import { useState, useCallback } from 'react'
import { apiClient } from '../../../shared/services/api'
import type {
  CashCutFilters,
  CashCutReport,
  ConsultaExpressCreate,
  Payment,
  PaymentCreate,
  PaymentFilters,
} from '../types'
import { aErrorDeCobro, detalleDeError } from '../utils/cobro'

/** Quita los filtros vacíos: mandar `doctor_id=` sería pedir "la doctora vacía". */
const sinVacios = <T extends object>(params?: T): Partial<T> | undefined => {
  if (!params) return undefined
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>
}

export const useFinanzas = () => {
  // `loading` es sólo de las lecturas. Registrar o anular un pago no debe
  // borrar la tabla con un spinner mientras la secretaria sigue viéndola.
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getCashCut = useCallback(async (filtros?: CashCutFilters): Promise<CashCutReport> => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<CashCutReport>('/payments/cash-cut', {
        params: sinVacios(filtros),
      })
      return res.data
    } catch (err: any) {
      const msg = detalleDeError(err, 'Error al cargar corte de caja')
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPayments = useCallback(async (filtros?: PaymentFilters): Promise<Payment[]> => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<Payment[]>('/payments', { params: sinVacios(filtros) })
      return res.data
    } catch (err: any) {
      const msg = detalleDeError(err, 'Error al cargar pagos')
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Lanza `ErrorDeCobro`: el 409 de cobro doble trae el pago que ya existe y
   * la pantalla lo necesita para marcar la cita como cobrada.
   */
  const createPayment = useCallback(async (data: PaymentCreate): Promise<Payment> => {
    try {
      const res = await apiClient.post<Payment>('/payments', data)
      return res.data
    } catch (err: any) {
      throw aErrorDeCobro(err, 'No se pudo registrar el pago. No quedó registrado; inténtalo de nuevo.')
    }
  }, [])

  /** Cita express + pago en una sola llamada; lanza `ErrorDeCobro` (409 con la cita del día). */
  const createConsultaExpress = useCallback(async (data: ConsultaExpressCreate): Promise<Payment> => {
    try {
      const res = await apiClient.post<Payment>('/payments/consulta-express', data)
      return res.data
    } catch (err: any) {
      throw aErrorDeCobro(
        err,
        'No se pudo registrar la consulta express. No quedó ni la cita ni el pago; inténtalo de nuevo.',
      )
    }
  }, [])

  const anularPago = useCallback(
    async (
      paymentId: number,
      motivo: string,
      opciones: { cancelarConsultaExpress?: boolean } = {},
    ): Promise<Payment> => {
    try {
      const res = await apiClient.post<Payment>(`/payments/${paymentId}/anular`, {
        motivo,
        ...(opciones.cancelarConsultaExpress ? { cancelar_consulta_express: true } : {}),
      })
      return res.data
    } catch (err: any) {
      throw aErrorDeCobro(err, 'No se pudo anular el pago. Sigue vigente; inténtalo de nuevo.')
    }
    },
    [],
  )

  const sendReceipt = useCallback(async (paymentId: number): Promise<{ to_email: string }> => {
    try {
      const res = await apiClient.post(`/payments/${paymentId}/send-receipt`)
      return res.data
    } catch (err: any) {
      throw new Error(detalleDeError(err, 'No se pudo enviar el recibo.'))
    }
  }, [])

  return {
    loading,
    error,
    getCashCut,
    fetchPayments,
    createPayment,
    createConsultaExpress,
    anularPago,
    sendReceipt,
  }
}
