/**
 * Todas las llamadas del módulo de imagen, en un solo lugar.
 *
 * Los componentes no arman rutas ni cabeceras: piden cosas con nombre («los
 * estudios del paciente», «el manifiesto de la serie»). Así, cuando cambie un
 * endpoint, se cambia aquí y no en cinco pantallas.
 */
import { apiClient } from '../../../shared/services/api'
import type { CorteClave } from '../dominio/cortesClave'
import type { EnlaceCompartido, EnlaceCreado } from '../dominio/compartir'
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
  /** Nombre del paciente, para escribirlo en una captura sólo si se pide. */
  async nombreDelPaciente(patientId: number | string): Promise<string | null> {
    const { data } = await apiClient.get<{ first_name?: string; last_name?: string }>(
      `/patients/${patientId}`
    )
    const nombre = `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim()
    return nombre || null
  },

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

// ── Cortes clave, hoja en PDF y enlaces temporales ──────────────────────────

export interface DatosDeCorteClave {
  series_id: number
  instance_index: number
  sop_instance_uid?: string | null
  label?: string | null
  notes?: string | null
  view_state: object
  /** Captura PNG del corte; sin ella sólo se marca el corte. */
  imagen?: Blob | null
}

/**
 * Con `responseType: 'blob'` el cuerpo de un error también llega como Blob y el
 * mensaje del servidor («No hay cortes clave con captura…») se perdería. Se lee
 * y se devuelve como un error normal; si no es legible, se deja el original.
 */
export async function errorLegibleDeBlob(error: unknown): Promise<unknown> {
  const cuerpo = (error as { response?: { data?: unknown } })?.response?.data
  if (typeof Blob === 'undefined' || !(cuerpo instanceof Blob)) return error
  try {
    const detalle = JSON.parse(await cuerpo.text())?.detail
    if (typeof detalle === 'string' && detalle) return new Error(detalle)
  } catch {
    // El cuerpo no era JSON: se conserva el error original.
  }
  return error
}

export const cortesClaveApi = {
  async listar(studyId: number | string): Promise<CorteClave[]> {
    const { data } = await apiClient.get<CorteClave[]>(`/imaging/studies/${studyId}/key-images`)
    return data
  },

  /** Marca (o actualiza) un corte. Marcar dos veces el mismo no lo duplica. */
  async guardar(studyId: number | string, datos: DatosDeCorteClave): Promise<CorteClave> {
    const cuerpo = new FormData()
    cuerpo.append('series_id', String(datos.series_id))
    cuerpo.append('instance_index', String(datos.instance_index))
    if (datos.sop_instance_uid) cuerpo.append('sop_instance_uid', datos.sop_instance_uid)
    if (datos.label != null) cuerpo.append('label', datos.label)
    if (datos.notes != null) cuerpo.append('notes', datos.notes)
    cuerpo.append('view_state', JSON.stringify(datos.view_state))
    if (datos.imagen) cuerpo.append('imagen', datos.imagen, 'captura.png')
    const { data } = await apiClient.post<CorteClave>(
      `/imaging/studies/${studyId}/key-images`,
      cuerpo,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return data
  },

  async editar(
    keyImageId: number,
    cambios: { label?: string | null; notes?: string | null }
  ): Promise<CorteClave> {
    const { data } = await apiClient.patch<CorteClave>(`/imaging/key-images/${keyImageId}`, cambios)
    return data
  },

  async quitar(keyImageId: number): Promise<void> {
    await apiClient.delete(`/imaging/key-images/${keyImageId}`)
  },

  /** La captura como Blob: lleva la sesión, así que no puede ser un `<img src>` directo. */
  async captura(keyImageId: number): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(`/imaging/key-images/${keyImageId}/image`, {
      responseType: 'blob',
    })
    return data
  },

  async hojaEnPdf(
    studyId: number | string,
    opciones: { ids?: number[]; anonimo?: boolean } = {}
  ): Promise<Blob> {
    try {
      const { data } = await apiClient.post<Blob>(
        `/imaging/studies/${studyId}/export-pdf`,
        { key_image_ids: opciones.ids ?? [], anonimo: Boolean(opciones.anonimo) },
        { responseType: 'blob' }
      )
      return data
    } catch (error) {
      throw await errorLegibleDeBlob(error)
    }
  },
}

export const enlacesApi = {
  async listar(studyId: number | string): Promise<EnlaceCompartido[]> {
    const { data } = await apiClient.get<EnlaceCompartido[]>(
      `/imaging/studies/${studyId}/share-links`
    )
    return data
  },

  async crear(
    studyId: number | string,
    datos: { hours: number; note?: string | null; consent_confirmed: boolean }
  ): Promise<EnlaceCreado> {
    const { data } = await apiClient.post<EnlaceCreado>(
      `/imaging/studies/${studyId}/share-links`,
      datos
    )
    return data
  },

  async revocar(linkId: number): Promise<EnlaceCompartido> {
    const { data } = await apiClient.post<EnlaceCompartido>(`/imaging/share-links/${linkId}/revoke`)
    return data
  },
}

// ── Lo que ve quien abre el enlace, sin sesión ──────────────────────────────

export interface SerieCompartida {
  id: number
  series_number: number
  series_description: string | null
  sequence_label: string | null
  modality: string
  instance_count: number
}

export interface EstudioCompartido {
  modality: string
  study_date: string
  study_description: string | null
  body_part: string | null
  series: SerieCompartida[]
  expires_at: string
  aviso: string
}

export const compartidoApi = {
  async resumen(token: string): Promise<EstudioCompartido> {
    const { data } = await apiClient.get<EstudioCompartido>(`/public/imaging/shared/${token}`)
    return data
  },

  async manifiesto(token: string, seriesId: number): Promise<ManifiestoSerie> {
    const { data } = await apiClient.get<ManifiestoSerie>(
      `/public/imaging/shared/${token}/series/${seriesId}/manifest`
    )
    return data
  },
}
