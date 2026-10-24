/**
 * Sube un archivo de resultado y lo liga a su orden (O-04, plan 26 D-1).
 *
 * Lo usan recepción (el sobre del laboratorio) y el médico (el estudio que la
 * paciente le mandó por WhatsApp o correo). Cada subida crea su propio
 * resultado con su documento, así una orden admite varios archivos: el PDF del
 * reporte y las fotos del ultrasonido.
 */
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'

export interface ResultadoAdjuntado {
  result_id: number
  order_id: number
  order_status: string
  patient_document_id: number
  file_name: string
  mime_type: string
  file_size: number
  uploaded_at: string
}

export interface OpcionesAnexo {
  resulted_on?: string
  reporting_provider?: string
}

/** Lo que acepta el servidor; se repite aquí para que el selector de archivos ya filtre. */
export const TIPOS_DE_ARCHIVO_ACEPTADOS = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

/**
 * Devuelve lo que el servidor confirmó (201) o lanza un Error con su motivo en
 * español: quien llama solo dice «anexado» si esto no lanza.
 */
export const anexarArchivoDeResultado = async (
  orderId: number,
  file: File,
  opciones: OpcionesAnexo = {},
): Promise<ResultadoAdjuntado> => {
  const formData = new FormData()
  formData.append('file', file)
  if (opciones.resulted_on) formData.append('resulted_on', opciones.resulted_on)
  if (opciones.reporting_provider) formData.append('reporting_provider', opciones.reporting_provider)
  try {
    const response = await apiClient.post<ResultadoAdjuntado>(
      `/clinical-tracking/orders/${orderId}/result-attachment`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return response.data
  } catch (err) {
    throw new Error(mensajeDeError(err, 'No se pudo subir el archivo.'))
  }
}
