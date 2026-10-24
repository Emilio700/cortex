/**
 * Triage API hook
 */
import { useState, useCallback } from 'react'
import { apiClient } from '../../../shared/services/api'
import type { Triage, TriageCreate } from '../types'
import { mensajeDeError } from '../../../shared/utils/errors'

export const useTriage = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Get triage by appointment ID
   */
  const getTriageByAppointment = useCallback(async (appointmentId: number): Promise<Triage | null> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.get<Triage>(`/triage/appointment/${appointmentId}`)
      // 204 = la cita existe pero todavía no tiene signos vitales. Sin esto,
      // axios devuelve la cadena vacía del cuerpo y `triage !== null` da
      // verdadero: la cita se dibujaba con la insignia de "Triage registrado" y
      // el botón de pasar a sala habilitado, y al oprimirlo el backend contesta
      // 400. La pantalla afirmaba algo que el sistema no había hecho.
      if (response.status === 204) return null
      return response.data
    } catch (err: any) {
      if (err.response?.status === 404) {
        // La cita no existe. Que no haya triage ya se responde con 204.
        return null
      }
      const errorMessage = mensajeDeError(err, 'No se pudieron cargar los signos vitales.')
      setError(errorMessage)
      // El código viaja con el error porque quien llama tiene que distinguir
      // «no tienes acceso a este paciente» (403) de «no se pudo leer»: son
      // avisos distintos y ninguno de los dos es «no hay signos».
      const fallo = new Error(errorMessage) as Error & { status?: number }
      fallo.status = err?.response?.status
      throw fallo
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Create triage
   */
  const createTriage = useCallback(async (data: TriageCreate): Promise<Triage> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.post<Triage>('/triage', data)
      return response.data
    } catch (err: any) {
      const errorMessage = mensajeDeError(err, 'No se pudieron guardar los signos vitales.')
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Update triage
   */
  const updateTriage = useCallback(async (id: number, data: Partial<TriageCreate>): Promise<Triage> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.put<Triage>(`/triage/${id}`, data)
      return response.data
    } catch (err: any) {
      const errorMessage = mensajeDeError(err, 'No se pudieron actualizar los signos vitales.')
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    getTriageByAppointment,
    createTriage,
    updateTriage,
  }
}
