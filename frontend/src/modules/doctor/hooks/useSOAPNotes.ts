/**
 * Custom hook for SOAP Notes API
 */
import { useState } from 'react'
import api from '../../../shared/services/api'
import { cargar, type Cargado, mensajeDeError } from '../../../shared/utils/errors'
import type { SOAPNote, SOAPNoteCreate, SOAPNoteUpdate } from '../types'

export const useSOAPNotes = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createSOAPNote = async (data: SOAPNoteCreate): Promise<SOAPNote | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post<SOAPNote>('/soap-notes', data)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo crear la nota de consulta.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  const getSOAPNote = async (id: number): Promise<SOAPNote | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<SOAPNote>(`/soap-notes/${id}`)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo cargar la nota de consulta.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  /**
   * Devuelve `Cargado` y no `SOAPNote | null` porque quien llama tiene que
   * poder distinguir "esta consulta todavía no tiene nota" de "no pude leer
   * la nota". Con `null` para ambos, un 500 o un problema de permisos se
   * dibujaba como formulario vacío e invitaba a escribir encima de una nota
   * que sí existía. El servidor responde 204 cuando aún no hay registro.
   */
  const getSOAPNoteByAppointment = async (
    appointmentId: number,
  ): Promise<Cargado<SOAPNote>> => {
    setLoading(true)
    setError(null)
    try {
      const resultado = await cargar<SOAPNote>(
        api.get<SOAPNote>(`/soap-notes/appointment/${appointmentId}`),
      )
      if (resultado.estado === 'error') setError(resultado.mensaje)
      return resultado
    } finally {
      setLoading(false)
    }
  }

  const updateSOAPNote = async (id: number, data: SOAPNoteUpdate): Promise<SOAPNote | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.put<SOAPNote>(`/soap-notes/${id}`, data)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo actualizar la nota de consulta.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  const getPatientSOAPNotes = async (patientId: number): Promise<SOAPNote[]> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<SOAPNote[]>(`/soap-notes/patient/${patientId}/all`)
      return response.data
    } catch (err: any) {
      const mensaje = mensajeDeError(err, 'No se pudieron cargar las notas de la paciente.')
      setError(mensaje)
      // Se relanza: quien pinta el historial tiene que distinguir «no hay»
      // de «no se pudo leer» (plan 29, T-1). El mensaje ya va en español.
      throw new Error(mensaje)
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    createSOAPNote,
    getSOAPNote,
    getSOAPNoteByAppointment,
    getPatientSOAPNotes,
    updateSOAPNote,
  }
}
