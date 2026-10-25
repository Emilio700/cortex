/**
 * La pila de cortes de una serie, montada en un elemento de la pantalla.
 *
 * Antes vivía dentro de la página del visor. Se separó porque la usan dos
 * pantallas (la del médico y la del enlace compartido) y porque aquí está todo lo
 * que toca Cornerstone: la página sólo habla con la `Pila` que devuelve esto.
 *
 * Quien la crea es responsable de `destruir()`: sin eso, cambiar de serie deja
 * motores y grupos de herramientas vivos y la memoria del navegador se llena a la
 * tercera resonancia.
 */
import { Enums, RenderingEngine, eventTarget, type Types } from '@cornerstonejs/core'
import { ToolGroupManager, Enums as csToolsEnums } from '@cornerstonejs/tools'

import { medicionDeAnotacion, type MedicionTrazada } from '../dominio/mediciones'
import type { ManifiestoSerie } from '../dominio/tipos'
import { HERRAMIENTAS } from './cornerstone'
import { urlAbsoluta } from './estudiosApi'
import {
  acercar,
  aplicarEstado,
  aplicarVentana,
  ajustarAPantalla,
  crearCine,
  invertir,
  irAlCorte,
  leerEstado,
  restablecer,
  rotar,
  ventanaAutomatica,
  voltear,
  type Cine,
  type EstadoDeVista,
  type VistaLike,
} from './controlesDeVista'

export type Herramienta = 'ventana' | 'medir' | 'angulo' | 'area' | 'desplazar' | 'zoom'

/** Los eventos de Cornerstone que cambian lo que se ve. Se escriben aquí para no depender de que existan en un `Enums` simulado. */
const EVENTOS_DE_VISTA = [
  'CORNERSTONE_CAMERA_MODIFIED',
  'CORNERSTONE_VOI_MODIFIED',
  'CORNERSTONE_STACK_NEW_IMAGE',
] as const

const BOTON_PRIMARIO = 1 as csToolsEnums.MouseBindings
const BOTON_DERECHO = 2 as csToolsEnums.MouseBindings
const BOTON_MEDIO = 4 as csToolsEnums.MouseBindings

/** Un dedo equivale al botón primario: así el visor se maneja en una tableta. */
const UN_DEDO = { numTouchPoints: 1 }

export interface Pila {
  destruir: () => void
  irA: (indice: number) => void
  total: () => number
  estado: () => EstadoDeVista
  /** El UID DICOM del corte en esa posición, para guardarlo en una marca. */
  corteUid: (indice: number) => string | null
  aplicarHerramienta: (herramienta: Herramienta) => void
  ventana: (wc: number, ww: number) => void
  ventanaAutomatica: () => void
  invertir: () => void
  rotar: (grados?: number) => void
  voltear: (eje: 'h' | 'v') => void
  acercar: (factor: number) => void
  ajustar: () => void
  restablecer: () => void
  aplicarEstado: (estado: Partial<EstadoDeVista>) => void
  cine: Cine
  /** El lienzo donde Cornerstone dibuja la imagen (para capturarla). */
  lienzo: () => HTMLCanvasElement | null
  /** La capa SVG con las mediciones, que no está en el lienzo. */
  capaDeMarcas: () => SVGElement | null
}

export interface OpcionesDePila {
  elemento: HTMLDivElement
  manifiesto: ManifiestoSerie
  /** Distingue los motores de dos pilas en pantalla (`izq`, `der`). */
  sufijo: string
  herramienta?: Herramienta
  /** Se llamó al terminar un trazo que sí es una medición. */
  alMedir?: (medicion: MedicionTrazada) => void
  /** Cambió algo de lo que se ve (corte, ventana, zoom, giro…). */
  alCambiar?: (estado: EstadoDeVista) => void
  /** La persona recorrió los cortes con la rueda; sirve para sincronizar dos pilas. */
  alDesplazar?: (indice: number, total: number) => void
}

export async function crearPila(opciones: OpcionesDePila): Promise<Pila> {
  const { elemento, manifiesto, sufijo } = opciones
  const imageIds = manifiesto.instances.map((corte) => `wadouri:${urlAbsoluta(corte.url)}`)
  if (imageIds.length === 0) {
    throw new Error('La serie no tiene cortes guardados.')
  }

  const motorId = `cx-motor-${sufijo}`
  const viewportId = `cx-vp-${sufijo}`
  const grupoId = `cx-grupo-${sufijo}`

  elemento.innerHTML = ''
  const motor = new RenderingEngine(motorId)
  motor.enableElement({
    viewportId,
    element: elemento,
    type: Enums.ViewportType.STACK,
    defaultOptions: { background: [0, 0, 0] },
  })
  const viewport = motor.getViewport(viewportId) as Types.IStackViewport
  const vista = viewport as unknown as VistaLike
  await viewport.setStack(imageIds, 0)
  viewport.render()

  const grupo = ToolGroupManager.createToolGroup(grupoId)
  if (grupo) {
    grupo.addViewport(viewportId, motorId)
    for (const nombre of [
      HERRAMIENTAS.ventana,
      HERRAMIENTAS.desplazar,
      HERRAMIENTAS.zoom,
      HERRAMIENTAS.medir,
      HERRAMIENTAS.angulo,
      HERRAMIENTAS.area,
    ]) {
      grupo.addTool(nombre)
    }
  }

  /**
   * Una herramienta en el botón primario (y con un dedo); el botón central
   * desplaza y el derecho acerca siempre. Si la elegida es el desplazamiento o el
   * zoom, además de su botón de siempre toma el primario.
   */
  const aplicarHerramienta = (herramienta: Herramienta) => {
    const actual = ToolGroupManager.getToolGroup(grupoId)
    if (!actual) return
    const primario = [{ mouseButton: BOTON_PRIMARIO }, UN_DEDO]
    for (const nombre of [HERRAMIENTAS.ventana, HERRAMIENTAS.medir, HERRAMIENTAS.angulo, HERRAMIENTAS.area]) {
      actual.setToolPassive(nombre)
    }
    actual.setToolActive(HERRAMIENTAS.desplazar, {
      bindings:
        herramienta === 'desplazar'
          ? [...primario, { mouseButton: BOTON_MEDIO }]
          : [{ mouseButton: BOTON_MEDIO }],
    })
    actual.setToolActive(HERRAMIENTAS.zoom, {
      bindings:
        herramienta === 'zoom'
          ? [...primario, { mouseButton: BOTON_DERECHO }]
          : [{ mouseButton: BOTON_DERECHO }],
    })
    const porHerramienta = {
      ventana: HERRAMIENTAS.ventana,
      medir: HERRAMIENTAS.medir,
      angulo: HERRAMIENTAS.angulo,
      area: HERRAMIENTAS.area,
    } as const
    if (herramienta in porHerramienta) {
      actual.setToolActive(porHerramienta[herramienta as keyof typeof porHerramienta], {
        bindings: primario,
      })
    }
  }
  aplicarHerramienta(opciones.herramienta ?? 'ventana')

  // Los cambios de vista llegan a ráfagas (mover el zoom dispara decenas): se
  // avisa una vez por cuadro de pantalla.
  let pendiente = 0
  const avisar = () => {
    if (!opciones.alCambiar || pendiente) return
    pendiente = requestAnimationFrame(() => {
      pendiente = 0
      opciones.alCambiar?.(leerEstado(vista))
    })
  }
  for (const evento of EVENTOS_DE_VISTA) elemento.addEventListener(evento, avisar)

  const irA = (indice: number) => {
    irAlCorte(vista, indice)
    avisar()
  }

  // La rueda se maneja a mano: es el gesto que más se usa y así no depende de
  // que una herramienta esté activa o en pasiva.
  const alRodar = (evento: WheelEvent) => {
    evento.preventDefault()
    const total = viewport.getImageIds().length
    const siguiente = viewport.getCurrentImageIdIndex() + (evento.deltaY > 0 ? 1 : -1)
    irA(siguiente)
    opciones.alDesplazar?.(Math.min(total - 1, Math.max(0, siguiente)), total)
  }
  elemento.addEventListener('wheel', alRodar, { passive: false })

  // Cornerstone avisa que terminó un trazo en su `eventTarget` global, no en el
  // elemento de la imagen: escuchar en el elemento no recibe nada (el visor
  // heredado nunca llevaba las mediciones al panel por eso). Como es global, se
  // oye el trazo de cualquier visor abierto: sólo cuenta el de esta pila.
  const alAnotar = (evento: Event) => {
    const anotacion = (evento as CustomEvent).detail?.annotation
    const referencia = anotacion?.metadata?.referencedImageId
    if (typeof referencia === 'string' && !imageIds.some((id) => referencia.startsWith(id))) return
    const medicion = medicionDeAnotacion(anotacion)
    if (medicion) opciones.alMedir?.(medicion)
  }
  eventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_COMPLETED, alAnotar)

  const cine = crearCine(vista, (indice) => {
    avisar()
    opciones.alDesplazar?.(indice, viewport.getImageIds().length)
  })

  avisar()

  return {
    destruir: () => {
      cine.detener()
      if (pendiente) cancelAnimationFrame(pendiente)
      for (const evento of EVENTOS_DE_VISTA) elemento.removeEventListener(evento, avisar)
      elemento.removeEventListener('wheel', alRodar)
      eventTarget.removeEventListener(csToolsEnums.Events.ANNOTATION_COMPLETED, alAnotar)
      ToolGroupManager.destroyToolGroup(grupoId)
      motor.destroy()
      elemento.innerHTML = ''
    },
    irA,
    total: () => viewport.getImageIds().length,
    estado: () => leerEstado(vista),
    corteUid: (indice) => manifiesto.instances[indice]?.sop_instance_uid ?? null,
    aplicarHerramienta,
    ventana: (wc, ww) => {
      aplicarVentana(vista, wc, ww)
      avisar()
    },
    ventanaAutomatica: () => {
      ventanaAutomatica(vista)
      avisar()
    },
    invertir: () => {
      invertir(vista)
      avisar()
    },
    rotar: (grados) => {
      rotar(vista, grados)
      avisar()
    },
    voltear: (eje) => {
      voltear(vista, eje)
      avisar()
    },
    acercar: (factor) => {
      acercar(vista, factor)
      avisar()
    },
    ajustar: () => {
      ajustarAPantalla(vista)
      avisar()
    },
    restablecer: () => {
      restablecer(vista)
      avisar()
    },
    aplicarEstado: (estado) => {
      aplicarEstado(vista, estado)
      avisar()
    },
    cine,
    lienzo: () => elemento.querySelector('canvas'),
    capaDeMarcas: () => elemento.querySelector('svg.svg-layer'),
  }
}
