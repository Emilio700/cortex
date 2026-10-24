import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import { cilBellExclamation, cilCheckCircle } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import { formatearFechaISOCon } from '../../../shared/utils/date'
import { rutaDelExpediente } from '../../expediente/rutas'

export interface RevisionPendiente {
  pregnancy_id: number
  patient_id: number
  patient_full_name: string
  next_review_on: string
  dias_de_atraso: number
  vencida: boolean
  estimated_delivery_date?: string | null
  avisado_a_recepcion: boolean
}

const formatearFecha = (iso: string) =>
  formatearFechaISOCon(iso, { day: '2-digit', month: 'short' })

/**
 * Cuánto falta o cuánto lleva esperando, en las palabras en que se piensa.
 *
 * El número crudo obliga a hacer la resta mental cada renglón, y ese cálculo es
 * justo el que la lista venía a ahorrar.
 */
const describirEspera = (dias: number) => {
  if (dias === 0) return 'Le toca hoy'
  if (dias > 0) return dias === 1 ? 'Venció ayer' : `Venció hace ${dias} días`
  const faltan = Math.abs(dias)
  return faltan === 1 ? 'Le toca mañana' : `Le toca en ${faltan} días`
}

/**
 * Controles prenatales vencidos o próximos que nadie ha agendado.
 *
 * Es una lista que se consulta y no una notificación, por decisión de Emilio:
 * un aviso significa "haz algo" y aquí no hay nada que el médico tenga que
 * hacer en el momento — llamar al paciente es trabajo de recepción, y a
 * recepción sí le llega el aviso. El médico ya acumula avisos sin leer; otra
 * campanita habría vuelto ruido también a esta.
 *
 * No se dibuja nada cuando no hay pendientes: una tarjeta que dice "todo bien"
 * ocupa el mismo lugar todos los días y enseña a ignorar ese lugar.
 */
const TableroRevisionPrenatal = () => {
  const navigate = useNavigate()
  const [pendientes, setPendientes] = useState<RevisionPendiente[]>([])

  useEffect(() => {
    apiClient
      .get<RevisionPendiente[]>('/clinical-tracking/prenatal-review-board')
      .then((response) => setPendientes(response.data))
      // Silencioso a propósito: el tablero es un apoyo, no la ruta crítica de la
      // consulta. Un error aquí no puede tapar la agenda del día.
      .catch(() => setPendientes([]))
  }, [])

  if (pendientes.length === 0) return null

  return (
    <div className="hf-card mb-4" data-tour="doctora-revision-prenatal">
      <div
        className="hf-section-header"
        style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--hf-border-light)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CIcon icon={cilBellExclamation} style={{ color: 'var(--hf-amber, #d97706)' }} />
          <h5>Controles prenatales sin cita</h5>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--hf-text-tertiary)' }}>
          {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
        </span>
      </div>
      {pendientes.slice(0, 8).map((item) => (
        <div
          className="hf-appointment-item"
          key={item.pregnancy_id}
          onClick={() => navigate(rutaDelExpediente(item.patient_id))}
        >
          <div className="hf-appointment-time">
            {item.vencida ? 'Vencida' : 'Próxima'}
            <div className="time-duration">{formatearFecha(item.next_review_on)}</div>
          </div>
          <div className="hf-appointment-info">
            <div className="patient-name">{item.patient_full_name}</div>
            <div className="patient-meta">
              {describirEspera(item.dias_de_atraso)}
              {/* Lo primero que se pregunta antes de ponerse a llamar uno mismo. */}
              {item.avisado_a_recepcion ? (
                <>
                  {' · '}
                  <CIcon icon={cilCheckCircle} size="sm" /> Recepción ya fue avisada
                </>
              ) : (
                ' · Recepción aún no ha sido avisada'
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default TableroRevisionPrenatal
