/**
 * Payments / cash-cut hook - over /payments (Fase 3.2/3.3/3.4)
 */
import { useState } from 'react'
import { apiClient } from '../../../shared/services/api'
import type { CashCutReport, Payment } from '../types'

export const usePayments = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getCashCut = async (startDate?: string, endDate?: string): Promise<CashCutReport> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<CashCutReport>('/payments/cash-cut', {
        params: { start_date: startDate, end_date: endDate },
      })
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al cargar el corte de caja'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = async (): Promise<Payment[]> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<Payment[]>('/payments')
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al cargar pagos'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  const sendReceipt = async (paymentId: number): Promise<{ to_email: string }> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.post(`/payments/${paymentId}/send-receipt`)
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al enviar el recibo'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, getCashCut, fetchPayments, sendReceipt }
}
