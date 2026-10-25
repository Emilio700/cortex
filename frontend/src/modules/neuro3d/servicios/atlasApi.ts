/**
 * Lo que el atlas le pide al servidor: el nombre del paciente en contexto,
 * guardar una captura en su expediente y, con el módulo `neuro3d_paciente`,
 * los modelos 3D armados desde sus estudios (feat/modelo-3d-desde-tc).
 *
 * Guardar usa el endpoint de imágenes clínicas que ya existe
 * (`POST /clinical-images/upload`), con su consentimiento obligatorio: el
 * servidor rechaza la imagen sin él. La pantalla sólo dice «guardado» cuando
 * esta llamada regresa bien.
 */
import { apiClient } from '../../../shared/services/api'
import type { Modelo3D } from '../dominio/modeloPaciente'

export type { Modelo3D }

export interface ImagenGuardada {
  id: number
  patient_id: number
  caption?: string | null
}

export const atlasApi = {
  async nombreDelPaciente(patientId: number | string): Promise<string | null> {
    const { data } = await apiClient.get<{ first_name?: string; last_name?: string }>(`/patients/${patientId}`)
    const nombre = `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim()
    return nombre || null
  },

  async guardarEnExpediente(datos: {
    patientId: number
    imagen: Blob
    nombreArchivo: string
    descripcion: string
    consentimiento: boolean
  }): Promise<ImagenGuardada> {
    const form = new FormData()
    form.append('patient_id', String(datos.patientId))
    // «Imagen de referencia»: material de apoyo, no una foto de la consulta.
    form.append('category', 'reference')
    form.append('consent_obtained', datos.consentimiento ? 'true' : 'false')
    form.append('body_region', 'Neuro 3D')
    if (datos.descripcion) form.append('caption', datos.descripcion)
    form.append('file', new File([datos.imagen], datos.nombreArchivo, { type: 'image/png' }))
    const { data } = await apiClient.post<ImagenGuardada>('/clinical-images/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  // ── Modelo 3D del paciente (feat/modelo-3d-desde-tc) ──
  async modelosDelPaciente(patientId: number): Promise<Modelo3D[]> {
    const { data } = await apiClient.get<Modelo3D[]>(`/patients/${patientId}/modelos-3d`)
    return data
  },

  /** El GLB del modelo (mm, LPS). Sólo existe si el servidor lo dio por listo. */
  async mallasDelModelo(modeloId: number): Promise<ArrayBuffer> {
    const { data } = await apiClient.get<ArrayBuffer>(`/imaging/modelos-3d/${modeloId}/mallas`, { responseType: 'arraybuffer' })
    return data
  },

  async marcarRevisado(modeloId: number): Promise<Modelo3D> {
    const { data } = await apiClient.post<Modelo3D>(`/imaging/modelos-3d/${modeloId}/revisado`)
    return data
  },
}
