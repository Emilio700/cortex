/**
 * Recuerda qué recorridos ya vio cada usuaria, por versión.
 *
 * Se guarda en localStorage porque es sólo una comodidad: si el navegador lo
 * bloquea (ventana privada, políticas de la clínica, cuota llena), lo peor que
 * pasa es que el recorrido se ofrezca otra vez. Por eso toda lectura y escritura
 * va envuelta en try/catch y nunca debe romper la pantalla.
 *
 * Además se lleva una copia en memoria: si localStorage falla, que el recorrido
 * no vuelva a saltar cada vez que el médico cambia de pestaña en la misma sesión.
 */

const PREFIJO = 'gems.tutoriales.vistos.'

type Vistos = Record<string, number>

const enMemoria = new Map<string, Vistos>()

const llave = (usuarioId: number | string) => `${PREFIJO}${usuarioId}`

const leerPersistido = (usuarioId: number | string): Vistos => {
  try {
    const crudo = window.localStorage.getItem(llave(usuarioId))
    if (!crudo) return {}
    const datos = JSON.parse(crudo) as unknown
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return {}
    const limpio: Vistos = {}
    for (const [id, version] of Object.entries(datos as Record<string, unknown>)) {
      if (typeof version === 'number') limpio[id] = version
    }
    return limpio
  } catch {
    return {}
  }
}

const leer = (usuarioId: number | string): Vistos => ({
  ...leerPersistido(usuarioId),
  ...(enMemoria.get(String(usuarioId)) ?? {}),
})

/** ¿Ya vio esta versión (o una posterior) del recorrido? */
export function yaLoVio(usuarioId: number | string, recorridoId: string, version: number): boolean {
  const vistos = leer(usuarioId)
  return (vistos[recorridoId] ?? 0) >= version
}

/**
 * ¿Vio completa alguna versión, aunque sea una anterior? Distingue a quien
 * entra por primera vez de quien ya conoce el sistema y sólo cambió el texto.
 */
export function vioAlgunaVersion(usuarioId: number | string, recorridoId: string): boolean {
  return (leer(usuarioId)[recorridoId] ?? 0) > 0
}

/**
 * Anota que lo vio completo. Si no se puede guardar, queda al menos en memoria.
 * El progreso a medias ya no sirve: se borra para que no se ofrezca "continuar".
 */
export function marcarVisto(usuarioId: number | string, recorridoId: string, version: number): void {
  borrarProgreso(usuarioId, recorridoId)
  const clave = String(usuarioId)
  enMemoria.set(clave, { ...(enMemoria.get(clave) ?? {}), [recorridoId]: version })
  try {
    const vistos = { ...leerPersistido(usuarioId), [recorridoId]: version }
    window.localStorage.setItem(llave(usuarioId), JSON.stringify(vistos))
  } catch {
    // Sin almacenamiento el recorrido volverá a ofrecerse en otra sesión; es
    // preferible a interrumpir a quien está trabajando.
  }
}

/** Olvida lo visto y lo dejado a medias (para volver a ver todos los recorridos). */
export function olvidarVistos(usuarioId: number | string): void {
  enMemoria.delete(String(usuarioId))
  progresoEnMemoria.delete(String(usuarioId))
  try {
    window.localStorage.removeItem(llave(usuarioId))
    window.localStorage.removeItem(llaveProgreso(usuarioId))
  } catch {
    // Igual que arriba: no hay nada que hacer si el navegador no deja.
  }
}

/* ------------------------------------------------------------------ */
/* Progreso de un recorrido que se cerró antes de terminar.            */
/*                                                                    */
/* El recorrido completo usa el mismo almacén con su propio id: su     */
/* "paso" es la etapa en que va, y terminarlo lo marca como visto.     */
/*                                                                    */
/* Cerrar a medias no cuenta como visto: quien lo cierra en el paso 3  */
/* de 9 no vio lo demás. Se guarda el último paso que vio para poder   */
/* ofrecerle continuar ahí, con la misma tolerancia a fallos de arriba.*/
/* ------------------------------------------------------------------ */

const PREFIJO_PROGRESO = 'gems.tutoriales.progreso.'

export interface Progreso {
  version: number
  /** Índice del último paso que vio, contado sobre los pasos declarados del recorrido. */
  paso: number
  /**
   * Lo que decía el globo en ese paso ("Paso 2 de 8"), contado sobre los
   * pasos que sí estaban en pantalla. Se guarda aparte porque un paso que no
   * aplica en ese equipo (el menú del celular en escritorio) se salta, y el
   * índice decía "a medias (2 de 9)" cuando la persona vio "2 de 8".
   */
  enPantalla?: { posicion: number; total: number }
}

/** `null` en memoria quiere decir "borrado", aunque en localStorage no se haya podido borrar. */
type Progresos = Record<string, Progreso | null>

const progresoEnMemoria = new Map<string, Progresos>()

const llaveProgreso = (usuarioId: number | string) => `${PREFIJO_PROGRESO}${usuarioId}`

const esProgreso = (valor: unknown): valor is Progreso =>
  Boolean(valor) &&
  typeof valor === 'object' &&
  Number.isInteger((valor as Progreso).version) &&
  Number.isInteger((valor as Progreso).paso) &&
  (valor as Progreso).paso >= 0

const esEnPantalla = (valor: unknown): valor is Progreso['enPantalla'] =>
  Boolean(valor) &&
  typeof valor === 'object' &&
  Number.isInteger((valor as { posicion: number }).posicion) &&
  Number.isInteger((valor as { total: number }).total) &&
  (valor as { posicion: number }).posicion >= 1 &&
  (valor as { total: number }).total >= (valor as { posicion: number }).posicion

const leerProgresoPersistido = (usuarioId: number | string): Record<string, Progreso> => {
  try {
    const crudo = window.localStorage.getItem(llaveProgreso(usuarioId))
    if (!crudo) return {}
    const datos = JSON.parse(crudo) as unknown
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return {}
    const limpio: Record<string, Progreso> = {}
    for (const [id, valor] of Object.entries(datos as Record<string, unknown>)) {
      if (!esProgreso(valor)) continue
      limpio[id] = { version: valor.version, paso: valor.paso }
      if (esEnPantalla(valor.enPantalla)) limpio[id].enPantalla = valor.enPantalla
    }
    return limpio
  } catch {
    return {}
  }
}

const escribirProgreso = (usuarioId: number | string, recorridoId: string, valor: Progreso | null) => {
  const clave = String(usuarioId)
  progresoEnMemoria.set(clave, { ...(progresoEnMemoria.get(clave) ?? {}), [recorridoId]: valor })
  try {
    const persistido = leerProgresoPersistido(usuarioId)
    if (valor) persistido[recorridoId] = valor
    else delete persistido[recorridoId]
    if (Object.keys(persistido).length === 0) {
      window.localStorage.removeItem(llaveProgreso(usuarioId))
    } else {
      window.localStorage.setItem(llaveProgreso(usuarioId), JSON.stringify(persistido))
    }
  } catch {
    // Sin almacenamiento, el progreso dura lo que dure la sesión.
  }
}

/**
 * Paso en que se quedó, o `null` si no hay progreso de esta versión. El de una
 * versión anterior se descarta: los pasos cambiaron y "paso 4" ya no quiere
 * decir lo mismo.
 */
export function leerProgreso(
  usuarioId: number | string,
  recorridoId: string,
  version: number,
): number | null {
  return leerAvance(usuarioId, recorridoId, version)?.paso ?? null
}

/** Igual que `leerProgreso`, con lo que decía el globo en ese paso. */
export function leerAvance(
  usuarioId: number | string,
  recorridoId: string,
  version: number,
): Progreso | null {
  const memoria = progresoEnMemoria.get(String(usuarioId)) ?? {}
  const guardado =
    recorridoId in memoria ? memoria[recorridoId] : leerProgresoPersistido(usuarioId)[recorridoId]
  if (!guardado) return null
  if (guardado.version !== version) {
    escribirProgreso(usuarioId, recorridoId, null)
    return null
  }
  return guardado
}

export function guardarProgreso(
  usuarioId: number | string,
  recorridoId: string,
  version: number,
  paso: number,
  enPantalla?: Progreso['enPantalla'],
): void {
  escribirProgreso(usuarioId, recorridoId, enPantalla ? { version, paso, enPantalla } : { version, paso })
}

export function borrarProgreso(usuarioId: number | string, recorridoId: string): void {
  const memoria = progresoEnMemoria.get(String(usuarioId)) ?? {}
  // Evita escribir en localStorage cuando no hay nada que borrar: marcarVisto
  // pasa por aquí en cada recorrido terminado.
  if (!(recorridoId in memoria) && !(recorridoId in leerProgresoPersistido(usuarioId))) return
  escribirProgreso(usuarioId, recorridoId, null)
}

/* ------------------------------------------------------------------ */
/* Aviso de la primera vez junto al botón de ayuda.                    */
/*                                                                    */
/* Se muestra una sola vez por usuaria. Se anota al mostrarse, no al   */
/* cerrarse: quien lo ignora y recarga no tiene por qué volver a verlo. */
/* ------------------------------------------------------------------ */

const PREFIJO_AVISO = 'gems.tutoriales.aviso.'

const avisoEnMemoria = new Set<string>()

export function avisoYaMostrado(usuarioId: number | string): boolean {
  if (avisoEnMemoria.has(String(usuarioId))) return true
  try {
    return window.localStorage.getItem(`${PREFIJO_AVISO}${usuarioId}`) !== null
  } catch {
    // Sin almacenamiento se vuelve a mostrar en otra sesión; en ésta, la
    // copia en memoria evita que reaparezca en cada pantalla.
    return false
  }
}

export function marcarAvisoMostrado(usuarioId: number | string): void {
  avisoEnMemoria.add(String(usuarioId))
  try {
    window.localStorage.setItem(`${PREFIJO_AVISO}${usuarioId}`, '1')
  } catch {
    // Igual que arriba: queda al menos en memoria.
  }
}

/* El aviso de novedades de una versión: una vez por usuaria y por versión. */
const PREFIJO_NOVEDADES = 'gems.tutoriales.novedades.'
const novedadesEnMemoria = new Set<string>()

export function novedadesYaAvisadas(usuarioId: number | string, version: string): boolean {
  const clave = `${PREFIJO_NOVEDADES}${version}.${usuarioId}`
  if (novedadesEnMemoria.has(clave)) return true
  try {
    return window.localStorage.getItem(clave) !== null
  } catch {
    return false
  }
}

export function marcarNovedadesAvisadas(usuarioId: number | string, version: string): void {
  const clave = `${PREFIJO_NOVEDADES}${version}.${usuarioId}`
  novedadesEnMemoria.add(clave)
  try {
    window.localStorage.setItem(clave, '1')
  } catch {
    // Queda al menos en memoria.
  }
}

/** Sólo para pruebas: la copia en memoria sobrevive entre casos si no se limpia. */
export function _limpiarMemoriaParaPruebas(): void {
  enMemoria.clear()
  progresoEnMemoria.clear()
  avisoEnMemoria.clear()
  novedadesEnMemoria.clear()
}
