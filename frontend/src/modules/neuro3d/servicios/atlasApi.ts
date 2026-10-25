/**
 * Lo único que el atlas le pide al servidor: el nombre del paciente en
 * contexto y guardar una captura en su expediente.
 *
 * Guardar usa el endpoint de imágenes clínicas que ya existe
 * (`POST /clinical-images/upload`), con su consentimiento obligatorio: el
 * servidor rechaza la imagen sin él. La pantalla sólo dice «guardado» cuando
 * esta llamada regresa bien.
 */
import { apiClient } from '../../../shared/services/api'

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
    form.append('body_region', 'Atlas Neuro 3D')
    if (datos.descripcion) form.append('caption', datos.descripcion)
    form.append('file', new File([datos.imagen], datos.nombreArchivo, { type: 'image/png' }))
    const { data } = await apiClient.post<ImagenGuardada>('/clinical-images/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
