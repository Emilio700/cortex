/**
 * Recepción adjunta el resultado (PDF o foto) a una orden de estudio (O-04).
 *
 * Recepción encuentra la orden con `GET /clinical-tracking/orders/awaiting-result`
 * (sólo paciente, estudio, fecha, folio y estado; nada de indicación ni
 * interpretación). La subida (`POST /orders/{id}/result-attachment`) vive en
 * `doctor/utils/anexarResultado.ts`, la misma que usa la doctora.
 * La lectura y la subida piden el permiso `clinical_tracking.attach_result`.
 */
import { useCallback, useState } from 'react'
import api from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import type { SeguimientoDeOrden } from '../../doctor/types/clinicalTracking'

export interface OrdenPendienteResultado {
  order_id: number
  order_group_id: number | null
  patient_id: number
  patient_name: string
  study_name: string
  requested_on: string
  status: string
  /** Doctora autora: un papel lleva la firma de una sola (M5). */
  doctor_id?: number | null
  doctor_name?: string | null
  priority?: string | null
  /** Cuántos archivos de resultado tiene ya, para no subir dos veces el mismo. */
  attachments: number
  /** Cuáles son, para verlos en el visor (servidores desde el plan 26). */
  adjuntos?: AdjuntoSubido[]
  /** Atrasado y su último seguimiento (plan 32, punto 3): operativo, no clínico. */
  atrasada?: boolean
  dias_sin_resultado?: number | null
  ultimo_seguimiento?: SeguimientoDeOrden | null
}

/** Un archivo ya subido a la orden, para que recepción lo pueda ver (plan 26, R-1). */
export interface AdjuntoSubido {
  result_id: number
  patient_document_id: number
  file_name: string
  mime_type: string
  uploaded_at: string
}

const PAGE_SIZE = 25

export const useOrdenesResultado = () => {
  const [items, setItems] = useState<OrdenPendienteResultado[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const buscar = useCallback(
    async (search: string, page = 0, soloAtrasadas = false): Promise<void> => {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await api.get('/clinical-tracking/orders/awaiting-result', {
          params: {
            search: search || undefined,
            solo_atrasadas: soloAtrasadas || undefined,
            skip: page * PAGE_SIZE,
            limit: PAGE_SIZE,
          },
        })
        setItems(response.data.items)
        setTotal(response.data.total)
      } catch (err) {
        setLoadError(mensajeDeError(err, 'No se pudo cargar la lista de órdenes por resultado.'))
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return { items, total, loading, loadError, buscar, PAGE_SIZE }
}
