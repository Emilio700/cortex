/**
 * Lo que la fila de un estudio dice de su atraso y su seguimiento (plan 32, punto 3).
 *
 * «Atrasado · 35 días sin resultado» con su propio tratamiento (ícono de reloj
 * y texto, no solo un color), y debajo, si lo hay, el último seguimiento:
 * motivo, hasta cuándo y quién lo escribió. Se comparte entre la bandeja de la
 * doctora y la lista de recepción.
 */
import CIcon from '@coreui/icons-react'
import { cilClock } from '@coreui/icons'

import { formatearFechaISO } from '../../../shared/utils/date'
import type { SeguimientoDeOrden } from '../types/clinicalTracking'

interface Props {
  orden: {
    atrasada?: boolean
    dias_sin_resultado?: number | null
    ultimo_seguimiento?: SeguimientoDeOrden | null
  }
}

export default function SeguimientoDeLaFila({ orden }: Props) {
  const seg = orden.ultimo_seguimiento
  if (!orden.atrasada && !seg) return null
  const dias = orden.dias_sin_resultado
  return (
    <div className="small mt-1 d-flex flex-wrap align-items-center gap-2">
      {orden.atrasada && (
        <span className="insignia-atrasado" data-tour="bandeja-atrasado">
          <CIcon icon={cilClock} size="sm" aria-hidden="true" />
          Atrasado{dias != null ? ` · ${dias} ${dias === 1 ? 'día' : 'días'} sin resultado` : ''}
        </span>
      )}
      {seg && (
        <span className="text-body-secondary">
          {seg.motivo_texto}
          {seg.nota ? ` («${seg.nota}»)` : ''} · revisar el {formatearFechaISO(seg.revisar_el, 'sin fecha', 'short')}
          {seg.registrado_por_nombre ? ` · ${seg.registrado_por_nombre}` : ''}
        </span>
      )}
    </div>
  )
}
