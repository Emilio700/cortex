/**
 * Todas las llamadas del módulo de imagen, en un solo lugar.
 *
 * Los componentes no arman rutas ni cabeceras: piden cosas con nombre («los
 * estudios del paciente», «el manifiesto de la serie»). Así, cuando cambie un
 * endpoint, se cambia aquí y no en cinco pantallas.
 */
import { apiClient } from '../../../shared/services/api'
import type {
  AnotacionDicom,
  CandidatoComparacion,
  EstudioDicom,
  ManifiestoSerie,
} from '../dominio/tipos'

interface RespuestaCarga {
  creados: { id: number; status_detail: string | null }[]
  ya_existentes: number[]
  archivos_descartados: number
  mensajes: string[]
}

/** URL absoluta: el cargador de Cornerstone no pasa por axios ni por su base. */
export function urlAbsoluta(ruta: string): string {
  const base = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '')
  if (/^https?:\/\//i.test(base)) return `${base}${ruta}`
  return new URL(`${base}${ruta}`, window.location.origin).toString()
}

export const estudiosApi = {
  async listar(patientId: number | string): Promise<EstudioDicom[]> {
    const { data } = await apiClient.get<EstudioDicom[]>(`/patients/${patientId}/imaging/studies`)
    return data
  },

  async detalle(studyId: number | string): Promise<EstudioDicom> {
    const { data } = await apiClient.get<EstudioDicom>(`/imaging/studies/${studyId}`)
    return data
  },

  async manifiesto(seriesId: number): Promise<ManifiestoSerie> {
    const { data } = await apiClient.get<ManifiestoSerie>(`/imaging/series/${seriesId}/manifest`)
    return data
  },

  async candidatos(studyId: number | string): Promise<CandidatoComparacion[]> {
    const { data } = await apiClient.get<CandidatoComparacion[]>(
      `/imaging/studies/${studyId}/comparison-candidates`
    )
    return data
  },

  async subirArchivos(patientId: number | string, archivos: File[]): Promise<RespuestaCarga> {
    const cuerpo = new FormData()
    for (const archivo of archivos) cuerpo.append('archivos', archivo)
    const { data } = await apiClient.post<RespuestaCarga>(
      `/patients/${patientId}/imaging/upload`,
      cuerpo,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return data
  },

  async subirZip(patientId: number | string, archivo: File): Promise<RespuestaCarga> {
    const cuerpo = new FormData()
    cuerpo.append('archivo', archivo)
    const { data } = await apiClient.post<RespuestaCarga>(
      `/patients/${patientId}/imaging/upload-archive`,
      cuerpo,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return data
  },

  async guardarMedicion(
    studyId: number | string,
    medicion: {
      kind: string
      series_id: number | null
      geometry: Record<string, unknown>
      value: number
      unit: string
      label: string | null
    }
  ): Promise<AnotacionDicom> {
    const { data } = await apiClient.post<AnotacionDicom>(
      `/imaging/studies/${studyId}/annotations`,
      medicion
    )
    return data
  },

  async confirmarMedicion(annotationId: number): Promise<AnotacionDicom> {
    const { data } = await apiClient.post<AnotacionDicom>(
      `/imaging/annotations/${annotationId}/confirm`
    )
    return data
  },

  async borrarMedicion(annotationId: number): Promise<void> {
    await apiClient.delete(`/imaging/annotations/${annotationId}`)
  },
}
