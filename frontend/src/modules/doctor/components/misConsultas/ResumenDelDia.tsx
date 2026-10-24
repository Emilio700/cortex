/**
 * El resumen del día en el encabezado de Mis Consultas (plan 32, punto 4).
 *
 * No son tres tarjetas sueltas (decisión del punto 3): una sola pieza de
 * segmentos conectados, con una barra que dice cuánto del día ya se atendió.
 * Los números son del servidor; si no llegan, se dice, sin ceros falsos.
 */
import type { ResumenDelDia as Resumen } from '../../utils/resumenDelDia'

interface Props {
  resumen: Resumen | null
  error: boolean
  onReintentar: () => void
}

export default function ResumenDelDia({ resumen, error, onReintentar }: Props) {
  if (error) {
    return (
      <div className="resumen-dia resumen-dia--error" role="status" data-tour="consultas-resumen">
        No se pudo contar el día.{' '}
        <button type="button" className="resumen-dia__reintentar" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    )
  }
  const avance = resumen && resumen.total > 0 ? Math.round((resumen.atendidas / resumen.total) * 100) : 0
  const n = (v?: number) => (resumen ? v : '—')
  return (
    <div className="resumen-dia" data-tour="consultas-resumen" aria-busy={!resumen}>
      <dl className="resumen-dia__segmentos">
        <div className="resumen-dia__segmento">
          <dt>Hoy</dt>
          <dd>{n(resumen?.total)}</dd>
        </div>
        <div className="resumen-dia__segmento">
          <dt>Pendientes</dt>
          <dd>{n(resumen?.pendientes)}</dd>
        </div>
        <div className="resumen-dia__segmento">
          <dt>Atendidas</dt>
          <dd>{n(resumen?.atendidas)}</dd>
        </div>
      </dl>
      <div
        className="resumen-dia__barra"
        role="img"
        aria-label={resumen ? `${avance} % del día atendido` : 'Contando el día'}
      >
        <span style={{ width: `${avance}%` }} />
      </div>
    </div>
  )
}
