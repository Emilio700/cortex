import { CBadge, CCard, CCardBody, CCol, CRow } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBaby, cilCalendar, cilWarning } from '@coreui/icons'

import type { Pregnancy } from '../types/prenatal'
import { resumirEmbarazo } from '../utils/embarazo'
import ProximaRevisionEditable from './ProximaRevisionEditable'
import { formatearFechaISO } from '../../../shared/utils/date'

interface PregnancyOverviewProps {
  pregnancy: Pregnancy
  /** Avisa de la próxima revisión recién guardada, para no quedar desfasado. */
  onPregnancyUpdated?: (pregnancy: Pregnancy) => void
}

const formatDate = (value?: string | null) => {
  if (!value) return 'Sin registro'
  return formatearFechaISO(value, 'Sin registro')
}

const datingLabel: Record<string, string> = {
  pending: 'Pendiente de confirmar',
  preliminary: 'Preliminar',
  confirmed: 'Confirmada',
  suboptimally_dated: 'Datación por confirmar',
}

const PregnancyOverview = ({ pregnancy, onPregnancyUpdated }: PregnancyOverviewProps) => {
  const resumen = resumirEmbarazo(pregnancy)
  return (
  <CCard className="border-0 bg-primary bg-opacity-10">
    <CCardBody>
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
        <div className="d-flex align-items-center gap-2">
          <CIcon icon={cilBaby} className="text-primary" size="lg" />
          <div>
            <h6 className="mb-0">Embarazo activo</h6>
            <small className="text-body-secondary">Resumen registrado en el expediente</small>
          </div>
        </div>
        <div className="d-flex gap-1 flex-wrap">
          <CBadge color="primary">Activo</CBadge>
          <CBadge color={pregnancy.dating_status === 'confirmed' ? 'success' : 'warning'}>
            {datingLabel[pregnancy.dating_status] || pregnancy.dating_status}
          </CBadge>
        </div>
      </div>
      <CRow className="g-2 small">
        <CCol sm={6}>
          <div className="text-body-secondary">FUR</div>
          <div className="fw-semibold">{formatDate(pregnancy.last_menstrual_period)}</div>
        </CCol>
        <CCol sm={6}>
          <div className="text-body-secondary">
            <CIcon icon={cilCalendar} className="me-1" />
            FPP
          </div>
          <div className="fw-semibold">{formatDate(pregnancy.estimated_delivery_date)}</div>
        </CCol>
        <CCol sm={6}>
          <div className="text-body-secondary">Edad gestacional</div>
          <div className="fw-semibold">
            {resumen ? `${resumen.edad.etiqueta} (${resumen.edad.etiquetaCorta})` : 'Sin datación registrada'}
          </div>
          {resumen?.furDerivada && (
            <div className="text-body-secondary" style={{ fontSize: '0.75rem' }}>
              Calculada desde la FPP: no hay FUR registrada.
            </div>
          )}
        </CCol>
        <CCol sm={6}>
          <div className="text-body-secondary">Origen de FPP</div>
          <div className="fw-semibold">
            {pregnancy.estimated_delivery_date_source || pregnancy.dating_method || 'Sin registro'}
          </div>
        </CCol>
      </CRow>
      <div className="mt-3">
        <ProximaRevisionEditable
          pregnancy={pregnancy}
          resumen={resumen}
          onGuardada={onPregnancyUpdated}
        />
      </div>
      {pregnancy.dating_status !== 'confirmed' && (
        <div className="small text-warning mt-3">
          <CIcon icon={cilWarning} className="me-1" />
          Confirma la FPP con el criterio clínico y la evidencia correspondiente.
        </div>
      )}
      {pregnancy.notes && <div className="small mt-3 pt-2 border-top">{pregnancy.notes}</div>}
    </CCardBody>
  </CCard>
  )
}

export default PregnancyOverview
