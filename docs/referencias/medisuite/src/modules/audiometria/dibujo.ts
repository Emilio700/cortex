// Dibujo del audiograma en canvas (para PNG y PDF), con símbolos ASHA 1990.
import { DB_MAX, DB_MIN, FRECUENCIAS, etiquetaFrec, xFrec, yDb, type Frecuencia, type Oido, type Umbrales, type Via } from './audiograma'

export const ROJO = '#dc2626'
export const AZUL = '#2563eb'
export const OCTAVAS = [125, 250, 500, 1000, 2000, 4000, 8000]

type Ctx = CanvasRenderingContext2D

/** Símbolo ASHA: aérea O/△ (der) X/□ (izq); ósea < [ (der) > ] (izq). */
export function simbolo(g: Ctx, oido: Oido, via: Via, enm: boolean, x: number, y: number, s: number, sinResp: boolean) {
  g.save()
  g.strokeStyle = oido === 'der' ? ROJO : AZUL
  g.lineWidth = Math.max(1.5, s / 6)
  g.beginPath()
  if (via === 'aerea') {
    if (oido === 'der' && !enm) g.arc(x, y, s / 2, 0, Math.PI * 2)
    else if (oido === 'der') {
      g.moveTo(x, y - s / 2)
      g.lineTo(x + s / 2, y + s / 2)
      g.lineTo(x - s / 2, y + s / 2)
      g.closePath()
    } else if (!enm) {
      g.moveTo(x - s / 2, y - s / 2)
      g.lineTo(x + s / 2, y + s / 2)
      g.moveTo(x + s / 2, y - s / 2)
      g.lineTo(x - s / 2, y + s / 2)
    } else g.rect(x - s / 2, y - s / 2, s, s)
  } else {
    // ósea: el símbolo derecho va a la izquierda de la línea de frecuencia y el izquierdo a la derecha
    const dx = oido === 'der' ? -s * 0.7 : s * 0.7
    const cx = x + dx
    const d = oido === 'der' ? 1 : -1
    if (!enm) {
      g.moveTo(cx + (d * s) / 3, y - s / 2)
      g.lineTo(cx - (d * s) / 3, y)
      g.lineTo(cx + (d * s) / 3, y + s / 2)
    } else {
      g.moveTo(cx + (d * s) / 3, y - s / 2)
      g.lineTo(cx - (d * s) / 3, y - s / 2)
      g.lineTo(cx - (d * s) / 3, y + s / 2)
      g.lineTo(cx + (d * s) / 3, y + s / 2)
    }
  }
  g.stroke()
  if (sinResp) {
    // flecha hacia abajo y hacia afuera: sin respuesta al nivel máximo
    const d = oido === 'der' ? -1 : 1
    const x0 = x + (d * s) / 2
    const y0 = y + s / 2
    const x1 = x0 + d * s * 0.7
    const y1 = y0 + s * 0.7
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.moveTo(x1, y1)
    g.lineTo(x1 - d * s * 0.35, y1)
    g.moveTo(x1, y1)
    g.lineTo(x1, y1 - s * 0.35)
    g.stroke()
  }
  g.restore()
}

/** Dibuja el audiograma completo dentro del rectángulo (x, y, w, h) — w debe ser ≈ 1.1×h para la proporción ASHA. */
export function dibujarAudiograma(g: Ctx, u: Umbrales, x: number, y: number, w: number, h: number) {
  const ml = 46
  const mt = 38
  const mr = 14
  const mb = 14
  const pw = w - ml - mr
  const ph = h - mt - mb
  const px = (f: number) => x + ml + xFrec(f) * pw
  const py = (db: number) => y + mt + yDb(db) * ph
  g.save()
  g.fillStyle = '#fff'
  g.fillRect(x, y, w, h)
  // banda de audición normal (< 20 dB, OMS 2021)
  g.fillStyle = 'rgba(22,163,74,0.08)'
  g.fillRect(px(125), py(DB_MIN), pw, py(20) - py(DB_MIN))
  g.font = '12px sans-serif'
  g.fillStyle = '#333'
  g.strokeStyle = '#d4d4d8'
  g.lineWidth = 1
  for (let db = DB_MIN; db <= DB_MAX; db += 10) {
    g.beginPath()
    g.moveTo(px(125), py(db))
    g.lineTo(px(8000), py(db))
    g.strokeStyle = db === 0 ? '#71717a' : '#d4d4d8'
    g.stroke()
    g.textAlign = 'right'
    g.textBaseline = 'middle'
    g.fillText(String(db), x + ml - 6, py(db))
  }
  for (const f of [...OCTAVAS, 3000, 6000]) {
    g.beginPath()
    g.setLineDash(OCTAVAS.includes(f) ? [] : [4, 4])
    g.strokeStyle = '#d4d4d8'
    g.moveTo(px(f), py(DB_MIN))
    g.lineTo(px(f), py(DB_MAX))
    g.stroke()
    g.setLineDash([])
    g.textAlign = 'center'
    g.textBaseline = 'bottom'
    g.fillText(etiquetaFrec(f), px(f), y + mt - 12)
  }
  g.strokeStyle = '#71717a'
  g.strokeRect(px(125), py(DB_MIN), pw, ph)
  g.save()
  g.translate(x + 12, y + mt + ph / 2)
  g.rotate(-Math.PI / 2)
  g.textAlign = 'center'
  g.fillText('dB HL', 0, 0)
  g.restore()
  g.textAlign = 'left'
  g.textBaseline = 'bottom'
  g.fillText('Hz', x + 4, y + mt - 12)

  const s = Math.max(9, pw / 42)
  for (const oido of ['der', 'izq'] as Oido[]) {
    // líneas que unen la vía aérea (derecho continuo, izquierdo discontinuo)
    const pts = FRECUENCIAS.map((f) => [f, u[oido].aerea[f]] as const).filter(([, t]) => t && t.db != null && !t.sinRespuesta)
    g.save()
    g.strokeStyle = oido === 'der' ? ROJO : AZUL
    g.lineWidth = 1.6
    if (oido === 'izq') g.setLineDash([6, 4])
    g.beginPath()
    pts.forEach(([f, t], i) => (i ? g.lineTo(px(f), py(t!.db!)) : g.moveTo(px(f), py(t!.db!))))
    g.stroke()
    g.restore()
    for (const via of ['aerea', 'osea'] as Via[])
      for (const f of FRECUENCIAS) {
        const t = u[oido][via][f as Frecuencia]
        if (!t || t.db == null) continue
        simbolo(g, oido, via, !!t.enmascarado, px(f), py(t.db), s, !!t.sinRespuesta)
      }
  }
  g.restore()
}

/** PNG del audiograma con título y leyenda. */
export function audiogramaPNG(u: Umbrales, titulo: string, subtitulo: string): string {
  const W = 900
  const H = 860
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#111'
  g.font = 'bold 22px sans-serif'
  g.fillText(titulo, 24, 34)
  g.font = '15px sans-serif'
  g.fillStyle = '#444'
  g.fillText(subtitulo, 24, 58)
  dibujarAudiograma(g, u, 16, 76, W - 32, 700)
  leyenda(g, 24, 800, W - 48)
  return cv.toDataURL('image/png')
}

export function leyenda(g: Ctx, x: number, y: number, w: number) {
  const items: [Oido, Via, boolean, string][] = [
    ['der', 'aerea', false, 'Aérea der.'],
    ['der', 'aerea', true, 'Aérea der. enm.'],
    ['izq', 'aerea', false, 'Aérea izq.'],
    ['izq', 'aerea', true, 'Aérea izq. enm.'],
    ['der', 'osea', false, 'Ósea der.'],
    ['der', 'osea', true, 'Ósea der. enm.'],
    ['izq', 'osea', false, 'Ósea izq.'],
    ['izq', 'osea', true, 'Ósea izq. enm.'],
  ]
  const col = w / 4
  g.font = '13px sans-serif'
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  items.forEach(([o, v, e, t], i) => {
    const cx = x + (i % 4) * col + 14
    const cy = y + Math.floor(i / 4) * 24
    simbolo(g, o, v, e, v === 'osea' ? cx + (o === 'der' ? 8 : -8) : cx, cy, 11, false)
    g.fillStyle = '#333'
    g.fillText(t, cx + 16, cy)
  })
}
