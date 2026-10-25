// Visor 2D sobre canvas: ventana/nivel, zoom/desplazamiento, cortes, cine, mediciones y gestos táctiles.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Contrast, Move, ZoomIn, Layers, Ruler, Triangle, Circle, RotateCw, SquareSplitHorizontal, SquareSplitVertical,
  RotateCcw, Play, Pause, Eraser, SunMoon, Undo2,
} from 'lucide-react'
import { cx } from '../../lib/utils'
import { Select } from '../../components/ui'
import { getFrame, defaultWL, renderFrame, str, type Frame, type Series, type Instance } from './dicomlib'

export type Tool = 'wl' | 'pan' | 'zoom' | 'stack' | 'dist' | 'angle' | 'roi'
type P = { x: number; y: number }
type Meas = { type: 'dist' | 'angle' | 'roi'; pts: P[]; done?: boolean }

export const PRESETS: Record<string, [number, number]> = {
  Pulmón: [-600, 1500],
  Mediastino: [50, 350],
  Hueso: [400, 1800],
  Cerebro: [40, 80],
  Abdomen: [60, 400],
}

const TOOLS: { id: Tool; label: string; icon: typeof Move }[] = [
  { id: 'wl', label: 'Ventana/nivel', icon: Contrast },
  { id: 'pan', label: 'Mover', icon: Move },
  { id: 'zoom', label: 'Zoom', icon: ZoomIn },
  { id: 'stack', label: 'Cortes', icon: Layers },
  { id: 'dist', label: 'Distancia', icon: Ruler },
  { id: 'angle', label: 'Ángulo', icon: Triangle },
  { id: 'roi', label: 'ROI', icon: Circle },
]

interface View { zoom: number; px: number; py: number; rot: number; fh: boolean; fv: boolean }
const VIEW0: View = { zoom: 1, px: 0, py: 0, rot: 0, fh: false, fv: false }

function IconBtn({ on, title, onClick, children }: { on?: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      title={title}
      aria-label={title}
      aria-pressed={on}
      onClick={onClick}
      className={cx('grid size-9 shrink-0 place-items-center rounded-lg border', on ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface hover:bg-surface-2')}
    >
      {children}
    </button>
  )
}

function letters(v: number[]) {
  // vector de paciente (LPS) → letra dominante
  const ax = [0, 1, 2].sort((a, b) => Math.abs(v[b]) - Math.abs(v[a]))[0]
  return [['L', 'R'], ['P', 'A'], ['H', 'F']][ax][v[ax] >= 0 ? 0 : 1]
}

export interface ViewerHandle { canvas: HTMLCanvasElement | null; idx: number }

export default function Viewer({ series, onIndex, handle }: { series: Series; onIndex?: (i: number) => void; handle?: React.RefObject<ViewerHandle | null> }) {
  const n = series.images.length
  const [idx, setIdx] = useState(() => Math.floor(n / 2))
  const [frame, setFrame] = useState<Frame | null>(null)
  const [err, setErr] = useState('')
  const [wl, setWL] = useState<[number, number] | null>(null)
  const [invert, setInvert] = useState(false)
  const [view, setView] = useState<View>(VIEW0)
  const [tool, setTool] = useState<Tool>('wl')
  const [meas, setMeas] = useState<Record<number, Meas[]>>({})
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState(10)
  const [size, setSize] = useState({ w: 300, h: 300 })
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLCanvasElement>(document.createElement('canvas'))

  const cur = series.images[Math.min(idx, n - 1)]
  const inst: Instance = cur.inst
  const sp = inst.spacing
  const aspect = sp ? sp[0] / sp[1] : 1

  useEffect(() => onIndex?.(idx), [idx, onIndex])
  useEffect(() => {
    if (handle) handle.current = { canvas: cv.current, idx }
  })

  // decodificar cuadro actual (+ precarga de vecinos)
  useEffect(() => {
    let alive = true
    getFrame(cur.inst, cur.frame)
      .then((f) => {
        if (!alive) return
        setErr('')
        setFrame(f)
        setWL((w) => w ?? defaultWL(cur.inst, f))
      })
      .catch((e: Error) => alive && (setErr(e.message), setFrame(null)))
    for (const d of [1, -1, 2]) {
      const nb = series.images[idx + d]
      if (nb) getFrame(nb.inst, nb.frame).catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [cur, idx, series])

  // tamaño del lienzo
  useEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // cine
  useEffect(() => {
    if (!playing || n < 2) return
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 1000 / fps)
    return () => clearInterval(t)
  }, [playing, fps, n])

  // render de la imagen a resolución nativa (antes del dibujo final)
  useLayoutEffect(() => {
    if (!frame || !wl) return
    const c = img.current
    c.width = frame.w
    c.height = frame.h
    c.getContext('2d')!.putImageData(renderFrame(frame, wl[0], wl[1], invert !== (inst.photometric === 'MONOCHROME1')), 0, 0)
  }, [frame, wl, invert, inst])

  const matrix = useCallback(() => {
    const w = frame?.w ?? inst.cols, h = (frame?.h ?? inst.rows) * aspect
    const rotated = view.rot % 180 !== 0
    const fit = Math.min(size.w / (rotated ? h : w), size.h / (rotated ? w : h)) * 0.95
    const s = fit * view.zoom
    return new DOMMatrix()
      .translate(size.w / 2 + view.px, size.h / 2 + view.py)
      .rotate(view.rot)
      .scale(view.fh ? -s : s, (view.fv ? -s : s) * aspect)
      .translate(-(frame?.w ?? inst.cols) / 2, -(frame?.h ?? inst.rows) / 2)
  }, [frame, inst, aspect, size, view])

  const toImg = (sx: number, sy: number): P => {
    const p = matrix().inverse().transformPoint(new DOMPoint(sx, sy))
    return { x: p.x, y: p.y }
  }

  const unit = inst.modality === 'CT' ? ' HU' : ''
  const mm = (a: P, b: P) => (sp ? Math.hypot((b.x - a.x) * sp[1], (b.y - a.y) * sp[0]) : Math.hypot(b.x - a.x, b.y - a.y))
  const measText = useCallback(
    (m: Meas): string => {
      if (m.type === 'dist') return `${mm(m.pts[0], m.pts[1]).toFixed(1)} ${sp ? 'mm' : 'px'}`
      if (m.type === 'angle') {
        if (m.pts.length < 3) return ''
        const [a, b, c] = m.pts
        const k = sp ? [sp[1], sp[0]] : [1, 1]
        const v1 = [(a.x - b.x) * k[0], (a.y - b.y) * k[1]], v2 = [(c.x - b.x) * k[0], (c.y - b.y) * k[1]]
        const ang = (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1)))) * 180) / Math.PI
        return `${ang.toFixed(1)}°`
      }
      // ROI elipse
      if (!frame || frame.kind !== 'gray') return 'ROI (solo escala de grises)'
      const [p, q] = m.pts
      const cx0 = (p.x + q.x) / 2, cy0 = (p.y + q.y) / 2, rx = Math.abs(q.x - p.x) / 2, ry = Math.abs(q.y - p.y) / 2
      if (rx < 0.5 || ry < 0.5) return ''
      let s = 0, s2 = 0, cnt = 0, mn = Infinity, mx = -Infinity
      for (let y = Math.max(0, Math.floor(cy0 - ry)); y <= Math.min(frame.h - 1, Math.ceil(cy0 + ry)); y++)
        for (let x = Math.max(0, Math.floor(cx0 - rx)); x <= Math.min(frame.w - 1, Math.ceil(cx0 + rx)); x++) {
          if (((x + 0.5 - cx0) / rx) ** 2 + ((y + 0.5 - cy0) / ry) ** 2 > 1) continue
          const v = frame.data[y * frame.w + x]
          s += v
          s2 += v * v
          cnt++
          if (v < mn) mn = v
          if (v > mx) mx = v
        }
      if (!cnt) return ''
      const mean = s / cnt, sd = Math.sqrt(Math.max(0, s2 / cnt - mean * mean))
      const area = sp ? `${((Math.PI * rx * ry * sp[0] * sp[1]) / 100).toFixed(2)} cm²` : `${cnt} px`
      return `Media ${mean.toFixed(1)}${unit} · DE ${sd.toFixed(1)} · [${mn.toFixed(0)}, ${mx.toFixed(0)}] · ${area}`
    },
    [frame, sp, unit], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // dibujo final
  useLayoutEffect(() => {
    const c = cv.current!
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(size.w * dpr)
    c.height = Math.round(size.h * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size.w, size.h)
    if (!frame || !wl) return
    const M = matrix()
    ctx.save()
    ctx.setTransform(new DOMMatrix([dpr, 0, 0, dpr, 0, 0]).multiply(M))
    ctx.imageSmoothingEnabled = M.a * M.a + M.b * M.b < 9
    ctx.drawImage(img.current, 0, 0)
    ctx.restore()
    const S = (p: P) => M.transformPoint(new DOMPoint(p.x, p.y))
    ctx.lineWidth = 1.5
    ctx.font = '12px system-ui, sans-serif'
    const label = (t: string, x: number, y: number) => {
      if (!t) return
      const w = ctx.measureText(t).width
      ctx.fillStyle = 'rgba(0,0,0,.6)'
      ctx.fillRect(x - 2, y - 12, w + 4, 16)
      ctx.fillStyle = '#fde047'
      ctx.fillText(t, x, y)
    }
    for (const m of meas[idx] ?? []) {
      ctx.strokeStyle = m.done ? '#facc15' : '#22d3ee'
      ctx.fillStyle = ctx.strokeStyle
      const pts = m.pts.map(S)
      ctx.beginPath()
      if (m.type === 'roi') {
        const c0 = S({ x: (m.pts[0].x + m.pts[1].x) / 2, y: (m.pts[0].y + m.pts[1].y) / 2 })
        const ex = M.transformPoint(new DOMPoint((m.pts[0].x + m.pts[1].x) / 2 + Math.abs(m.pts[1].x - m.pts[0].x) / 2, (m.pts[0].y + m.pts[1].y) / 2))
        const ey = M.transformPoint(new DOMPoint((m.pts[0].x + m.pts[1].x) / 2, (m.pts[0].y + m.pts[1].y) / 2 + Math.abs(m.pts[1].y - m.pts[0].y) / 2))
        const rx = Math.hypot(ex.x - c0.x, ex.y - c0.y), ry = Math.hypot(ey.x - c0.x, ey.y - c0.y)
        ctx.ellipse(c0.x, c0.y, rx, ry, Math.atan2(ex.y - c0.y, ex.x - c0.x), 0, Math.PI * 2)
        ctx.stroke()
        label(measText(m), c0.x - rx, c0.y + ry + 16)
      } else {
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.stroke()
        for (const p of pts) ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5)
        const at = m.type === 'angle' ? (pts[1] ?? pts[0]) : pts[pts.length - 1]
        label(measText(m), at.x + 8, at.y - 6)
      }
    }
    // textos de esquina
    const ds = inst.ds
    ctx.fillStyle = '#e5e7eb'
    ctx.shadowColor = '#000'
    ctx.shadowBlur = 3
    const lines = (arr: string[], x: number, y: number, right = false, up = false) =>
      arr.filter(Boolean).forEach((t, i) => {
        ctx.textAlign = right ? 'right' : 'left'
        ctx.fillText(t, x, up ? y - i * 15 : y + i * 15)
      })
    const date = str(ds, 'x00080020')
    lines([str(ds, 'x00100010').replace(/\^/g, ' '), str(ds, 'x00100020'), date.length === 8 ? `${date.slice(6)}/${date.slice(4, 6)}/${date.slice(0, 4)}` : date], 8, 18)
    lines([[inst.modality, series.desc].filter(Boolean).join(' · '), `Im ${idx + 1}/${n}${inst.frames > 1 ? ` (cuadro ${cur.frame + 1})` : ''}`, str(ds, 'x00080080')], size.w - 8, 18, true)
    lines([frame.kind === 'gray' ? `C ${wl[0].toFixed(0)} / A ${wl[1].toFixed(0)}` : 'RGB', `Zoom ${(view.zoom * 100).toFixed(0)}%`], 8, size.h - 10, false, true)
    const th = ds.floatString('x00180050'), loc = ds.floatString('x00201041') ?? inst.position?.[2]
    lines([th ? `Grosor ${th} mm` : '', loc !== undefined ? `Pos ${loc.toFixed(1)} mm` : '', `${frame.w}×${frame.h}`], size.w - 8, size.h - 10, true, true)
    // marcadores de orientación
    if (inst.orientation) {
      const o = inst.orientation, inv = M.inverse()
      const dir = (sx: number, sy: number) => {
        const a = inv.transformPoint(new DOMPoint(0, 0)), b = inv.transformPoint(new DOMPoint(sx, sy))
        const dx = (b.x - a.x) * (sp?.[1] ?? 1), dy = (b.y - a.y) * (sp?.[0] ?? 1)
        return letters([o[0] * dx + o[3] * dy, o[1] * dx + o[4] * dy, o[2] * dx + o[5] * dy])
      }
      ctx.textAlign = 'center'
      ctx.fillStyle = '#93c5fd'
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.fillText(dir(1, 0), size.w - 14, size.h / 2)
      ctx.fillText(dir(-1, 0), 14, size.h / 2)
      ctx.fillText(dir(0, -1), size.w / 2, 40)
      ctx.fillText(dir(0, 1), size.w / 2, size.h - 30)
    }
    ctx.shadowBlur = 0
    ctx.textAlign = 'left'
  })

  // ---------- interacción ----------
  const ptrs = useRef(new Map<number, P>())
  const drag = useRef<{ mode: Tool | 'pinch'; start: P; last: P; acc: number; pinch?: { d: number; zoom: number; mid: P; px: number; py: number } } | null>(null)
  const rel = (e: { clientX: number; clientY: number }): P => {
    const r = cv.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const curMeas = meas[idx] ?? []
  const setCurMeas = (f: (m: Meas[]) => Meas[]) => setMeas((all) => ({ ...all, [idx]: f(all[idx] ?? []) }))

  const onDown = (e: React.PointerEvent) => {
    cv.current!.setPointerCapture(e.pointerId)
    const p = rel(e)
    ptrs.current.set(e.pointerId, p)
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()]
      // cancelar medición en curso iniciada por el primer dedo
      setCurMeas((ms) => ms.filter((m) => m.done || m.type === 'angle'))
      drag.current = { mode: 'pinch', start: p, last: p, acc: 0, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, px: view.px, py: view.py } }
      return
    }
    const mode: Tool = e.button === 2 ? 'wl' : e.button === 1 ? 'pan' : tool
    drag.current = { mode, start: p, last: p, acc: 0 }
    if (mode === 'dist' || mode === 'roi') {
      const ip = toImg(p.x, p.y)
      setCurMeas((ms) => [...ms, { type: mode, pts: [ip, ip] }])
    } else if (mode === 'angle') {
      const ip = toImg(p.x, p.y)
      setCurMeas((ms) => {
        const last = ms[ms.length - 1]
        if (last && last.type === 'angle' && !last.done) return [...ms.slice(0, -1), { ...last, pts: [...last.pts, ip] }]
        return [...ms, { type: 'angle', pts: [ip, ip] }]
      })
    }
  }

  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return
    const p = rel(e)
    ptrs.current.set(e.pointerId, p)
    const d = drag.current
    if (!d) return
    if (d.mode === 'pinch' && d.pinch && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      setView((v) => ({ ...v, zoom: Math.min(40, Math.max(0.1, (d.pinch!.zoom * dist) / Math.max(10, d.pinch!.d))), px: d.pinch!.px + mid.x - d.pinch!.mid.x, py: d.pinch!.py + mid.y - d.pinch!.mid.y }))
      return
    }
    const dx = p.x - d.last.x, dy = p.y - d.last.y
    d.last = p
    if (d.mode === 'wl' && frame?.kind === 'gray') {
      const k = Math.max(0.5, (frame.max - frame.min) / 600)
      setWL((w) => (w ? [w[0] + dy * k, Math.max(1, w[1] + dx * k)] : w))
    } else if (d.mode === 'pan') setView((v) => ({ ...v, px: v.px + dx, py: v.py + dy }))
    else if (d.mode === 'zoom') setView((v) => ({ ...v, zoom: Math.min(40, Math.max(0.1, v.zoom * Math.exp(-dy / 150))) }))
    else if (d.mode === 'stack') {
      d.acc += dy
      const steps = Math.trunc(d.acc / 8)
      if (steps) {
        d.acc -= steps * 8
        setIdx((i) => Math.max(0, Math.min(n - 1, i + steps)))
      }
    } else if (d.mode === 'dist' || d.mode === 'roi' || d.mode === 'angle') {
      const ip = toImg(p.x, p.y)
      setCurMeas((ms) => {
        const last = ms[ms.length - 1]
        if (!last || last.done) return ms
        return [...ms.slice(0, -1), { ...last, pts: [...last.pts.slice(0, -1), ip] }]
      })
    }
  }

  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId)
    const d = drag.current
    if (ptrs.current.size > 0) return
    drag.current = null
    if (!d || d.mode === 'pinch') return
    if (d.mode === 'dist' || d.mode === 'roi' || d.mode === 'angle') {
      const tiny = Math.hypot(d.last.x - d.start.x, d.last.y - d.start.y) < 4
      setCurMeas((ms) => {
        const last = ms[ms.length - 1]
        if (!last || last.done) return ms
        const rest = ms.slice(0, -1)
        if (last.type !== 'angle') return tiny ? rest : [...rest, { ...last, done: true }]
        if (last.pts.length === 3) return [...rest, { ...last, done: true }]
        // primer gesto con toque simple: queda solo el vértice A y se espera el siguiente punto
        if (tiny && last.pts.length === 2 && last.pts[0] === last.pts[1]) return [...rest, { ...last, pts: [last.pts[0]] }]
        return ms
      })
    }
  }

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) setView((v) => ({ ...v, zoom: Math.min(40, Math.max(0.1, v.zoom * Math.exp(-e.deltaY / 300))) }))
      else setIdx((i) => Math.max(0, Math.min(n - 1, i + Math.sign(e.deltaY))))
    },
    [n],
  )
  useEffect(() => {
    const c = cv.current!
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1))
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setIdx((i) => Math.min(n - 1, i + 1))
    else if (e.key === 'Escape') setCurMeas((ms) => ms.filter((m) => m.done))
    else return
    e.preventDefault()
  }

  const reset = () => {
    setView(VIEW0)
    setInvert(false)
    if (frame) setWL(defaultWL(inst, frame))
  }
  const presetVal = useMemo(() => Object.entries(PRESETS).find(([, v]) => wl && v[0] === wl[0] && v[1] === wl[1])?.[0] ?? '', [wl])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-2">
        {TOOLS.map((t) => (
          <IconBtn key={t.id} title={t.label} on={tool === t.id} onClick={() => setTool(t.id)}>
            <t.icon className="size-4" />
          </IconBtn>
        ))}
        <span className="mx-1 h-6 w-px bg-line" />
        <IconBtn title="Invertir" on={invert} onClick={() => setInvert((v) => !v)}>
          <SunMoon className="size-4" />
        </IconBtn>
        <IconBtn title="Rotar 90°" onClick={() => setView((v) => ({ ...v, rot: (v.rot + 90) % 360 }))}>
          <RotateCw className="size-4" />
        </IconBtn>
        <IconBtn title="Voltear horizontal" on={view.fh} onClick={() => setView((v) => ({ ...v, fh: !v.fh }))}>
          <SquareSplitHorizontal className="size-4" />
        </IconBtn>
        <IconBtn title="Voltear vertical" on={view.fv} onClick={() => setView((v) => ({ ...v, fv: !v.fv }))}>
          <SquareSplitVertical className="size-4" />
        </IconBtn>
        <IconBtn title="Deshacer medición" onClick={() => setCurMeas((ms) => ms.slice(0, -1))}>
          <Undo2 className="size-4" />
        </IconBtn>
        <IconBtn title="Borrar mediciones del corte" onClick={() => setCurMeas(() => [])}>
          <Eraser className="size-4" />
        </IconBtn>
        <IconBtn title="Restablecer" onClick={reset}>
          <RotateCcw className="size-4" />
        </IconBtn>
        <Select
          aria-label="Preajuste de ventana"
          className="h-9 w-auto! py-1"
          value={presetVal}
          disabled={frame?.kind !== 'gray'}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'auto') frame && setWL(defaultWL(inst, frame))
            else if (PRESETS[v]) setWL(PRESETS[v])
          }}
        >
          <option value="">Ventana…</option>
          <option value="auto">Auto (DICOM)</option>
          {Object.keys(PRESETS).map((k) => (
            <option key={k} value={k}>
              {k} ({PRESETS[k][0]}/{PRESETS[k][1]})
            </option>
          ))}
        </Select>
      </div>
      <div ref={wrap} className="relative min-h-[300px] flex-1 overflow-hidden bg-black" tabIndex={0} onKeyDown={onKey}>
        <canvas
          ref={cv}
          className="absolute inset-0 size-full touch-none select-none"
          style={{ cursor: tool === 'pan' ? 'grab' : tool === 'wl' ? 'ns-resize' : 'crosshair' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        {err && <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-lg bg-black/70 p-4 text-center text-sm text-amber-300">{err}</div>}
        {tool === 'angle' && curMeas.some((m) => m.type === 'angle' && !m.done && m.pts.length < 3) && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-1 text-xs text-cyan-300">Marca el siguiente punto</div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line p-2">
        <IconBtn title={playing ? 'Pausa' : 'Cine'} on={playing} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </IconBtn>
        <input
          type="range"
          aria-label="Corte"
          min={0}
          max={Math.max(0, n - 1)}
          value={idx}
          onChange={(e) => setIdx(+e.target.value)}
          className="min-w-0 flex-1 accent-[var(--color-brand)]"
        />
        <span className="w-16 text-right text-xs tabular-nums text-muted">
          {idx + 1}/{n}
        </span>
        <Select aria-label="Cuadros por segundo" className="h-9 w-24! py-1" value={fps} onChange={(e) => setFps(+e.target.value)}>
          {[2, 5, 10, 15, 24, 30].map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
