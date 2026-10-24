/**
 * Appointment List Card - Visual card-based appointment list for a day
 */
import React from 'react'
import { CCard, CCardBody, CCardHeader, CBadge } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilClock, cilUser, cilMedicalCross, cilCheckAlt, cilCalendar, cilRoom } from '@coreui/icons'
import type { Appointment, AppointmentStatus } from '../types'
import { nombreSalaDeCita } from '../utils/salas'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'
import { formatearEnConsultorio, formatearHoraDeCita } from '../../../shared/utils/date'

interface AppointmentListCardProps {
  title: string
  appointments: Appointment[]
  onAppointmentClick: (appointment: Appointment) => void
}

const STATUS_CONFIG: Record<AppointmentStatus, { color: string; bg: string; label: string; icon: any }> = {
  agendada: { color: '#0d6efd', bg: '#e7f1ff', label: 'Agendada', icon: cilCalendar },
  confirmada: { color: '#198754', bg: '#e8f5e9', label: 'Confirmada', icon: cilCheckAlt },
  en_sala: { color: '#fd7e14', bg: '#fff3e0', label: 'En Sala', icon: cilMedicalCross },
  en_consulta: { color: '#6f42c1', bg: '#f1ebfa', label: 'En consulta', icon: cilMedicalCross },
  atendida: { color: '#6c757d', bg: '#f3f4f6', label: 'Atendida', icon: cilCheckAlt },
  cancelada: { color: '#dc3545', bg: '#fbe9e7', label: 'Cancelada', icon: cilClock },
}

// Hora de la cita en el reloj del consultorio (D-12).
const formatTime = (dateString: string) =>
  formatearHoraDeCita(dateString, { hour: '2-digit', minute: '2-digit' })

const AppointmentCard: React.FC<{
  appointment: Appointment
  onClick: () => void
}> = ({ appointment: apt, onClick }) => {
  const status = STATUS_CONFIG[apt.status] || STATUS_CONFIG.agendada
  const patientName = apt.patient
    ? `${apt.patient.first_name} ${apt.patient.last_name}`
    : 'Paciente #' + apt.patient_id
  const doctorName = apt.doctor?.full_name ? nombreConTratamiento(apt.doctor) : 'Sin asignar'
  const initial = patientName.charAt(0).toUpperCase()
  // El backend ya resuelve el nombre; las citas históricas no traen ninguno.
  const salaNombre = nombreSalaDeCita(apt)

  return (
    <div
      onClick={onClick}
      className="appointment-card d-flex align-items-stretch gap-0 mb-2 rounded-3 overflow-hidden"
      style={{ cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', transition: 'all 0.15s ease', border: '1px solid #e9ecef' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      {/* Left color accent bar */}
      <div style={{ width: '5px', backgroundColor: status.color, flexShrink: 0 }}></div>

      {/* Avatar column */}
      <div
        className="d-flex align-items-center justify-content-center flex-shrink-0"
        style={{
          width: '52px',
          backgroundColor: status.bg,
        }}
      >
        <div
          className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
          style={{
            width: '36px',
            height: '36px',
            backgroundColor: status.color,
            fontSize: '14px',
          }}
        >
          {initial}
        </div>
      </div>

      {/* Content */}
      <div className="flex-grow-1 p-2 px-3" style={{ backgroundColor: '#fff' }}>
        <div className="d-flex justify-content-between align-items-start mb-1">
          <div>
            <div className="fw-semibold small lh-sm">{patientName}</div>
            <div className="text-muted small" style={{ fontSize: '0.75rem' }}>
              <CIcon icon={cilUser} size="sm" className="me-1 opacity-50" />
              {doctorName}
            </div>
          </div>
          <div className="text-end d-flex flex-column align-items-end gap-1">
            <span className="fw-bold small" style={{ color: status.color, whiteSpace: 'nowrap' }}>
              {formatTime(apt.scheduled_at)}
            </span>
            {apt.duration_minutes && (
              <span className="text-muted small" style={{ fontSize: '0.65rem', lineHeight: 1 }}>
                {apt.duration_minutes} min
              </span>
            )}
          </div>
        </div>

        {/* Badge row */}
        <div className="d-flex align-items-center gap-1 mt-1">
          <span
            className="badge rounded-pill small d-inline-flex align-items-center gap-1"
            style={{
              backgroundColor: status.bg,
              color: status.color,
              fontSize: '0.65rem',
              fontWeight: 500,
              padding: '2px 8px',
              border: `1px solid ${status.color}33`,
            }}
          >
            {status.label}
          </span>

          {apt.has_triage && (
            <span
              className="badge rounded-pill small d-inline-flex align-items-center gap-1"
              style={{
                backgroundColor: '#e8f5e9',
                color: '#198754',
                fontSize: '0.65rem',
                fontWeight: 500,
                padding: '2px 8px',
              }}
            >
              <CIcon icon={cilCheckAlt} size="sm" /> Triage
            </span>
          )}

          {salaNombre && (
            <span
              className="badge rounded-pill small d-inline-flex align-items-center gap-1"
              style={{
                backgroundColor: '#eef2ff',
                color: '#3f51b5',
                fontSize: '0.65rem',
                fontWeight: 500,
                padding: '2px 8px',
              }}
            >
              <CIcon icon={cilRoom} size="sm" /> {salaNombre}
            </span>
          )}

        </div>
      </div>
    </div>
  )
}

export const AppointmentListCard: React.FC<AppointmentListCardProps> = ({
  title,
  appointments,
  onAppointmentClick,
}) => {
  const isToday = title === 'Hoy'
  const todayStr = isToday
    ? formatearEnConsultorio(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  return (
    <CCard className="h-100 glass-card border-0 shadow-sm">
      <CCardHeader className="bg-transparent border-bottom d-flex justify-content-between align-items-center py-3">
        <div>
          <h6 className="mb-0 fw-bold">{title}</h6>
          {todayStr && <small className="text-muted" style={{ fontSize: '0.7rem' }}>{todayStr}</small>}
        </div>
        <CBadge
          color={appointments.length > 0 ? 'primary' : 'secondary'}
          shape="rounded-pill"
          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
        >
          {appointments.length} cita{appointments.length !== 1 ? 's' : ''}
        </CBadge>
      </CCardHeader>
      <CCardBody className="p-3" style={{ maxHeight: '480px', overflowY: 'auto' }}>
        {appointments.length === 0 ? (
          <div className="text-center py-5">
            <CIcon icon={cilCalendar} size="xxl" className="text-muted opacity-25 mb-2" />
            <p className="text-muted small mb-0">No hay citas programadas</p>
          </div>
        ) : (
          [...appointments]
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
            .map((apt) => (
              <AppointmentCard
                key={apt.id}
                appointment={apt}
                onClick={() => onAppointmentClick(apt)}
              />
            ))
        )}
      </CCardBody>
    </CCard>
  )
}
