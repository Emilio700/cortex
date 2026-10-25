/**
 * Silueta de frente y por detrás con los dermatomas encendidos.
 *
 * Es lo que el paciente entiende sin saber anatomía: «el dolor le baja por aquí
 * porque esta raíz es la que siente esta piel». Un solo SVG con las dos vistas,
 * para poder llevarlo tal cual a la captura.
 */
import { forwardRef, useId } from 'react'
import type { DermatomaEncendido } from '../dominio/conexiones'
import {
  CABEZA,
  CONTORNO,
  DERMATOMAS,
  comoPuntosSvg,
  reflejar,
  reflejarPara,
  type Poligono,
  type VistaSilueta,
} from '../dominio/dermatomas'

interface Props {
  encendidos: DermatomaEncendido[]
  /** Texto para lectores de pantalla y para el pie. */
  titulo?: string
  compacta?: boolean
}

const VISTAS: { id: VistaSilueta; nombre: string; desplazamiento: number }[] = [
  { id: 'anterior', nombre: 'De frente', desplazamiento: 0 },
  { id: 'posterior', nombre: 'Por detrás', desplazamiento: 220 },
]

const LADO_TEXTO = { derecho: 'derecho', izquierdo: 'izquierdo' } as const

const SiluetaDermatomas = forwardRef<SVGSVGElement, Props>(function SiluetaDermatomas({ encendidos, titulo, compacta }, ref) {
  const id = useId().replace(/:/g, '')
  const recorte = `atlas-silueta-${id}`
  const resumen =
    encendidos.length === 0
      ? 'Sin dermatomas encendidos.'
      : encendidos
          .map((e) => `${e.dermatoma} ${LADO_TEXTO[e.lado]}`)
          .join(', ')

  const poligonosDe = (vista: VistaSilueta, e: DermatomaEncendido): Poligono[] => {
    const d = DERMATOMAS.find((x) => x.id === e.dermatoma)
    const base = d?.regiones[vista] ?? []
    return reflejarPara(vista, e.lado) ? base.map(reflejar) : base
  }

  const puntoDe = (vista: VistaSilueta, e: DermatomaEncendido) => {
    const d = DERMATOMAS.find((x) => x.id === e.dermatoma)
    if (!d || d.punto.vista !== vista) return null
    const x = reflejarPara(vista, e.lado) ? 200 - d.punto.x : d.punto.x
    return { x, y: d.punto.y }
  }

  return (
    <figure className={`atlas-silueta${compacta ? ' atlas-silueta--compacta' : ''}`}>
      <svg
        ref={ref}
        viewBox="0 0 430 500"
        role="img"
        aria-label={`${titulo ?? 'Dermatomas'}: ${resumen}`}
        className="atlas-silueta__svg"
      >
        <defs>
          <clipPath id={recorte}>
            <polygon points={comoPuntosSvg(CONTORNO)} />
            <ellipse cx={CABEZA.cx} cy={CABEZA.cy} rx={CABEZA.rx} ry={CABEZA.ry} />
          </clipPath>
        </defs>
        <rect x="0" y="0" width="430" height="500" fill="var(--cx-anat-fondo)" rx="16" />
        {VISTAS.map((v) => (
          <g key={v.id} transform={`translate(${v.desplazamiento + 10}, 6)`}>
            <polygon points={comoPuntosSvg(CONTORNO)} fill="var(--cx-anat-fondo-2)" stroke="var(--cx-anat-piel)" strokeWidth="1.2" strokeOpacity="0.7" />
            <ellipse cx={CABEZA.cx} cy={CABEZA.cy} rx={CABEZA.rx} ry={CABEZA.ry} fill="var(--cx-anat-fondo-2)" stroke="var(--cx-anat-piel)" strokeWidth="1.2" strokeOpacity="0.7" />
            {/* Línea media: ayuda a leer qué lado es cuál. */}
            <line x1="100" y1="12" x2="100" y2="272" stroke="var(--cx-anat-piel)" strokeOpacity="0.18" strokeDasharray="3 4" />
            <g clipPath={`url(#${recorte})`}>
              {encendidos.flatMap((e) =>
                poligonosDe(v.id, e).map((p, i) => (
                  <polygon
                    key={`${e.dermatoma}-${e.lado}-${i}`}
                    points={comoPuntosSvg(p)}
                    className="atlas-silueta__region"
                    fill="var(--cx-anat-afectado)"
                  />
                )),
              )}
            </g>
            {encendidos.map((e) => {
              const p = puntoDe(v.id, e)
              return p ? (
                <circle key={`p-${e.dermatoma}-${e.lado}`} cx={p.x} cy={p.y} r="3.2" fill="var(--cx-anat-texto)" stroke="var(--cx-anat-fondo)" strokeWidth="1.2" />
              ) : null
            })}
            <text x="100" y="486" textAnchor="middle" fill="var(--cx-anat-texto)" fontSize="13" fontWeight="600">
              {v.nombre}
            </text>
            {/* Lado del paciente en cada vista. */}
            <text x="6" y="472" fill="var(--cx-anat-texto-2)" fontSize="10.5">
              {v.id === 'anterior' ? 'Der.' : 'Izq.'}
            </text>
            <text x="194" y="472" textAnchor="end" fill="var(--cx-anat-texto-2)" fontSize="10.5">
              {v.id === 'anterior' ? 'Izq.' : 'Der.'}
            </text>
          </g>
        ))}
      </svg>
      {!compacta && (
        <figcaption className="atlas-silueta__pie">
          Dermatomas esquemáticos (los límites varían entre personas). El punto marca el punto sensitivo clave de ASIA.
        </figcaption>
      )}
    </figure>
  )
})

export default SiluetaDermatomas
