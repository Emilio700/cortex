/**
 * Custom hook for doctor working hours and schedule blocks (Fase 5.1/5.2)
 */
import { useState, useCallback } from 'react'
import api from '../../../shared/services/api'

export interface WorkingHours {
    id: number
    doctor_id: number
    weekday: number // 0=Monday ... 6=Sunday
    start_time: string // "HH:MM:SS"
    end_time: string
}

export interface ScheduleBlock {
    id: number
    doctor_id: number
    start_at: string
    end_at: string
    reason: string | null
    created_by_user_id: number
}

export const useDoctorSchedule = () => {
    const [workingHours, setWorkingHours] = useState<WorkingHours[]>([])
    const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const getWorkingHours = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.get<WorkingHours[]>('/doctor-schedule/working-hours')
            setWorkingHours(response.data)
            return response.data
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al cargar el horario laboral')
            return []
        } finally {
            setLoading(false)
        }
    }, [])

    const createWorkingHours = async (weekday: number, startTime: string, endTime: string) => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.post<WorkingHours>('/doctor-schedule/working-hours', {
                weekday,
                start_time: startTime,
                end_time: endTime,
            })
            await getWorkingHours()
            return response.data
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al crear el horario')
            return null
        } finally {
            setLoading(false)
        }
    }

    const deleteWorkingHours = async (id: number) => {
        setLoading(true)
        setError(null)
        try {
            await api.delete(`/doctor-schedule/working-hours/${id}`)
            await getWorkingHours()
            return true
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al eliminar el horario')
            return false
        } finally {
            setLoading(false)
        }
    }

    const getBlocks = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.get<ScheduleBlock[]>('/doctor-schedule/blocks')
            setBlocks(response.data)
            return response.data
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al cargar los bloqueos')
            return []
        } finally {
            setLoading(false)
        }
    }, [])

    const createBlock = async (doctorId: number, startAt: string, endAt: string, reason: string) => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.post<ScheduleBlock>('/doctor-schedule/blocks', {
                doctor_id: doctorId,
                start_at: startAt,
                end_at: endAt,
                reason: reason || undefined,
            })
            await getBlocks()
            return response.data
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al crear el bloqueo')
            return null
        } finally {
            setLoading(false)
        }
    }

    const deleteBlock = async (id: number) => {
        setLoading(true)
        setError(null)
        try {
            await api.delete(`/doctor-schedule/blocks/${id}`)
            await getBlocks()
            return true
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al eliminar el bloqueo')
            return false
        } finally {
            setLoading(false)
        }
    }

    return {
        workingHours,
        blocks,
        loading,
        error,
        getWorkingHours,
        createWorkingHours,
        deleteWorkingHours,
        getBlocks,
        createBlock,
        deleteBlock,
    }
}
