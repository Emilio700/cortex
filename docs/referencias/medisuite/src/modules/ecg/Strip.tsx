// Trazo de ECG sobre papel milimétrico (25 mm/s, 10 mm/mV) en canvas.
import { useLayoutEffect, type RefObject } from 'react'
import type { Signal } from './signal'

export type Layout = '12' | 'lead'
const GRID_12 = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
]
const ROW_MM = 30
const LEFT_MM = 8 // pulso de calibración

interface Props {
  signal: Signal
  layout: Layout
  lead: number // derivación a mostrar (layout 'lead') y analizada
  peaks: number[]
  start: number // s
  rowSec: number
  maxRows: number
  pxmm: number
  canvasRef: RefObject<HTMLCanvasElement | null>
}

export function stripRows(signal: Signal, layout: Layout, start: number, rowSec: number, maxRows: number) {
  const dur = signal.leads[0].data.length / signal.fs
  if (layout === '12') return { rows: 4, sec: Math.min(10, Math.max(2.5, dur - start)) }
  return { rows: Math.max(1, Math.min(maxRows, Math.ceil((dur - start) / rowSec))), sec: rowSec }
}

export default function Strip({ signal, layout, lead, peaks, start, rowSec, maxRows, pxmm, canvasRef }: Props) {
  useLayoutEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const { fs, leads } = signal
    const { rows, sec } = stripRows(signal, layout, start, rowSec, maxRows)
    const Wmm = LEFT_MM + sec * 25 + 2
    const Hmm = rows * ROW_MM + 6
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = Math.round(Wmm * pxmm), H = Math.round(Hmm * pxmm)
    c.width = W * dpr
    c.height = H * dpr
    c.style.width = W + 'px'
    c.style.height = H + 'px'
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    // papel
    g.fillStyle = '#fff7f7'
    g.fillRect(0, 0, W, H)
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      g.moveTo(x0, y0)
      g.lineTo(x1, y1)
    }
    if (pxmm >= 2.5) {
      g.strokeStyle = '#f6cccc'
      g.lineWidth = 0.5
      g.beginPath()
      for (let x = 0; x <= Wmm; x++) if (x % 5) line(x * pxmm + 0.5, 0, x * pxmm + 0.5, H)
      for (let y = 0; y <= Hmm; y++) if (y % 5) line(0, y * pxmm + 0.5, W, y * pxmm + 0.5)
      g.stroke()
    }
    g.strokeStyle = '#e59a9a'
    g.lineWidth = 1
    g.beginPath()
    for (let x = 0; x <= Wmm; x += 5) line(x * pxmm + 0.5, 0, x * pxmm + 0.5, H)
    for (let y = 0; y <= Hmm; y += 5) line(0, y * pxmm + 0.5, W, y * pxmm + 0.5)
    g.stroke()

    const pxs = 25 * pxmm // px por segundo
    const pmv = 10 * pxmm // px por mV
    const trace = (data: Float32Array, t0: number, t1: number, x0: number, yb: number) => {
      const i0 = Math.max(0, Math.floor(t0 * fs)), i1 = Math.min(data.length, Math.ceil(t1 * fs))
      if (i1 <= i0) return
      // línea base: mediana aproximada del segmento
      const step = Math.max(1, Math.floor((i1 - i0) / 200))
      const smp: number[] = []
      for (let i = i0; i < i1; i += step) smp.push(data[i])
      smp.sort((a, b) => a - b)
      const base = smp[smp.length >> 1] ?? 0
      g.beginPath()
      const spp = fs / pxs
      if (spp > 2) {
        // envolvente min/máx por columna de píxel
        let px = -1, mn = 0, mx = 0
        for (let i = i0; i < i1; i++) {
          const x = Math.floor(x0 + (i / fs - t0) * pxs)
          const v = data[i] - base
          if (x !== px) {
            if (px >= 0) {
              g.lineTo(px, yb - mx * pmv)
              g.lineTo(px, yb - mn * pmv)
            } else g.moveTo(x, yb - v * pmv)
            px = x
            mn = mx = v
          } else {
            if (v < mn) mn = v
            if (v > mx) mx = v
          }
        }
      } else for (let i = i0; i < i1; i++) (i === i0 ? g.moveTo : g.lineTo).call(g, x0 + (i / fs - t0) * pxs, yb - (data[i] - base) * pmv)
      g.strokeStyle = '#111827'
      g.lineWidth = 1.2
      g.stroke()
    }
    const calib = (yb: number) => {
      const x = 2 * pxmm, w = 5 * pxmm
      g.beginPath()
      g.moveTo(x - pxmm, yb)
      g.lineTo(x, yb)
      g.lineTo(x, yb - pmv)
      g.lineTo(x + w, yb - pmv)
      g.lineTo(x + w, yb)
      g.lineTo(x + w + pxmm, yb)
      g.strokeStyle = '#111827'
      g.lineWidth = 1.2
      g.stroke()
    }
    const label = (t: string, x: number, y: number) => {
      g.font = `600 ${Math.max(10, pxmm * 3)}px system-ui, sans-serif`
      g.fillStyle = '#1f2937'
      g.fillText(t, x, y)
    }
    const markers = (t0: number, t1: number, x0: number, yb: number, rr: boolean) => {
      const inSeg = peaks.filter((p) => p / fs >= t0 && p / fs < t1)
      g.fillStyle = '#2563eb'
      g.font = `${Math.max(9, pxmm * 2.4)}px system-ui, sans-serif`
      for (const p of inSeg) {
        const x = x0 + (p / fs - t0) * pxs
        const y = yb - ROW_MM * 0.42 * pxmm
        g.beginPath()
        g.moveTo(x, y + 6)
        g.lineTo(x - 4, y)
        g.lineTo(x + 4, y)
        g.fill()
        const k = peaks.indexOf(p)
        if (rr && k > 0) {
          const ms = ((p - peaks[k - 1]) / fs) * 1000
          const xm = x0 + ((p + peaks[k - 1]) / 2 / fs - t0) * pxs
          if (xm > x0 + 10) {
            g.textAlign = 'center'
            g.fillText(ms.toFixed(0), xm, y - 2)
            g.textAlign = 'left'
          }
        }
      }
    }
    const x0 = LEFT_MM * pxmm
    const aname = leads[lead]?.name
    if (layout === '12') {
      const seg = sec / 4
      GRID_12.forEach((row, r) => {
        const yb = (r * ROW_MM + ROW_MM / 2 + 3) * pxmm
        calib(yb)
        row.forEach((name, col) => {
          const L = leads.find((l) => l.name === name)
          if (!L) return
          const t0 = start + col * seg, xs = x0 + col * seg * pxs
          trace(L.data, t0, t0 + seg, xs, yb)
          if (col) {
            g.fillStyle = '#111827'
            g.fillRect(xs, yb - 4 * pxmm, 1, 8 * pxmm)
          }
          label(name, xs + 4, yb - 8 * pxmm)
          if (name === aname) markers(t0, t0 + seg, xs, yb, false)
        })
      })
      const yb = (3 * ROW_MM + ROW_MM / 2 + 3) * pxmm
      const L = leads.find((l) => l.name === 'II') ?? leads[0]
      calib(yb)
      trace(L.data, start, start + sec, x0, yb)
      label(`${L.name} (ritmo)`, x0 + 4, yb - 8 * pxmm)
      if (L.name === aname) markers(start, start + sec, x0, yb, true)
    } else {
      const L = leads[lead] ?? leads[0]
      for (let r = 0; r < rows; r++) {
        const yb = (r * ROW_MM + ROW_MM / 2 + 3) * pxmm
        const t0 = start + r * sec
        calib(yb)
        trace(L.data, t0, t0 + sec, x0, yb)
        label(`${L.name} · ${t0.toFixed(0)} s`, x0 + 4, yb - 8 * pxmm)
        markers(t0, t0 + sec, x0, yb, true)
      }
    }
    g.font = `${Math.max(9, pxmm * 2.4)}px system-ui, sans-serif`
    g.fillStyle = '#6b7280'
    g.textAlign = 'right'
    g.fillText(`25 mm/s · 10 mm/mV · ${fs} Hz`, W - 6, H - 4)
    g.textAlign = 'left'
  }, [signal, layout, lead, peaks, start, rowSec, maxRows, pxmm, canvasRef])

  return <canvas ref={canvasRef} className="block" />
}
