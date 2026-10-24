/**
 * Recepción sube el resultado (PDF o foto) de una orden de estudio (O-04,
 * plan 26 fase 4).
 *
 * Decisión de Emilio: el médico imprime la orden y recepción puede reimprimir
 * y subir el resultado; el médico lo interpreta y marca revisado. Aquí
 * recepción encuentra al paciente, adjunta uno o varios archivos a cada
 * estudio y puede ver lo que ya subió (R-1): antes solo veía cuántos archivos
 * había, sin forma de notar que subió el sobre equivocado o el mismo dos veces.
 * No ve indicación ni interpretación: el servidor no las manda a esta lista.
 *
 * Regla de oro (plan 22): sólo se dice «adjuntado» cuando el servidor devuelve
 * el 201; si algo falla, se muestra su motivo tal cual.
 */
import { useEffect, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CFormInput,
  CSpinner,
} from '@coreui/react-pro'
import { useOrdenesResultado, type OrdenPendienteResultado } from '../hooks/useOrdenesResultado'
import { agruparPorPaciente } from '../utils/porPaciente'
import {
  estadoVisibleDe,
  etiquetaEstadoOrden,
  etiquetaPrioridad,
} from '../../doctor/utils/etiquetasOrden'
import AnexarResultadoModal from '../../doctor/components/AnexarResultadoModal'
import RegistrarSeguimientoModal from '../../doctor/components/RegistrarSeguimientoModal'
import SeguimientoDeLaFila from '../../doctor/components/SeguimientoDeLaFila'
import '../../doctor/pages/bandejaPlegable.css'
import ImprimirOrdenPaciente from './ImprimirOrdenPaciente'
import VisorDocumentos, {
  archivoDeDocumento,
  type ArchivoVisor,
} from '../../../shared/components/VisorDocumentos'
import { formatearFechaISO } from '../../../shared/utils/date'

const PanelSubirResultado = ({ puedeSeguir = false }: { puedeSeguir?: boolean }) => {
  const { items, total, loading, loadError, buscar, PAGE_SIZE } = useOrdenesResultado()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [anexando, setAnexando] = useState<OrdenPendienteResultado | null>(null)
  const [visor, setVisor] = useState<{ titulo: string; archivos: ArchivoVisor[] } | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [soloAtrasadas, setSoloAtrasadas] = useState(false)
  const [siguiendo, setSiguiendo] = useState<OrdenPendienteResultado | null>(null)

  // Búsqueda con debounce, como la bandeja del médico.
  useEffect(() => {
    const timer = window.setTimeout(() => void buscar(search, page, soloAtrasadas), 250)
    return () => clearTimeout(timer)
  }, [buscar, search, page, soloAtrasadas])

  const verSubidos = (orden: OrdenPendienteResultado) =>
    setVisor({
      titulo: `${orden.patient_name}: ${orden.study_name}`,
      archivos: (orden.adjuntos ?? []).map((a) =>
        archivoDeDocumento(a.patient_document_id, a.file_name, a.mime_type),
      ),
    })

  const pacientes = agruparPorPaciente(items)

  return (
    <div data-tour="panel-resultados">
      <p className="text-body-secondary">
        Busca al paciente, adjunta a cada estudio el resultado que entregó el laboratorio (uno o
        varios archivos) y revisa lo que ya subiste. El médico lo revisa.
      </p>

      {exito && (
        <CAlert color="success" dismissible onClose={() => setExito(null)}>
          {exito}
        </CAlert>
      )}

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <CFormInput
          data-tour="resultados-buscar"
          style={{ maxWidth: 420 }}
          placeholder="Paciente, estudio o folio…"
          aria-label="Buscar órdenes por resultado"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
        {/* Recepción suele ser quien llama al paciente o al laboratorio (plan 32, punto 3). */}
        <CButton
          color="warning"
          variant={soloAtrasadas ? undefined : 'outline'}
          aria-pressed={soloAtrasadas}
          data-tour="resultados-atrasados"
          onClick={() => {
            setSoloAtrasadas((v) => !v)
            setPage(0)
          }}
        >
          Solo atrasados
        </CButton>
      </div>

      {loading ? (
        <div className="text-center p-5">
          <CSpinner />
        </div>
      ) : loadError ? (
        <CAlert
          color="danger"
          className="d-flex justify-content-between align-items-center gap-3 flex-wrap"
        >
          <span>{loadError}</span>
          <CButton color="danger" variant="outline" onClick={() => void buscar(search, page)}>
            Reintentar
          </CButton>
        </CAlert>
      ) : items.length === 0 ? (
        <CAlert color="info">
          {soloAtrasadas
            ? 'No hay estudios atrasados con esa búsqueda.'
            : 'No hay órdenes esperando resultado con esa búsqueda.'}
        </CAlert>
      ) : (
        <div className="d-flex flex-column gap-3" data-tour="resultados-lista">
          {pacientes.map((paciente) => {
            // Solo lo que sigue pendiente: lo que ya trae resultado no se vuelve a
            // mandar al laboratorio (plan 26, I3).
            const imprimibles = paciente.ordenes.filter(
              (o) => estadoVisibleDe({ status: o.status }) === 'pendiente',
            )
            return (
              <CCard key={paciente.patient_id}>
                <CCardHeader className="d-flex flex-wrap align-items-center gap-2">
                  <span className="fw-semibold">{paciente.patient_name}</span>
                  <span className="small text-body-secondary">
                    · {paciente.ordenes.length}{' '}
                    {paciente.ordenes.length === 1 ? 'estudio' : 'estudios'}
                  </span>
                  {imprimibles.length > 0 && (
                    <div className="ms-auto">
                      <ImprimirOrdenPaciente
                        patientId={paciente.patient_id}
                        patientName={paciente.patient_name}
                        ordenes={imprimibles}
                        variant="outline"
                        color="secondary"
                      />
                    </div>
                  )}
                </CCardHeader>
                <CCardBody className="py-1">
                  {paciente.ordenes.map((orden) => {
                    const subidos = orden.adjuntos?.length ?? 0
                    return (
                      <div
                        key={orden.order_id}
                        className="d-flex flex-wrap align-items-center gap-2 py-2 border-top"
                      >
                        <div className="flex-grow-1" style={{ minWidth: 200 }}>
                          <div className="fw-semibold">{orden.study_name}</div>
                          <div className="small text-body-secondary">
                            Folio {orden.order_id} · solicitada{' '}
                            {formatearFechaISO(orden.requested_on)}
                          </div>
                          <SeguimientoDeLaFila orden={orden} />
                        </div>
                        {orden.priority && orden.priority !== 'routine' && (
                          <CBadge color={orden.priority === 'urgent' ? 'danger' : 'warning'}>
                            {etiquetaPrioridad(orden.priority)}
                          </CBadge>
                        )}
                        <CBadge color="secondary">{etiquetaEstadoOrden(orden.status)}</CBadge>
                        {subidos > 0 ? (
                          <CButton
                            size="sm"
                            color="secondary"
                            variant="outline"
                            data-tour="resultados-ver-archivo"
                            onClick={() => verSubidos(orden)}
                          >
                            Ver {subidos === 1 ? 'archivo subido' : `${subidos} archivos subidos`}
                          </CButton>
                        ) : orden.attachments > 0 ? (
                          // Servidor viejo: sabe cuántos hay pero no cuáles.
                          <CBadge color="info">
                            {orden.attachments} archivo{orden.attachments === 1 ? '' : 's'} ya
                            subido{orden.attachments === 1 ? '' : 's'}
                          </CBadge>
                        ) : null}
                        <CButton
                          data-tour="resultados-subir"
                          size="sm"
                          color="primary"
                          variant="outline"
                          onClick={() => setAnexando(orden)}
                        >
                          Adjuntar resultado
                        </CButton>
                        {puedeSeguir && estadoVisibleDe({ status: orden.status }) === 'pendiente' && (
                          <CButton
                            size="sm"
                            color="secondary"
                            variant="ghost"
                            data-tour="resultados-seguimiento"
                            onClick={() => setSiguiendo(orden)}
                          >
                            Registrar seguimiento
                          </CButton>
                        )}
                      </div>
                    )
                  })}
                </CCardBody>
              </CCard>
            )
          })}
        </div>
      )}

      {!loadError && items.length > 0 && (
        <div className="d-flex justify-content-between mt-3">
          <span>{total} órdenes por resultado</span>
          <div>
            <CButton disabled={!page} onClick={() => setPage(page - 1)}>
              Anterior
            </CButton>
            <CButton
              className="ms-2"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </CButton>
          </div>
        </div>
      )}

      {anexando && (
        <AnexarResultadoModal
          visible
          orden={{
            id: anexando.order_id,
            study_name: anexando.study_name,
            patient_name: anexando.patient_name,
          }}
          onClose={() => setAnexando(null)}
          onAnexado={(confirmados) => {
            setExito(
              `Se ${confirmados.length === 1 ? 'adjuntó 1 archivo' : `adjuntaron ${confirmados.length} archivos`} a la orden de ${anexando.study_name} de ${anexando.patient_name}. El médico lo revisará.`,
            )
            void buscar(search, page, soloAtrasadas)
          }}
        />
      )}
      {siguiendo && (
        <RegistrarSeguimientoModal
          visible
          orden={{ id: siguiendo.order_id, study_name: siguiendo.study_name, patient_name: siguiendo.patient_name }}
          onClose={() => setSiguiendo(null)}
          onGuardado={(seg) => {
            setExito(
              `Seguimiento guardado: ${siguiendo.study_name} de ${siguiendo.patient_name} se vuelve a revisar el ${formatearFechaISO(seg.revisar_el)}.`,
            )
            void buscar(search, page, soloAtrasadas)
          }}
        />
      )}
      <VisorDocumentos
        visible={visor !== null}
        onClose={() => setVisor(null)}
        titulo={visor?.titulo ?? ''}
        archivos={visor?.archivos ?? []}
      />
    </div>
  )
}

export default PanelSubirResultado
