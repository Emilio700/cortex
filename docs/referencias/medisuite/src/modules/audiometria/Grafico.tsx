// Audiograma en SVG (pantalla). Clic en la cuadrícula para colocar el umbral del oído/vía seleccionados.
import type { ReactNode } from 'react'
import { DB_MAX, DB_MIN, FRECUENCIAS, etiquetaFrec, xFrec, yDb, type Frecuencia, type Oido, type Umbrales, type Via } from './audiograma'
import { AZUL, OCTAVAS, ROJO } from './dibujo'

export function SimboloSVG({ oido, via, enm, x, y, s, sinResp }: { oido: Oido; via: Via; enm: boolean; x: number; y: number; s: number; sinResp?: boolean }) {
  const c = oido === 'der' ? ROJO : AZUL
  const h = s / 2
  let el: ReactNode
  if (via === 'aerea') {
    if (oido === 'der') el = enm ? <path d={`M${x},${y - h} L${x + h},${y + h} L${x - h},${y + h} Z`} /> : <circle cx={x} cy={y} r={h} />
    else el = enm ? <rect x={x - h} y={y - h} width={s} height={s} /> : <path d={`M${x - h},${y - h} L${x + h},${y + h} M${x + h},${y - h} L${x - h},${y + h}`} />
  } else {
    const d = oido === 'der' ? 1 : -1
    const cx = x + (oido === 'der' ? -s * 0.7 : s * 0.7)
    el = enm ? (
      <path d={`M${cx + (d * s) / 3},${y - h} L${cx - (d * s) / 3},${y - h} L${cx - (d * s) / 3},${y + h} L${cx + (d * s) / 3},${y + h}`} />
    ) : (
      <path d={`M${cx + (d * s) / 3},${y - h} L${cx - (d * s) / 3},${y} L${cx + (d * s) / 3},${y + h}`} />
    )
  }
  let flecha: ReactNode = null
  if (sinResp) {
    const d = oido === 'der' ? -1 : 1
    const x0 = x + d * h
    const y0 = y + h
    const x1 = x0 + d * s * 0.7
    const y1 = y0 + s * 0.7
    flecha = <path d={`M${x0},${y0} L${x1},${y1} M${x1},${y1} L${x1 - d * s * 0.35},${y1} M${x1},${y1} L${x1},${y1 - s * 0.35}`} />
  }
  return (
    <g fill="none" stroke={c} strokeWidth={1.8}>
      {el}
      {flecha}
    </g>
  )
}

const W = 560
const H = 520
const ML = 44
const MT = 36
const MR = 14
const MB = 12
const PW = W - ML - MR
const PH = H - MT - MB
const px = (f: number) => ML + xFrec(f) * PW
const py = (db: number) => MT + yDb(db) * PH

export function Grafico({ u, onPunto, titulo }: { u: Umbrales; onPunto?: (f: Frecuencia, db: number) => void; titulo?: string }) {
  const s = 13
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPunto) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    if (x < ML - 10 || y < MT - 6 || y > MT + PH + 6) return
    // frecuencia más cercana (en escala log)
    let mejor: Frecuencia = FRECUENCIAS[0]
    for (const f of FRECUENCIAS) if (Math.abs(px(f) - x) < Math.abs(px(mejor) - x)) mejor = f
    if (Math.abs(px(mejor) - x) > PW / 14) return
    const db = Math.round((DB_MIN + ((y - MT) / PH) * (DB_MAX - DB_MIN)) / 5) * 5
    onPunto(mejor, Math.max(DB_MIN, Math.min(DB_MAX, db)))
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[640px] select-none" role="img" aria-label={titulo ?? 'Audiograma'} onClick={click} style={{ cursor: onPunto ? 'crosshair' : undefined }}>
      <rect x={px(125)} y={py(DB_MIN)} width={PW} height={py(20) - py(DB_MIN)} className="fill-ok/10" />
      {Array.from({ length: (DB_MAX - DB_MIN) / 10 + 1 }, (_, i) => DB_MIN + i * 10).map((db) => (
        <g key={db}>
          <line x1={px(125)} x2={px(8000)} y1={py(db)} y2={py(db)} stroke="var(--color-line)" strokeWidth={db === 0 ? 1.6 : 1} />
          <text x={ML - 6} y={py(db)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="var(--color-muted)">
            {db}
          </text>
        </g>
      ))}
      {[...OCTAVAS, 3000, 6000].map((f) => (
        <g key={f}>
          <line x1={px(f)} x2={px(f)} y1={py(DB_MIN)} y2={py(DB_MAX)} stroke="var(--color-line)" strokeDasharray={OCTAVAS.includes(f) ? undefined : '4 4'} />
          <text x={px(f)} y={MT - 14} textAnchor="middle" fontSize={12} fill="var(--color-muted)">
            {etiquetaFrec(f)}
          </text>
        </g>
      ))}
      <rect x={px(125)} y={py(DB_MIN)} width={PW} height={PH} fill="none" stroke="var(--color-muted)" />
      <text x={4} y={MT - 14} fontSize={11} fill="var(--color-muted)">
        Hz
      </text>
      <text x={12} y={MT + PH / 2} fontSize={11} fill="var(--color-muted)" transform={`rotate(-90 12 ${MT + PH / 2})`} textAnchor="middle">
        dB HL
      </text>
      {(['der', 'izq'] as Oido[]).map((o) => {
        const pts = FRECUENCIAS.map((f) => [f, u[o].aerea[f]] as const).filter(([, t]) => t && t.db != null && !t.sinRespuesta)
        return (
          <g key={o}>
            <polyline
              points={pts.map(([f, t]) => `${px(f)},${py(t!.db!)}`).join(' ')}
              fill="none"
              stroke={o === 'der' ? ROJO : AZUL}
              strokeWidth={1.6}
              strokeDasharray={o === 'izq' ? '6 4' : undefined}
            />
            {(['aerea', 'osea'] as Via[]).map((v) =>
              FRECUENCIAS.map((f) => {
                const t = u[o][v][f]
                if (!t || t.db == null) return null
                return <SimboloSVG key={v + f} oido={o} via={v} enm={!!t.enmascarado} x={px(f)} y={py(t.db)} s={s} sinResp={t.sinRespuesta} />
              }),
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function Leyenda() {
  const items: [Oido, Via, boolean, string][] = [
    ['der', 'aerea', false, 'Aérea derecho'],
    ['izq', 'aerea', false, 'Aérea izquierdo'],
    ['der', 'aerea', true, 'Aérea der. enmascarada'],
    ['izq', 'aerea', true, 'Aérea izq. enmascarada'],
    ['der', 'osea', false, 'Ósea derecho'],
    ['izq', 'osea', false, 'Ósea izquierdo'],
    ['der', 'osea', true, 'Ósea der. enmascarada'],
    ['izq', 'osea', true, 'Ósea izq. enmascarada'],
  ]
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted sm:grid-cols-4">
      {items.map(([o, v, e, t]) => (
        <li key={t} className="flex items-center gap-1.5">
          <svg width={26} height={18} aria-hidden="true">
            <SimboloSVG oido={o} via={v} enm={e} x={v === 'osea' ? (o === 'der' ? 20 : 6) : 13} y={9} s={11} />
          </svg>
          {t}
        </li>
      ))}
    </ul>
  )
}
