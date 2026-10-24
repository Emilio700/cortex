/**
 * Cálculos de fecha y hora del modal de cita, en funciones puras.
 *
 * Todo esto trabaja con **hora local del consultorio**. `scheduled_at` se
 * guarda sin zona horaria, así que aquí no se usa `toISOString()` ni
 * `Date.UTC`: pasar por UTC desfasa la agenda siete horas, que es justamente
 * el error que ya se cometió una vez.
 */
import type { DiaDisponible, Franja } from '../../../shared/services/disponibilidad'

export const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

const dosDigitos = (n: number): string => String(n).padStart(2, '0')

/** "2026-09-19" a partir de un Date local. Sin pasar por UTC. */
export const aClaveFecha = (fecha: Date): string =>
  `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`

/** El Date local de una clave "2026-09-19". */
export const deClaveFecha = (clave: string): Date => {
  const [anio, mes, dia] = clave.split('-').map(Number)
  return new Date(anio, (mes || 1) - 1, dia || 1)
}

/** "2026-09-19T09:00:00" -> "2026-09-19". Corta la cadena, no la interpreta. */
export const fechaDeIso = (iso: string): string => iso.slice(0, 10)

/** "19 de septiembre de 2026", como lo lee el subtítulo de la rejilla. */
export const fechaLarga = (fecha: Date): string =>
  `${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`

/** "septiembre 2026", el encabezado del calendario. */
export const mesYAnio = (fecha: Date): string => `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`

/** Mismo día del calendario (ignora la hora). */
export const mismoDia = (a: Date, b: Date): boolean => aClaveFecha(a) === aClaveFecha(b)

/** Primer día del mes siguiente o anterior, conservando el año. */
export const desplazarMes = (fecha: Date, meses: number): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth() + meses, 1)

/** Una casilla del calendario mensual. */
export interface CasillaCalendario {
  fecha: Date
  clave: string
  /** Pertenece al mes que se está mirando (las de relleno, no). */
  delMes: boolean
}

/**
 * Las 6 semanas de casillas de un mes, empezando en lunes.
 *
 * Siempre 42 casillas: si la rejilla cambiara de alto al pasar de mes, el
 * modal daría un salto y la asistente perdería el sitio.
 */
export const casillasDelMes = (referencia: Date): CasillaCalendario[] => {
  const primero = new Date(referencia.getFullYear(), referencia.getMonth(), 1)
  // getDay() es 0=domingo; aquí la semana empieza en lunes.
  const desplazamiento = (primero.getDay() + 6) % 7
  const inicio = new Date(primero.getFullYear(), primero.getMonth(), 1 - desplazamiento)

  return Array.from({ length: 42 }, (_, i) => {
    const fecha = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)
    return {
      fecha,
      clave: aClaveFecha(fecha),
      delMes: fecha.getMonth() === referencia.getMonth(),
    }
  })
}

/** Índice por fecha para consultar la disponibilidad de una casilla en O(1). */
export const indexarDias = (dias: DiaDisponible[]): Record<string, DiaDisponible> =>
  Object.fromEntries(dias.map((dia) => [dia.fecha, dia]))

export type EstadoDia = 'seleccionada' | 'disponible' | 'no-disponible' | 'sin-datos'

/**
 * Cómo se pinta una casilla del calendario, que es exactamente la leyenda:
 * Fecha seleccionada · Disponible · No disponible.
 *
 * `sin-datos` es el caso honesto de las casillas de relleno y de cuando
 * todavía no se sabe (aún no hay doctor elegido, o la consulta falló): se
 * dejan neutras en vez de afirmar algo que no se ha comprobado.
 */
export const estadoDeCasilla = (
  casilla: CasillaCalendario,
  seleccionada: string | null,
  porFecha: Record<string, DiaDisponible>,
): EstadoDia => {
  if (seleccionada && casilla.clave === seleccionada) return 'seleccionada'
  if (!casilla.delMes) return 'sin-datos'
  const dia = porFecha[casilla.clave]
  if (!dia) return 'sin-datos'
  return dia.disponible ? 'disponible' : 'no-disponible'
}

export type Meridiano = 'am' | 'pm'

/**
 * Reparte las franjas entre el conmutador a. m. / p. m.
 *
 * El backend ya etiqueta cada franja, así que aquí sólo se agrupa: la regla de
 * corte (las 12:00 son p. m.) vive en un solo sitio, el servidor.
 */
export const repartirPorMeridiano = (franjas: Franja[]): Record<Meridiano, Franja[]> => ({
  am: franjas.filter((f) => f.meridiano === 'am'),
  pm: franjas.filter((f) => f.meridiano === 'pm'),
})

/**
 * Qué mitad del día conviene enseñar al abrir: la de la franja ya elegida, y
 * si no hay ninguna, la primera que tenga algo libre. Abrir en a. m. una tarde
 * en la que sólo queda hueco por la tarde obliga a un clic de más.
 */
export const meridianoInicial = (franjas: Franja[], seleccionada?: string | null): Meridiano => {
  if (seleccionada) {
    const elegida = franjas.find((f) => f.inicio === seleccionada)
    if (elegida) return elegida.meridiano
  }
  const libre = franjas.find((f) => f.disponible)
  return libre ? libre.meridiano : 'am'
}

/** Cuántas franjas quedan libres. Alimenta el contador del panel. */
export const contarLibres = (franjas: Franja[]): number =>
  franjas.reduce((total, f) => total + (f.disponible ? 1 : 0), 0)

/**
 * Compone el `scheduled_at` que se manda al backend: hora local, sin zona y
 * con segundos, como lo guarda la columna.
 */
export const aScheduledAt = (inicio: string): string =>
  inicio.length === 16 ? `${inicio}:00` : inicio

/** Sustituye el día de un `scheduled_at` conservando la hora. */
export const cambiarDia = (scheduledAt: string, clave: string): string =>
  `${clave}T${scheduledAt.slice(11, 19) || '09:00:00'}`
