/**
 * Las llamadas del módulo de escalas, en un solo lugar.
 *
 * El alta manda las respuestas y la versión de la escala, **nunca el puntaje**:
 * lo calcula el servidor y es el que se muestra al guardar.
 */
import { apiClient } from '../../../shared/services/api'
import type { Respuestas, Tono } from '../dominio/tipos'

export interface EscalaAplicada {
  id: number
  patient_id: number
  appointment_id: number | null
  doctor_id: number
  escala: string
  version_escala: string
  respuestas: Record<string, string>
  puntaje: number | null
  interpretacion: string | null
  detalle: string | null
  notas: string | null
  /** UTC sin zona, como el resto de los instantes del servidor. */
  aplicada_en: string
  created_by_user_id: number
  created_at: string
  anulado_at: string | null
  anulado_por_user_id: number | null
  anulado_motivo: string | null
  tono: Tono
  avisos: string[]
}

export interface NuevaEscala {
  escala: string
  version_escala: string
  respuestas: Respuestas
  appointment_id?: number
  notas?: string
}

export const escalasApi = {
  async listar(
    patientId: number,
    opciones: { escala?: string; incluirAnuladas?: boolean } = {},
  ): Promise<EscalaAplicada[]> {
    const { data } = await apiClient.get<EscalaAplicada[]>(`/patients/${patientId}/escalas`, {
      params: {
        escala: opciones.escala,
        incluir_anuladas: opciones.incluirAnuladas ?? true,
      },
    })
    return Array.isArray(data) ? data : []
  },

  async aplicar(patientId: number, nueva: NuevaEscala): Promise<EscalaAplicada> {
    // Solo las respondidas: una sección omitida no viaja como cadena vacía.
    const respuestas = Object.fromEntries(
      Object.entries(nueva.respuestas).filter(([, v]) => v !== undefined && v !== ''),
    )
    const { data } = await apiClient.post<EscalaAplicada>(`/patients/${patientId}/escalas`, {
      ...nueva,
      respuestas,
    })
    return data
  },

  async anular(patientId: number, escalaId: number, motivo: string): Promise<EscalaAplicada> {
    const { data } = await apiClient.post<EscalaAplicada>(
      `/patients/${patientId}/escalas/${escalaId}/anular`,
      { motivo },
    )
    return data
  },
}
