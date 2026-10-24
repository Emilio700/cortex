/**
 * «Resultados pendientes de la paciente» dentro de la consulta (plan 26, N3).
 *
 * Los resultados de estudios pedidos en consultas anteriores llegaban a la
 * bandeja, pero en la consulta de hoy, con la paciente enfrente, no se veían. Y
 * revisar con la paciente es justo lo que cierra una incidencia crítica (D-8).
 * Aquí salen los recibidos sin revisar y los que tienen una incidencia abierta,
 * de cualquier cita anterior (`?por_atender=true`), y «Revisar» los abre en el
 * panel con la cita de HOY: así la revisión cuenta como hecha en consulta.
 *
 * Si no hay nada, no se pinta nada. Si no se pudo consultar, se dice.
 */
import { useState } from 'react'
import { CAlert, CBadge, CButton, CSpinner } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilWarning } from '@coreui/icons'

import { formatearFechaISO } from '../../../shared/utils/date'
import PanelResultado, { incidenciaAbierta } from './PanelResultado'
import AnexarResultadoModal from './AnexarResultadoModal'
import { colorEstadoVisible, estadoVisibleDe, etiquetaEstadoVisible } from '../utils/etiquetasOrden'
import { avisarResultadosActualizados } from '../hooks/useResultadosSinRevisar'
import { useResultadosPorAtender } from '../hooks/useFuenteDeOrdenes'
import type { OrdenEnBandeja } from '../types/clinicalTracking'

interface Props {
  patientId: number
  appointmentId: number
  patientName?: string
  puedeAnexar?: boolean
  /** Para avisar a la tarjeta de la consulta, que comparte el aviso de éxito. */
  onAviso?: (texto: string) => void
}

const ResultadosPorAtender = ({
  patientId,
  appointmentId,
  patientName,
  puedeAnexar,
  onAviso,
}: Props) => {
  const { porAtender, totalPorAtender, cargando, error, recargar } = useResultadosPorAtender(
    patientId,
    appointmentId,
  )
  const [revisando, setRevisando] = useState<OrdenEnBandeja | null>(null)
  const [anexando, setAnexando] = useState<OrdenEnBandeja | null>(null)

  // Las de esta consulta ya están en «Estudios de esta consulta».
  let ordenes: OrdenEnBandeja[] | null = null
  let total = 0
  if (porAtender !== null) {
    ordenes = porAtender.filter((o) => o.appointment_id !== appointmentId)
    total =
      totalPorAtender === null
        ? ordenes.length
        : totalPorAtender - (porAtender.length - ordenes.length)
  }

  if (error) {
    return (
      <CAlert
        color="danger"
        className="d-flex justify-content-between align-items-center gap-2 flex-wrap"
      >
        <span>{error} Puede que tenga resultados esperando revisión.</span>
        <CButton size="sm" color="danger" variant="outline" onClick={() => void recargar()}>
          Reintentar
        </CButton>
      </CAlert>
    )
  }
  if (cargando || ordenes === null) {
    return (
      <div className="text-center py-2">
        <CSpinner size="sm" />
      </div>
    )
  }
  if (ordenes.length === 0) return null

  return (
    <div
      className="border border-warning rounded p-3 mb-3"
      data-tour="consulta-resultados-pendientes"
    >
      <div className="fw-semibold mb-1">Resultados pendientes de la paciente ({total})</div>
      <div className="small text-body-secondary mb-2">
        De consultas anteriores. Revisarlos aquí, con la paciente, cierra la incidencia si es
        crítico.
      </div>
      {total > ordenes.length && (
        <div className="small text-warning-emphasis mb-2">
          Se muestran {ordenes.length} de {total}; el resto está en la bandeja.
        </div>
      )}
      {ordenes.map((orden) => {
        const estado = estadoVisibleDe(orden)
        const abierta = incidenciaAbierta(orden)
        return (
          <div key={orden.id} className="d-flex flex-wrap align-items-center gap-2 py-2 border-top">
            <div className="flex-grow-1" style={{ minWidth: 180 }}>
              <span className="fw-semibold">{orden.study_name}</span>
              {abierta && (
                <CBadge color="danger" className="ms-2">
                  <CIcon icon={cilWarning} size="sm" className="me-1" />
                  Crítico sin cerrar
                </CBadge>
              )}
              <div className="small text-body-secondary">
                Orden n.º {orden.id} · solicitada{' '}
                {formatearFechaISO(orden.requested_on, 'sin fecha', 'short')}
              </div>
            </div>
            <CBadge color={colorEstadoVisible(estado)}>{etiquetaEstadoVisible(estado)}</CBadge>
            <CButton
              size="sm"
              color={abierta ? 'danger' : 'primary'}
              variant="outline"
              style={{ minHeight: 40 }}
              onClick={() => setRevisando(orden)}
              data-tour="consulta-revisar-pendiente"
            >
              Revisar
            </CButton>
          </div>
        )
      })}
      {revisando && (
        <PanelResultado
          key={revisando.id}
          orden={revisando}
          pacienteNombre={patientName || 'Paciente de esta consulta'}
          modo="revisar"
          appointmentId={appointmentId}
          onClose={() => setRevisando(null)}
          onAnexar={puedeAnexar ? () => setAnexando(revisando) : undefined}
          onGuardado={(_, mensaje) => {
            onAviso?.(mensaje)
            setRevisando(null)
            avisarResultadosActualizados()
            void recargar()
          }}
        />
      )}
      {anexando && (
        <AnexarResultadoModal
          visible
          orden={{ ...anexando, patient_name: patientName }}
          onClose={() => setAnexando(null)}
          onAnexado={() => void recargar()}
        />
      )}
    </div>
  )
}

export default ResultadosPorAtender
