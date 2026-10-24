/**
 * Motor pesado de los recorridos: la única parte que conoce driver.js.
 *
 * Ningún otro archivo lo importa de forma estática: la fachada `motor.ts` lo
 * trae con `import()` recién cuando la persona pide un recorrido o abre el
 * centro de ayuda (ahí está el porqué). Así, quien nunca usa la ayuda no
 * descarga la librería ni su CSS.
 *
 * Regla de este archivo: un recorrido nunca puede dejar la aplicación
 * inservible. Toda llamada a driver.js y a quien lo arrancó va protegida; ante
 * cualquier error se cierra el recorrido, se barren los restos (el fondo
 * oscurecido, las clases del body) y la pantalla queda como estaba.
 */
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './recorrido.css'
import type { Recorrido } from './tipos'
import { buscarAncla, buscarElemento } from './visibilidad'
import {
  VIGILANCIA_MS,
  aPasoDriver,
  indiceParaContinuar,
  pasosConIndice,
  type MotivoCierre,
  type OpcionesInicio,
  type PasoConIndice,
} from './motor'

/**
 * Quita del documento todo lo que driver.js pone mientras hay un recorrido:
 * el fondo oscurecido, el globo y las clases que bloquean el clic. Es la red
 * por si la librería falla a medio cerrar; sin esto la pantalla podría
 * quedarse oscura y sin responder a media consulta.
 *
 * Vive aquí —y no en la fachada— para que ni los selectores de driver.js
 * viajen en el paquete inicial: sin motor cargado no hay restos que barrer.
 */
export function limpiarRestos(doc: Document = document): void {
  const clases = [
    'driver-active-element',
    'driver-active-element-parent',
    'driver-active-element-parent-no-scroll',
    'driver-no-interaction',
  ]
  try {
    doc
      .querySelectorAll('.driver-overlay, .driver-popover, #driver-dummy-element')
      .forEach((nodo) => nodo.remove())
    doc.body.classList.remove(
      'driver-active',
      'driver-fade',
      'driver-simple',
      'driver-no-interaction',
    )
    doc.querySelectorAll(clases.map((c) => `.${c}`).join(', ')).forEach((nodo) => {
      nodo.classList.remove(...clases)
      nodo.removeAttribute('aria-haspopup')
      nodo.removeAttribute('aria-expanded')
      nodo.removeAttribute('aria-controls')
    })
  } catch {
    // Si ni barrer se puede, no hay nada más que hacer sin arriesgar la pantalla.
  }
}

let activo: Driver | null = null
/** Cierra el recorrido activo avisando a quien lo arrancó. */
let cerrarActivo: ((completo: boolean, motivo: MotivoCierre) => void) | null = null

export function hayRecorridoActivo(): boolean {
  try {
    return activo?.isActive() ?? false
  } catch {
    return false
  }
}

export function detenerRecorrido(): void {
  const cerrar = cerrarActivo
  activo = null
  cerrarActivo = null
  if (cerrar) cerrar(false, 'detenido')
  limpiarRestos()
}

const reportar = (error: unknown) => {
  // A la consola y nada más: un tutorial roto no amerita interrumpir a nadie.
  console.error('[tutoriales] el recorrido se cerró por un error interno', error)
}

/**
 * Arranca un recorrido. Devuelve `false` si no hay nada que mostrar (ninguno
 * de sus pasos está en pantalla) o si no se pudo arrancar, para que quien lo
 * pidió pueda decirlo. Nunca lanza.
 */
export function iniciarRecorrido(recorrido: Recorrido, opciones: OpcionesInicio = {}): boolean {
  detenerRecorrido()
  try {
    return arrancar(recorrido, opciones)
  } catch (error) {
    reportar(error)
    // Si ya había una instancia a medio armar, que se cierre avisando.
    const cerrar = cerrarActivo
    activo = null
    cerrarActivo = null
    cerrar?.(false, 'error')
    limpiarRestos()
    return false
  }
}

function arrancar(recorrido: Recorrido, opciones: OpcionesInicio): boolean {
  const raiz = opciones.raiz ?? document
  const conIndice = pasosConIndice(recorrido, raiz)
  const pasos = conIndice.map(({ paso }) => aPasoDriver(paso, raiz))
  if (pasos.length === 0) return false
  const indices = conIndice.map(({ indice }) => indice)
  const inicio =
    opciones.desdePaso === undefined ? 0 : indiceParaContinuar(indices, opciones.desdePaso)

  // El aviso de cierre no se cuelga de `onDestroyed` de driver.js: ése sólo
  // se dispara si el paso ya terminó de resaltarse, y cerrar a media animación
  // dejaría el recorrido sin anotar.
  let avisado = false
  let vigilancia: ReturnType<typeof setInterval> | undefined = undefined

  const hayInstancia = () => {
    try {
      return instancia.isActive()
    } catch {
      return false
    }
  }
  const enUltimoPaso = () => {
    const activoIdx = instancia.getActiveIndex()
    return activoIdx !== undefined && activoIdx >= pasos.length - 1
  }

  const cerrar = (completo: boolean, motivo: MotivoCierre) => {
    window.removeEventListener('keydown', alTeclear, true)
    if (vigilancia !== undefined) clearInterval(vigilancia)
    let terminado = completo
    try {
      // Quien cierra con la ✕ ya estando en el último paso vio todo; dejarlo
      // "a medias (9 de 9)" sólo haría que se le ofreciera continuar a nada.
      if (!terminado && motivo === 'cerrado') terminado = hayInstancia() && enUltimoPaso()
    } catch {
      terminado = false
    }
    if (activo === instancia) {
      activo = null
      cerrarActivo = null
    }
    try {
      if (hayInstancia()) instancia.destroy()
    } catch (error) {
      reportar(error)
    }
    limpiarRestos()
    if (avisado) return
    avisado = true
    try {
      opciones.alCerrar?.(terminado, terminado ? 'terminado' : motivo)
    } catch (error) {
      reportar(error)
    }
  }

  /** Cualquier falla dentro de un callback termina aquí: se cierra y se limpia. */
  const protegido =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      try {
        fn(...args)
      } catch (error) {
        reportar(error)
        cerrar(false, 'error')
      }
    }

  // Escape tiene que cerrar el recorrido y nada más. Los modales de CoreUI
  // también se cierran con Escape, y un recorrido del formulario de citas que
  // al cerrarse tirara el modal se llevaría lo capturado.
  const alTeclear = (evento: KeyboardEvent) => {
    if (evento.key !== 'Escape' || !hayInstancia()) return
    evento.stopPropagation()
    evento.preventDefault()
    cerrar(false, 'cerrado')
  }

  const instancia = driver({
    steps: pasos,
    showProgress: pasos.length > 1,
    progressText: 'Paso {{current}} de {{total}}',
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Anterior',
    doneBtnText: 'Terminar',
    popoverClass: 'gems-tour',
    // Un tutorial sólo señala y explica. Si el clic pasara al elemento
    // resaltado, "Siguiente" mal apuntado podría guardar una nota o finalizar
    // una consulta.
    disableActiveInteraction: true,
    skipMissingElement: true,
    allowClose: true,
    allowKeyboardControl: true,
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 8,
    overlayOpacity: 0.55,
    onPopoverRender: protegido((popover, { state }) => {
      popover.closeButton.setAttribute('aria-label', 'Cerrar el recorrido')
      popover.closeButton.setAttribute('title', 'Cerrar el recorrido')
      popover.wrapper.setAttribute('aria-label', `Recorrido: ${recorrido.titulo}`)
      // Se anota al pintarse el globo, que es cuando la persona lo ve: así
      // "continuar" la regresa al último paso que alcanzó a leer.
      const idx = state.activeIndex
      if (idx !== undefined && indices[idx] !== undefined) {
        opciones.alMostrarPaso?.(indices[idx], { posicion: idx + 1, total: pasos.length })
      }
    }),
    onNextClick: protegido((_el, _paso, { driver: d }) => {
      if (!d.hasNextStep()) {
        cerrar(true, 'terminado')
        return
      }
      d.moveNext()
    }),
    // La ✕ y el clic fuera del globo pasan por aquí antes de cerrar.
    onDestroyStarted: () => cerrar(false, 'cerrado'),
  })

  /**
   * Revisa que lo que se señala siga ahí. Un modal que se cerró, una pestaña
   * que cambió o una lista que se recargó dejan el recuadro sobre la nada, o
   * peor, la pantalla oscurecida sin globo. Se pasa al siguiente paso que sí
   * esté; si ya no queda ninguno, se cierra guardando el avance.
   */
  const vigilar = protegido(() => {
    const perdido =
      !hayInstancia() ||
      (recorrido.contexto !== undefined && !buscarElemento(recorrido.contexto, raiz)) ||
      !document.querySelector('.driver-popover')
    if (perdido) {
      cerrar(false, 'desaparecio')
      return
    }
    const idx = instancia.getActiveIndex()
    if (idx === undefined) return
    const paso = conIndice[idx]?.paso
    if (!paso?.elemento) return
    const ancla = buscarAncla(paso.elemento, raiz)
    if (ancla && ancla === instancia.getActiveElement()) return
    if (ancla) {
      // Sigue, pero es otro nodo (la pantalla se volvió a pintar): se vuelve
      // a resaltar para que el recuadro quede sobre el nuevo.
      instancia.moveTo(idx)
      return
    }
    const presente = (c: PasoConIndice) =>
      Boolean(c.paso.elemento) && buscarAncla(c.paso.elemento!, raiz) !== null
    // Si lo que queda son sólo tarjetas sueltas ("Eso es todo"), mejor cerrar
    // guardando el avance que seguir hablando de algo que ya no se ve.
    const siguiente = conIndice.findIndex((c, i) => i > idx && presente(c))
    if (siguiente === -1) {
      cerrar(false, 'desaparecio')
      return
    }
    instancia.moveTo(siguiente)
  })

  window.addEventListener('keydown', alTeclear, true)

  cerrarActivo = cerrar
  activo = instancia
  instancia.drive(inicio)
  if (!hayInstancia()) {
    // Se cerró al arrancar (p. ej. un callback falló): ya se limpió.
    return false
  }
  vigilancia = setInterval(vigilar, VIGILANCIA_MS)
  return true
}
