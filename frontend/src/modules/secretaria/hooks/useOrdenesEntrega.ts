/**
 * Recepción: órdenes por entregar del día y marcar entregada (O-09).
 *
 * Es la otra mitad del mostrador, aparte de «subir resultados» (O-04). La
 * entrega es contabilidad del mostrador: no toca el estado clínico de la orden.
 * Con `GET /orders/to-deliver` se listan las emitidas del día y con
 * `POST /orders/{id}/delivered` se marca la entrega (idempotente).
 *
 * Regla de oro (plan 22): sólo se dice «entregada» cuando el servidor lo
 * confirma; si ya estaba entregada, no se anuncia dos veces.
 */
import { useCallback, useState } from 'react'
import api from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'

export interface OrdenPorEntregar {
  order_id: number
  order_group_id: number | null
  patient_id: number
  patient_name: string
  study_name: string
  requested_on: string
  status: string
  /** Médico autora: un papel lleva la firma de una sola (M5). */
  doctor_id?: number | null
  doctor_name?: string | null
  priority?: string | null
  delivered: boolean
  delivered_at: string | null
}

export interface EntregaResultado {
  order_id: number
  delivered: boolean
  delivered_at: string | null
  delivered_by_user_id: number | null
  ya_estaba_entregada: boolean
}

const PAGE_SIZE = 25

export const useOrdenesEntrega = () => {
  const [items, setItems] = useState<OrdenPorEntregar[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const buscar = useCallback(
    async (search: string, incluirEntregadas: boolean, page = 0): Promise<void> => {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await api.get('/clinical-tracking/orders/to-deliver', {
          params: {
            search: search || undefined,
            include_delivered: incluirEntregadas || undefined,
            skip: page * PAGE_SIZE,
            limit: PAGE_SIZE,
          },
        })
        setItems(response.data.items)
        setTotal(response.data.total)
      } catch (err) {
        setLoadError(mensajeDeError(err, 'No se pudo cargar la lista de órdenes por entregar.'))
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  /**
   * Marca la orden como entregada. Devuelve el resultado del servidor (incluido
   * `ya_estaba_entregada`) o lanza un Error con el motivo en español.
   */
  const marcarEntregada = async (orderId: number): Promise<EntregaResultado> => {
    try {
      const response = await api.post<EntregaResultado>(
        `/clinical-tracking/orders/${orderId}/delivered`,
      )
      return response.data
    } catch (err) {
      throw new Error(mensajeDeError(err, 'No se pudo marcar la orden como entregada.'))
    }
  }

  return { items, total, loading, loadError, buscar, marcarEntregada, PAGE_SIZE }
}
