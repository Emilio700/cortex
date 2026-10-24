/**
 * Reports hook - over /reports (Fase 3.7)
 */
import { useState } from 'react'
import { apiClient } from '../../../shared/services/api'
import type { ReportsSummary } from '../types'

export const useReports = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getSummary = async (startDate?: string, endDate?: string): Promise<ReportsSummary> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<ReportsSummary>('/reports/summary', {
        params: { start_date: startDate, end_date: endDate },
      })
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al cargar el reporte'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, getSummary }
}
