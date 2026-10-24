/**
 * Implantes y anticoagulantes del paciente, a la vista durante la consulta.
 *
 * En neurocirugía son las dos cosas que cambian una decisión en el momento:
 * un implante (válvula, marcapasos, material metálico) decide si se puede
 * pedir una resonancia, y un anticoagulante obliga a planear su suspensión
 * antes de cualquier procedimiento. Como las alergias, sólo se pinta lo que
 * está registrado: un campo vacío no quiere decir «no tiene».
 */
import { CBadge } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBolt, cilDrop } from '@coreui/icons'

import type { Patient } from '../../secretaria/types'

interface Props {
  paciente: Pick<Patient, 'implanted_devices' | 'anticoagulants'> | null
  className?: string
}

const SenalesNeuroquirurgicas = ({ paciente, className }: Props) => {
  const implantes = paciente?.implanted_devices?.trim()
  const anticoagulantes = paciente?.anticoagulants?.trim()
  if (!implantes && !anticoagulantes) return null
  return (
    <div className={`d-flex flex-wrap gap-2 ${className ?? ''}`}>
      {implantes && (
        <CBadge
          color="info"
          textColor="white"
          className="d-inline-flex align-items-center gap-1 px-2 py-1 text-wrap text-start"
          title="Revisa la compatibilidad antes de pedir una resonancia"
        >
          <CIcon icon={cilBolt} className="flex-shrink-0" />
          Implantes: {implantes}
        </CBadge>
      )}
      {anticoagulantes && (
        <CBadge
          color="danger"
          className="d-inline-flex align-items-center gap-1 px-2 py-1 text-wrap text-start"
          title="Riesgo de sangrado: valora suspenderlo antes de un procedimiento"
        >
          <CIcon icon={cilDrop} className="flex-shrink-0" />
          Anticoagulantes: {anticoagulantes}
        </CBadge>
      )}
    </div>
  )
}

export default SenalesNeuroquirurgicas
