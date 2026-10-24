/**
 * Lo que se sabe de las alergias del paciente, dicho en el lugar donde se
 * receta (plan 29, C-1 y C-3).
 *
 * Tres casos, y ninguno puede verse como otro:
 *
 * - **No se pudo leer la ficha**: se dice, con «Reintentar». Antes la lectura
 *   fallida se tragaba y la pantalla se veía igual que un paciente sin
 *   alergias: el médico recetaba creyéndolo.
 * - **Hay alergias registradas**: se muestran.
 * - **No hay nada registrado**: en el encabezado no se pinta nada (un campo
 *   vacío quiere decir «no se ha preguntado», no «no tiene»). En la receta se
 *   dice exactamente eso, «sin alergias registradas», que es lo único cierto.
 */
import { useState } from 'react'
import { CAlert, CBadge, CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilWarning } from '@coreui/icons'
import type { Patient } from '../../secretaria/types'

interface Props {
  paciente: Pick<Patient, 'allergies'> | null
  /** Mensaje del fallo al leer la ficha; `null` si se leyó. */
  error: string | null
  onReintentar?: () => Promise<unknown> | void
  /** En la receta se dice también cuando no hay nada registrado. */
  decirSiNoHayRegistro?: boolean
  className?: string
}

const AvisoAlergias = ({ paciente, error, onReintentar, decirSiNoHayRegistro = false, className }: Props) => {
  const [reintentando, setReintentando] = useState(false)

  if (error) {
    return (
      <CAlert color="danger" className={`d-flex flex-wrap align-items-center gap-2 py-2 mb-0 ${className ?? ''}`} role="alert">
        <CIcon icon={cilWarning} className="flex-shrink-0" />
        <span className="flex-grow-1">
          <strong>No se pudieron leer las alergias del paciente.</strong> No des por hecho que no tiene; pregúntale
          antes de recetar.
        </span>
        {onReintentar && (
          <CButton
            color="danger"
            variant="outline"
            size="sm"
            disabled={reintentando}
            onClick={async () => {
              setReintentando(true)
              try {
                await onReintentar()
              } finally {
                setReintentando(false)
              }
            }}
          >
            {reintentando ? 'Reintentando…' : 'Reintentar'}
          </CButton>
        )}
      </CAlert>
    )
  }

  const alergias = paciente?.allergies?.trim()
  if (alergias) {
    return (
      <div className={className}>
        <CBadge color="warning" textColor="dark" className="d-inline-flex align-items-center gap-1 px-2 py-1 text-wrap text-start">
          <CIcon icon={cilWarning} className="flex-shrink-0" />
          Alergias: {alergias}
        </CBadge>
      </div>
    )
  }

  if (decirSiNoHayRegistro && paciente) {
    return <div className={`small text-body-secondary ${className ?? ''}`}>Sin alergias registradas en el expediente.</div>
  }
  return null
}

export default AvisoAlergias
