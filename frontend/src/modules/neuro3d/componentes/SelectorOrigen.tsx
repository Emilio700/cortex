/**
 * «Origen del modelo»: de dónde sale la columna que se ve en Neuro 3D.
 *
 * Tres orígenes (contrato común en `dominio/origenModelo.ts`): el esquemático
 * del atlas, el ajustado desde radiografía (tramo RX) y la reconstrucción desde
 * la TC del paciente (tramo TC). Una opción sin modelo aparece deshabilitada y
 * dice por qué; una que el consultorio no usa (módulo apagado) no se pinta.
 *
 * Es un grupo de radio: flechas para moverse dentro, Tab para salir. La opción
 * elegida es la que la escena **ya muestra**: quien la usa no cambia `valor`
 * hasta que la capa cargó, así el aviso nunca habla de un modelo que no está.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { OrigenModelo } from '../dominio/origenModelo'

export interface OpcionDeOrigen {
  disponible: boolean
  /** Por qué no está disponible (o un detalle breve si lo está). */
  motivo?: string
}

export const NOMBRE_DE_ORIGEN: Record<OrigenModelo, string> = {
  esquematico: 'Esquemático',
  radiografia: 'Radiografía',
  tc: 'Tomografía del paciente',
}

const ORDEN: OrigenModelo[] = ['esquematico', 'radiografia', 'tc']

interface Props {
  valor: OrigenModelo
  /** Las que falten no se pintan (módulo apagado o sin permiso). */
  opciones: Partial<Record<OrigenModelo, OpcionDeOrigen>>
  alCambiar: (origen: OrigenModelo) => void
  /** Mientras se carga un origen, el grupo no acepta otro cambio. */
  ocupado?: boolean
  /** Acciones junto al grupo (p. ej. el enlace de RX para marcar la radiografía). */
  children?: ReactNode
}

export default function SelectorOrigen({ valor, opciones, alCambiar, ocupado = false, children }: Props) {
  const botones = useRef<Partial<Record<OrigenModelo, HTMLButtonElement | null>>>({})
  const visibles = ORDEN.filter((o) => opciones[o])
  const elegibles = visibles.filter((o) => opciones[o]!.disponible)

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!paso || ocupado || elegibles.length === 0) return
    e.preventDefault()
    const actual = Math.max(0, elegibles.indexOf(valor))
    const siguiente = elegibles[(actual + paso + elegibles.length) % elegibles.length]
    botones.current[siguiente]?.focus()
    if (siguiente !== valor) alCambiar(siguiente)
  }

  const motivos = visibles.filter((o) => !opciones[o]!.disponible && opciones[o]!.motivo)

  return (
    <div className="atlas-origen" data-tour="atlas-origen">
      <span className="atlas-origen__titulo" id="atlas-origen-titulo">
        Origen del modelo
      </span>
      <div className="atlas-origen__opciones" role="radiogroup" aria-labelledby="atlas-origen-titulo" onKeyDown={alTeclear}>
        {visibles.map((origen) => {
          const opcion = opciones[origen]!
          const elegida = origen === valor
          return (
            <button
              key={origen}
              ref={(el) => {
                botones.current[origen] = el
              }}
              type="button"
              role="radio"
              aria-checked={elegida}
              tabIndex={elegida ? 0 : -1}
              disabled={!opcion.disponible || ocupado}
              title={!opcion.disponible ? opcion.motivo : undefined}
              className={`atlas-origen__opcion${elegida ? ' atlas-origen__opcion--elegida' : ''}`}
              onClick={() => !elegida && alCambiar(origen)}
            >
              {NOMBRE_DE_ORIGEN[origen]}
            </button>
          )
        })}
      </div>
      {children}
      {motivos.length > 0 && (
        <ul className="atlas-origen__motivos">
          {motivos.map((o) => (
            <li key={o}>
              <b>{NOMBRE_DE_ORIGEN[o]}:</b> {opciones[o]!.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
