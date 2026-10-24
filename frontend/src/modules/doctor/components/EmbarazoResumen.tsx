/**
 * Piezas visuales del embarazo activo: la insignia con las semanas y la
 * sugerencia de próxima revisión.
 *
 * Todo lo que se muestra aquí es orientativo. Nada se agenda solo: la fecha
 * sugerida es una ayuda para el médico y la asistente, no una cita.
 */
import { CAlert, CBadge } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBaby, cilCalendar } from '@coreui/icons'

import type { ResumenEmbarazo } from '../utils/embarazo'
import { formatearFechaISO } from '../../../shared/utils/date'

/** Fecha ISO en formato legible (7 de abril de 2026). */
export const formatearFechaLarga = (valor?: string | null) => {
  if (!valor) return 'Sin fecha'
  return formatearFechaISO(valor, 'Sin fecha', 'long')
}

interface InsigniaEmbarazoProps {
  resumen: ResumenEmbarazo | null
  /** Texto adicional al frente; por omisión "Embarazo". */
  etiqueta?: string
}

/** Insignia compacta: "Embarazo · 24.3 sem". */
export const InsigniaEmbarazo = ({ resumen, etiqueta = 'Embarazo' }: InsigniaEmbarazoProps) => {
  if (!resumen) return null
  return (
    <CBadge
      color={resumen.edad.fueraDeRango ? 'warning' : 'info'}
      textColor={resumen.edad.fueraDeRango ? 'dark' : undefined}
      shape="rounded-pill"
      className="d-inline-flex align-items-center gap-1"
      title={`Edad gestacional por FUR: ${resumen.edad.etiqueta}`}
    >
      <CIcon icon={cilBaby} size="sm" />
      {etiqueta} · {resumen.edad.etiquetaCorta}
    </CBadge>
  )
}

interface SugerenciaProximaRevisionProps {
  resumen: ResumenEmbarazo | null
  /** Aviso corto para el modal de cierre de consulta. */
  compacta?: boolean
}

/** Sugerencia orientativa de la siguiente revisión prenatal. */
export const SugerenciaProximaRevision = ({
  resumen,
  compacta = false,
}: SugerenciaProximaRevisionProps) => {
  if (!resumen) return null
  if (resumen.edad.fueraDeRango) {
    return (
      <CAlert color="warning" className="small mb-0">
        La datación registrada ({resumen.edad.etiqueta}) ya no corresponde a un embarazo en curso.
        Revisa la FUR o cierra el embarazo con su desenlace.
      </CAlert>
    )
  }
  if (!resumen.proxima) return null
  return (
    <CAlert color={compacta ? 'info' : 'light'} className="small mb-0">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <CIcon icon={cilCalendar} className="text-primary" />
        <strong>Próxima revisión sugerida: {formatearFechaLarga(resumen.proxima.fecha)}</strong>
        <CBadge color="light" textColor="dark" shape="rounded-pill">
          en {resumen.proxima.dias} días
        </CBadge>
      </div>
      <div className="text-body-secondary mt-1">
        {resumen.proxima.motivo}
        {resumen.proxima.recortada && ' (ajustada para no saltarse el cambio de frecuencia)'}. Es
        solo una sugerencia orientativa: no se agenda ninguna cita automáticamente.
      </div>
    </CAlert>
  )
}
