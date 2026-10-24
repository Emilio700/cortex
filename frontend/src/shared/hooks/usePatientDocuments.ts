/**
 * Custom hook for Patient Documents API
 */
import { useState } from 'react'
import api from '../services/api'
import { mensajeDeError } from '../utils/errors'

export interface PatientDocument {
  id: number
  patient_id: number
  tenant_id: number
  uploaded_by_user_id: number
  document_type: 'lab_result' | 'imaging_study' | 'external_note' | 'other'
  title: string
  description?: string
  file_path: string
  file_name: string
  file_size?: number
  mime_type?: string
  lab_name?: string
  study_date?: string
  created_at: string
  /** Corrección (plan 29, lote 7): nulos en un documento vigente. */
  anulado_at?: string | null
  anulado_motivo?: string | null
  movido_desde_patient_id?: number | null
  movido_at?: string | null
  movido_motivo?: string | null
}

/** Quien lo subió puede corregirlo en las primeras 24 h, aunque no tenga el permiso. */
export const VENTANA_DE_CORRECCION_MS = 24 * 60 * 60 * 1000

export const usePatientDocuments = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<PatientDocument[]>([])
  const [hasMore, setHasMore] = useState(false)
  // Cuántos archivos del paciente son resultado de un estudio: viven en
  // Estudios y la lista ya no los repite (plan 32, punto 6).
  const [enEstudios, setEnEstudios] = useState(0)

  const fetchPatientDocuments = async (
    patientId: number,
    skip = 0,
    pageSize = 50,
    append = false,
    anulados = false,
  ): Promise<PatientDocument[]> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<PatientDocument[]>(`/documents/patient/${patientId}`, {
        params: { skip, limit: pageSize + 1, ...(anulados ? { anulados: true } : {}) },
      })
      setEnEstudios(Number(response.headers?.['x-resultados-en-estudios'] ?? 0) || 0)
      const page = response.data.slice(0, pageSize)
      setHasMore(response.data.length > pageSize)
      setDocuments((current) => append ? [...current, ...page] : page)
      return page
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudieron cargar los documentos.'))
      return []
    } finally {
      setLoading(false)
    }
  }

  const uploadDocument = async (formData: FormData): Promise<PatientDocument | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post<PatientDocument>('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo subir el documento.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  /*
   * Corregir un documento (plan 29, lote 7). Los documentos no se borran: se
   * anulan o se mueven. Cada función devuelve el documento como quedó en el
   * servidor, o lanza un Error con su mensaje: la pantalla anuncia solo lo
   * que el servidor confirmó.
   */
  const corregir = async (url: string, cuerpo: Record<string, unknown>, respaldo: string) => {
    try {
      const response = await api.post<PatientDocument>(url, cuerpo)
      return response.data
    } catch (err: any) {
      throw new Error(mensajeDeError(err, respaldo))
    }
  }

  const anularDocumento = (documentId: number, motivo: string) =>
    corregir(`/documents/${documentId}/anular`, { motivo }, 'No se pudo anular el documento.')

  const moverDocumento = (documentId: number, patientId: number, motivo: string) =>
    corregir(`/documents/${documentId}/mover`, { patient_id: patientId, motivo }, 'No se pudo mover el documento.')

  const revertirAnulacion = (documentId: number, motivo: string) =>
    corregir(`/documents/${documentId}/revertir-anulacion`, { motivo }, 'No se pudo revertir la anulación.')

  const downloadDocument = async (documentId: number, fileName: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/documents/${documentId}/download`, {
        responseType: 'blob',
      })
      
      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', fileName)
      
      // Append to html link element page
      document.body.appendChild(link)
      link.click()
      
      // Clean up and remove the link
      link.parentNode?.removeChild(link)
      return true
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo descargar el documento.'))
      return false
    } finally {
      setLoading(false)
    }
  }

  return {
    enEstudios,
    loading,
    error,
    documents,
    hasMore,
    fetchPatientDocuments,
    uploadDocument,
    anularDocumento,
    moverDocumento,
    revertirAnulacion,
    downloadDocument,
  }
}
