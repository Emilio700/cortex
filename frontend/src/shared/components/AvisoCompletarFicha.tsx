/**
 * La línea gris de la consulta: «Completa sus datos» (plan 32, punto 5).
 *
 * Una sola línea, descartable, que no es modal ni aviso de color: la doctora
 * está atendiendo y esto puede esperar. Se descarta por paciente y por sesión
 * del navegador; si mañana la ficha sigue incompleta, vuelve a decirlo.
 */
import React, { useState } from 'react'
import CIcon from '@coreui/icons-react'
import { cilX } from '@coreui/icons'
import { faltantesDeFicha, type DatosDeFicha } from '../utils/fichaIncompleta'

const CLAVE = 'gems_ficha_descartada'

const leerDescartadas = (): number[] => {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE) || '[]') as number[]
  } catch {
    return []
  }
}

interface Props {
  paciente: (DatosDeFicha & { id: number }) | null | undefined
  /** Si se pasa, «Completa sus datos» es un botón que abre el formulario. */
  onCompletar?: () => void
  /** Dónde se completa, si no hay botón: «con el lápiz junto a su edad». */
  pista?: string
  className?: string
}

export const AvisoCompletarFicha: React.FC<Props> = ({ paciente, onCompletar, pista, className }) => {
  const [descartada, setDescartada] = useState(() =>
    paciente ? leerDescartadas().includes(paciente.id) : false,
  )
  const faltan = faltantesDeFicha(paciente)
  if (!paciente || faltan.length === 0 || descartada) return null

  const descartar = () => {
    setDescartada(true)
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify([...leerDescartadas(), paciente.id]))
    } catch {
      /* sin almacenamiento basta con ocultarla ahora */
    }
  }

  return (
    <div className={`aviso-completar-ficha${className ? ` ${className}` : ''}`}>
      <span>
        {onCompletar ? (
          <button type="button" className="aviso-completar-ficha__accion" onClick={onCompletar}>
            Completa sus datos
          </button>
        ) : (
          'Completa sus datos'
        )}
        : falta {faltan.join(' y ')}{pista ? `; ${pista}` : ''}.
      </span>
      <button
        type="button"
        className="aviso-completar-ficha__cerrar"
        aria-label="Ocultar el aviso de datos incompletos"
        onClick={descartar}
      >
        <CIcon icon={cilX} size="sm" aria-hidden="true" />
      </button>
    </div>
  )
}

export default AvisoCompletarFicha
