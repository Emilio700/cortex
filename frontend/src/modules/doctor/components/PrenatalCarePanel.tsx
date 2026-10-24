import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CForm,
  CFormInput,
  CFormLabel,
  CFormTextarea,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBaby, cilPlus } from '@coreui/icons'

import { useAuth } from '../../../shared/context/AuthContext'
import { apiClient } from '../../../shared/services/api'
import { calcularFpp } from '../../../shared/utils/patientForm'
import type { Pregnancy, PregnancyCollection, PregnancyCreate } from '../types/prenatal'
import { resumirEmbarazo } from '../utils/embarazo'
import { InsigniaEmbarazo } from './EmbarazoResumen'
import PregnancyOverview from './PregnancyOverview'
import PrenatalVisitForm from './PrenatalVisitForm'
import ObstetricTrackingPanel from './ObstetricTrackingPanel'

interface PrenatalCarePanelProps {
  patientId: number
  appointmentId?: number
  /** Avisa al expediente del embarazo activo para mostrarlo en su cabecera. */
  onPregnancyLoaded?: (pregnancy: Pregnancy | null) => void
}

/** Origen que queda anotado cuando el medico sobrescribe la FPP calculada. */
const FPP_AJUSTADA = 'Fecha ajustada por el médico'

const initialPregnancy = () => ({
  last_menstrual_period: '',
  estimated_delivery_date: '',
  notes: '',
})

const PrenatalCarePanel = ({
  patientId,
  appointmentId,
  onPregnancyLoaded,
}: PrenatalCarePanelProps) => {
  const { user } = useAuth()
  const [pregnancy, setPregnancy] = useState<Pregnancy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // El fallo al LEER el embarazo va aparte del de guardar: con él no se sabe si
  // hay embarazo activo, así que no se dice «no hay» ni se ofrece registrar
  // uno encima del que quizá existe (plan 29, C-2).
  // `null`: se leyó bien. Texto (puede ser vacío): no se pudo leer, con el motivo del servidor si lo dio.
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newPregnancy, setNewPregnancy] = useState(initialPregnancy)
  // Mientras el médico no toque la FPP, la mantenemos calculada desde la FUR.
  const [fppManual, setFppManual] = useState(false)
  const canCreate = user?.role === 'doctor' || user?.role === 'master'

  const fppCalculada = calcularFpp(newPregnancy.last_menstrual_period)
  const resumenNuevo = resumirEmbarazo({
    last_menstrual_period: newPregnancy.last_menstrual_period,
    estimated_delivery_date: newPregnancy.estimated_delivery_date,
  })

  /** La FUR manda: al capturarla se recalcula la FPP salvo que ya se ajustara. */
  const capturarFur = (fur: string) => {
    setNewPregnancy((current) => ({
      ...current,
      last_menstrual_period: fur,
      estimated_delivery_date: fppManual ? current.estimated_delivery_date : calcularFpp(fur) || '',
    }))
  }

  const capturarFpp = (fpp: string) => {
    setFppManual(true)
    setNewPregnancy((current) => ({ ...current, estimated_delivery_date: fpp }))
  }

  /** Vuelve a la FPP de Naegele y descarta el ajuste manual. */
  const recalcularFpp = () => {
    setFppManual(false)
    setNewPregnancy((current) => ({
      ...current,
      estimated_delivery_date: calcularFpp(current.last_menstrual_period) || '',
    }))
  }

  // El embarazo recien guardado se propaga tambien a la cabecera del
  // expediente: mostrar dos versiones distintas del mismo dato clinico en la
  // misma pantalla es peor que no mostrarlo.
  const actualizarEmbarazo = useCallback(
    (actualizado: Pregnancy) => {
      setPregnancy(actualizado)
      onPregnancyLoaded?.(actualizado)
    },
    [onPregnancyLoaded],
  )

  const loadPregnancy = useCallback(async () => {
    setLoading(true)
    setError(null)
    setErrorLectura(null)
    try {
      const response = await apiClient.get<PregnancyCollection>(
        `/prenatal/patient/${patientId}/pregnancies?status=active`,
      )
      if (!Array.isArray(response.data?.items)) throw new Error('Respuesta sin la lista de embarazos.')
      const activa = response.data.items[0] ?? null
      setPregnancy(activa)
      onPregnancyLoaded?.(activa)
    } catch (requestError: any) {
      // Se guarda el motivo del servidor si lo dio; la frase del aviso ya dice
      // lo que no se sabe.
      const detalle = requestError.response?.data?.detail
      setErrorLectura(typeof detalle === 'string' && detalle.trim() ? detalle : '')
      setPregnancy(null)
      onPregnancyLoaded?.(null)
    } finally {
      setLoading(false)
    }
  }, [patientId, onPregnancyLoaded])
  useEffect(() => {
    void loadPregnancy()
  }, [loadPregnancy])

  const createPregnancy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    // Si la FPP es exactamente la de Naegele no se manda: el backend la calcula
    // y deja anotado el origen. Solo viaja cuando el médico la ajusta.
    const fppEsCalculada =
      !!newPregnancy.last_menstrual_period &&
      newPregnancy.estimated_delivery_date === calcularFpp(newPregnancy.last_menstrual_period)
    const payload: PregnancyCreate = {
      patient_id: patientId,
      ...(newPregnancy.last_menstrual_period
        ? { last_menstrual_period: newPregnancy.last_menstrual_period }
        : {}),
      ...(newPregnancy.estimated_delivery_date && !fppEsCalculada
        ? {
            estimated_delivery_date: newPregnancy.estimated_delivery_date,
            estimated_delivery_date_source: FPP_AJUSTADA,
          }
        : {}),
      ...(newPregnancy.notes.trim() ? { notes: newPregnancy.notes.trim() } : {}),
    }
    try {
      await apiClient.post('/prenatal/pregnancies', payload)
      setNewPregnancy(initialPregnancy())
      setFppManual(false)
      setCreating(false)
      await loadPregnancy()
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible registrar el embarazo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <CCard className="border-0 shadow-sm">
      <CCardBody>
        <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
          <div className="d-flex align-items-center gap-2">
            <CIcon icon={cilBaby} className="text-primary" />
            <div>
              <h5 className="mb-0 d-flex align-items-center gap-2">
                Control prenatal
                {pregnancy && <InsigniaEmbarazo resumen={resumirEmbarazo(pregnancy)} />}
              </h5>
              <small className="texto-de-apoyo text-body-secondary">
                Datos estructurados que acompañan la nota clínica.
              </small>
            </div>
          </div>
          {!pregnancy && errorLectura === null && canCreate && !creating && (
            <CButton size="sm" color="primary" variant="outline" onClick={() => setCreating(true)}>
              <CIcon icon={cilPlus} className="me-1" />
              Registrar embarazo
            </CButton>
          )}
        </div>
        {loading && (
          <div className="text-center py-3">
            <CSpinner color="primary" />
            <div className="small mt-2">Cargando embarazo activo...</div>
          </div>
        )}
        {!loading && error && (
          <CAlert color="danger" dismissible onClose={() => setError(null)}>
            {error}
          </CAlert>
        )}
        {!loading && errorLectura !== null && (
          <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2 mb-0" role="alert">
            {/* Una sola frase: antes decía lo mismo dos veces (plan 29, lote 5). */}
            <span className="flex-grow-1">
              No se pudo saber si tiene un embarazo activo, así que no se muestran semanas ni se ofrece registrar
              uno.
              {errorLectura && <span className="d-block small">{errorLectura}</span>}
            </span>
            <CButton color="danger" variant="outline" size="sm" onClick={() => void loadPregnancy()}>
              Reintentar
            </CButton>
          </CAlert>
        )}
        {!loading && errorLectura === null && !pregnancy && !creating && (
          <CAlert color="light" className="mb-0">
            No hay un embarazo activo registrado para este paciente.
          </CAlert>
        )}
        {!loading && creating && (
          <CForm onSubmit={createPregnancy}>
            <CRow className="g-3">
              <CCol md={4}>
                <CFormLabel htmlFor="embarazo-fur">FUR (última menstruación)</CFormLabel>
                <CFormInput
                  id="embarazo-fur"
                  type="date"
                  value={newPregnancy.last_menstrual_period}
                  onChange={(e) => capturarFur(e.target.value)}
                />
                <small className="text-body-secondary">
                  {resumenNuevo
                    ? `Edad gestacional hoy: ${resumenNuevo.edad.etiqueta}`
                    : 'Con la FUR se calculan la FPP y las semanas de gestación.'}
                </small>
              </CCol>
              <CCol md={4}>
                <CFormLabel htmlFor="embarazo-fpp">FPP (fecha probable de parto)</CFormLabel>
                <CFormInput
                  id="embarazo-fpp"
                  type="date"
                  value={newPregnancy.estimated_delivery_date}
                  onChange={(e) => capturarFpp(e.target.value)}
                />
                <small className="text-body-secondary d-block">
                  {fppManual && fppCalculada
                    ? 'Fecha ajustada por ti; manda sobre el cálculo.'
                    : fppCalculada
                      ? 'Calculada por regla de Naegele (FUR + 280 días). Puedes sobrescribirla.'
                      : 'Captura la FUR para calcularla, o escríbela directamente.'}
                </small>
                {fppManual &&
                  fppCalculada &&
                  fppCalculada !== newPregnancy.estimated_delivery_date && (
                    <CButton
                      color="link"
                      size="sm"
                      className="p-0 text-decoration-none"
                      type="button"
                      onClick={recalcularFpp}
                    >
                      Volver a la calculada ({fppCalculada})
                    </CButton>
                  )}
              </CCol>
              <CCol md={12}>
                <CFormLabel>Notas iniciales</CFormLabel>
                <CFormTextarea
                  rows={2}
                  value={newPregnancy.notes}
                  onChange={(e) =>
                    setNewPregnancy((current) => ({ ...current, notes: e.target.value }))
                  }
                />
              </CCol>
            </CRow>
            <div className="d-flex gap-2 justify-content-end mt-3">
              <CButton
                color="secondary"
                variant="ghost"
                type="button"
                onClick={() => {
                  setCreating(false)
                  setFppManual(false)
                  setNewPregnancy(initialPregnancy())
                }}
              >
                Cancelar
              </CButton>
              <CButton color="primary" type="submit" disabled={saving}>
                {saving ? <CSpinner size="sm" /> : 'Guardar embarazo'}
              </CButton>
            </div>
          </CForm>
        )}
        {!loading && pregnancy && (
          <div className="d-flex flex-column gap-3">
            <PregnancyOverview pregnancy={pregnancy} onPregnancyUpdated={actualizarEmbarazo} />
            <ObstetricTrackingPanel pregnancy={pregnancy} onChanged={loadPregnancy} />
            <div>
              <h6 className="mb-3">Registrar visita prenatal</h6>
              <PrenatalVisitForm
                pregnancy={pregnancy}
                appointmentId={appointmentId}
                onSaved={loadPregnancy}
              />
            </div>
          </div>
        )}
      </CCardBody>
    </CCard>
  )
}

export default PrenatalCarePanel
