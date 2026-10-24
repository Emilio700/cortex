/**
 * Cuentas del inicio de la doctora (plan 28, Fase 2).
 *
 * Todas las cifras de la pantalla salen de la misma lista de citas y se
 * calculan aquí, con prueba. El boceto mostraba números que no cuadraban entre
 * sí (12 citas, pero 4 + 1 + 8 = 13); la pantalla real no puede hacer eso.
 */
import type { Appointment } from '../../secretaria/types'
import { horaDelConsultorio, ZONA_CONSULTORIO } from '../../../shared/utils/date'

// ---------------------------------------------------------------------------
// Conteos del día
// ---------------------------------------------------------------------------

/** Estados que todavía esperan a la doctora: no llegaron, o esperan en sala. */
const POR_ATENDER = new Set(['agendada', 'confirmada', 'en_sala'])

export interface ConteoDelDia {
  /** Citas del día sin las canceladas: las canceladas no son trabajo del día. */
  total: number
  canceladas: number
  /** Agendadas, confirmadas y en sala. */
  porAtender: number
  enSala: number
  /** En sala y sin signos vitales: lo que recepción todavía tiene que tomar. */
  enSalaSinSignos: number
  enConsulta: number
  atendidas: number
  /** Atendidas sobre el total del día, en %. `null` sin citas: no se divide entre cero. */
  porcentajeAtendidas: number | null
}

export const contarDelDia = (citas: Appointment[]): ConteoDelDia => {
  let canceladas = 0
  let porAtender = 0
  let enSala = 0
  let enSalaSinSignos = 0
  let enConsulta = 0
  let atendidas = 0
  for (const cita of citas) {
    const estado = cita.status as string
    if (estado === 'cancelada') canceladas += 1
    if (POR_ATENDER.has(estado)) porAtender += 1
    if (estado === 'en_sala') {
      enSala += 1
      if (!cita.has_triage) enSalaSinSignos += 1
    }
    if (estado === 'en_consulta') enConsulta += 1
    if (estado === 'atendida') atendidas += 1
  }
  const total = citas.length - canceladas
  return {
    total,
    canceladas,
    porAtender,
    enSala,
    enSalaSinSignos,
    enConsulta,
    atendidas,
    porcentajeAtendidas: total > 0 ? Math.round((atendidas / total) * 100) : null,
  }
}

// ---------------------------------------------------------------------------
// Pestañas de la agenda de hoy
// ---------------------------------------------------------------------------

export type PestanaAgenda = 'todas' | 'por_atender' | 'en_sala' | 'en_consulta' | 'atendidas'

export const PESTANAS_AGENDA: { id: PestanaAgenda; nombre: string }[] = [
  { id: 'todas', nombre: 'Todas' },
  { id: 'por_atender', nombre: 'Por atender' },
  { id: 'en_sala', nombre: 'En sala' },
  { id: 'en_consulta', nombre: 'En consulta' },
  { id: 'atendidas', nombre: 'Atendidas' },
]

const porHora = (a: Appointment, b: Appointment) => a.scheduled_at.localeCompare(b.scheduled_at)

/**
 * Las citas de una pestaña, por hora. Las canceladas solo salen en «Todas»
 * (atenuadas): ahí se ve el día completo; en las demás estorbarían.
 */
export const filtrarPorPestana = (citas: Appointment[], pestana: PestanaAgenda): Appointment[] => {
  const elegidas = citas.filter((cita) => {
    const estado = cita.status as string
    switch (pestana) {
      case 'todas':
        return true
      case 'por_atender':
        return POR_ATENDER.has(estado)
      case 'en_sala':
        return estado === 'en_sala'
      case 'en_consulta':
        return estado === 'en_consulta'
      case 'atendidas':
        return estado === 'atendida'
    }
  })
  return [...elegidas].sort(porHora)
}

/** Número de cada pestaña, de las mismas cuentas que los indicadores. */
export const numeroDePestana = (conteo: ConteoDelDia, pestana: PestanaAgenda): number => {
  switch (pestana) {
    case 'todas':
      return conteo.total
    case 'por_atender':
      return conteo.porAtender
    case 'en_sala':
      return conteo.enSala
    case 'en_consulta':
      return conteo.enConsulta
    case 'atendidas':
      return conteo.atendidas
  }
}

// ---------------------------------------------------------------------------
// Siguiente paciente
// ---------------------------------------------------------------------------

export interface SiguientePaciente {
  cita: Appointment
  /** Por qué es ella: cambia el texto del botón. */
  motivo: 'en_consulta' | 'en_sala' | 'por_atender'
}

/**
 * A quién abrir con «Siguiente paciente».
 *
 * Primero la consulta que la doctora dejó abierta (continuarla), luego la
 * primera que espera en sala y, si nadie ha llegado, la siguiente por hora.
 * No existe consulta sin cita: si no hay nadie, `null`.
 */
export const siguientePaciente = (citas: Appointment[]): SiguientePaciente | null => {
  const ordenadas = [...citas].sort(porHora)
  const abierta = ordenadas.find((c) => c.status === 'en_consulta')
  if (abierta) return { cita: abierta, motivo: 'en_consulta' }
  const enSala = ordenadas.find((c) => c.status === 'en_sala')
  if (enSala) return { cita: enSala, motivo: 'en_sala' }
  const pendiente = ordenadas.find((c) => c.status === 'agendada' || c.status === 'confirmada')
  return pendiente ? { cita: pendiente, motivo: 'por_atender' } : null
}

// ---------------------------------------------------------------------------
// Pacientes recientes
// ---------------------------------------------------------------------------

/**
 * Las últimas `n` pacientes distintas que atendió, de la más reciente a la más
 * antigua. Una paciente que vino tres veces sale una sola, con su última cita.
 */
export const recientesDistintas = (citas: Appointment[], n = 5): Appointment[] => {
  const vistas = new Set<number>()
  const resultado: Appointment[] = []
  for (const cita of [...citas].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))) {
    if (vistas.has(cita.patient_id)) continue
    vistas.add(cita.patient_id)
    resultado.push(cita)
    if (resultado.length === n) break
  }
  return resultado
}

// ---------------------------------------------------------------------------
// Saludo y hora del consultorio
// ---------------------------------------------------------------------------

/** La hora (0–23) que marca el reloj del consultorio en ese instante. */
export const horaEnConsultorio = (ahora: Date = new Date()): number => {
  const hora = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_CONSULTORIO,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(ahora)
  return Number(hora) % 24
}

/**
 * «Buenos días» de 6 a 11:59, «Buenas tardes» de 12 a 18:59 y «Buenas noches»
 * el resto, con la hora de Mazatlán y no la del navegador. Antes decía
 * «Buenos días» a cualquier hora.
 */
export const saludoPorHora = (hora: number): string => {
  if (hora >= 6 && hora < 12) return 'Buenos días'
  if (hora >= 12 && hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ---------------------------------------------------------------------------
// Pequeños textos de la cita
// ---------------------------------------------------------------------------

/** «ML» de «María Fernanda» + «López»: primer nombre y primer apellido. Sin nombre, «?». */
export const iniciales = (nombre = '', apellido = ''): string => {
  const primera = nombre.trim().charAt(0)
  const segunda = apellido.trim().charAt(0)
  const texto = `${primera}${segunda}`.toUpperCase()
  return texto || '?'
}

/** «28.3 SDG», o `null` si el servidor no mandó semanas (no hay embarazo activo o no se puede ver). */
export const etiquetaSemanas = (cita: Pick<Appointment, 'semanas_gestacion' | 'dias_gestacion'>): string | null => {
  if (cita.semanas_gestacion === null || cita.semanas_gestacion === undefined) return null
  return `${cita.semanas_gestacion}.${cita.dias_gestacion ?? 0} SDG`
}

/** Minutos de la hora de una cita en el reloj del consultorio, para la línea de tiempo. */
export const minutosDelDia = (scheduledAt: string): number => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_CONSULTORIO,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(horaDelConsultorio(scheduledAt))
  const de = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0)
  return (de('hour') % 24) * 60 + de('minute')
}

/** «hace un momento», «hace 3 min», «hace 2 h»: para «Actualizado hace…». */
export const haceCuanto = (desde: Date, ahora: Date = new Date()): string => {
  const minutos = Math.floor((ahora.getTime() - desde.getTime()) / 60000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  return `hace ${Math.floor(minutos / 60)} h`
}

/** Cuántas citas (sin canceladas) hay cada día, por «AAAA-MM-DD» de `scheduled_at`. */
export const conteoPorDia = (citas: Appointment[]): Map<string, number> => {
  const mapa = new Map<string, number>()
  for (const cita of citas) {
    if (cita.status === 'cancelada') continue
    const clave = cita.scheduled_at.slice(0, 10)
    mapa.set(clave, (mapa.get(clave) ?? 0) + 1)
  }
  return mapa
}
