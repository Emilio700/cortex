/**
 * El deslizador de cortes: dónde se está, cuántos hay y cuáles están marcados.
 *
 * Las muescas sobre la pista son los cortes clave de la serie: se ve de un golpe
 * dónde estaba la lesión, sin recorrer el estudio. Los botones con estrella saltan
 * de uno a otro. Es un `<input type="range">` de verdad, así que funciona con
 * teclado y con lector de pantalla (`aria-valuetext` dice «Corte 12 de 24»).
 */
import { CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilChevronLeft, cilChevronRight } from '@coreui/icons'

import { posicionesEnDeslizador, type CorteClave } from '../dominio/cortesClave'

interface Props {
  indice: number
  total: number
  onCambiar: (indice: number) => void
  /** Cortes clave de la serie abierta; vacío si no hay o no aplica. */
  marcas?: CorteClave[]
  /** Saltar al corte clave anterior o siguiente; sin esto no se muestran los botones. */
  onSaltar?: (direccion: 1 | -1) => void
  hayAnterior?: boolean
  haySiguiente?: boolean
}

export default function SelectorDeCortes({
  indice,
  total,
  onCambiar,
  marcas = [],
  onSaltar,
  hayAnterior,
  haySiguiente,
}: Props) {
  if (total <= 0) return null
  const muescas = posicionesEnDeslizador(marcas, total)
  return (
    <div className="visor-cortes" data-tour="visor-cortes">
      <CButton
        size="sm"
        color="secondary"
        variant="ghost"
        aria-label="Corte anterior"
        title="Corte anterior (↑)"
        disabled={indice <= 0}
        onClick={() => onCambiar(indice - 1)}
      >
        <CIcon icon={cilChevronLeft} size="sm" />
      </CButton>

      <div className="visor-cortes__pista">
        <input
          type="range"
          className="visor-cortes__rango"
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={Math.min(indice, Math.max(0, total - 1))}
          disabled={total <= 1}
          aria-label="Corte"
          aria-valuetext={`Corte ${indice + 1} de ${total}`}
          onChange={(evento) => onCambiar(Number(evento.target.value))}
        />
        {muescas.map((posicion, i) => (
          <span
            key={`${posicion}-${i}`}
            className="visor-cortes__muesca"
            style={{ left: `${posicion}%` }}
            aria-hidden="true"
          />
        ))}
      </div>

      <CButton
        size="sm"
        color="secondary"
        variant="ghost"
        aria-label="Corte siguiente"
        title="Corte siguiente (↓)"
        disabled={indice >= total - 1}
        onClick={() => onCambiar(indice + 1)}
      >
        <CIcon icon={cilChevronRight} size="sm" />
      </CButton>

      <span className="visor-cortes__contador" aria-live="polite">
        Corte {indice + 1} / {total}
      </span>

      {onSaltar && marcas.length > 0 && (
        <span className="visor-cortes__claves">
          <CButton
            size="sm"
            color="warning"
            variant="ghost"
            title="Corte clave anterior"
            aria-label="Corte clave anterior"
            disabled={!hayAnterior}
            onClick={() => onSaltar(-1)}
          >
            ◀ ★
          </CButton>
          <CButton
            size="sm"
            color="warning"
            variant="ghost"
            title="Corte clave siguiente"
            aria-label="Corte clave siguiente"
            disabled={!haySiguiente}
            onClick={() => onSaltar(1)}
          >
            ★ ▶
          </CButton>
        </span>
      )}
    </div>
  )
}
