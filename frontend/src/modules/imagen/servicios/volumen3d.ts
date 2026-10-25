/**
 * El volumen 3D de una serie, montado en un elemento de la pantalla
 * (feat/render-volumetrico).
 *
 * Es el estudio mismo pintado en la tarjeta gráfica (render volumétrico): no hay
 * segmentación ni IA. Lo que toca Cornerstone y VTK vive aquí; la pantalla sólo
 * habla con el `Volumen3D` que devuelve esto.
 *
 * La carga va en dos pasos, porque el cargador `wadouri:` no conoce la geometría
 * de un corte hasta que lo descarga y el volumen la necesita antes de nacer:
 *   1. se descargan los archivos de los cortes (con la sesión, como el visor);
 *   2. se arma el volumen con el cargador en streaming y se pinta.
 * Cada paso avisa su avance para la barra de progreso.
 *
 * Quien lo crea es responsable de `destruir()`: suelta el volumen de la caché,
 * los archivos leídos, el motor y el grupo de herramientas. Una TC entera pesa
 * cientos de MB; dejarla viva al salir llena la memoria a la segunda.
 */
import {
  CONSTANTS,
  Enums,
  RenderingEngine,
  cache,
  canRenderFloatTextures,
  cornerstoneStreamingImageVolumeLoader,
  eventTarget,
  volumeLoader,
  type Types,
} from '@cornerstonejs/core'
import dicomImageLoader from '@cornerstonejs/dicom-image-loader'
import { ToolGroupManager, Enums as csToolsEnums } from '@cornerstonejs/tools'
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane'

import {
  curvaDeOpacidad,
  decimarCortes,
  planosDeRecorte,
  preajustePorId,
  type Recortes,
} from '../dominio/volumen3d'
import type { ManifiestoSerie } from '../dominio/tipos'
import { HERRAMIENTAS } from './cornerstone'
import { urlAbsoluta } from './estudiosApi'

export type FaseDeCarga = 'descargando' | 'armando'

export interface Progreso {
  fase: FaseDeCarga
  hechos: number
  total: number
}

export type HerramientaVolumen = 'rotar' | 'desplazar' | 'zoom'

export interface Volumen3D {
  aplicarPreajuste: (id: string, desplazamiento?: number, opacidad?: number) => void
  ajustarOpacidad: (desplazamiento: number, opacidad: number) => void
  recortar: (recortes: Recortes) => void
  aplicarHerramienta: (herramienta: HerramientaVolumen) => void
  /** Iluminación cinematográfica: oclusión ambiental local y dispersión. */
  fijarCinematica: (activa: boolean) => void
  restablecer: () => void
  /** El lienzo donde Cornerstone copia el render (para capturarlo). */
  lienzo: () => HTMLCanvasElement | null
  destruir: () => void
}

export interface OpcionesDeVolumen {
  elemento: HTMLDivElement
  manifiesto: ManifiestoSerie
  /** Un corte de cada `decimado` (1 = todos). */
  decimado: number
  preajuste: string
  alProgreso?: (progreso: Progreso) => void
  /** La tarjeta perdió el contexto (memoria agotada o controlador reiniciado). */
  alPerderContexto?: () => void
}

/** Error con un texto para el médico y la sugerencia de reducir resolución. */
export class FalloDeVolumen extends Error {
  constructor(
    mensaje: string,
    readonly sugerirReducir: boolean
  ) {
    super(mensaje)
    this.name = 'FalloDeVolumen'
  }
}

const ESQUEMA = 'cornerstoneStreamingImageVolume'
const DESCARGAS_SIMULTANEAS = 6
const BOTON_PRIMARIO = 1 as csToolsEnums.MouseBindings
const BOTON_DERECHO = 2 as csToolsEnums.MouseBindings
const BOTON_MEDIO = 4 as csToolsEnums.MouseBindings
const RUEDA = 524288 as csToolsEnums.MouseBindings
const UN_DEDO = { numTouchPoints: 1 }
const EVENTO_VOLUMEN_MODIFICADO = 'CORNERSTONE_IMAGE_VOLUME_MODIFIED'
const EVENTO_CONTEXTO_PERDIDO = 'CORNERSTONE_WEBGL_CONTEXT_LOST'

let cargadorRegistrado = false
let contador = 0

/** ¿El navegador da WebGL2? Sin él no hay render volumétrico. */
export function hayWebGL2(): boolean {
  try {
    const lienzo = document.createElement('canvas')
    return Boolean(lienzo.getContext('webgl2'))
  } catch {
    return false
  }
}

/** ¿La tarjeta pinta texturas de punto flotante? Sin ellas se pierde precisión o memoria. */
export function soportaTexturasFloat(): boolean {
  try {
    return canRenderFloatTextures()
  } catch {
    return false
  }
}

/** Traduce lo que lanza Cornerstone o el navegador a algo que el médico entienda. */
export function explicarFallo(fallo: unknown): FalloDeVolumen {
  if (fallo instanceof FalloDeVolumen) return fallo
  const texto = String((fallo as { message?: string })?.message ?? fallo ?? '')
  if (/cache|memory|memoria|allocation|out of memory|RangeError|Array buffer/i.test(texto)) {
    return new FalloDeVolumen(
      'Se agotó la memoria para el volumen. Prueba «Reducir resolución» o cierra otras pestañas con estudios.',
      true
    )
  }
  if (/webgl|context|texture/i.test(texto)) {
    return new FalloDeVolumen(
      'La tarjeta gráfica no pudo pintar el volumen. Prueba «Reducir resolución» o abre el estudio en otro equipo.',
      true
    )
  }
  return new FalloDeVolumen(`No se pudo armar el volumen: ${texto || 'motivo desconocido'}.`, true)
}

function registrarCargador() {
  if (cargadorRegistrado) return
  volumeLoader.registerVolumeLoader(
    ESQUEMA,
    cornerstoneStreamingImageVolumeLoader as unknown as Types.VolumeLoaderFn
  )
  cargadorRegistrado = true
}

/** Descarga los archivos (no los decodifica): basta para que haya metadatos. */
async function descargarCortes(
  urls: string[],
  imageIds: string[],
  alAvanzar: (hechos: number) => void,
  cancelado: () => boolean
): Promise<string[]> {
  const cargados: string[] = []
  let siguiente = 0
  let hechos = 0
  let primerFallo: unknown = null
  const trabajador = async () => {
    while (siguiente < urls.length && !cancelado() && !primerFallo) {
      const i = siguiente++
      try {
        await dicomImageLoader.wadouri.dataSetCacheManager.load(urls[i], undefined as never, imageIds[i])
        cargados.push(urls[i])
      } catch (fallo) {
        primerFallo = fallo
      }
      hechos++
      alAvanzar(hechos)
    }
  }
  await Promise.all(Array.from({ length: Math.min(DESCARGAS_SIMULTANEAS, urls.length) }, trabajador))
  if (primerFallo) {
    for (const url of cargados) dicomImageLoader.wadouri.dataSetCacheManager.unload(url)
    const estado = (primerFallo as { request?: { status?: number } })?.request?.status
    throw new FalloDeVolumen(
      estado === 401 || estado === 403
        ? 'La sesión ya no permite leer los cortes. Vuelve a entrar y abre el estudio de nuevo.'
        : 'No se pudo descargar uno de los cortes. Revisa la conexión e inténtalo de nuevo.',
      false
    )
  }
  return cargados
}

function presetDeCornerstone(nombre: string) {
  return (CONSTANTS.VIEWPORT_PRESETS as Array<{ name: string; colorTransfer: string; scalarOpacity: string }>).find(
    (p) => p.name === nombre
  )
}

export async function crearVolumen3D(opciones: OpcionesDeVolumen): Promise<Volumen3D> {
  const { elemento, manifiesto } = opciones
  const cortes = decimarCortes(manifiesto.instances, opciones.decimado)
  const urls = cortes.map((c) => urlAbsoluta(c.url))
  const imageIds = urls.map((u) => `wadouri:${u}`)
  if (imageIds.length === 0) throw new FalloDeVolumen('La serie no tiene cortes guardados.', false)

  registrarCargador()
  contador += 1
  const sufijo = `vol-${contador}`
  const motorId = `cx-motor-${sufijo}`
  const viewportId = `cx-vp-${sufijo}`
  const grupoId = `cx-grupo-${sufijo}`
  const volumeId = `${ESQUEMA}:cx-${sufijo}`

  let destruido = false
  let motor: RenderingEngine | null = null
  let cargados: string[] = []
  let volumen: Types.IImageVolume | null = null
  let quitarEscuchas: () => void = () => undefined

  const alModificar = (evento: Event) => {
    const detalle = (evento as CustomEvent).detail
    if (detalle?.volumeId !== volumeId) return
    opciones.alProgreso?.({ fase: 'armando', hechos: detalle.framesProcessed ?? 0, total: imageIds.length })
  }
  const alPerder = (evento: Event) => {
    if ((evento as CustomEvent).detail?.renderingEngineId !== motorId) return
    opciones.alPerderContexto?.()
  }

  const liberar = () => {
    if (destruido) return
    destruido = true
    eventTarget.removeEventListener(EVENTO_VOLUMEN_MODIFICADO, alModificar)
    eventTarget.removeEventListener(EVENTO_CONTEXTO_PERDIDO, alPerder)
    quitarEscuchas()
    try {
      ;(volumen as unknown as { cancelLoading?: () => void } | null)?.cancelLoading?.()
    } catch {
      // Cancelar un volumen ya cargado no es un error que importe al salir.
    }
    try {
      ToolGroupManager.destroyToolGroup(grupoId)
    } catch {
      // El grupo puede no existir si la carga falló antes.
    }
    try {
      motor?.destroy()
    } catch {
      // Igual: se intenta soltar todo aunque una pieza ya no esté.
    }
    try {
      if (cache.getVolumeLoadObject(volumeId)) cache.removeVolumeLoadObject(volumeId)
    } catch {
      // Sin volumen en la caché no hay nada que soltar.
    }
    for (const url of cargados) dicomImageLoader.wadouri.dataSetCacheManager.unload(url)
    cargados = []
    elemento.innerHTML = ''
  }

  try {
    opciones.alProgreso?.({ fase: 'descargando', hechos: 0, total: imageIds.length })
    cargados = await descargarCortes(
      urls,
      imageIds,
      (hechos) => opciones.alProgreso?.({ fase: 'descargando', hechos, total: imageIds.length }),
      () => destruido
    )
    if (destruido) throw new FalloDeVolumen('Se canceló la carga.', false)

    opciones.alProgreso?.({ fase: 'armando', hechos: 0, total: imageIds.length })
    eventTarget.addEventListener(EVENTO_VOLUMEN_MODIFICADO, alModificar)
    eventTarget.addEventListener(EVENTO_CONTEXTO_PERDIDO, alPerder)

    volumen = (await volumeLoader.createAndCacheVolume(volumeId, { imageIds })) as Types.IImageVolume
    if (destruido) throw new FalloDeVolumen('Se canceló la carga.', false)

    elemento.innerHTML = ''
    motor = new RenderingEngine(motorId)
    motor.enableElement({
      viewportId,
      element: elemento,
      type: Enums.ViewportType.VOLUME_3D,
      defaultOptions: { background: [0, 0, 0] as Types.Point3 },
    })
    const viewport = motor.getViewport(viewportId) as Types.IVolumeViewport

    // Se espera a que estén todos los cortes: un volumen a medias pintado en 3D
    // parece una lesión (un hueco), y aquí no hay corte que lo desmienta.
    await new Promise<void>((resolver, rechazar) => {
      const conCarga = volumen as unknown as {
        load: (cb: (e: { success?: boolean; framesLoaded?: number; error?: unknown }) => void) => void
      }
      // Cornerstone avisa una sola vez, al procesar el último corte; los que
      // fallaron cuentan como procesados pero no como cargados.
      conCarga.load((evento) => {
        const cargadosOk = evento?.framesLoaded ?? imageIds.length
        if (evento?.success === false || cargadosOk < imageIds.length) {
          rechazar(
            new FalloDeVolumen(
              `${imageIds.length - cargadosOk || 'Algunos'} cortes no se pudieron decodificar; el volumen tendría huecos.`,
              true
            )
          )
        } else resolver()
      })
    })
    if (destruido) throw new FalloDeVolumen('Se canceló la carga.', false)
    opciones.alProgreso?.({ fase: 'armando', hechos: imageIds.length, total: imageIds.length })

    await viewport.setVolumes([{ volumeId }])
    if (destruido) throw new FalloDeVolumen('Se canceló la carga.', false)

    const grupo = ToolGroupManager.createToolGroup(grupoId)
    if (grupo) {
      grupo.addViewport(viewportId, motorId)
      for (const nombre of [HERRAMIENTAS.rotar3d, HERRAMIENTAS.desplazar, HERRAMIENTAS.zoom]) grupo.addTool(nombre)
    }

    const actor = () =>
      (viewport as unknown as { getDefaultActor: () => { actor: VtkVolumen } | undefined }).getDefaultActor()?.actor ??
      null

    let preajusteActual = opciones.preajuste

    const ajustarOpacidad = (desplazamiento: number, opacidad: number) => {
      const preajuste = preajustePorId(preajusteActual)
      const curva = preajuste ? presetDeCornerstone(preajuste.preset) : null
      const volumenVtk = actor()
      if (!curva || !volumenVtk) return
      const funcion = volumenVtk.getProperty().getScalarOpacity(0)
      funcion.removeAllPoints()
      for (const [x, y] of curvaDeOpacidad(curva, desplazamiento, opacidad)) funcion.addPoint(x, y)
      viewport.render()
    }

    // ── Iluminación y calidad ──
    // Receta inspirada en VolView de Kitware (Apache-2.0, `utils/volumeProperties.ts`):
    // oclusión ambiental local (LAO) y dispersión volumétrica de vtk.js. Los
    // valores se ajustaron aquí a ojo sobre una TC; no se copió su código.
    let cinematica = false
    let interactuando = false
    const aplicarLuz = () => {
      const volumenVtk = actor()
      if (!volumenVtk) return
      const propiedad = volumenVtk.getProperty() as unknown as PropiedadCinematica
      const alta = cinematica && !interactuando
      try {
        propiedad.setShade?.(true)
        propiedad.setLocalAmbientOcclusion?.(alta)
        propiedad.setLAOKernelSize?.(10)
        propiedad.setLAOKernelRadius?.(5)
        propiedad.setVolumetricScatteringBlending?.(alta ? 0.35 : 0)
        propiedad.setGlobalIlluminationReach?.(alta ? 0.1 : 0)
        propiedad.setAnisotropy?.(0)
        propiedad.setComputeNormalFromOpacity?.(alta)
      } catch {
        // Un vtk.js sin estas funciones pinta sin iluminación cinematográfica; no es un fallo.
      }
      // Mientras se gira, menos muestras por rayo: fluido en una GPU modesta.
      try {
        ;(viewport as unknown as { setSampleDistanceMultiplier?: (m: number) => void }).setSampleDistanceMultiplier?.(
          interactuando ? 4 : 1
        )
      } catch {
        // Sin muestreo variable se queda en calidad alta.
      }
    }

    const aplicarPreajuste = (id: string, desplazamiento = 0, opacidad = 1) => {
      const preajuste = preajustePorId(id)
      if (!preajuste) return
      preajusteActual = id
      viewport.setProperties({ preset: preajuste.preset })
      // El preajuste reescribe la luz: se vuelve a poner la elegida.
      aplicarLuz()
      if (desplazamiento !== 0 || opacidad !== 1) ajustarOpacidad(desplazamiento, opacidad)
      else viewport.render()
    }

    const fijarCinematica = (activa: boolean) => {
      cinematica = activa
      aplicarLuz()
      viewport.render()
    }

    let reposo = 0
    const alEmpezar = () => {
      window.clearTimeout(reposo)
      if (interactuando) return
      interactuando = true
      aplicarLuz()
    }
    const alTerminar = () => {
      window.clearTimeout(reposo)
      reposo = window.setTimeout(() => {
        if (destruido) return
        interactuando = false
        aplicarLuz()
        viewport.render()
      }, 200)
    }
    const alRodar = () => {
      alEmpezar()
      alTerminar()
    }
    elemento.addEventListener('pointerdown', alEmpezar)
    elemento.addEventListener('wheel', alRodar, { passive: true })
    window.addEventListener('pointerup', alTerminar)
    quitarEscuchas = () => {
      window.clearTimeout(reposo)
      elemento.removeEventListener('pointerdown', alEmpezar)
      elemento.removeEventListener('wheel', alRodar)
      window.removeEventListener('pointerup', alTerminar)
    }

    const recortar = (recortes: Recortes) => {
      const volumenVtk = actor()
      if (!volumenVtk || !volumen) return
      const mapper = volumenVtk.getMapper()
      mapper.removeAllClippingPlanes()
      const limites = (volumen.imageData as unknown as { getBounds: () => number[] }).getBounds()
      for (const plano of planosDeRecorte(recortes, limites)) {
        mapper.addClippingPlane(vtkPlane.newInstance({ origin: plano.origen, normal: plano.normal }))
      }
      viewport.render()
    }

    const aplicarHerramienta = (herramienta: HerramientaVolumen) => {
      const actual = ToolGroupManager.getToolGroup(grupoId)
      if (!actual) return
      const primario = [{ mouseButton: BOTON_PRIMARIO }, UN_DEDO]
      const nombres = { rotar: HERRAMIENTAS.rotar3d, desplazar: HERRAMIENTAS.desplazar, zoom: HERRAMIENTAS.zoom }
      const fijos: Record<HerramientaVolumen, Array<{ mouseButton?: csToolsEnums.MouseBindings; numTouchPoints?: number }>> = {
        rotar: [],
        desplazar: [{ mouseButton: BOTON_MEDIO }],
        zoom: [{ mouseButton: BOTON_DERECHO }, { mouseButton: RUEDA }],
      }
      for (const clave of Object.keys(nombres) as HerramientaVolumen[]) {
        const enlaces = clave === herramienta ? [...primario, ...fijos[clave]] : fijos[clave]
        if (enlaces.length) actual.setToolActive(nombres[clave], { bindings: enlaces })
        else actual.setToolPassive(nombres[clave])
      }
    }

    aplicarPreajuste(opciones.preajuste)
    aplicarHerramienta('rotar')
    viewport.resetCamera()
    viewport.render()

    return {
      aplicarPreajuste,
      ajustarOpacidad,
      recortar,
      aplicarHerramienta,
      fijarCinematica,
      restablecer: () => {
        viewport.resetCamera()
        viewport.render()
      },
      lienzo: () => elemento.querySelector('canvas'),
      destruir: liberar,
    }
  } catch (fallo) {
    liberar()
    throw explicarFallo(fallo)
  }
}

/** Las funciones de iluminación de `vtkVolumeProperty` (vtk.js 36); opcionales por si faltan. */
interface PropiedadCinematica {
  setShade?: (v: boolean) => void
  setLocalAmbientOcclusion?: (v: boolean) => void
  setLAOKernelSize?: (v: number) => void
  setLAOKernelRadius?: (v: number) => void
  setVolumetricScatteringBlending?: (v: number) => void
  setGlobalIlluminationReach?: (v: number) => void
  setAnisotropy?: (v: number) => void
  setComputeNormalFromOpacity?: (v: boolean) => void
}

/** Lo poco de VTK que se usa, escrito aquí para no depender de sus tipos internos. */
interface VtkVolumen {
  getProperty: () => {
    getScalarOpacity: (indice: number) => { removeAllPoints: () => void; addPoint: (x: number, y: number) => void }
  }
  getMapper: () => { removeAllClippingPlanes: () => void; addClippingPlane: (plano: unknown) => void }
}
