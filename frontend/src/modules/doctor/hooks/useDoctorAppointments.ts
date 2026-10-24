/**
 * Custom hook for Doctor's Appointments API
 */
import { useState, useCallback } from 'react'
import api from '../../../shared/services/api'
import { mensajeDeError, parseErrorDetail } from '../../../shared/utils/errors'
import type { Appointment, AppointmentCreate } from '../../secretaria/types'
import type { DoctorAppointmentFilters } from '../types'

/**
 * Resultado de abrir una cita.
 *
 * Con `Appointment | null` la pantalla sólo podía decir una frase —"no se
 * encontró la cita o no tienes permisos"— para tres situaciones distintas, y
 * ante un 500 afirmaba que la cita no existía. Una cita que sí existe y que no
 * pudimos leer no es una cita que no existe: la primera se reintenta, la
 * segunda manda al médico a buscar en la agenda algo que está ahí.
 *
 * `no-encontrada` cubre dos casos a propósito: el backend responde 404 tanto
 * si la cita no existe como si es de otro médico, para no confirmar la
 * existencia de citas ajenas. Esa ambigüedad es del servidor y el mensaje la
 * dice tal cual, en lugar de inventar certeza.
 */
export type CitaCargada =
  | { estado: 'ok'; dato: Appointment }
  | { estado: 'no-encontrada' }
  | { estado: 'sin-permiso'; mensaje: string }
  | { estado: 'error'; mensaje: string }

/**
 * Resultado de agendar. No es `Appointment | null` ni una excepción a secas
 * porque el fallo más común al agendar no es un error del sistema: es que el
 * horario se acaba de ocupar, y eso el backend lo explica con un 400 cuyo
 * texto hay que mostrar tal cual. Confundir "esa hora ya no está libre" con
 * "falló el sistema" manda al médico a reintentar lo que nunca va a pasar.
 */
export type CitaAgendada =
  | { estado: 'ok'; dato: Appointment }
  | { estado: 'horario-ocupado'; mensaje: string }
  | { estado: 'sin-permiso'; mensaje: string }
  | { estado: 'error'; mensaje: string }

export const useDoctorAppointments = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  // Cuántas cumplen los filtros en el servidor, no cuántas trajo esta página.
  // null mientras no se sepa: un 0 inventado diría «no hay consultas».
  const [total, setTotal] = useState<number | null>(null)

  const fetchMyAppointments = useCallback(async (filters?: DoctorAppointmentFilters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters?.start_date) params.append('start_date', filters.start_date)
      if (filters?.end_date) params.append('end_date', filters.end_date)
      if (filters?.status) params.append('status', filters.status)
      if (filters?.q?.trim()) params.append('q', filters.q.trim())
      if (filters?.orden) params.append('orden', filters.orden)
      if (filters?.fecha_desde) params.append('fecha_desde', filters.fecha_desde)
      if (filters?.fecha_hasta) params.append('fecha_hasta', filters.fecha_hasta)
      if (filters?.appointment_type) params.append('appointment_type', filters.appointment_type)
      if (filters?.skip !== undefined) params.append('skip', filters.skip.toString())
      if (filters?.limit !== undefined) params.append('limit', filters.limit.toString())

      const response = await api.get<Appointment[]>(`/appointments/my-appointments?${params}`)
      setAppointments(response.data)
      const cabecera = Number(response.headers?.['x-total-count'])
      setTotal(Number.isFinite(cabecera) ? cabecera : null)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudieron cargar las citas.'))
      setTotal(null)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const getAppointment = async (id: number): Promise<CitaCargada> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<Appointment>(`/appointments/${id}`)
      return { estado: 'ok', dato: response.data }
    } catch (err: any) {
      const estado: number | undefined = err?.response?.status
      const mensaje = mensajeDeError(err)
      setError(mensaje)
      if (estado === 404) return { estado: 'no-encontrada' }
      if (estado === 403) return { estado: 'sin-permiso', mensaje }
      return { estado: 'error', mensaje }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Agenda una cita. El médico sólo puede agendar en su propia agenda: el
   * backend lo verifica (403), así que aquí no se disimula el error.
   */
  const createAppointment = async (data: AppointmentCreate): Promise<CitaAgendada> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post<Appointment>('/appointments', data)
      return { estado: 'ok', dato: response.data }
    } catch (err: any) {
      const estado: number | undefined = err?.response?.status
      const mensaje = parseErrorDetail(err)
      setError(mensaje)
      if (estado === 400) return { estado: 'horario-ocupado', mensaje }
      if (estado === 403) return { estado: 'sin-permiso', mensaje }
      return { estado: 'error', mensaje }
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    appointments,
    total,
    fetchMyAppointments,
    getAppointment,
    createAppointment,
  }
}
