/**
 * Appointments API hook
 */
import { useState, useCallback } from 'react'
import { apiClient } from '../../../shared/services/api'
import { parseErrorDetail, mensajeDeError } from '../../../shared/utils/errors'
import type { Appointment, AppointmentCreate, AppointmentFilters, AppointmentStatus } from '../types'

export const useAppointments = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * List appointments with filters
   */
  const fetchAppointments = useCallback(async (filters?: AppointmentFilters): Promise<Appointment[]> => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (filters?.start_date) params.append('start_date', filters.start_date)
      if (filters?.end_date) params.append('end_date', filters.end_date)
      if (filters?.fecha_desde) params.append('fecha_desde', filters.fecha_desde)
      if (filters?.fecha_hasta) params.append('fecha_hasta', filters.fecha_hasta)
      if (filters?.doctor_id) params.append('doctor_id', filters.doctor_id.toString())
      if (filters?.patient_id) params.append('patient_id', filters.patient_id.toString())
      if (filters?.tenant_id) params.append('tenant_id', filters.tenant_id.toString())
      if (filters?.appointment_type) params.append('appointment_type', filters.appointment_type)
      if (filters?.room_id) params.append('room_id', filters.room_id.toString())
      if (filters?.status) params.append('status', filters.status)
      if (filters?.skip) params.append('skip', filters.skip.toString())
      if (filters?.limit) params.append('limit', filters.limit.toString())

      const response = await apiClient.get<Appointment[]>(`/appointments?${params.toString()}`)
      return response.data
    } catch (err: any) {
      const errorMessage = mensajeDeError(err, 'No se pudieron cargar las citas.')
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Get appointment by ID
   */
  const getAppointment = useCallback(async (id: number): Promise<Appointment> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.get<Appointment>(`/appointments/${id}`)
      return response.data
    } catch (err: any) {
      const errorMessage = parseErrorDetail(err)
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Create new appointment
   */
  const createAppointment = useCallback(async (data: AppointmentCreate): Promise<Appointment> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.post<Appointment>('/appointments', data)
      return response.data
    } catch (err: any) {
      const errorMessage = parseErrorDetail(err)
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Update appointment
   */
  const updateAppointment = useCallback(async (id: number, data: Partial<AppointmentCreate>): Promise<Appointment> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.put<Appointment>(`/appointments/${id}`, data)
      return response.data
    } catch (err: any) {
      const errorMessage = parseErrorDetail(err)
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Change appointment status
   */
  const changeStatus = useCallback(async (
    id: number,
    status: AppointmentStatus,
    cancellationReason?: string,
  ): Promise<Appointment> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.patch<Appointment>(`/appointments/${id}/status`, {
        status,
        cancellation_reason: cancellationReason,
      })
      return response.data
    } catch (err: any) {
      const errorMessage = parseErrorDetail(err)
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * S-05: reenvía al paciente el correo de confirmación de su cita. El
   * servidor dice si de veras se envió (`enviado`) y por qué no (`motivo`), así
   * que la interfaz sólo afirma «se reenvió» con la confirmación del servidor.
   */
  const reenviarConfirmacion = useCallback(
    async (id: number): Promise<{ enviado: boolean; motivo: string | null; destinatario: string | null }> => {
      const response = await apiClient.post(`/appointments/${id}/confirmacion`)
      return response.data
    },
    [],
  )

  return {
    loading,
    error,
    fetchAppointments,
    getAppointment,
    createAppointment,
    updateAppointment,
    changeStatus,
    reenviarConfirmacion,
  }
}
