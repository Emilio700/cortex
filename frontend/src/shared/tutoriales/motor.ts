/**
 * Fachada ligera del motor de recorridos.
 *
 * Todo lo que no toca driver.js vive aquí: tipos, utilidades de pasos y una
 * limpieza de restos que delega en el motor. El motor pesado
 * (`motorDriver.ts`, con la librería, su CSS y el arranque real) se trae con
 * `import()` recién cuando la persona pide un recorrido o abre el centro de
 * ayuda: antes, esa maquinaria viajaba en el paquete inicial (un chunk de
 * ~114 kB) aunque nadie abriera la ayuda.
 *
 * Mientras la carga no termina no puede haber ningún recorrido activo, así
 * que `hayRecorridoActivo()` responde `false` y `detenerRecorrido()` sólo
 * barre restos. `iniciarRecorrido()` no arranca nada con el motor sin
 * cargar: quien lo llama desde la interfaz espera antes a `cargarMotor()`.
 */
import type { DriveStep } from 'driver.js'
import type { Recorrido } from './tipos'
import { buscarAncla, pasosPresentes } from './visibilidad'

/** Cada cuánto se revisa que el paso a la vista siga teniendo a qué señalar. */
export const VIGILANCIA_MS = 600

/**
 * Por qué se cerró un recorrido:
 * - `terminado`: llegó al último paso.
 * - `cerrado`: la persona lo cerró antes (✕, Esc o clic fuera).
 * - `detenido`: lo cerró el sistema a propósito (cambio de pantalla, otro recorrido).
 * - `desaparecio`: lo que señalaba se fue de la pantalla y no quedó nada más.
 * - `error`: algo falló por dentro; se cerró para no estorbar.
 */
export type MotivoCierre = 'terminado' | 'cerrado' | 'detenido' | 'desaparecio' | 'error'

export interface OpcionesInicio {
  /**
   * Se llama una vez al cerrarse. `completo` es verdadero si se llegó al
   * último paso: con "Terminar" o cerrándolo ya estando en él.
   */
  alCerrar?: (completo: boolean, motivo: MotivoCierre) => void
  /**
   * Cada vez que se muestra un paso, con su índice entre los pasos declarados
   * y lo que dice el globo ("Paso 2 de 8", contado sobre los presentes).
   */
  alMostrarPaso?: (indiceDeclarado: number, enPantalla: { posicion: number; total: number }) => void
  /**
   * Índice (entre los pasos declarados) desde el cual continuar. Si ese paso
   * no está en pantalla, se continúa desde el siguiente que sí esté.
   */
  desdePaso?: number
  /** Raíz donde buscar los elementos (en pruebas, el contenedor montado). */
  raiz?: ParentNode
}

/**
 * Barre los restos que deja driver.js mientras hay un recorrido (el fondo
 * oscurecido, el globo, clases que bloquean el clic). Los pone sólo el motor
 * pesado, así que sin él no hay nada que barrer; con él cargado se delega en
 * su implementación, que es la que conoce los selectores. Es la red por si
 * la librería falla a medio cerrar: sin esto la pantalla podría quedarse
 * oscura y sin responder a media consulta.
 */
export function limpiarRestos(doc: Document = document): void {
  modulo?.limpiarRestos(doc)
}

/* ------- piezas de pasos que comparte motorDriver.ts (interno) ------- */

export type PasoConIndice = { paso: Recorrido['pasos'][number]; indice: number }

/** Pasos que sí están en pantalla, con el índice que tienen entre los declarados. */
export const pasosConIndice = (recorrido: Recorrido, raiz: ParentNode): PasoConIndice[] => {
  const presentes = new Set(pasosPresentes(recorrido.pasos, raiz))
  return recorrido.pasos
    .map((paso, indice) => ({ paso, indice }))
    .filter(({ paso }) => presentes.has(paso))
}

/**
 * Convierte un paso al formato de driver.js. El elemento se resuelve al
 * llegar al paso y no al arrancar: entre un paso y otro la pantalla puede
 * re-renderizar y cambiar el nodo. Si para entonces ya no está, driver.js lo
 * salta (skipMissingElement) en vez de señalar la nada.
 */
export const aPasoDriver = (paso: Recorrido['pasos'][number], raiz: ParentNode): DriveStep => ({
  element: paso.elemento
    ? () => buscarAncla(paso.elemento!, raiz) as unknown as Element
    : undefined,
  popover: {
    title: paso.titulo,
    description: paso.texto,
    side: paso.lado,
    align: paso.alinear ?? 'start',
  },
})

/** Convierte los pasos que sí están en pantalla al formato de driver.js. */
export function construirPasos(recorrido: Recorrido, raiz: ParentNode = document): DriveStep[] {
  return pasosConIndice(recorrido, raiz).map(({ paso }) => aPasoDriver(paso, raiz))
}

/**
 * Primer paso en pantalla cuyo índice declarado es `desde` o posterior. Si ya
 * no queda ninguno (se quedó en uno que desapareció y los siguientes tampoco
 * están), se empieza desde el principio en vez de no mostrar nada.
 */
export function indiceParaContinuar(indicesPresentes: number[], desde: number): number {
  const posicion = indicesPresentes.findIndex((i) => i >= desde)
  return posicion === -1 ? 0 : posicion
}

/* --------------------------- carga diferida --------------------------- */

type ModuloMotor = typeof import('./motorDriver')

let modulo: ModuloMotor | null = null
let carga: Promise<boolean> | null = null

/** ¿Ya está cargado el motor pesado? Lo usan la interfaz y las pruebas. */
export function motorCargado(): boolean {
  return modulo !== null
}

/**
 * Trae el motor pesado con `import()`. Es idempotente: las llamadas
 * siguientes esperan la misma carga. Devuelve `false` si no se pudo traer
 * (sin red, chunk caído); en ese caso un intento posterior vuelve a probar.
 */
export function cargarMotor(): Promise<boolean> {
  if (modulo) return Promise.resolve(true)
  if (!carga) {
    carga = import('./motorDriver')
      .then((traido) => {
        modulo = traido
        return true
      })
      .catch((error) => {
        // Se olvida el intento fallido para que el próximo clic reintente.
        carga = null
        console.error('[tutoriales] no se pudo cargar el motor de los recorridos', error)
        return false
      })
  }
  return carga
}

/** ¿Hay un recorrido señalando ahora? Sin motor cargado, no hay ninguno. */
export function hayRecorridoActivo(): boolean {
  try {
    return modulo?.hayRecorridoActivo() ?? false
  } catch {
    return false
  }
}

/**
 * Cierra el recorrido activo (si lo hay) y barre sus restos. Se puede llamar
 * siempre, aunque el motor no esté cargado: en ese caso sólo limpia.
 */
export function detenerRecorrido(): void {
  if (!modulo) {
    limpiarRestos()
    return
  }
  try {
    modulo.detenerRecorrido()
  } catch {
    limpiarRestos()
  }
}

/**
 * Arranca un recorrido con el motor ya cargado. Mantiene el contrato de
 * siempre (devuelve `false` si no hay nada que mostrar y nunca lanza), pero
 * si el motor todavía no está cargado devuelve `false` sin arrancar nada:
 * quien lo pide desde la interfaz espera antes a `cargarMotor()`.
 */
export function iniciarRecorrido(recorrido: Recorrido, opciones: OpcionesInicio = {}): boolean {
  if (!modulo) return false
  return modulo.iniciarRecorrido(recorrido, opciones)
}
