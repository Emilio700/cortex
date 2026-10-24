/**
 * Decide qué recorridos le tocan a quién y qué pasos se pueden mostrar ahora.
 *
 * La regla de acceso copia la de `AccessGuard`: permiso primero y rol de
 * respaldo. Si divergieran, el menú de ayuda ofrecería un recorrido de una
 * pantalla que a la usuaria la echa a /403, o le escondería uno que sí puede usar.
 */
import type { AccesoTutoriales, PasoRecorrido, Recorrido } from './tipos'

export function puedeVerRecorrido(recorrido: Recorrido, acceso: AccesoTutoriales): boolean {
  const { requiere, roles, soloRoles } = recorrido
  if (soloRoles?.length && (acceso.role === undefined || !soloRoles.includes(acceso.role))) return false
  if (!requiere?.length && !roles?.length) return true

  const permisos = acceso.permissions ?? []
  // Una sesión vieja sin permisos no se lee como "no tiene ninguno": decide el rol.
  const porPermiso =
    Boolean(requiere?.length) && permisos.length > 0 && requiere!.some((p) => permisos.includes(p))
  const porRol = Boolean(roles?.length) && acceso.role !== undefined && roles!.includes(acceso.role)
  return porPermiso || porRol
}

export function recorridosDisponibles(
  catalogo: Recorrido[],
  acceso: AccesoTutoriales,
): Recorrido[] {
  return catalogo.filter((r) => puedeVerRecorrido(r, acceso))
}

/** ¿La ruta concreta (`/doctor/consultation/15`) corresponde al patrón (`/doctor/consultation/:appointmentId`)? */
export function rutaCoincide(patron: string, ruta: string): boolean {
  const a = patron.split('/').filter(Boolean)
  const b = ruta.split('/').filter(Boolean)
  if (a.length !== b.length) return false
  return a.every((segmento, i) => segmento.startsWith(':') || segmento === b[i])
}

export function recorridosDeRuta(disponibles: Recorrido[], ruta: string): Recorrido[] {
  return disponibles.filter((r) => r.ruta !== undefined && rutaCoincide(r.ruta, ruta))
}

/**
 * ¿El elemento se ve? Las pestañas de la app quedan montadas con
 * `display: none` y los bloques plegados también; señalar algo escondido
 * dibujaría el recuadro sobre la nada.
 *
 * Se revisa el estilo de la cadena de ancestros en vez de medir la caja porque
 * así funciona igual en el navegador y en las pruebas (jsdom no mide nada).
 */
export function estaVisible(elemento: Element): boolean {
  let actual: Element | null = elemento
  while (actual && actual !== document.documentElement) {
    if (actual instanceof HTMLElement) {
      if (actual.hidden) return false
      const estilo = window.getComputedStyle(actual)
      if (estilo.display === 'none' || estilo.visibility === 'hidden') return false
      // CCollapse cerrado deja la clase `collapse` sin `show`; su CSS lo oculta,
      // pero en pruebas no hay CSS, así que se mira la clase directamente.
      if (actual.classList.contains('collapse') && !actual.classList.contains('show')) return false
    }
    actual = actual.parentElement
  }
  if (actual === null) return false
  // El menú lateral en el celular no se oculta: se corre fuera de la pantalla.
  // Sólo se descarta si la caja tiene tamaño (en jsdom todo mide cero y no
  // hay forma de saber dónde quedó).
  const caja = elemento.getBoundingClientRect()
  if (caja.width > 0 && (caja.right <= 0 || caja.left >= window.innerWidth)) return false
  return true
}

/**
 * Primer elemento visible con ese `data-tour`. Puede haber varios: dos
 * consultas abiertas en pestañas distintas pintan los mismos ids, y hay que
 * señalar el de la pestaña que se está viendo.
 */
export function buscarElemento(id: string, raiz: ParentNode = document): HTMLElement | null {
  const candidatos = raiz.querySelectorAll<HTMLElement>(`[data-tour="${cssEscape(id)}"]`)
  for (const candidato of Array.from(candidatos)) {
    if (estaVisible(candidato)) return candidato
  }
  return null
}

const cssEscape = (valor: string) =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(valor)
    : valor.replace(/["\\]/g, '\\$&')

/** Primer elemento visible entre las alternativas de un paso. */
export function buscarAncla(
  elemento: string | string[],
  raiz: ParentNode = document,
): HTMLElement | null {
  const ids = Array.isArray(elemento) ? elemento : [elemento]
  for (const id of ids) {
    const encontrado = buscarElemento(id, raiz)
    if (encontrado) return encontrado
  }
  return null
}

/**
 * Pasos que se pueden mostrar ahora. Un paso cuyo elemento no está (otra
 * usuaria con otros permisos, una lista vacía, un id que aún no existe) se
 * omite en vez de romper el recorrido o señalar un hueco.
 */
export function pasosPresentes(pasos: PasoRecorrido[], raiz: ParentNode = document): PasoRecorrido[] {
  return pasos.filter((paso) => !paso.elemento || buscarAncla(paso.elemento, raiz) !== null)
}

/** ¿Aplica ahora un recorrido con contexto (p. ej. un modal abierto)? */
export function contextoPresente(recorrido: Recorrido, raiz: ParentNode = document): boolean {
  return !recorrido.contexto || buscarElemento(recorrido.contexto, raiz) !== null
}

/**
 * ¿Hay algo en pantalla que merezca contenido propio? Si ni uno solo de los
 * pasos con elemento está, el recorrido sería sólo tarjetas sueltas hablando
 * de cosas que no se ven: mejor no arrancarlo solo.
 */
export function tieneAncla(pasos: PasoRecorrido[], raiz: ParentNode = document): boolean {
  const conElemento = pasos.filter((p) => p.elemento)
  if (conElemento.length === 0) return true
  return conElemento.some((p) => buscarAncla(p.elemento!, raiz) !== null)
}
