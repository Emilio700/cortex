/**
 * Custom hook for Prescriptions API
 */
import { useState } from 'react'
import api from '../../../shared/services/api'
import { cargar, type Cargado, mensajeDeError } from '../../../shared/utils/errors'
import type { Prescription, PrescriptionCreate, PrescriptionUpdate } from '../types'

export const usePrescriptions = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createPrescription = async (data: PrescriptionCreate): Promise<Prescription | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post<Prescription>('/prescriptions', data)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo crear la receta.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  const getPrescription = async (id: number): Promise<Prescription | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<Prescription>(`/prescriptions/${id}`)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo cargar la receta.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  /**
   * Devuelve `Cargado` y no `Prescription[]` porque una lista vacía por error
   * es indistinguible de una consulta sin recetas: la página dibujaba el
   * formulario en blanco y la doctora volvía a capturar una receta que ya
   * estaba emitida.
   */
  const getAppointmentPrescriptions = async (
    appointmentId: number,
  ): Promise<Cargado<Prescription[]>> => {
    setLoading(true)
    setError(null)
    try {
      const resultado = await cargar<Prescription[]>(
        api.get<Prescription[]>(`/prescriptions/appointment/${appointmentId}/all`),
      )
      if (resultado.estado === 'error') setError(resultado.mensaje)
      return resultado
    } finally {
      setLoading(false)
    }
  }

  const getPatientPrescriptions = async (patientId: number, skip = 0, limit = 20): Promise<Prescription[]> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<Prescription[]>(`/prescriptions/patient/${patientId}/all`, { params: { skip, limit } })
      return response.data
    } catch (err: any) {
      const mensaje = mensajeDeError(err, 'No se pudieron cargar las recetas de la paciente.')
      setError(mensaje)
      // Se relanza: quien pinta el historial tiene que distinguir «no hay»
      // de «no se pudo leer» (plan 29, T-1). El mensaje ya va en español.
      throw new Error(mensaje)
    } finally {
      setLoading(false)
    }
  }

  const updatePrescription = async (
    id: number,
    data: PrescriptionUpdate,
  ): Promise<Prescription | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.put<Prescription>(`/prescriptions/${id}`, data)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo actualizar la receta.'))
      return null
    } finally {
      setLoading(false)
    }
  }
  const downloadPrescriptionPDF = async (id: number, fileName: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/prescriptions/${id}/pdf`, {
        responseType: 'blob',
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      link.parentNode?.removeChild(link)
      return true
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo descargar el PDF de la receta.'))
      return false
    } finally {
      setLoading(false)
    }
  }

  const printPrescription = async (id: number) => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/prescriptions/${id}/pdf`, {
        responseType: 'blob',
      })
      
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      
      // Create invisible iframe
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = url
      document.body.appendChild(iframe)
      
      // Wait for load then print
      iframe.onload = () => {
        if (iframe.contentWindow) {
          iframe.contentWindow.print()
        }
      }
      
      return true
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo imprimir la receta.'))
      return false
    } finally {
      setLoading(false)
    }
  }

  const sendPrescriptionEmail = async (id: number): Promise<{ to_email: string } | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post(`/prescriptions/${id}/send-email`)
      return response.data
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al enviar la receta por correo')
      return null
    } finally {
      setLoading(false)
    }
  }

  const previewPrescription = async (data: PrescriptionCreate): Promise<string | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post('/prescriptions/preview', data, {
        responseType: 'blob',
      })
      return window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo generar la vista previa de la receta.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    createPrescription,
    getPrescription,
    getAppointmentPrescriptions,
    getPatientPrescriptions,
    updatePrescription,
    downloadPrescriptionPDF,
    printPrescription,
    previewPrescription,
    sendPrescriptionEmail,
  }
}
