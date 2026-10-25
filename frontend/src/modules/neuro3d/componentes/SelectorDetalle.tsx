/**
 * «Modelo: Simplificado | Atlas detallado»: qué tan fino se dibuja el modelo
 * esquemático.
 *
 * El simplificado lo dibuja Cortex en código; el atlas detallado son mallas
 * reales de BodyParts3D (una persona de referencia). Se ve con y sin paciente,
 * pero el atlas sólo se puede elegir con el origen «Esquemático»: la TC y la
 * radiografía hablan del paciente y no se mezclan con otra persona.
 *
 * Mismo patrón que `SelectorOrigen` (grupo de radio, flechas, motivo visible
 * de lo deshabilitado). La opción marcada es la que la escena **ya muestra**:
 * mientras el atlas se descarga, la barra de avance lo dice.
 */
import { useRef, type KeyboardEvent } from 'react'
import { CProgress } from '@coreui/react-pro'
import { COMO_INSTALAR_ATLAS, MOTIVO_SIN_ATLAS, NOMBRE_DE_DETALLE, type DetalleDelModelo } from '../dominio/atlasDetallado'

export interface OpcionDeDetalle {
  disponible: boolean
  motivo?: string
}

const ORDEN: DetalleDelModelo[] = ['simplificado', 'atlas']

interface Props {
  valor: DetalleDelModelo
  opciones: Record<DetalleDelModelo, OpcionDeDetalle>
  alCambiar: (d: DetalleDelModelo) => void
  /** 0–1 mientras se descarga el atlas; `null` sin descarga en curso. */
  progreso: number | null
  ocupado?: boolean
}

export default function SelectorDetalle({ valor, opciones, alCambiar, progreso, ocupado = false }: Props) {
  const botones = useRef<Partial<Record<DetalleDelModelo, HTMLButtonElement | null>>>({})
  const elegibles = ORDEN.filter((d) => opciones[d].disponible)
  const bloqueado = ocupado || progreso !== null

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!paso || bloqueado || elegibles.length === 0) return
    e.preventDefault()
    const actual = Math.max(0, elegibles.indexOf(valor))
    const siguiente = elegibles[(actual + paso + elegibles.length) % elegibles.length]
    botones.current[siguiente]?.focus()
    if (siguiente !== valor) alCambiar(siguiente)
  }

  const atlas = opciones.atlas
  const sinInstalar = !atlas.disponible && atlas.motivo === MOTIVO_SIN_ATLAS

  return (
    <div className="atlas-origen atlas-detalle" data-tour="atlas-detalle">
      <span className="atlas-origen__titulo" id="atlas-detalle-titulo">
        Modelo
      </span>
      <div className="atlas-origen__opciones" role="radiogroup" aria-labelledby="atlas-detalle-titulo" onKeyDown={alTeclear}>
        {ORDEN.map((d) => {
          const opcion = opciones[d]
          const elegida = d === valor
          return (
            <button
              key={d}
              ref={(el) => {
                botones.current[d] = el
              }}
              type="button"
              role="radio"
              aria-checked={elegida}
              tabIndex={elegida ? 0 : -1}
              disabled={!opcion.disponible || bloqueado}
              title={!opcion.disponible ? opcion.motivo : undefined}
              className={`atlas-origen__opcion${elegida ? ' atlas-origen__opcion--elegida' : ''}`}
              onClick={() => !elegida && alCambiar(d)}
            >
              {NOMBRE_DE_DETALLE[d]}
            </button>
          )
        })}
      </div>
      {progreso !== null && (
        <div className="atlas-detalle__progreso" role="status">
          <span>Descargando el atlas detallado… {Math.round(progreso * 100)} %</span>
          <CProgress
            className="atlas-detalle__barra"
            value={Math.round(progreso * 100)}
            aria-label="Avance de la descarga del atlas detallado"
            height={6}
          />
        </div>
      )}
      {!atlas.disponible && atlas.motivo && (
        <ul className="atlas-origen__motivos">
          <li>
            <b>{NOMBRE_DE_DETALLE.atlas}:</b> {atlas.motivo}
            {sinInstalar && <span className="atlas-detalle__instalar"> {COMO_INSTALAR_ATLAS}</span>}
          </li>
        </ul>
      )}
    </div>
  )
}
