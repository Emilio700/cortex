/**
 * La fecha de la próxima revisión prenatal, editable y guardada de verdad.
 *
 * Hasta ahora la sugerencia se calculaba en el navegador y ahí se quedaba: si
 * la doctora quería adelantarla o retrasarla no tenía dónde anotarlo, y al
 * recargar la pantalla la corrección desaparecía. Peor: ningún proceso del
 * servidor podía saber que esa paciente tenía revisión próxima, así que el
 * recordatorio no podía existir.
 *
 * Guardar la fecha NO agenda nada. Mientras no exista el paso de elegir hora,
 * este componente lo dice tal cual, porque un mensaje que da por hecho algo
 * que el sistema no hizo es exactamente el error que duplicó una receta.
 */
import { useEffect, useState } from 'react'
import { CAlert, CButton, CFormInput, CFormLabel, CSpinner } from '@coreui/react-pro'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import type { Pregnancy } from '../types/prenatal'
import type { ResumenEmbarazo } from '../utils/embarazo'
import { SugerenciaProximaRevision, formatearFechaLarga } from './EmbarazoResumen'

interface Props {
  pregnancy: Pregnancy
  resumen: ResumenEmbarazo | null
  /** El embarazo ya actualizado, para que el expediente no quede desfasado. */
  onGuardada?: (pregnancy: Pregnancy) => void
}

const ProximaRevisionEditable = ({ pregnancy, resumen, onGuardada }: Props) => {
  const sugerida = resumen?.proxima?.fecha ?? null
  // La guardada manda sobre la sugerida: si la doctora ya decidió, lo que se
  // muestra es su decisión, no la propuesta de la regla.
  const guardada = pregnancy.next_review_on ?? null
  const [fecha, setFecha] = useState(guardada ?? sugerida ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al cambiar de embarazo o tras guardar, el campo vuelve a reflejar lo que
  // hay en el servidor. Sin esto seguiría mostrando la edición de otra ficha.
  useEffect(() => {
    setFecha(pregnancy.next_review_on ?? resumen?.proxima?.fecha ?? '')
    setError(null)
  }, [pregnancy.id, pregnancy.next_review_on, resumen?.proxima?.fecha])

  if (!resumen) return null

  const ajustada = !!guardada && !!sugerida && guardada !== sugerida
  const sinGuardar = fecha !== (guardada ?? '')

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const respuesta = await apiClient.patch<Pregnancy>(
        `/prenatal/pregnancies/${pregnancy.id}`,
        {
          next_review_on: fecha || null,
          // Se manda también la sugerida para que el servidor pueda saber
          // después si la doctora aceptó la regla o la corrigió.
          next_review_suggested_on: sugerida,
        },
      )
      onGuardada?.(respuesta.data)
    } catch (err) {
      setError(mensajeDeError(err, 'No fue posible guardar la fecha de la próxima revisión.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="d-flex flex-column gap-2">
      <SugerenciaProximaRevision resumen={resumen} />
      <div className="d-flex align-items-end gap-2 flex-wrap">
        <div>
          <CFormLabel htmlFor={`proxima-revision-${pregnancy.id}`} className="small mb-1">
            Próxima revisión
          </CFormLabel>
          <CFormInput
            id={`proxima-revision-${pregnancy.id}`}
            type="date"
            size="sm"
            value={fecha}
            disabled={guardando}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <CButton
          type="button"
          size="sm"
          color="primary"
          variant="outline"
          disabled={guardando || !sinGuardar}
          onClick={() => void guardar()}
        >
          {guardando ? <CSpinner size="sm" /> : 'Guardar fecha'}
        </CButton>
        {sugerida && fecha !== sugerida && (
          <CButton
            type="button"
            size="sm"
            color="link"
            className="p-0 text-decoration-none"
            disabled={guardando}
            onClick={() => setFecha(sugerida)}
          >
            Volver a la sugerida ({formatearFechaLarga(sugerida)})
          </CButton>
        )}
      </div>
      {error && (
        <CAlert color="danger" className="small mb-0" dismissible onClose={() => setError(null)}>
          {error}
        </CAlert>
      )}
      <div className="small text-body-secondary">
        {sinGuardar
          ? 'Todavía sin guardar: la fecha del campo no está registrada.'
          : guardada
            ? ajustada
              ? `Guardada: ${formatearFechaLarga(guardada)}, ajustada respecto a la sugerida.`
              : `Guardada: ${formatearFechaLarga(guardada)}.`
            : 'Sin fecha registrada. Guárdala para que quede en el expediente.'}{' '}
        Guardar la fecha no agenda la cita ni avisa a la paciente.
      </div>
    </div>
  )
}

export default ProximaRevisionEditable
