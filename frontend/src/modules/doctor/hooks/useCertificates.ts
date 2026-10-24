/**
 * Custom hook for Medical Certificates API
 */
import { useState } from 'react'
import api from '../../../shared/services/api'
import { cargar, type Cargado, mensajeDeError } from '../../../shared/utils/errors'
import type {
  MedicalCertificate,
  MedicalCertificateCreate,
  MedicalCertificateUpdate,
} from '../types'

export const useCertificates = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createCertificate = async (
    data: MedicalCertificateCreate,
  ): Promise<MedicalCertificate | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post<MedicalCertificate>('/medical-certificates', data)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo crear el certificado.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  const getCertificate = async (id: number): Promise<MedicalCertificate | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<MedicalCertificate>(`/medical-certificates/${id}`)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo cargar el certificado.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  /**
   * Devuelve `Cargado` y no `MedicalCertificate[]` para que quien llama pueda
   * distinguir "esta consulta no emitió certificados" de "no pude leerlos":
   * la lista vacía por error dejaba el formulario editable y abría la puerta
   * a emitir dos veces el mismo certificado.
   */
  const getAppointmentCertificates = async (
    appointmentId: number,
  ): Promise<Cargado<MedicalCertificate[]>> => {
    setLoading(true)
    setError(null)
    try {
      const resultado = await cargar<MedicalCertificate[]>(
        api.get<MedicalCertificate[]>(`/medical-certificates/appointment/${appointmentId}/all`),
      )
      if (resultado.estado === 'error') setError(resultado.mensaje)
      return resultado
    } finally {
      setLoading(false)
    }
  }

  const getPatientCertificates = async (patientId: number, skip = 0, limit = 20): Promise<MedicalCertificate[]> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<MedicalCertificate[]>(
        `/medical-certificates/patient/${patientId}/all`, { params: { skip, limit } },
      )
      return response.data
    } catch (err: any) {
      const mensaje = mensajeDeError(err, 'No se pudieron cargar los certificados del paciente.')
      setError(mensaje)
      // Se relanza: quien pinta el historial tiene que distinguir «no hay»
      // de «no se pudo leer» (plan 29, T-1). El mensaje ya va en español.
      throw new Error(mensaje)
    } finally {
      setLoading(false)
    }
  }

  const updateCertificate = async (
    id: number,
    data: MedicalCertificateUpdate,
  ): Promise<MedicalCertificate | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.put<MedicalCertificate>(`/medical-certificates/${id}`, data)
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo actualizar el certificado.'))
      return null
    } finally {
      setLoading(false)
    }
  }
  const downloadCertificatePDF = async (id: number, fileName: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/medical-certificates/${id}/pdf`, {
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
      setError(mensajeDeError(err, 'No se pudo descargar el PDF del certificado.'))
      return false
    } finally {
      setLoading(false)
    }
  }

  const sendCertificateEmail = async (id: number): Promise<{ to_email: string } | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post(`/medical-certificates/${id}/send-email`)
      return response.data
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al enviar el certificado por correo')
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    createCertificate,
    getCertificate,
    getAppointmentCertificates,
    getPatientCertificates,
    updateCertificate,
    downloadCertificatePDF,
    sendCertificateEmail,
  }
}
