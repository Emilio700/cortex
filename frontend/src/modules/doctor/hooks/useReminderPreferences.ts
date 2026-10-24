/**
 * Custom hook for appointment reminder preferences (Fase 4.3)
 */
import { useState, useCallback } from 'react'
import api from '../../../shared/services/api'

export interface ReminderPreference {
    id: number
    enabled: boolean
    reminder_times: string
    reminder_times_parsed: number[]
}

export const useReminderPreferences = () => {
    const [preference, setPreference] = useState<ReminderPreference | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const getPreference = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.get<ReminderPreference>('/appointment-reminders/preferences')
            setPreference(response.data)
            return response.data
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al cargar las preferencias de recordatorio')
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    const updatePreference = async (enabled: boolean, reminderTimes: string) => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.patch<ReminderPreference>('/appointment-reminders/preferences', {
                enabled,
                reminder_times: reminderTimes,
            })
            setPreference(response.data)
            return response.data
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al actualizar las preferencias de recordatorio')
            return null
        } finally {
            setLoading(false)
        }
    }

    return {
        preference,
        loading,
        error,
        getPreference,
        updatePreference,
    }
}
