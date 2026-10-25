// Registro en la bitácora del servidor de exportaciones hechas en el navegador (FHIR, CSV).
// Solo en modo servidor; no bloquea la descarga (fire-and-forget) pero avisa si no se pudo registrar.
import { toast } from '../components/toast'
import { api, isServer } from './api'

/** Recursos aceptados por POST /api/auditoria/evento (lista blanca del servidor). */
export type RecursoExportado = 'fhir' | 'caja' | 'inventario' | 'encuestas'

export interface EventoExportacion {
  patientId?: string
  formato: string
  /** Número de recursos/filas exportados. */
  recursos: number
}

export function registrarExportacion(recurso: RecursoExportado, e: EventoExportacion): Promise<void> {
  if (!isServer()) return Promise.resolve()
  return api('/auditoria/evento', {
    method: 'POST',
    body: { accion: 'exportar', recurso, ...(e.patientId ? { patientId: e.patientId } : {}), detalle: { formato: e.formato, recursos: e.recursos } },
  }).then(
    () => undefined,
    () => {
      toast('La exportación no quedó registrada en la bitácora. Avisa al administrador.', 'warn')
    },
  )
}
