/**
 * Disponibilidad de la agenda — único punto de acceso HTTP al recurso.
 *
 * Alimenta el calendario y la rejilla de horarios del modal de cita. Lo que
 * este endpoint devuelve como disponible **se puede agendar de verdad**: el
 * backend compone ahí las mismas reglas que valida al guardar la cita
 * (empalme del doctor, bloqueos de agenda, horario de atención y choque de
 * sala), así que la pantalla no ofrece nada que el servidor vaya a rechazar.
 *
 * CONTRATO (prefijo real `/api/v1`, lo añade `apiClient`):
 *
 *   GET /doctor-schedule/availability            -> Disponibilidad
 *       Cualquier rol autenticado.
 *       Query:
 *         doctor_id              (int, obligatorio)
 *         fecha                  (AAAA-MM-DD, obligatorio) día de la rejilla
 *         duration_minutes       (int, def. 30) duración que hay que encajar
 *         step_minutes           (int, def. 15) cada cuánto se ofrece franja
 *         room_id                (int, opcional) sala concreta; sin ella basta
 *                                con que quede alguna sala libre
 *         exclude_appointment_id (int, opcional) la cita que se está editando,
 *                                para que no se bloquee a sí misma
 *         incluir_mes            (bool, def. false) añade `dias` con todo el mes
 *         tenant_id              (int, sólo MASTER)
 *
 * Errores del backend, ya en español y que se muestran tal cual:
 *   404 "No se encontró al doctor."
 *
 * Las horas van y vienen en **hora local del consultorio, sin zona horaria**,
 * igual que `scheduled_at`. Nada de `new Date(...).toISOString()` sobre estos
 * valores: convertir a UTC desfasa la pantalla siete horas.
 */
import { apiClient } from './api'

const BASE = '/doctor-schedule/availability'

/** Una franja de la rejilla de horarios. */
export interface Franja {
  /** Inicio en hora local del consultorio: "2026-09-19T09:00:00". */
  inicio: string
  /** Etiqueta en 24 h: "09:00". */
  hora: string
  meridiano: 'am' | 'pm'
  disponible: boolean
  /** Por qué no se puede agendar ahí, en español. `null` si está libre. */
  motivo: string | null
}

/** Un día del calendario mensual. */
export interface DiaDisponible {
  /** "2026-09-19". */
  fecha: string
  disponible: boolean
  huecos: number
}

export interface Disponibilidad {
  doctor_id: number
  fecha: string
  duration_minutes: number
  step_minutes: number
  room_id: number | null
  /**
   * El doctor no tiene horario de atención configurado ese día y se está
   * suponiendo la jornada del consultorio (07:00–20:00).
   */
  jornada_por_defecto: boolean
  franjas: Franja[]
  /** Días del mes de `fecha`; vacío si no se pidió el mes. */
  dias: DiaDisponible[]
}

export interface ConsultaDisponibilidad {
  doctorId: number
  /** "AAAA-MM-DD" en hora local; no uses `toISOString()` para construirla. */
  fecha: string
  duracionMinutos?: number
  pasoMinutos?: number
  salaId?: number | null
  excluirCitaId?: number | null
  incluirMes?: boolean
}

const extractMessage = (error: unknown, fallback: string): string => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const msg = (detail[0] as { msg?: unknown })?.msg
    if (typeof msg === 'string') return msg
  }
  return fallback
}

export const getDisponibilidad = async ({
  doctorId,
  fecha,
  duracionMinutos = 30,
  pasoMinutos,
  salaId,
  excluirCitaId,
  incluirMes,
}: ConsultaDisponibilidad): Promise<Disponibilidad> => {
  const params: Record<string, unknown> = {
    doctor_id: doctorId,
    fecha,
    duration_minutes: duracionMinutos,
  }
  if (pasoMinutos) params.step_minutes = pasoMinutos
  if (salaId != null) params.room_id = salaId
  if (excluirCitaId != null) params.exclude_appointment_id = excluirCitaId
  if (incluirMes) params.incluir_mes = true

  try {
    const { data } = await apiClient.get<Disponibilidad>(BASE, { params })
    return data
  } catch (error) {
    throw new Error(extractMessage(error, 'No se pudieron cargar los horarios disponibles.'))
  }
}
