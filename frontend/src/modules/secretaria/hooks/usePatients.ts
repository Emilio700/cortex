/**
 * Patients API hook
 */
import { useState, useCallback } from 'react'
import { apiClient } from '../../../shared/services/api'
import type { Patient, PatientCreate } from '../types'

// Map backend field names to user-friendly Spanish labels
const FIELD_LABELS: Record<string, string> = {
  first_name: 'Nombre',
  last_name: 'Apellido',
  date_of_birth: 'Fecha de nacimiento',
  gender: 'Género',
  phone: 'Teléfono',
  email: 'Correo electrónico',
  address: 'Dirección',
  allergies: 'Alergias',
  personal_history: 'Antecedentes personales',
  family_history: 'Antecedentes familiares',
  gynecological_history: 'Antecedentes gineco-obstétricos',
}

/**
 * Parse a validation error from FastAPI into a human-readable Spanish message.
 * FastAPI returns 422 with body like:
 *   {"detail": [{"loc": ["body", "first_name"], "msg": "field required", ...}]}
 */
function parseErrorDetail(err: any): string {
  const raw = err.response?.data?.detail
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && raw.length > 0) {
    const parts = raw.map((e: any) => {
      // Extract the field name from the location
      const loc = e.loc || []
      const fieldName = loc[loc.length - 1] || ''
      const label = FIELD_LABELS[fieldName] || fieldName
      const msg = e.msg || ''

      // Translate common Pydantic messages
      if (msg.includes('field required')) return `"${label}" es obligatorio`
      if (msg.includes('none is not an allowed value')) return `"${label}" no puede estar vacío`
      if (msg.includes('value_error')) return `"${label}" tiene un valor inválido`
      if (msg.includes('extra fields not permitted')) return `Campo no permitido: "${label}"`
      return `${label}: ${msg}`
    })
    return parts.join('. ')
  }
  return 'Error de validación'
}

export const usePatients = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * List patients with optional search
   */
  const fetchPatients = useCallback(async (search?: string, skip = 0, limit = 100, incompletas = false): Promise<Patient[]> => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (search) params.append('search', search)
      params.append('skip', skip.toString())
      params.append('limit', limit.toString())
      // Fichas incompletas (plan 32, punto 5): lo filtra el servidor, así la
      // paginación cuenta sólo las que faltan.
      if (incompletas) params.append('incompletas', 'true')

      const response = await apiClient.get<Patient[]>(`/patients?${params.toString()}`)
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
   * Get patient by ID
   */
  const getPatient = useCallback(async (id: number): Promise<Patient> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.get<Patient>(`/patients/${id}`)
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
   * Create new patient
   */
  const createPatient = useCallback(async (data: PatientCreate): Promise<Patient> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.post<Patient>('/patients', data)
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
   * Update patient
   */
  const updatePatient = useCallback(async (id: number, data: Partial<PatientCreate>): Promise<Patient> => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.put<Patient>(`/patients/${id}`, data)
      return response.data
    } catch (err: any) {
      const errorMessage = parseErrorDetail(err)
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    fetchPatients,
    getPatient,
    createPatient,
    updatePatient,
  }
}
