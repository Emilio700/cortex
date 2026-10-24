/**
 * Labels, colores, y utilidades para estados de citas y enums del sistema.
 *
 * Centralizadas aquí para que todos los módulos (Doctor, Secretaria, Admin)
 * muestren consistencia visual y textual. NO duplicar getStatusColor()
 * en otros archivos — importar de aquí.
 */

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  en_sala: 'En Sala',
  en_consulta: 'En Consulta',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
}

export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  agendada: 'info',
  confirmada: 'primary',
  en_sala: 'warning',
  // Morado en el calendario y la leyenda; aquí el más cercano de CoreUI.
  en_consulta: 'dark',
  atendida: 'success',
  cancelada: 'danger',
}

/** Obtiene el color de CoreUI para un estado de cita. Usar en lugar de duplicar switch-case. */
export const getAppointmentStatusColor = (status: string): string =>
  APPOINTMENT_STATUS_COLORS[status] || 'secondary'

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
}
