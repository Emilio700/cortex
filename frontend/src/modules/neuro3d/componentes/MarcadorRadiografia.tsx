/**
 * La radiografía con los puntos encima. Se marca con el dedo o con el ratón:
 *
 * - Al tocar, aparece la **lupa** con una cruz; mientras el dedo no se levanta,
 *   el punto se puede afinar. Al soltar, se coloca el punto que toca.
 * - Tocar cerca de un punto ya puesto lo **arrastra** para corregirlo.
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
  alColocar: (clave: string, p: Punto) => void
  alColocarReferencia: (indice: 0 | 1, p: Punto) => void
}

/** Radio (en píxeles de pantalla) para tomar un punto ya puesto. */
const RADIO_DE_TOQUE = 18
const AUMENTO_LUPA = 3
const LADO_LUPA = 150

const PLATILLOS: Record<VistaRx, [string, string][]> = {
  lateral: [['sa', 'sp'], ['ia', 'ip']],
  ap: [['si', 'sd'], ['ii', 'id']],
}

export default function MarcadorRadiografia(props: Props) {
  const { src, ancho, alto, vista, puntos, pendiente, modo, referencia, zoom, alColocar, alColocarReferencia } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const [escala, setEscala] = useState(1)
  const [cursor, setCursor] = useState<Punto | null>(null)
  const [arrastre, setArrastre] = useState<{ clave: string; p: Punto } | null>(null)
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
    const radio = RADIO_DE_TOQUE / Math.max(escala, 1e-6)
    if (modo === 'referencia') {
      const refs = Object.fromEntries(referencia.flatMap((q, i) => (q ? [[String(i), q]] : [])))
      const cerca = puntoCercano(refs, p, radio)
      setArrastre({ clave: cerca ?? `ref.${referencia[0] ? 1 : 0}`, p })
      return
    }
    const cerca = puntoCercano(puntos, p, radio)
    if (cerca) setArrastre({ clave: cerca, p })
    else if (pendiente) setArrastre({ clave: pendiente.clave, p })
  }

  const alMover = (e: EventoPuntero<SVGSVGElement>) => {
    if (modo === 'mover') return
    const p = aImagen(e)
    if (!p) return
    // Con ratón, la lupa sigue al cursor aunque no se presione.
    if (apuntando.current || e.pointerType === 'mouse') setCursor(p)
    if (arrastre) setArrastre({ ...arrastre, p })
  }

  const alSoltar = (e: EventoPuntero<SVGSVGElement>) => {
    if (!apuntando.current) return
    apuntando.current = false
    const p = aImagen(e) ?? arrastre?.p
    if (arrastre && p) {
      if (modo === 'referencia') {
        const indice = arrastre.clave.endsWith('1') ? 1 : 0
        alColocarReferencia(indice, p)
      } else {
        alColocar(arrastre.clave, p)
      }
    }
    setArrastre(null)
    if (e.pointerType !== 'mouse') setCursor(null)
  }

  const visibles: Record<string, Punto> = { ...puntos }
  if (arrastre && modo !== 'referencia') visibles[arrastre.clave] = arrastre.p
  const refs = referencia.map((q, i) => (arrastre && modo === 'referencia' && arrastre.clave.endsWith(String(i)) ? arrastre.p : q))

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
            className={`rx-marcador__punto${arrastre?.clave === clave ? ' rx-marcador__punto--activo' : ''}`}
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
              setArrastre(null)
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
