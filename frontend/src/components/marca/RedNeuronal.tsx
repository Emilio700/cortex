/**
 * RedNeuronal — el fondo animado de la marca Cortex: nodos que derivan, se
 * conectan cuando están cerca y por cuyas conexiones viajan pulsos, como las
 * sinapsis del logo.
 *
 * Es un canvas y no SVG porque son cientos de líneas por cuadro: con SVG cada
 * una sería un nodo del DOM. Se pausa con la pestaña oculta (no gasta batería
 * en una pantalla que nadie ve) y con «reducir movimiento» pinta un solo cuadro
 * quieto, completo, sin pulsos.
 */
import React, { useEffect, useRef } from 'react'

interface Nodo {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  fase: number
}

interface Pulso {
  a: number
  b: number
  t: number
  vel: number
}

interface RedNeuronalProps {
  /** Nodos por cada 10 000 px² de superficie. */
  densidad?: number
  /** Distancia máxima, en px, a la que dos nodos se conectan. */
  alcance?: number
  /** Si el cursor atrae a los nodos cercanos. */
  interactiva?: boolean
  className?: string
}

const AZUL = '47, 140, 255'
const CIAN = '125, 211, 252'

const prefiereQuietud = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.classList.contains('reduce-motion'))

const RedNeuronal: React.FC<RedNeuronalProps> = ({
  densidad = 0.9,
  alcance = 140,
  interactiva = true,
  className,
}) => {
  const lienzoRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const lienzo = lienzoRef.current
    // jsdom (las pruebas) no implementa canvas: pedirle el contexto sólo llena
    // la salida de errores. La red es decorativa, así que ahí no se pinta.
    if (!lienzo || /jsdom/i.test(navigator.userAgent)) return
    const ctx = lienzo.getContext('2d')
    if (!lienzo || !ctx) return

    const quieta = prefiereQuietud()
    let ancho = 0
    let alto = 0
    let nodos: Nodo[] = []
    let pulsos: Pulso[] = []
    let cuadro = 0
    const cursor = { x: -9999, y: -9999 }

    const sembrar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      ancho = lienzo.clientWidth
      alto = lienzo.clientHeight
      lienzo.width = Math.round(ancho * dpr)
      lienzo.height = Math.round(alto * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const total = Math.max(18, Math.min(160, Math.round(((ancho * alto) / 10000) * densidad)))
      nodos = Array.from({ length: total }, () => ({
        x: Math.random() * ancho,
        y: Math.random() * alto,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 1 + Math.random() * 1.8,
        fase: Math.random() * Math.PI * 2,
      }))
      pulsos = []
    }

    const pintar = (tiempo: number) => {
      ctx.clearRect(0, 0, ancho, alto)
      const alcance2 = alcance * alcance

      for (let i = 0; i < nodos.length; i++) {
        const a = nodos[i]
        for (let j = i + 1; j < nodos.length; j++) {
          const b = nodos[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 > alcance2) continue
          const cercania = 1 - Math.sqrt(d2) / alcance
          ctx.strokeStyle = `rgba(${AZUL}, ${cercania * 0.35})`
          ctx.lineWidth = cercania * 1.1
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
          // De vez en cuando una conexión dispara un pulso.
          if (!quieta && pulsos.length < 26 && Math.random() < 0.0009 * cercania) {
            pulsos.push({ a: i, b: j, t: 0, vel: 0.008 + Math.random() * 0.014 })
          }
        }
      }

      for (const n of nodos) {
        const latido = 0.55 + 0.45 * Math.sin(tiempo / 900 + n.fase)
        const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 6)
        halo.addColorStop(0, `rgba(${CIAN}, ${0.35 * latido})`)
        halo.addColorStop(1, `rgba(${CIAN}, 0)`)
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(220, 240, 255, ${0.5 + 0.5 * latido})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
      }

      pulsos = pulsos.filter((p) => p.t <= 1)
      for (const p of pulsos) {
        const a = nodos[p.a]
        const b = nodos[p.b]
        if (!a || !b) continue
        const x = a.x + (b.x - a.x) * p.t
        const y = a.y + (b.y - a.y) * p.t
        const brillo = ctx.createRadialGradient(x, y, 0, x, y, 10)
        brillo.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
        brillo.addColorStop(0.3, `rgba(${CIAN}, 0.6)`)
        brillo.addColorStop(1, `rgba(${AZUL}, 0)`)
        ctx.fillStyle = brillo
        ctx.beginPath()
        ctx.arc(x, y, 10, 0, Math.PI * 2)
        ctx.fill()
        p.t += p.vel
      }
    }

    const mover = () => {
      for (const n of nodos) {
        if (interactiva) {
          const dx = cursor.x - n.x
          const dy = cursor.y - n.y
          const d2 = dx * dx + dy * dy
          if (d2 < 180 * 180 && d2 > 1) {
            n.vx += (dx / Math.sqrt(d2)) * 0.012
            n.vy += (dy / Math.sqrt(d2)) * 0.012
          }
        }
        n.vx *= 0.985
        n.vy *= 0.985
        // Una deriva mínima para que nunca se queden quietos del todo.
        n.vx += (Math.random() - 0.5) * 0.01
        n.vy += (Math.random() - 0.5) * 0.01
        n.x += n.vx
        n.y += n.vy
        if (n.x < -20) n.x = ancho + 20
        if (n.x > ancho + 20) n.x = -20
        if (n.y < -20) n.y = alto + 20
        if (n.y > alto + 20) n.y = -20
      }
    }

    const ciclo = (tiempo: number) => {
      mover()
      pintar(tiempo)
      cuadro = requestAnimationFrame(ciclo)
    }

    const arrancar = () => {
      cancelAnimationFrame(cuadro)
      if (quieta) pintar(0)
      else cuadro = requestAnimationFrame(ciclo)
    }

    const alCambiarVisibilidad = () => {
      if (document.hidden) cancelAnimationFrame(cuadro)
      else arrancar()
    }

    const alMoverCursor = (e: PointerEvent) => {
      const caja = lienzo.getBoundingClientRect()
      cursor.x = e.clientX - caja.left
      cursor.y = e.clientY - caja.top
    }
    const alSalirCursor = () => {
      cursor.x = -9999
      cursor.y = -9999
    }

    sembrar()
    arrancar()

    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      sembrar()
      if (quieta) pintar(0)
    }) : null
    observador?.observe(lienzo)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    if (interactiva) {
      window.addEventListener('pointermove', alMoverCursor)
      document.addEventListener('pointerleave', alSalirCursor)
    }

    return () => {
      cancelAnimationFrame(cuadro)
      observador?.disconnect()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('pointermove', alMoverCursor)
      document.removeEventListener('pointerleave', alSalirCursor)
    }
  }, [densidad, alcance, interactiva])

  return <canvas ref={lienzoRef} className={className} aria-hidden="true" />
}

export default RedNeuronal
