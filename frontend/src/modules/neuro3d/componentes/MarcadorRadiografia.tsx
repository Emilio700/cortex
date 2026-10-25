/**
 * La radiografía con los puntos encima. Se marca con el dedo o con el ratón:
 *
 * - Al tocar, aparece la **lupa** con una cruz; mientras el dedo no se levanta,
 *   el punto se puede afinar. Al soltar, se coloca el punto que toca.
 * - Tocar cerca de un punto ya puesto y **arrastrar** lo corrige. Un toque sin
 *   arrastrar pone el punto que toca aunque haya otro cerca: en un disco
 *   estrecho, a 390 px, las esquinas vecinas quedan a pocos píxeles.
 * - En modo «Mover» el dedo desplaza la imagen y no marca nada.
 *
 * Las coordenadas son píxeles de la imagen original (el `viewBox` del SVG), así
 * que no dependen del zoom ni del tamaño de la pantalla.
 */
import { useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import type { Punto } from '../dominio/ajusteRadiografico'
import { puntoCercano, type PasoDeMarcado, type VistaRx } from '../dominio/marcadoRadiografia'

export type ModoMarcado = 'marcar' | 'mover' | 'referencia'

interface Props {
  src: string
  ancho: number
  alto: number
  vista: VistaRx
  puntos: Record<string, Punto>
  pendiente: PasoDeMarcado | null
  modo: ModoMarcado
  /** Extremos de la distancia conocida, si se está calibrando. */
  referencia: (Punto | null)[]
  zoom: number
  /**
   * Coloca un punto. `null` es «el que toca»: lo resuelve la pantalla con su
   * estado más reciente, porque dos toques rápidos llegan antes de que este
   * componente reciba el siguiente `pendiente`.
   */
  alColocar: (clave: string | null, p: Punto) => void
  alColocarReferencia: (indice: 0 | 1, p: Punto) => void
}

/** Radio (en píxeles de pantalla) para tomar un punto ya puesto. */
const RADIO_DE_TOQUE = 18
/** Cuánto (px de pantalla) hay que mover el dedo para que un toque sea arrastre. */
const UMBRAL_DE_ARRASTRE = 6
const AUMENTO_LUPA = 3
const LADO_LUPA = 150

const PLATILLOS: Record<VistaRx, [string, string][]> = {
  lateral: [['sa', 'sp'], ['ia', 'ip']],
  ap: [['si', 'sd'], ['ii', 'id']],
}

interface Arrastre {
  /** Lo que se mueve si el dedo se arrastra: un punto ya puesto o el que toca. */
  clave: string
  p: Punto
  inicio: Punto
  /** Tomó un punto ya puesto (sólo cuenta si el dedo se arrastra). */
  existente: boolean
  movido: boolean
}

export default function MarcadorRadiografia(props: Props) {
  const { src, ancho, alto, vista, puntos, pendiente, modo, referencia, zoom, alColocar, alColocarReferencia } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const [escala, setEscala] = useState(1)
  const [cursor, setCursor] = useState<Punto | null>(null)
  // En una ref y no sólo en el estado: un toque rápido dispara «bajar» y «soltar»
  // sin que React vuelva a pintar entre los dos, y con el estado el punto se perdía.
  const arrastreRef = useRef<Arrastre | null>(null)
  const [arrastre, setArrastreVisible] = useState<Arrastre | null>(null)
  const fijarArrastre = (a: Arrastre | null) => {
    arrastreRef.current = a
    setArrastreVisible(a)
  }
  const apuntando = useRef(false)

  // Píxeles de pantalla por píxel de imagen: el tamaño de los puntos no cambia con el zoom.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const medir = () => {
      const w = svg.getBoundingClientRect().width
      if (w > 0) setEscala(w / ancho)
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [ancho, zoom])

  const aImagen = (e: { clientX: number; clientY: number }): Punto | null => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return null
    const x = ((e.clientX - r.left) / r.width) * ancho
    const y = ((e.clientY - r.top) / r.height) * alto
    return { x: Math.round(Math.min(ancho, Math.max(0, x)) * 10) / 10, y: Math.round(Math.min(alto, Math.max(0, y)) * 10) / 10 }
  }

  /** La escala del momento (el zoom pudo cambiar sin que el observador avisara aún). */
  const escalaReal = () => {
    const w = svgRef.current?.getBoundingClientRect().width ?? 0
    return w > 0 ? w / ancho : escala
  }

  const alBajar = (e: EventoPuntero<SVGSVGElement>) => {
    if (modo === 'mover') return
    const p = aImagen(e)
    if (!p) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* jsdom y algunos navegadores viejos no capturan: se sigue igual. */
    }
    apuntando.current = true
    setCursor(p)
    const radio = RADIO_DE_TOQUE / Math.max(escalaReal(), 1e-6)
    if (modo === 'referencia') {
      const refs = Object.fromEntries(referencia.flatMap((q, i) => (q ? [[String(i), q]] : [])))
      const cerca = puntoCercano(refs, p, radio)
      fijarArrastre({ clave: cerca ?? `ref.${referencia[0] ? 1 : 0}`, p, inicio: p, existente: cerca !== null, movido: false })
      return
    }
    const cerca = puntoCercano(puntos, p, radio)
    if (cerca) fijarArrastre({ clave: cerca, p, inicio: p, existente: true, movido: false })
    else fijarArrastre({ clave: pendiente?.clave ?? '', p, inicio: p, existente: false, movido: false })
  }

  const alMover = (e: EventoPuntero<SVGSVGElement>) => {
    if (modo === 'mover') return
    const p = aImagen(e)
    if (!p) return
    // Con ratón, la lupa sigue al cursor aunque no se presione.
    if (apuntando.current || e.pointerType === 'mouse') setCursor(p)
    const a = arrastreRef.current
    if (!a) return
    const umbral = UMBRAL_DE_ARRASTRE / Math.max(escalaReal(), 1e-6)
    const movido = a.movido || Math.hypot(p.x - a.inicio.x, p.y - a.inicio.y) > umbral
    fijarArrastre({ ...a, p, movido })
  }

  const alSoltar = (e: EventoPuntero<SVGSVGElement>) => {
    if (!apuntando.current) return
    apuntando.current = false
    const a = arrastreRef.current
    const p = aImagen(e) ?? a?.p
    if (a && p) {
      if (modo === 'referencia') {
        const clave = a.existente && !a.movido ? `ref.${referencia[0] ? 1 : 0}` : a.clave
        alColocarReferencia(clave.endsWith('1') ? 1 : 0, p)
      } else if (a.existente && !a.movido) {
        // Un toque (sin arrastrar) junto a un punto ya puesto: es el punto que toca.
        alColocar(null, p)
      } else {
        alColocar(a.existente ? a.clave : null, p)
      }
    }
    fijarArrastre(null)
    if (e.pointerType !== 'mouse') setCursor(null)
  }

  // Un punto ya puesto sólo se ve moverse cuando de verdad se arrastra.
  const moviendo = arrastre && (!arrastre.existente || arrastre.movido) ? arrastre : null
  const visibles: Record<string, Punto> = { ...puntos }
  if (moviendo && modo !== 'referencia') visibles[moviendo.clave] = moviendo.p
  const refs = referencia.map((q, i) => (moviendo && modo === 'referencia' && moviendo.clave.endsWith(String(i)) ? moviendo.p : q))

  const u = 1 / Math.max(escala, 1e-6)
  const vertebras = [...new Set(Object.keys(visibles).filter((k) => !k.startsWith('cadera.')).map((k) => k.split('.')[0]))]

  const dibujo = (s: number) => (
    <g>
      {vertebras.map((v) =>
        PLATILLOS[vista].map(([a, b]) => {
          const p = visibles[`${v}.${a}`]
          const q = visibles[`${v}.${b}`]
          return p && q ? (
            <line key={`${v}-${a}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="rx-marcador__platillo" strokeWidth={2 * s} />
          ) : null
        }),
      )}
      {Object.entries(visibles).map(([clave, p]) =>
        clave.startsWith('cadera.') ? (
          <g key={clave}>
            <circle cx={p.x} cy={p.y} r={14 * s} className="rx-marcador__cadera" strokeWidth={2 * s} />
            <circle cx={p.x} cy={p.y} r={3 * s} className="rx-marcador__punto" />
          </g>
        ) : (
          <circle
            key={clave}
            cx={p.x}
            cy={p.y}
            r={5 * s}
            strokeWidth={1.5 * s}
            className={`rx-marcador__punto${moviendo?.clave === clave ? ' rx-marcador__punto--activo' : ''}`}
          />
        ),
      )}
      {vertebras.map((v) => {
        const p = visibles[`${v}.${vista === 'lateral' ? 'sa' : 'sd'}`] ?? visibles[`${v}.${vista === 'lateral' ? 'sp' : 'si'}`]
        return p ? (
          <text key={`t-${v}`} x={p.x + 9 * s} y={p.y - 6 * s} fontSize={13 * s} className="rx-marcador__rotulo">
            {v}
          </text>
        ) : null
      })}
      {refs[0] && refs[1] && (
        <line x1={refs[0].x} y1={refs[0].y} x2={refs[1].x} y2={refs[1].y} className="rx-marcador__referencia" strokeWidth={2 * s} strokeDasharray={`${6 * s} ${4 * s}`} />
      )}
      {refs.map((q, i) => (q ? <circle key={`ref-${i}`} cx={q.x} cy={q.y} r={5 * s} className="rx-marcador__punto rx-marcador__punto--referencia" strokeWidth={1.5 * s} /> : null))}
    </g>
  )

  // La lupa: del lado contrario al dedo, para que no la tape.
  const ladoLupa = cursor && cursor.x * escala < 200 ? 'derecha' : 'izquierda'
  const medioLupa = LADO_LUPA / 2 / (escala * AUMENTO_LUPA)

  return (
    <div className="rx-marcador" data-tour="rx-imagen">
      <div className={`rx-marcador__lienzo rx-marcador__lienzo--${modo}`}>
        <div className="rx-marcador__contenido" style={{ width: `${zoom * 100}%` }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${ancho} ${alto}`}
            className="rx-marcador__svg"
            role="img"
            aria-label={pendiente ? `Radiografía. Toca para marcar: ${pendiente.titulo}` : 'Radiografía con los puntos marcados'}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={() => {
              apuntando.current = false
              fijarArrastre(null)
              setCursor(null)
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse' && !apuntando.current) setCursor(null)
            }}
          >
            <image href={src} width={ancho} height={alto} preserveAspectRatio="none" />
            {dibujo(u)}
          </svg>
        </div>
      </div>
      {cursor && modo !== 'mover' && (
        <div className={`rx-marcador__lupa rx-marcador__lupa--${ladoLupa}`} aria-hidden="true">
          <svg
            width={LADO_LUPA}
            height={LADO_LUPA}
            viewBox={`${cursor.x - medioLupa} ${cursor.y - medioLupa} ${2 * medioLupa} ${2 * medioLupa}`}
          >
            <image href={src} width={ancho} height={alto} preserveAspectRatio="none" />
            {dibujo(u / AUMENTO_LUPA)}
            <line x1={cursor.x - medioLupa} y1={cursor.y} x2={cursor.x + medioLupa} y2={cursor.y} className="rx-marcador__cruz" strokeWidth={u / AUMENTO_LUPA} />
            <line x1={cursor.x} y1={cursor.y - medioLupa} x2={cursor.x} y2={cursor.y + medioLupa} className="rx-marcador__cruz" strokeWidth={u / AUMENTO_LUPA} />
          </svg>
        </div>
      )}
    </div>
  )
}
