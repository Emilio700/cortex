/**
 * Archivos de los resultados de una orden, listos para el visor (plan 26, D-2).
 *
 * Una orden puede tener varios resultados, cada uno con su documento: el PDF
 * del reporte y las fotos del ultrasonido. El visor los muestra juntos, del más
 * antiguo al más reciente, para que se lean en el orden en que llegaron.
 */
import { archivoDeDocumento, type ArchivoVisor } from '../../../shared/components/VisorDocumentos'

interface ConDocumento {
  patient_document_id?: number | null
  document_file_name?: string | null
  document_mime_type?: string | null
  created_at?: string | null
  anulado_at?: string | null
}

export interface VisorAbierto {
  titulo: string
  archivos: ArchivoVisor[]
  inicial: number
}

export const archivosDeResultados = (resultados: ConDocumento[]): ArchivoVisor[] =>
  [...resultados]
    // El archivo de un resultado anulado ya no es parte del estudio (lote 9).
    .filter((r) => r.patient_document_id && !r.anulado_at)
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    .map((r) => archivoDeDocumento(r.patient_document_id!, r.document_file_name, r.document_mime_type))
