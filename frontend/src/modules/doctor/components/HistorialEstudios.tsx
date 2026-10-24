/**
 * Historial de estudios del expediente clínico (O-08).
 *
 * Lista todas las órdenes del paciente, en cualquier estado, con sus fechas,
 * su estado en español y sus resultados; los archivos de cada orden se ven en
 * el visor compartido, todos juntos en un carrusel (plan 26, D-2). La primera
 * página viene de la fuente compartida de la consulta (sin una petición nueva
 * al visitar la pestaña); las siguientes se piden por página, cada una con su
 * total (`GET /clinical-tracking/patient/{id}/orders`, con `X-Total-Count`):
 * sin N+1 desde el cliente.
 */
import { useCallback, useEffect, useState } from 'react'
import { CAlert, CBadge, CButton, CCard, CCardBody, CSpinner } from '@coreui/react-pro'
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import VisorDocumentos from '../../../shared/components/VisorDocumentos'
import { archivosDeResultados, type VisorAbierto } from '../utils/archivosDeResultados'
import { etiquetaEstadoOrden, etiquetaPrioridad } from '../utils/etiquetasOrden'
import type { OrdenConResultados } from '../types/clinicalTracking'
import { LeyendaUltimaActualizacion, LeyendasDeResultado } from './RastroDeEstudio'
import { formatearFechaISO } from '../../../shared/utils/date'
import { datosValoracion } from '../utils/valoracion'
import { useHistorialDeOrdenes } from '../hooks/useFuenteDeOrdenes'

interface Props {
  patientId: number
}

const PAGE_SIZE = 25

const fecha = (valor?: string | null) => (valor ? formatearFechaISO(valor) : null)

/** Etiquetas en español del estado de revisión de un resultado. */
const REVISION: Record<string, string> = {
  received: 'Recibido',
  reviewed: 'Revisado',
  requires_action: 'Requiere acción',
  communicated: 'Comunicado al paciente',
}

const HistorialEstudios = ({ patientId }: Props) => {
  // La página 0 viene de la fuente compartida de la consulta: si ya está
  // cargada, visitar la pestaña no dispara ninguna petición.
  const {
    historial,
    totalExpediente,
    cargando: cargandoCompartido,
    error: errorCompartido,
    recargar,
  } = useHistorialDeOrdenes(patientId)
  const [page, setPage] = useState(0)
  // Las páginas 1+ se piden al servidor igual que antes.
  const [paginaRemota, setPaginaRemota] = useState<OrdenConResultados[] | null>(null)
  const [cargandoRemota, setCargandoRemota] = useState(false)
  const [errorRemota, setErrorRemota] = useState<string | null>(null)
  const [visor, setVisor] = useState<VisorAbierto | null>(null)

  const cargarPaginaRemota = useCallback(
    async (p: number) => {
      setCargandoRemota(true)
      setErrorRemota(null)
      try {
        const respuesta = await apiClient.get<OrdenConResultados[]>(
          `/clinical-tracking/patient/${patientId}/orders`,
          { params: { skip: p * PAGE_SIZE, limit: PAGE_SIZE } },
        )
        setPaginaRemota(respuesta.data)
      } catch (err) {
        setPaginaRemota(null)
        setErrorRemota(mensajeDeError(err, 'No se pudo cargar el historial de estudios.'))
      } finally {
        setCargandoRemota(false)
      }
    },
    [patientId],
  )

  useEffect(() => {
    if (page === 0) {
      // La fuente compartida ya tiene esta página; se descarta la remota.
      setPaginaRemota(null)
      setCargandoRemota(false)
      setErrorRemota(null)
      return
    }
    void cargarPaginaRemota(page)
  }, [page, cargarPaginaRemota])

  const total = totalExpediente ?? 0
  const cargando = cargandoCompartido || cargandoRemota
  const error = errorCompartido ?? errorRemota
  const ordenes = page === 0 ? historial.slice(0, PAGE_SIZE) : (paginaRemota ?? [])

  // Abre en el visor todos los archivos de la orden, empezando por el pulsado.
  const abrirDocumento = (orden: OrdenConResultados, documentId: number) => {
    const archivos = archivosDeResultados(orden.results)
    setVisor({
      titulo: orden.study_name,
      archivos,
      inicial: Math.max(
        0,
        archivos.findIndex((a) => a.clave === `doc-${documentId}`),
      ),
    })
  }

  if (cargando) {
    return (
      <div className="text-center p-4">
        <CSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <CAlert
        color="danger"
        className="d-flex justify-content-between align-items-center gap-3 flex-wrap"
      >
        <span>{error}</span>
        <CButton
          color="danger"
          variant="outline"
          onClick={() => (page === 0 ? void recargar() : void cargarPaginaRemota(page))}
        >
          Reintentar
        </CButton>
      </CAlert>
    )
  }

  if (ordenes.length === 0) {
    return <CAlert color="info">Este paciente no tiene órdenes de estudios registradas.</CAlert>
  }

  return (
    <div data-tour="expediente-estudios">
      <div className="d-flex flex-column gap-3">
        {ordenes.map((orden) => (
          <CCard key={orden.id}>
            <CCardBody>
              <div className="d-flex justify-content-between gap-2 flex-wrap">
                <div className="fw-semibold">{orden.study_name}</div>
                <div>
                  <CBadge color={orden.priority === 'urgent' ? 'danger' : 'info'}>
                    {etiquetaPrioridad(orden.priority)}
                  </CBadge>
                  <CBadge className="ms-2" color="secondary">
                    {etiquetaEstadoOrden(orden.status)}
                  </CBadge>
                </div>
              </div>
              <div className="small text-body-secondary mt-1">
                Folio {orden.id}
                {orden.order_group_id ? ` · lote G-${orden.order_group_id}` : ''} · solicitada{' '}
                {fecha(orden.requested_on)}
                {orden.desired_on ? ` · a más tardar ${fecha(orden.desired_on)}` : ''}
              </div>
              <LeyendaUltimaActualizacion
                orderId={orden.id}
                cuando={orden.ultima_actualizacion_at}
                por={orden.ultima_actualizacion_por}
              />
              {orden.status_reason &&
                (orden.status === 'cancelled' || orden.status === 'rejected') && (
                  <div className="small text-danger mt-1">Motivo: {orden.status_reason}</div>
                )}

              {orden.results.length > 0 && (
                <div className="mt-2 border-top pt-2">
                  <div className="small fw-semibold mb-1">Resultados</div>
                  {orden.results.map((resultado) => (
                    <div key={resultado.id} className="small mb-2">
                      {/* Solo la administración recibe anulados (plan 29, lote 9). */}
                      {resultado.anulado_at && (
                        <div className="text-danger">
                          <CBadge color="danger" className="me-1">
                            Anulado
                          </CBadge>
                          Motivo: {resultado.anulado_motivo || '—'}
                        </div>
                      )}
                      <div
                        className={
                          resultado.anulado_at
                            ? 'text-decoration-line-through text-body-secondary'
                            : undefined
                        }
                      >
                        {datosValoracion(resultado.valoracion) && (
                          <CBadge
                            color={datosValoracion(resultado.valoracion)!.color}
                            className="me-1"
                          >
                            {datosValoracion(resultado.valoracion)!.etiqueta}
                          </CBadge>
                        )}
                        <CBadge color="secondary">
                          {REVISION[resultado.review_status] ?? resultado.review_status}
                        </CBadge>
                        {resultado.resulted_on && (
                          <span className="ms-2">Reporte: {fecha(resultado.resulted_on)}</span>
                        )}
                        {resultado.reporting_provider && (
                          <span className="ms-2 text-body-secondary">
                            {resultado.reporting_provider}
                          </span>
                        )}
                        {resultado.clinician_interpretation && (
                          <div className="text-body-secondary">
                            Interpretación: {resultado.clinician_interpretation}
                          </div>
                        )}
                      </div>
                      <LeyendasDeResultado resultado={resultado} />
                      {resultado.patient_document_id && !resultado.anulado_at && (
                        <div className="mt-1">
                          <CButton
                            size="sm"
                            color="secondary"
                            variant="outline"
                            onClick={() => abrirDocumento(orden, resultado.patient_document_id!)}
                          >
                            Ver {resultado.document_file_name || 'archivo del resultado'}
                          </CButton>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CCardBody>
          </CCard>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="d-flex justify-content-between align-items-center mt-3">
          <span className="small text-body-secondary">{total} órdenes</span>
          <div>
            <CButton disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </CButton>
            <CButton
              className="ms-2"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </CButton>
          </div>
        </div>
      )}
      <VisorDocumentos
        visible={visor !== null}
        onClose={() => setVisor(null)}
        titulo={visor?.titulo ?? ''}
        archivos={visor?.archivos ?? []}
        inicial={visor?.inicial ?? 0}
      />
    </div>
  )
}

export default HistorialEstudios
