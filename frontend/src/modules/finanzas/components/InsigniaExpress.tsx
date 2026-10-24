/**
 * Marca de la consulta express: la que no se agendó y se registró al cobrarla
 * (plan 23, ajustes del 2026-09-28).
 *
 * Sin esta marca, en la agenda y en el historial se vería igual que una
 * consulta agendada a esa hora, y alguien podría concluir que el paciente
 * tenía cita o que el médico la atendió en ese horario de principio a fin.
 */
import React from 'react'
import type { OrigenCita } from '../types'

interface Props {
  cita: { origen?: OrigenCita | string | null }
  /** En el calendario el espacio es poco: sólo "Express". */
  compacta?: boolean
  className?: string
}

export const TEXTO_EXPRESS = 'Express · registrada al cobrar'

export const InsigniaExpress: React.FC<Props> = ({ cita, compacta, className = '' }) => {
  if (cita.origen !== 'express') return null
  return (
    <span
      data-tour="agenda-insignia-express"
      className={`badge rounded-pill text-bg-dark ${className}`}
      title="Consulta sin cita: se registró en la agenda al cobrarla."
      aria-label={TEXTO_EXPRESS}
    >
      {compacta ? 'Express' : TEXTO_EXPRESS}
    </span>
  )
}

export default InsigniaExpress
