/**
 * Lo que recepción ve en Estudios y Consentimientos (plan 32, punto 6).
 *
 * Estudios: el estado (pendiente o con resultado recibido) y el archivo que
 * le llegó a ella (decisión 2 de Emilio), sin interpretación, valoración ni
 * notas: el servidor no se las manda a esta lista.
 * Consentimientos: que existen y si están firmados, sin su contenido.
 */
import { useCallback, useEffect, useState } from 'react'
import { CAlert, CBadge, CButton, CSpinner } from '@coreui/react-pro'

import { apiClient } from '../../shared/services/api'
import { mensajeDeError } from '../../shared/utils/errors'
import { formatearFechaISO, formatearInstante } from '../../shared/utils/date'
import VisorDocumentos, { archivoDeDocumento, type ArchivoVisor } from '../../shared/components/VisorDocumentos'
import { etiquetaEstadoOrden } from '../doctor/utils/etiquetasOrden'
import type { OrdenPendienteResultado } from '../secretaria/hooks/useOrdenesResultado'
import type { ConsentimientoEstado } from './tipos'

function useLista<T>(ruta: string, params?: Record<string, unknown>, extraer?: (d: any) => T[]) {
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clave = JSON.stringify(params ?? {})
  const cargar = useCallback(async () => {
    setError(null)
    try {
      const { data } = await apiClient.get(ruta, { params })
      setItems(extraer ? extraer(data) : data)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar esta sección.'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta, clave])
  useEffect(() => { void cargar() }, [cargar])
  return { items, error, cargar }
}

const Fallo = ({ error, onReintentar }: { error: string; onReintentar: () => void }) => (
  <CAlert color="danger" className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
    <span>{error}</span>
    <CButton color="danger" variant="outline" size="sm" onClick={onReintentar}>Reintentar</CButton>
  </CAlert>
)

export function EstudiosDeRecepcion({ patientId }: { patientId: number }) {
  const { items, error, cargar } = useLista<OrdenPendienteResultado>(
    '/clinical-tracking/orders/awaiting-result',
    { patient_id: patientId, limit: 100 },
    (d) => d.items,
  )
  const [visor, setVisor] = useState<{ titulo: string; archivos: ArchivoVisor[] } | null>(null)
  if (error) return <Fallo error={error} onReintentar={() => void cargar()} />
  if (!items) return <div className="text-center p-4"><CSpinner size="sm" /></div>
  return (
    <>
      {items.length === 0 ? (
        <CAlert color="light" className="mb-0">No tiene estudios esperando resultado.</CAlert>
      ) : (
        <ul className="expediente-lista">
          {items.map((o) => (
            <li key={o.order_id} className="expediente-lista__fila">
              <div>
                <div className="fw-semibold">{o.study_name}</div>
                <div className="small text-body-secondary">
                  Orden n.º {o.order_id} · solicitada {formatearFechaISO(o.requested_on)}
                  {o.doctor_name ? ` · ${o.doctor_name}` : ''}
                </div>
              </div>
              <CBadge color="secondary">{etiquetaEstadoOrden(o.status)}</CBadge>
              {(o.adjuntos?.length ?? 0) > 0 && (
                <CButton
                  size="sm"
                  color="secondary"
                  variant="outline"
                  onClick={() =>
                    setVisor({
                      titulo: `${o.patient_name}: ${o.study_name}`,
                      archivos: (o.adjuntos ?? []).map((a) => archivoDeDocumento(a.patient_document_id, a.file_name, a.mime_type)),
                    })
                  }
                >
                  Ver archivo recibido
                </CButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <VisorDocumentos visible={visor !== null} onClose={() => setVisor(null)} titulo={visor?.titulo ?? ''} archivos={visor?.archivos ?? []} />
    </>
  )
}

export function ConsentimientosDeRecepcion({ patientId }: { patientId: number }) {
  const { items, error, cargar } = useLista<ConsentimientoEstado>(`/patients/${patientId}/expediente/consentimientos`)
  if (error) return <Fallo error={error} onReintentar={() => void cargar()} />
  if (!items) return <div className="text-center p-4"><CSpinner size="sm" /></div>
  if (items.length === 0) return <CAlert color="light" className="mb-0">No tiene consentimientos registrados.</CAlert>
  return (
    <ul className="expediente-lista">
      {items.map((c) => (
        <li key={c.id} className="expediente-lista__fila">
          <div className="fw-semibold">{c.title}</div>
          <CBadge color={c.firmado ? 'success' : 'secondary'}>
            {c.firmado
              ? `Firmado${c.signed_at ? ` el ${formatearInstante(c.signed_at, { dateStyle: 'medium' })}` : ''}`
              : c.status === 'revoked'
                ? 'Revocado'
                : c.status === 'cancelled'
                  ? 'Anulado'
                  : 'No firmado'}
          </CBadge>
        </li>
      ))}
    </ul>
  )
}
