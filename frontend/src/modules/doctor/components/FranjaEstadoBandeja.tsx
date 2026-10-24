/**
 * Franja de estado de la bandeja (plan 32, punto 3).
 *
 * Decisión de Emilio: nada de cuatro tarjetas de tablero con número e ícono.
 * Es una sola franja de segmentos conectados, con el lenguaje del inicio de la
 * doctora: cada segmento tiene su número, una barra con su proporción sobre lo
 * activo y funciona como filtro. Crítico y atrasado llevan su propio
 * tratamiento (franja lateral y trama), no solo otro color.
 *
 * Los números vienen del servidor (todas las páginas). Si el conteo falla se
 * dice; nunca se pinta un 0 que haría creer que no hay pendientes.
 */
import { useEffect, useRef, useState } from 'react'

import type { FiltroBandeja, ResumenBandeja } from '../types/clinicalTracking'
import './franjaEstadoBandeja.css'

type Clave = 'pendientes' | 'por_revisar' | 'criticos' | 'atrasados' | 'urgentes'

const SEGMENTOS: ReadonlyArray<{ clave: Clave; etiqueta: string; tono: string }> = [
  { clave: 'pendientes', etiqueta: 'Pendientes de resultado', tono: 'azul' },
  { clave: 'por_revisar', etiqueta: 'Por revisar', tono: 'morado' },
  { clave: 'criticos', etiqueta: 'Críticos abiertos', tono: 'critico' },
  { clave: 'atrasados', etiqueta: 'Atrasados', tono: 'atrasado' },
  { clave: 'urgentes', etiqueta: 'Urgentes y preferentes', tono: 'ambar' },
]

const sinMovimiento = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Cuenta hasta el número en ≤180 ms, una vez; con movimiento reducido, directo. */
const useConteo = (destino: number): number => {
  const [valor, setValor] = useState(() => (sinMovimiento() ? destino : 0))
  const marco = useRef<number | null>(null)
  useEffect(() => {
    if (sinMovimiento() || typeof window.requestAnimationFrame !== 'function') {
      setValor(destino)
      return
    }
    const inicio = performance.now()
    const paso = () => {
      const t = Math.min(1, (performance.now() - inicio) / 180)
      setValor(Math.round(destino * t))
      if (t < 1) marco.current = window.requestAnimationFrame(paso)
    }
    marco.current = window.requestAnimationFrame(paso)
    // Si el navegador congela los cuadros (pestaña de fondo), el número
    // igual queda bien: la animación es adorno, el valor no.
    const seguro = window.setTimeout(() => setValor(destino), 220)
    return () => {
      if (marco.current !== null) window.cancelAnimationFrame(marco.current)
      window.clearTimeout(seguro)
    }
  }, [destino])
  return valor
}

const Numero = ({ valor }: { valor: number }) => <>{useConteo(valor)}</>

interface Props {
  resumen: ResumenBandeja | null
  error: boolean
  cargando: boolean
  activo: FiltroBandeja
  onElegir: (filtro: FiltroBandeja) => void
  onReintentar: () => void
}

export default function FranjaEstadoBandeja({ resumen, error, cargando, activo, onElegir, onReintentar }: Props) {
  if (error) {
    return (
      <div className="franja-bandeja franja-bandeja--error" role="status" data-tour="bandeja-franja">
        <span>No se pudieron contar los pendientes; la lista de abajo sí está completa.</span>
        <button type="button" className="franja-bandeja__reintentar" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    )
  }
  const base = resumen ? Math.max(resumen.activas, 1) : 1
  return (
    <div
      className="franja-bandeja"
      role="group"
      aria-label="Resumen de la bandeja; cada segmento filtra la lista"
      aria-busy={cargando && !resumen}
      data-tour="bandeja-franja"
    >
      {SEGMENTOS.map(({ clave, etiqueta, tono }) => {
        const n = resumen ? resumen[clave] : null
        const elegido = activo === clave
        const proporcion = n !== null ? Math.min(100, Math.round((n / base) * 100)) : 0
        const alerta = (clave === 'criticos' || clave === 'atrasados') && (n ?? 0) > 0
        return (
          <button
            key={clave}
            type="button"
            className={`franja-bandeja__segmento franja-bandeja__segmento--${tono}${elegido ? ' is-elegido' : ''}${alerta ? ' is-alerta' : ''}`}
            aria-pressed={elegido}
            // Tocar el segmento elegido vuelve a «Todo lo pendiente».
            onClick={() => onElegir(elegido ? 'activas' : clave)}
          >
            <span className="franja-bandeja__numero">
              {n === null ? <span className="franja-bandeja__cargando" aria-label="Contando">—</span> : <Numero valor={n} />}
            </span>
            <span className="franja-bandeja__etiqueta">{etiqueta}</span>
            <span className="franja-bandeja__barra" aria-hidden="true">
              <span className="franja-bandeja__relleno" style={{ width: `${proporcion}%` }} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
