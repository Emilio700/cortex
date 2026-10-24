/**
 * Coordinación entre pestañas de GEMS abiertas a la vez (plan 27, F-10).
 *
 * Antes cada pestaña sondeaba por su cuenta. Con sonido y notificación del
 * navegador, dos pestañas sonarían dos veces por el mismo aviso. Aquí:
 *
 * - **Una sola pestaña sondea** (la líder), elegida con `navigator.locks`: el
 *   candado se suelta solo cuando la pestaña se cierra y otra lo toma.
 * - La líder **reparte** lo que obtuvo por `BroadcastChannel`.
 * - El **anuncio** (sonido, notificación del navegador) de cada aviso se
 *   reclama en `localStorage`: aunque falte `navigator.locks` y todas sondeen,
 *   sólo una lo anuncia.
 *
 * Sin `BroadcastChannel` ni `navigator.locks` (navegadores viejos), cada
 * pestaña se comporta como antes: sondea sola. Nada se rompe.
 */

export type MensajeEntrePestanas<T> =
  | { tipo: 'instantanea'; datos: T }
  | { tipo: 'refrescar' }
  | { tipo: 'visible' }

interface LockManagerMinimo {
  request: (nombre: string, callback: () => Promise<void>) => Promise<unknown>
}

export interface Coordinador<T> {
  esLider: () => boolean
  /** Avisa cuando esta pestaña pasa a ser la líder. */
  alSerLider: (fn: () => void) => void
  publicar: (mensaje: MensajeEntrePestanas<T>) => void
  alRecibir: (fn: (mensaje: MensajeEntrePestanas<T>) => void) => void
  cerrar: () => void
}

export function crearCoordinador<T>(nombre: string): Coordinador<T> {
  let lider = false
  let soltarCandado: (() => void) | null = null
  let cerrado = false
  const alLiderar: Array<() => void> = []
  const receptores: Array<(m: MensajeEntrePestanas<T>) => void> = []

  let canal: BroadcastChannel | null = null
  try {
    canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(nombre) : null
  } catch {
    canal = null
  }
  if (canal) {
    canal.onmessage = (evento: MessageEvent<MensajeEntrePestanas<T>>) => {
      for (const fn of receptores) fn(evento.data)
    }
  }

  const volverseLider = () => {
    if (cerrado || lider) return
    lider = true
    for (const fn of alLiderar) fn()
  }

  const locks = (typeof navigator !== 'undefined' ? (navigator as { locks?: LockManagerMinimo }).locks : undefined)
  if (locks && canal) {
    // La promesa no se resuelve mientras la pestaña viva: así se conserva el
    // candado. Al cerrarse la pestaña, el navegador lo suelta solo.
    locks
      .request(`${nombre}-lider`, () =>
        new Promise<void>((resolve) => {
          soltarCandado = resolve
          volverseLider()
        }),
      )
      .catch(() => volverseLider())
  } else {
    // Sin candados no hay forma segura de elegir: cada pestaña sondea, y el
    // anuncio se sigue reclamando una sola vez en localStorage.
    queueMicrotask(volverseLider)
  }

  return {
    esLider: () => lider,
    alSerLider: (fn) => {
      alLiderar.push(fn)
      if (lider) fn()
    },
    publicar: (mensaje) => {
      try {
        canal?.postMessage(mensaje)
      } catch {
        /* una pestaña que se cierra a media publicación no importa */
      }
    },
    alRecibir: (fn) => {
      receptores.push(fn)
    },
    cerrar: () => {
      cerrado = true
      lider = false
      soltarCandado?.()
      try {
        canal?.close()
      } catch {
        /* ya estaba cerrado */
      }
    },
  }
}

const llaveAnuncios = (usuarioId: number | string, espacio: string) =>
  espacio === 'avisos' ? `gems_avisos_anunciados_${usuarioId}` : `gems_${espacio}_anunciados_${usuarioId}`

/**
 * ¿Le toca a esta pestaña anunciar este aviso? La primera que lo reclama se
 * queda con él; las demás no suenan. Si `localStorage` falla, se anuncia:
 * sonar dos veces es mejor que no sonar. `espacio` separa ids de tablas
 * distintas (avisos y resultados críticos).
 */
export function reclamarAnuncio(usuarioId: number | string, avisoId: number, espacio = 'avisos'): boolean {
  try {
    const llave = llaveAnuncios(usuarioId, espacio)
    const ultimo = Number(localStorage.getItem(llave) ?? '0')
    if (Number.isFinite(ultimo) && avisoId <= ultimo) return false
    localStorage.setItem(llave, String(avisoId))
    return true
  } catch {
    return true
  }
}
