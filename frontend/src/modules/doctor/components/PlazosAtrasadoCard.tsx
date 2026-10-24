/**
 * Cuántos días sin resultado para que un estudio cuente como atrasado (plan 32, punto 3).
 *
 * De fábrica 7, 15 y 30 (decisión de Emilio). Se carga y se guarda aparte del
 * papel de la orden: un error aquí no toca el membrete, y al revés. Solo dice
 * «Guardado» cuando el servidor lo confirmó.
 */
import { useEffect, useState } from 'react'
import { CAlert, CButton, CCard, CCardBody, CCol, CFormInput, CFormLabel, CRow, CSpinner } from '@coreui/react-pro'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'

type Plazos = { urgent: number; preferential: number; routine: number }
const FABRICA: Plazos = { urgent: 7, preferential: 15, routine: 30 }
const CAMPOS: ReadonlyArray<{ clave: keyof Plazos; etiqueta: string }> = [
  { clave: 'urgent', etiqueta: 'Urgente' },
  { clave: 'preferential', etiqueta: 'Preferente' },
  { clave: 'routine', etiqueta: 'Rutinaria' },
]
const RUTA = '/doctor-profile/me/plazos-atrasado'

export default function PlazosAtrasadoCard() {
  const [plazos, setPlazos] = useState<Plazos | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ color: string; texto: string } | null>(null)

  const cargar = async () => {
    setErrorCarga(null)
    try {
      setPlazos((await apiClient.get<Plazos>(RUTA)).data)
    } catch (err) {
      setErrorCarga(mensajeDeError(err, 'No se pudieron leer tus plazos.'))
    }
  }
  useEffect(() => { void cargar() }, [])

  const validos = plazos !== null && CAMPOS.every(({ clave }) => {
    const v = plazos[clave]
    return Number.isInteger(v) && v >= 1 && v <= 365
  })

  const guardar = async (datos: Plazos) => {
    setGuardando(true)
    setAviso(null)
    try {
      setPlazos((await apiClient.put<Plazos>(RUTA, datos)).data)
      setAviso({ color: 'success', texto: 'Plazos guardados.' })
    } catch (err) {
      setAviso({ color: 'danger', texto: mensajeDeError(err, 'No se guardaron tus plazos.') })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <CCard className="mb-4 glass-card" data-tour="perfil-plazos-atrasado">
      <CCardBody>
        {/* h2: el perfil no tiene otro nivel entre su h1 y esta tarjeta (axe). */}
        <h2 className="h6 mb-1">¿Cuándo está atrasado un estudio?</h2>
        <p className="small text-body-secondary mb-3">
          Días sin resultado desde que lo pediste, según su prioridad. Si el estudio tiene «realizar a más
          tardar», cuenta esa fecha.
        </p>
        {errorCarga ? (
          <CAlert color="danger" className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
            <span>{errorCarga}</span>
            <CButton color="danger" variant="outline" size="sm" onClick={() => void cargar()}>Reintentar</CButton>
          </CAlert>
        ) : plazos === null ? (
          <CSpinner size="sm" />
        ) : (
          <>
            {aviso && <CAlert color={aviso.color} role="status">{aviso.texto}</CAlert>}
            <CRow className="g-2 mb-3">
              {CAMPOS.map(({ clave, etiqueta }) => (
                <CCol xs={4} key={clave}>
                  <CFormLabel htmlFor={`plazo-${clave}`}>{etiqueta}</CFormLabel>
                  <CFormInput
                    id={`plazo-${clave}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    value={Number.isNaN(plazos[clave]) ? '' : plazos[clave]}
                    disabled={guardando}
                    aria-describedby="plazos-unidad"
                    onChange={(e) => setPlazos({ ...plazos, [clave]: parseInt(e.target.value, 10) })}
                  />
                </CCol>
              ))}
            </CRow>
            <div id="plazos-unidad" className="form-text mb-3">En días, de 1 a 365.</div>
            <div className="d-flex flex-wrap gap-2">
              <CButton color="primary" disabled={!validos || guardando} onClick={() => validos && void guardar(plazos)}>
                {guardando && <CSpinner size="sm" className="me-2" />}
                Guardar plazos
              </CButton>
              <CButton color="secondary" variant="ghost" disabled={guardando} onClick={() => void guardar(FABRICA)}>
                Volver a 7, 15 y 30
              </CButton>
            </div>
          </>
        )}
      </CCardBody>
    </CCard>
  )
}
