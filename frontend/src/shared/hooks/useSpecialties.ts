/**
 * Custom hook for the specialty catalog (Fase 6.1)
 */
import { useState, useCallback } from 'react'
import api from '../services/api'
import type { Specialty } from '../../modules/doctor/types/doctorProfile'

export const useSpecialties = () => {
    const [specialties, setSpecialties] = useState<Specialty[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const getSpecialties = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.get<Specialty[]>('/specialties')
            setSpecialties(response.data)
            return response.data
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al cargar las especialidades')
            return []
        } finally {
            setLoading(false)
        }
    }, [])

    return { specialties, loading, error, getSpecialties }
}
