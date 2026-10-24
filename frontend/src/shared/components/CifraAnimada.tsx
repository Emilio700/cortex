/**
 * CifraAnimada — un número que cuenta desde su valor anterior hasta el nuevo
 * (de 0 la primera vez). Es parte del movimiento de la marca Cortex: las
 * cifras del día «llegan» en vez de aparecer de golpe.
 *
 * Sólo anima números; cualquier otra cosa («—» cuando no hay dato) se pinta
 * tal cual. Con «reducir movimiento» muestra el valor final de inmediato.
 * Dura poco (≤ 700 ms) para no retrasar la lectura.
 */
import React, { useEffect, useRef, useState } from 'react'

const quieto = () =>
  typeof window === 'undefined' ||
  typeof window.requestAnimationFrame !== 'function' ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
  document.documentElement.classList.contains('reduce-motion')

interface Props {
  valor: React.ReactNode
  duracion?: number
}

const CifraAnimada: React.FC<Props> = ({ valor, duracion = 700 }) => {
  const numerico = typeof valor === 'number' && Number.isFinite(valor)
  const [mostrado, setMostrado] = useState<number>(numerico && !quieto() ? 0 : (valor as number))
  const desde = useRef(0)

  useEffect(() => {
    if (!numerico) return
    const destino = valor as number
    if (quieto() || destino === desde.current) {
      setMostrado(destino)
      desde.current = destino
      return
    }
    const inicio = performance.now()
    const origen = desde.current
    let cuadro = 0
    const paso = (t: number) => {
      const avance = Math.min(1, (t - inicio) / duracion)
      // Desacelera al final: el número «se asienta».
      const suave = 1 - Math.pow(1 - avance, 3)
      setMostrado(Math.round(origen + (destino - origen) * suave))
      if (avance < 1) cuadro = requestAnimationFrame(paso)
      else desde.current = destino
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
  }, [valor, numerico, duracion])

  if (!numerico) return <>{valor}</>
  return <>{mostrado}</>
}

export default CifraAnimada
