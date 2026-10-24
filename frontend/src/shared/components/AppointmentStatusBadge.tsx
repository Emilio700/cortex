import React from 'react'
import { CBadge } from '@coreui/react-pro'
import { APPOINTMENT_STATUS_LABELS, getAppointmentStatusColor } from '../constants/statusLabels'

interface AppointmentStatusBadgeProps {
  status: string
  className?: string
}

/**
 * Badge reutilizable para mostrar el estado de una cita con color y label.
 * Usa los valores centralizados de statusLabels.ts.
 *
 * Uso: <AppointmentStatusBadge status="en_sala" />
 * Resultado: <CBadge color="warning">En Sala</CBadge>
 */
const AppointmentStatusBadge: React.FC<AppointmentStatusBadgeProps> = ({ status, className }) => (
  <CBadge color={getAppointmentStatusColor(status)} className={className}>
    {APPOINTMENT_STATUS_LABELS[status] || status}
  </CBadge>
)

export default AppointmentStatusBadge
