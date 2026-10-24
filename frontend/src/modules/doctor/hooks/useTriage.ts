/**
 * Custom hook for Triage API
 */
import { useState } from 'react'
import api from '../../../shared/services/api'
import { cargar, type Cargado, mensajeDeError } from '../../../shared/utils/errors'
import type { Triage } from '../../secretaria/types'

// Re-using Triage type from secretaria module
// In a larger app we might move this to shared types

export const useTriage = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Devuelve `Cargado` y no `Triage | null` porque `null` significaba las dos
   * cosas a la vez: "a este paciente todavía no le toman los signos vitales" y
   * "no pude leerlos". La pantalla se dibujaba igual en ambos casos y la
   * doctora concluía que nadie había pasado al paciente por triage; ahora
   * que puede capturarlos desde la consulta, además los escribiría encima.
   *
   * Aquí no se traduce ningún código: el endpoint ya responde 204 cuando la
   * cita no tiene signos vitales, igual que el resto del expediente. Antes
   * contestaba 404 para eso y para "la cita no existe", y este hook lo
   * reescribía — o sea, el navegador tapaba una inconsistencia del servidor, y
   * el siguiente hook que leyera triage habría heredado el 404 sobrecargado sin
   * enterarse.
   */
  const getTriageByAppointment = async (appointmentId: number): Promise<Cargado<Triage>> => {
    setLoading(true)
    setError(null)
    try {
      const resultado = await cargar<Triage>(api.get<Triage>(`/triage/appointment/${appointmentId}`))
      if (resultado.estado === 'error') setError(resultado.mensaje)
      return resultado
    } finally {
      setLoading(false)
    }
  }

  const getPatientTriageHistory = async (patientId: number): Promise<Triage[]> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<Triage[]>(`/triage/patient/${patientId}/all`)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo cargar el historial de signos vitales.'))
      return []
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    getTriageByAppointment,
    getPatientTriageHistory,
  }
}
