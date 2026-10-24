/**
 * Un punto discreto junto al nombre de una paciente con la ficha incompleta
 * (plan 32, punto 5; decisión de Emilio: «aprobada, pero sutil»).
 *
 * Nada de insignia llamativa: el detalle va en el `title` al pasar el cursor y
 * en texto oculto para el lector de pantalla, porque un punto de color no le
 * dice nada a quien no lo ve.
 */
import React from 'react'
import { avisoDeFicha, type DatosDeFicha } from '../utils/fichaIncompleta'

export const PuntoFichaIncompleta: React.FC<{ paciente: DatosDeFicha | null | undefined }> = ({ paciente }) => {
  const aviso = avisoDeFicha(paciente)
  if (!aviso) return null
  return (
    <span className="punto-ficha-incompleta" title={aviso}>
      <span aria-hidden="true" className="punto-ficha-incompleta__punto" />
      <span className="visually-hidden">{aviso}</span>
    </span>
  )
}

export default PuntoFichaIncompleta
