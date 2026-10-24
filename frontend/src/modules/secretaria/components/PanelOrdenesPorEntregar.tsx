/**
 * Recepción: órdenes por entregar del día (O-09, plan 26 fase 4).
 *
 * La otra mitad del mostrador: entregar a la paciente el papel de la orden.
 * Recepción busca a la paciente, le imprime un solo papel con sus estudios
 * (con vista previa) y marca que ya se lo entregó. La entrega es contabilidad
 * del mostrador; NO cambia el estado clínico de la orden.
 *
 * Antes era una tarjeta por estudio (R-2): una paciente con diez estudios eran
 * diez tarjetas y diez papeles. Ahora es una tarjeta por paciente.
 *
 * Regla de oro (plan 22): sólo se dice «entregada» cuando el servidor lo
 * confirma; si ya estaba entregada, se dice eso, no «entregada ahora».
 */
import { useEffect, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CFormCheck,
  CFormInput,
  CSpinner,
} from '@coreui/react-pro'
import { useOrdenesEntrega } from '../hooks/useOrdenesEntrega'
import { agruparPorPaciente } from '../utils/porPaciente'
import { etiquetaEstadoOrden, etiquetaPrioridad } from '../../doctor/utils/etiquetasOrden'
import BotonesOrdenPdf from '../../doctor/components/BotonesOrdenPdf'
import ImprimirOrdenPaciente from './ImprimirOrdenPaciente'
import { ordenImprimible } from '../../doctor/utils/ordenEstudioPdf'
import { formatearFechaISO } from '../../../shared/utils/date'

const PanelOrdenesPorEntregar = () => {
  const { items, total, loading, loadError, buscar, marcarEntregada, PAGE_SIZE } =
    useOrdenesEntrega()
  const [search, setSearch] = useState('')
  const [incluirEntregadas, setIncluirEntregadas] = useState(false)
  const [page, setPage] = useState(0)
  const [marcando, setMarcando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errorMarcar, setErrorMarcar] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => void buscar(search, incluirEntregadas, page), 250)
    return () => clearTimeout(timer)
  }, [buscar, search, incluirEntregadas, page])

  const marcar = async (orderId: number) => {
    setMarcando(orderId)
    setErrorMarcar(null)
    try {
      const resultado = await marcarEntregada(orderId)
      setAviso(
        resultado.ya_estaba_entregada
          ? `Esa orden ya estaba marcada como entregada (folio ${orderId}).`
          : `Orden ${orderId} marcada como entregada a la paciente.`,
      )
      await buscar(search, incluirEntregadas, page)
    } catch (err) {
      setErrorMarcar((err as Error).message)
    } finally {
      setMarcando(null)
    }
  }

  const pacientes = agruparPorPaciente(items)

  return (
    <div data-tour="panel-entrega">
      <p className="text-body-secondary">
        Órdenes de estudio del día que faltan por entregar, una tarjeta por paciente. Imprímele su
        orden, entrégasela y márcala como entregada. Esto no cambia el estado del estudio.
      </p>

      {aviso && (
        <CAlert color="success" dismissible onClose={() => setAviso(null)}>
          {aviso}
        </CAlert>
      )}
      {errorMarcar && (
        <CAlert color="danger" dismissible onClose={() => setErrorMarcar(null)}>
          {errorMarcar}
        </CAlert>
      )}

      <div className="d-flex gap-3 align-items-center flex-wrap mb-3">
        <CFormInput
          data-tour="entrega-buscar"
          style={{ maxWidth: 420 }}
          placeholder="Paciente, estudio o folio…"
          aria-label="Buscar órdenes por entregar"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
        <CFormCheck
          id="incluir-entregadas"
          label="Ver también las ya entregadas"
          checked={incluirEntregadas}
          onChange={(e) => {
            setIncluirEntregadas(e.target.checked)
            setPage(0)
          }}
        />
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
          <CButton
            color="danger"
            variant="outline"
            onClick={() => void buscar(search, incluirEntregadas, page)}
          >
            Reintentar
          </CButton>
        </CAlert>
      ) : items.length === 0 ? (
        <CAlert color="info">No hay órdenes por entregar con esa búsqueda.</CAlert>
      ) : (
        <div className="d-flex flex-column gap-3" data-tour="entrega-lista">
          {pacientes.map((paciente) => {
            const imprimibles = paciente.ordenes.filter((o) => ordenImprimible(o.status))
            return (
              <CCard key={paciente.patient_id} data-tour="entrega-paciente">
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
                        ordenes={paciente.ordenes.filter((o) => ordenImprimible(o.status))}
                        // Solo las órdenes de hoy que se están entregando, no todas
                        // sus pendientes (R2): eso se imprime en «Subir resultado».
                        alcance="listadas"
                        dataTour="entrega-imprimir-paciente"
                      />
                    </div>
                  )}
                </CCardHeader>
                <CCardBody className="py-1">
                  {paciente.ordenes.map((orden) => (
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
                      </div>
                      {/* Igual que en «Subir resultado»: solo se marca lo que no es rutinario (D-10). */}
                      {orden.priority && orden.priority !== 'routine' && (
                        <CBadge color={orden.priority === 'urgent' ? 'danger' : 'warning'}>
                          {etiquetaPrioridad(orden.priority)}
                        </CBadge>
                      )}
                      <CBadge color="secondary">{etiquetaEstadoOrden(orden.status)}</CBadge>
                      {orden.delivered && <CBadge color="success">Entregada</CBadge>}
                      <BotonesOrdenPdf
                        orderId={orden.order_id}
                        status={orden.status}
                        etiqueta="Solo este estudio"
                      />
                      {!orden.delivered && (
                        <CButton
                          data-tour="entrega-marcar"
                          color="success"
                          size="sm"
                          disabled={marcando === orden.order_id}
                          onClick={() => void marcar(orden.order_id)}
                        >
                          {marcando === orden.order_id ? <CSpinner size="sm" /> : 'Marcar entregada'}
                        </CButton>
                      )}
                    </div>
                  ))}
                </CCardBody>
              </CCard>
            )
          })}
        </div>
      )}

      {!loadError && items.length > 0 && (
        <div className="d-flex justify-content-between mt-3">
          <span>{total === 1 ? '1 orden por entregar' : `${total} órdenes por entregar`}</span>
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
    </div>
  )
}

export default PanelOrdenesPorEntregar
