/**
 * Lógica pura del tablero de la agenda.
 *
 * Aquí vive todo lo que el panel lateral, la vista de lista y la exportación
 * necesitan calcular: agrupar citas por día, armar el mes del mini calendario,
 * resumir el mes en cuatro cifras y volcar el rango visible a CSV.
 *
 * No hay React ni llamadas al backend: se parte SIEMPRE de las citas que la
 * página ya cargó del servidor. No se inventa ningún endpoint nuevo.
 *
 * Sobre las cifras del resumen: sólo se calcula lo que los datos permiten
 * afirmar. El sistema no tiene un estado "no asistió", así que el porcentaje
 * de asistencia se mide sobre las citas ya resueltas (atendidas + canceladas)
 * y, cuando no hay ninguna resuelta, se devuelve `null` para que la pantalla
 * no pinte un 0 % que sería mentira.
 */
import type { Appointment } from '../types'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'

/** Etiquetas de estado, tal como las lee el consultorio. */
export const ESTADO_LABELS: Record<string, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  en_sala: 'En sala',
  en_consulta: 'En consulta',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
}

/** Los únicos tipos de cita que existen hoy en el sistema. */
export const TIPO_LABELS: Record<string, string> = {
  consulta: 'Consulta',
  cirugia: 'Cirugía',
  procedimiento: 'Procedimiento',
}

/**
 * Motivos que se ofrecen de un clic al agendar.
 *
 * Son ATAJOS, no una lista cerrada: el campo admite texto libre y puede
 * quedarse vacio. Salieron del boceto del consultorio (Control, Primera vez,
 * Ultrasonido) mas los que ya se escribian a mano en las notas.
 *
 * OJO: esto NO son tipos de cita. Los tipos del sistema siguen siendo
 * `consulta`, `cirugia` y `procedimiento`, y el motivo no colorea nada.
 */
export const MOTIVOS_SUGERIDOS = [
  'CONTROL',
  'PRIMERA VEZ',
  'ULTRASONIDO',
  'REVISION',
  'COLPOSCOPIA',
  'PROCEDIMIENTO',
] as const

/**
 * Motivo de la cita listo para pintar, o null si no se anoto ninguno.
 *
 * Devuelve null tambien cuando viene en blanco o solo con espacios: una
 * etiqueta vacia en la tarjeta se lee como un fallo de la pantalla.
 */
export const motivoDeCita = (cita: Appointment): string | null => {
  const motivo = (cita.motivo_extra ?? '').trim()
  return motivo || null
}

/** Color con el que se pinta cada estado (el mismo del calendario). */
export const ESTADO_COLORES: Record<string, string> = {
  agendada: '#0d6efd',
  confirmada: '#198754',
  // Naranja oscuro: con letra blanca, #fd7e14 no llegaba a 4.5:1 (plan 32).
  en_sala: '#b8520b',
  // Morado: distinto de todos los demás y con texto blanco legible.
  en_consulta: '#6f42c1',
  atendida: '#6c757d',
  cancelada: '#dc3545',
}

/** Estados que siguen pendientes de atenderse. */
const ESTADOS_PENDIENTES = new Set(['agendada', 'confirmada'])

const dosDigitos = (n: number): string => String(n).padStart(2, '0')

/** Clave local de un día: "2026-09-19". En hora local, como el resto de la app. */
export const claveDia = (valor: string | Date): string => {
  const fecha = valor instanceof Date ? valor : new Date(valor)
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`
}

/** ¿Son el mismo día natural? */
export const mismoDia = (a: Date, b: Date): boolean => claveDia(a) === claveDia(b)

const porHora = (a: Appointment, b: Appointment): number =>
  new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()

/**
 * Reparte las citas por día natural. Cada día queda ordenado por hora, que es
 * como se leen: de la primera de la mañana a la última de la tarde.
 */
export const agruparCitasPorDia = (citas: Appointment[]): Map<string, Appointment[]> => {
  const mapa = new Map<string, Appointment[]>()
  for (const cita of citas) {
    const clave = claveDia(cita.scheduled_at)
    const lista = mapa.get(clave)
    if (lista) lista.push(cita)
    else mapa.set(clave, [cita])
  }
  for (const lista of mapa.values()) lista.sort(porHora)
  return mapa
}

/** Citas de un día concreto, ya ordenadas por hora. */
export const citasDeDia = (citas: Appointment[], dia: Date): Appointment[] =>
  citas.filter((cita) => claveDia(cita.scheduled_at) === claveDia(dia)).sort(porHora)

/** Las cuatro cifras del resumen. `asistencia` es null cuando no se puede calcular. */
export interface ResumenMes {
  /** Todas las citas del periodo, canceladas incluidas. */
  programadas: number
  /** Aún por atender: agendadas y confirmadas. */
  pendientes: number
  canceladas: number
  /** Atendidas sobre resueltas (atendidas + canceladas), en %. null si no hay resueltas. */
  asistencia: number | null
}

/**
 * Resume un conjunto de citas en las cuatro cifras del panel.
 *
 * El porcentaje de asistencia NO divide entre el total: una cita de dentro de
 * dos semanas todavía no ha faltado a nada. Se mide sólo sobre lo ya resuelto.
 */
export const resumenDelMes = (citas: Appointment[]): ResumenMes => {
  let pendientes = 0
  let canceladas = 0
  let atendidas = 0

  for (const cita of citas) {
    if (cita.status === 'cancelada') canceladas += 1
    else if (cita.status === 'atendida') atendidas += 1
    if (ESTADOS_PENDIENTES.has(cita.status)) pendientes += 1
  }

  const resueltas = atendidas + canceladas
  return {
    programadas: citas.length,
    pendientes,
    canceladas,
    asistencia: resueltas === 0 ? null : Math.round((atendidas / resueltas) * 100),
  }
}

/** Lo que se pinta en una tarjeta de cita del panel lateral. */
export interface TarjetaCita {
  id: number
  /** "08:30", en hora local y 24 h: es como lo dicta la asistente por teléfono. */
  hora: string
  paciente: string
  tipo: string
  /** Nota opcional del motivo, o null si la cita no la tiene. */
  motivo: string | null
  /** Nombre de la sala, o null en las citas históricas que no tienen. */
  sala: string | null
  estado: string
  estadoLabel: string
  estadoColor: string
}

/** Etiqueta legible del tipo de cita. Por defecto, Consulta (es el del backend). */
export const etiquetaTipoCita = (cita: Appointment): string =>
  TIPO_LABELS[cita.appointment_type ?? 'consulta'] ?? 'Consulta'

/** Nombre del paciente tal como debe verse, sin dejar nunca la tarjeta muda. */
export const nombrePaciente = (cita: Appointment): string => {
  if (!cita.patient) return `Paciente #${cita.patient_id}`
  const nombre = `${cita.patient.first_name ?? ''} ${cita.patient.last_name ?? ''}`.trim()
  return nombre || `Paciente #${cita.patient_id}`
}

/** "08:30" a partir de un ISO, en hora local. */
export const horaLocal = (iso: string | Date): string => {
  const fecha = iso instanceof Date ? iso : new Date(iso)
  return `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
}

/** Todo lo que necesita la tarjeta del panel, en un solo objeto ya formateado. */
export const formatearTarjetaCita = (cita: Appointment): TarjetaCita => ({
  id: cita.id,
  hora: horaLocal(cita.scheduled_at),
  paciente: nombrePaciente(cita),
  tipo: etiquetaTipoCita(cita),
  motivo: motivoDeCita(cita),
  sala: cita.room_name || null,
  estado: cita.status,
  estadoLabel: ESTADO_LABELS[cita.status] ?? cita.status,
  estadoColor: ESTADO_COLORES[cita.status] ?? ESTADO_COLORES.agendada,
})

// --- Mini calendario --------------------------------------------------------

/** Iniciales de los días, empezando en lunes: la semana laboral del consultorio. */
export const DIAS_SEMANA_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Primer día del mes al que pertenece la fecha. */
export const primerDiaDelMes = (fecha: Date): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth(), 1)

/** Último día del mes al que pertenece la fecha. */
export const ultimoDiaDelMes = (fecha: Date): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0)

/** Mes desplazado n posiciones, apuntando al día 1. n negativo va hacia atrás. */
export const mesDesplazado = (fecha: Date, n: number): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth() + n, 1)

/**
 * Rejilla del mini calendario: semanas completas de lunes a domingo que cubren
 * el mes. Los días de relleno (del mes anterior o siguiente) van incluidos:
 * la rejilla nunca tiene huecos, se marcan con `esDelMes`.
 */
export const semanasDelMes = (fecha: Date): Date[][] => {
  const primero = primerDiaDelMes(fecha)
  // getDay(): 0 = domingo. Se convierte a semana que empieza en lunes.
  const desplazamiento = (primero.getDay() + 6) % 7
  const inicio = new Date(primero.getFullYear(), primero.getMonth(), 1 - desplazamiento)

  const ultimo = ultimoDiaDelMes(fecha)
  const semanas: Date[][] = []
  const cursor = new Date(inicio)

  while (cursor <= ultimo || semanas.length === 0 || cursor.getDay() !== 1) {
    const semana: Date[] = []
    for (let i = 0; i < 7; i += 1) {
      semana.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    semanas.push(semana)
    if (cursor > ultimo) break
  }
  return semanas
}

/** ¿Esa fecha cae dentro del mes de referencia? */
export const esDelMes = (fecha: Date, referencia: Date): boolean =>
  fecha.getFullYear() === referencia.getFullYear() && fecha.getMonth() === referencia.getMonth()

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
]

/** "19 de septiembre", como lo escribiría la asistente. */
export const tituloDia = (dia: Date): string => `${dia.getDate()} de ${MESES[dia.getMonth()]}`

/** "Septiembre 2026", para la cabecera del mini calendario. */
export const tituloMes = (fecha: Date): string => {
  const nombre = MESES[fecha.getMonth()]
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${fecha.getFullYear()}`
}

/** Primer instante del mes, en ISO, para pedirle el rango al servidor. */
export const inicioDelMesISO = (fecha: Date): string =>
  new Date(fecha.getFullYear(), fecha.getMonth(), 1, 0, 0, 0, 0).toISOString()

/** Último instante del mes, en ISO. */
export const finDelMesISO = (fecha: Date): string =>
  new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

// --- Exportación a CSV ------------------------------------------------------

/** Cabeceras del CSV, en el orden en que se leen. */
export const CSV_CABECERAS = [
  'Fecha',
  'Hora',
  'Paciente',
  'Médico',
  'Tipo',
  'Motivo',
  'Sala',
  'Estado',
  'Duración (min)',
  'Notas',
]

const escaparCampo = (valor: string): string =>
  /[",\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor

/** Duración real en minutos; las cirugías se miden en horas. */
const duracionMinutos = (cita: Appointment): number => {
  if (cita.duration_hours && cita.duration_hours > 0) return Math.round(cita.duration_hours * 60)
  return cita.duration_minutes > 0 ? cita.duration_minutes : 30
}

/** Una fila del CSV, ya en texto plano. */
export const filaCsvDeCita = (cita: Appointment): string[] => [
  claveDia(cita.scheduled_at),
  horaLocal(cita.scheduled_at),
  nombrePaciente(cita),
  cita.doctor?.full_name ? nombreConTratamiento(cita.doctor) : 'Sin asignar',
  etiquetaTipoCita(cita),
  motivoDeCita(cita) ?? '',
  cita.room_name || 'Sin sala',
  ESTADO_LABELS[cita.status] ?? cita.status,
  String(duracionMinutos(cita)),
  (cita.notes ?? '').replace(/\s*\n\s*/g, ' ').trim(),
]

/**
 * CSV del rango visible, ordenado por fecha y hora. Siempre lleva la fila de
 * cabeceras: una hoja sin encabezados no la entiende nadie en administración.
 */
export const csvDeCitas = (citas: Appointment[]): string => {
  const filas = [...citas].sort(porHora).map(filaCsvDeCita)
  return [CSV_CABECERAS, ...filas].map((fila) => fila.map(escaparCampo).join(',')).join('\r\n')
}

/** "agenda-2026-09-01-a-2026-09-30.csv" */
export const nombreArchivoCsv = (inicio: Date, fin: Date): string =>
  `agenda-${claveDia(inicio)}-a-${claveDia(fin)}.csv`
