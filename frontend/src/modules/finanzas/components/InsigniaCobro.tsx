/**
 * Insignia de estado de cobro de una cita, para la agenda.
 *
 * La secretaria mira la agenda antes que el modal de pagos: si ahí ya dice
 * "Cobrada", no llega a pasar la tarjeta otra vez. Sólo se pinta cuando el
 * servidor mandó el estado: sin él no se sabe, y callar es mejor que adivinar.
 */
import React from 'react'
import type { CamposCobroDeCita } from '../types'
import { ESTADO_COBRO, describirCobro } from '../utils/cobro'

const CORTAS = { pendiente: 'Por cobrar', cobrada: 'Cobrada', sin_cargo: 'Sin cargo' } as const

interface Props {
  cita: CamposCobroDeCita
  /** En el calendario el espacio es poco: texto corto. */
  compacta?: boolean
  className?: string
}

export const InsigniaCobro: React.FC<Props> = ({ cita, compacta, className = '' }) => {
  const estado = cita.estado_cobro
  if (!estado || !ESTADO_COBRO[estado]) return null
  const cobros = cita.cobro_resumen ?? []
  const detalle =
    estado === 'cobrada' && cobros.length > 0
      ? cobros.map(describirCobro).join(' ')
      : estado === 'sin_cargo' && cita.cobro_sin_cargo_motivo
        ? `Sin cargo: ${cita.cobro_sin_cargo_motivo}`
        : ESTADO_COBRO[estado].label
  return (
    <span
      data-tour="agenda-insignia-cobro"
      className={`badge rounded-pill text-bg-${ESTADO_COBRO[estado].color} ${className}`}
      title={detalle}
      aria-label={`Cobro: ${detalle}`}
    >
      {compacta ? CORTAS[estado] : ESTADO_COBRO[estado].label}
    </span>
  )
}

export default InsigniaCobro
