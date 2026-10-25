import { useEffect, useRef, useState, useCallback } from 'react'
import OpenSeadragon from 'openseadragon'
import {
  ImageUp, Link2, Sparkles, Hand, Square, MapPin, Spline, RotateCw, RotateCcw, Maximize, Minimize, Home, Save, Download, Upload, Trash, Check,
  LoaderCircle, ZoomIn, ZoomOut, Crosshair,
} from 'lucide-react'
import { Page, Card, Button, Input, Field, Notice, PatientBar, Disclaimer, Empty } from '../../components/ui'
import { add, useActivePatient } from '../../lib/store'
import { cx, downloadBlob } from '../../lib/utils'
import { syntheticSlide } from './tissue'

type Mode = 'nav' | 'rect' | 'point' | 'line'
type Pt = [number, number]
interface Ann { id: string; type: 'rect' | 'point' | 'line'; pts: Pt[]; label: string; color: string }

const COLORS = ['#22c55e', '#facc15', '#38bdf8', '#f97316', '#e11d48', '#a855f7']
const MODES: { id: Mode; label: string; icon: typeof Hand }[] = [
  { id: 'nav', label: 'Navegar', icon: Hand },
  { id: 'rect', label: 'Rectángulo', icon: Square },
  { id: 'point', label: 'Punto', icon: MapPin },
  { id: 'line', label: 'Polilínea / medir', icon: Spline },
]

function niceLen(v: number) {
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 5, 10].map((k) => k * p).filter((x) => x <= v).pop() ?? p
}
const fmtLen = (um: number) => (um >= 1000 ? `${(um / 1000).toFixed(um >= 10000 ? 1 : 2)} mm` : `${um.toFixed(um < 10 ? 1 : 0)} µm`)

function IconBtn({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx('grid size-9 shrink-0 place-items-center rounded-lg border disabled:opacity-40', on ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface hover:bg-surface-2')}
    >
      {children}
    </button>
  )
}

export default function Modulo() {
  const osdEl = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const viewer = useRef<OpenSeadragon.Viewer | null>(null)
  const objUrl = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const [, setTick] = useState(0)
  const [opened, setOpened] = useState<{ name: string; w: number; h: number } | null>(null)
  const [mode, setMode] = useState<Mode>('nav')
  const [anns, setAnns] = useState<Ann[]>([])
  const [draft, setDraft] = useState<Ann | null>(null)
  const [hover, setHover] = useState<Pt | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [umpx, setUmpx] = useState<number>(0)
  const [full, setFull] = useState(false)
  const [dzi, setDzi] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const { patient } = useActivePatient()

  // crear visor
  useEffect(() => {
    const v = OpenSeadragon({
      element: osdEl.current!,
      drawer: 'canvas',
      showNavigationControl: false,
      showNavigator: true,
      navigatorPosition: 'BOTTOM_RIGHT',
      navigatorSizeRatio: 0.18,
      maxZoomPixelRatio: 4,
      visibilityRatio: 0.5,
      crossOriginPolicy: 'Anonymous',
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      gestureSettingsTouch: { pinchRotate: true },
    })
    viewer.current = v
    const bump = () => setTick((t) => t + 1)
    v.addHandler('animation', bump)
    v.addHandler('update-viewport', bump)
    v.addHandler('resize', bump)
    v.addHandler('rotate', bump)
    v.addHandler('open', () => {
      const sz = v.world.getItemAt(0)?.getContentSize()
      setOpened((o) => ({ name: o?.name ?? 'imagen', w: sz?.x ?? 0, h: sz?.y ?? 0 }))
      setBusy('')
      bump()
    })
    v.addHandler('open-failed', (e) => {
      setBusy('')
      setOpened(null)
      setMsg({ tone: 'danger', text: `No se pudo abrir la imagen: ${(e as unknown as { message?: string }).message ?? 'error'}. Si es una URL DZI externa, el servidor debe permitir CORS.` })
    })
    return () => {
      v.destroy()
      viewer.current = null
      if (objUrl.current) URL.revokeObjectURL(objUrl.current)
    }
  }, [])

  // navegación desactivada mientras se dibuja
  useEffect(() => {
    viewer.current?.setMouseNavEnabled(mode === 'nav')
    setDraft(null)
  }, [mode])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    const t = setTimeout(() => v.forceResize(), 50)
    return () => clearTimeout(t)
  }, [full])

  const openSource = (src: string | OpenSeadragon.TileSourceOptions, name: string) => {
    setBusy('Abriendo…')
    setMsg(null)
    setAnns([])
    setOpened({ name, w: 0, h: 0 })
    viewer.current?.open(src as never)
  }

  const openBlob = (b: Blob, name: string) => {
    if (objUrl.current) URL.revokeObjectURL(objUrl.current)
    objUrl.current = URL.createObjectURL(b)
    openSource({ type: 'image', url: objUrl.current } as OpenSeadragon.TileSourceOptions, name)
  }

  const demo = async () => {
    setBusy('Generando laminilla sintética 4096×4096…')
    await new Promise((r) => setTimeout(r, 30))
    try {
      openBlob(await syntheticSlide(4096), 'laminilla-sintetica-HE.jpg')
      setUmpx(0.5)
      setMsg({ tone: 'info', text: 'Laminilla sintética tipo H&E (4096×4096 px) generada en el navegador. Escala supuesta: 0.5 µm/px (objetivo 20×).' })
    } catch (e) {
      setBusy('')
      setMsg({ tone: 'danger', text: (e as Error).message })
    }
  }

  // ---------- coordenadas ----------
  const toScreen = useCallback((p: Pt) => {
    const v = viewer.current
    if (!v || !opened?.w) return { x: -1e5, y: -1e5 }
    const q = v.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(p[0], p[1]))
    return { x: q.x, y: q.y }
  }, [opened])
  const toImage = (e: React.PointerEvent): Pt => {
    const r = osdEl.current!.getBoundingClientRect()
    const q = viewer.current!.viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(e.clientX - r.left, e.clientY - r.top))
    return [q.x, q.y]
  }
  const scale = (() => {
    const a = toScreen([0, 0]), b = toScreen([1000, 0])
    return Math.hypot(b.x - a.x, b.y - a.y) / 1000 // px pantalla por px imagen
  })()

  const measure = (a: Ann) => {
    const k = umpx || 0
    const u = (px: number) => (k ? fmtLen(px * k) : `${px.toFixed(0)} px`)
    if (a.type === 'line') {
      let L = 0
      for (let i = 1; i < a.pts.length; i++) L += Math.hypot(a.pts[i][0] - a.pts[i - 1][0], a.pts[i][1] - a.pts[i - 1][1])
      return u(L)
    }
    if (a.type === 'rect') {
      const w = Math.abs(a.pts[1][0] - a.pts[0][0]), h = Math.abs(a.pts[1][1] - a.pts[0][1])
      const area = k ? (w * h * k * k >= 1e6 ? `${((w * h * k * k) / 1e6).toFixed(3)} mm²` : `${(w * h * k * k).toFixed(0)} µm²`) : `${(w * h).toFixed(0)} px²`
      return `${u(w)} × ${u(h)} · ${area}`
    }
    return `(${a.pts[0][0].toFixed(0)}, ${a.pts[0][1].toFixed(0)})`
  }

  // ---------- dibujo ----------
  const newAnn = (type: Ann['type'], pts: Pt[]): Ann => ({ id: Math.random().toString(36).slice(2, 9), type, pts, color, label: '' })
  const commit = (a: Ann) => {
    const n = anns.length + 1
    const label = a.type === 'point' ? `Punto ${n}` : a.type === 'rect' ? `Región ${n}` : `Medición ${n}`
    setAnns((x) => [...x, { ...a, label }])
    setSel(a.id)
    setDraft(null)
  }
  const onDown = (e: React.PointerEvent) => {
    if (mode === 'nav' || !opened?.w) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = toImage(e)
    if (mode === 'point') commit(newAnn('point', [p]))
    else if (mode === 'rect') setDraft(newAnn('rect', [p, p]))
    else if (mode === 'line') setDraft((d) => (d ? { ...d, pts: [...d.pts, p] } : newAnn('line', [p])))
  }
  const onMove = (e: React.PointerEvent) => {
    if (mode === 'nav' || !opened?.w) return
    const p = toImage(e)
    setHover(p)
    if (mode === 'rect' && draft && e.buttons) setDraft({ ...draft, pts: [draft.pts[0], p] })
  }
  const onUp = () => {
    if (mode === 'rect' && draft) {
      const [a, b] = draft.pts
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) * scale > 5) commit(draft)
      else setDraft(null)
    }
  }
  const finishLine = () => {
    // el doble clic agrega vértices repetidos: se eliminan
    const pts = draft?.pts.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) * scale > 3) ?? []
    if (draft && draft.type === 'line' && pts.length >= 2) commit({ ...draft, pts })
    else setDraft(null)
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(null)
      if (e.key === 'Enter') finishLine()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const shapes = [...anns, ...(draft ? [{ ...draft, pts: draft.type === 'line' && hover ? [...draft.pts, hover] : draft.pts }] : [])]

  // barra de escala
  const bar = umpx && scale ? (() => {
    const um = niceLen((140 / scale) * umpx)
    return { um, px: (um / umpx) * scale }
  })() : null

  // ---------- acciones ----------
  const rotate = (d: number) => {
    const v = viewer.current
    if (v) v.viewport.setRotation((v.viewport.getRotation() + d + 360) % 360)
  }
  const zoom = (f: number) => viewer.current?.viewport.zoomBy(f)
  const focus = (a: Ann) => {
    const v = viewer.current
    if (!v) return
    const xs = a.pts.map((p) => p[0]), ys = a.pts.map((p) => p[1])
    const pad = a.type === 'point' ? 200 : 0.3 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 50)
    v.viewport.fitBounds(v.viewport.imageToViewportRectangle(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad))
    setSel(a.id)
  }

  const exportJson = () =>
    downloadBlob(new Blob([JSON.stringify({ formato: 'medisuite-anotaciones/1', imagen: opened, umPorPx: umpx || null, anotaciones: anns }, null, 2)], { type: 'application/json' }), `anotaciones-${(opened?.name ?? 'imagen').replace(/\.\w+$/, '')}.json`)
  const importJson = async (f: File) => {
    try {
      const j = JSON.parse(await f.text())
      const list = (j.anotaciones ?? j.annotations ?? j) as Ann[]
      if (!Array.isArray(list)) throw new Error('formato no reconocido')
      setAnns(list.filter((a) => a && Array.isArray(a.pts) && ['rect', 'point', 'line'].includes(a.type)).map((a) => ({ ...a, id: a.id ?? Math.random().toString(36).slice(2, 9), color: a.color ?? COLORS[0], label: a.label ?? '' })))
      if (j.umPorPx) setUmpx(+j.umPorPx)
      setMsg({ tone: 'info', text: `${list.length} anotación(es) importada(s).` })
    } catch (e) {
      setMsg({ tone: 'danger', text: `JSON inválido: ${(e as Error).message}` })
    }
  }

  const snapshot = (): string | null => {
    const v = viewer.current
    const src = (v?.drawer as unknown as { canvas?: HTMLCanvasElement })?.canvas
    if (!v || !src || !osdEl.current) return null
    const k = src.width / osdEl.current.clientWidth
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(src, 0, 0)
    g.scale(k, k)
    g.lineWidth = 2
    g.font = 'bold 13px system-ui, sans-serif'
    for (const a of anns) {
      const s = a.pts.map(toScreen)
      g.strokeStyle = g.fillStyle = a.color
      g.beginPath()
      if (a.type === 'rect') g.rect(Math.min(s[0].x, s[1].x), Math.min(s[0].y, s[1].y), Math.abs(s[1].x - s[0].x), Math.abs(s[1].y - s[0].y))
      else if (a.type === 'line') s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
      else g.arc(s[0].x, s[0].y, 6, 0, Math.PI * 2)
      a.type === 'point' ? g.fill() : g.stroke()
      const t = `${a.label}${a.type !== 'point' ? ' · ' + measure(a) : ''}`
      g.fillStyle = 'rgba(0,0,0,.65)'
      g.fillRect(s[0].x + 6, s[0].y - 20, g.measureText(t).width + 8, 18)
      g.fillStyle = '#fff'
      g.fillText(t, s[0].x + 10, s[0].y - 6)
    }
    if (bar) {
      const y = osdEl.current.clientHeight - 20
      g.fillStyle = 'rgba(0,0,0,.6)'
      g.fillRect(8, y - 22, bar.px + 16, 32)
      g.fillStyle = '#fff'
      g.fillRect(16, y, bar.px, 4)
      g.fillText(fmtLen(bar.um), 16, y - 6)
    }
    try {
      return c.toDataURL('image/jpeg', 0.92)
    } catch {
      setMsg({ tone: 'danger', text: 'No se puede capturar: la imagen remota no permite CORS.' })
      return null
    }
  }

  const save = () => {
    const url = snapshot()
    if (!url || !patient) return
    add('documents', {
      patientId: patient.id,
      tipo: 'estudio',
      nombre: `Patología · ${opened?.name ?? 'imagen'} (anotada).jpg`,
      mime: 'image/jpeg',
      dataUrl: url,
      meta: { origen: 'patologia', imagen: opened, umPorPx: umpx || null, anotaciones: anns },
    })
    setMsg({ tone: 'info', text: `Captura anotada guardada en el expediente de ${patient.nombre}.` })
  }

  const selAnn = anns.find((a) => a.id === sel)

  return (
    <Page
      title="Patología y zoom profundo"
      subtitle="Laminillas, dermatoscopia y retina con OpenSeadragon. Anota regiones, puntos y mediciones."
      actions={
        <>
          <Button onClick={() => fileRef.current?.click()}>
            <ImageUp className="size-4" /> Imagen
          </Button>
          <Button variant="primary" onClick={demo} disabled={!!busy}>
            <Sparkles className="size-4" /> Laminilla demo
          </Button>
        </>
      }
    >
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="pat-file" onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) openBlob(f, f.name)
        e.target.value = ''
      }} />
      <input ref={jsonRef} type="file" accept=".json,application/json" hidden data-testid="pat-json" onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) importJson(f)
        e.target.value = ''
      }} />
      <PatientBar />
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (dzi.trim()) openSource(dzi.trim(), dzi.trim().split('/').pop() ?? 'dzi')
        }}
      >
        <Input placeholder="URL de imagen DZI / IIIF info.json (opcional)" value={dzi} onChange={(e) => setDzi(e.target.value)} />
        <Button type="submit" disabled={!dzi.trim()}>
          <Link2 className="size-4" /> Abrir
        </Button>
      </form>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div ref={wrap} className={cx('min-w-0 overflow-hidden border border-line bg-surface', full ? 'fixed inset-0 z-50 flex flex-col' : 'rounded-xl')}>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-2">
            {MODES.map((m) => (
              <IconBtn key={m.id} title={m.label} on={mode === m.id} onClick={() => setMode(m.id)} disabled={!opened}>
                <m.icon className="size-4" />
              </IconBtn>
            ))}
            {mode === 'line' && draft && (
              <Button size="sm" variant="primary" onClick={finishLine}>
                <Check className="size-4" /> Terminar
              </Button>
            )}
            <span className="mx-1 h-6 w-px bg-line" />
            <IconBtn title="Acercar" onClick={() => zoom(1.5)} disabled={!opened}>
              <ZoomIn className="size-4" />
            </IconBtn>
            <IconBtn title="Alejar" onClick={() => zoom(1 / 1.5)} disabled={!opened}>
              <ZoomOut className="size-4" />
            </IconBtn>
            <IconBtn title="Rotar a la izquierda" onClick={() => rotate(-90)} disabled={!opened}>
              <RotateCcw className="size-4" />
            </IconBtn>
            <IconBtn title="Rotar a la derecha" onClick={() => rotate(90)} disabled={!opened}>
              <RotateCw className="size-4" />
            </IconBtn>
            <IconBtn title="Vista completa" onClick={() => viewer.current?.viewport.goHome()} disabled={!opened}>
              <Home className="size-4" />
            </IconBtn>
            <IconBtn title={full ? 'Salir de pantalla completa' : 'Pantalla completa'} on={full} onClick={() => setFull((f) => !f)}>
              {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </IconBtn>
            <div className="ml-auto flex gap-1">
              {COLORS.map((c) => (
                <button key={c} aria-label={`Color ${c}`} onClick={() => setColor(c)} className={cx('size-6 rounded-full border-2', color === c ? 'border-ink' : 'border-transparent')} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className={cx('relative bg-neutral-900', full ? 'flex-1' : 'h-[65vh] min-h-[380px]')}>
            <div ref={osdEl} className="absolute inset-0" />
            <svg
              className={cx('absolute inset-0 size-full touch-none', mode === 'nav' ? 'pointer-events-none' : 'cursor-crosshair')}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onDoubleClick={finishLine}
            >
              {shapes.map((a) => {
                const s = a.pts.map(toScreen)
                const isSel = a.id === sel
                const sw = isSel ? 3 : 2
                return (
                  <g key={a.id} stroke={a.color} fill="none" strokeWidth={sw}>
                    {a.type === 'rect' && <rect x={Math.min(s[0].x, s[1].x)} y={Math.min(s[0].y, s[1].y)} width={Math.abs(s[1].x - s[0].x)} height={Math.abs(s[1].y - s[0].y)} fill={a.color + '22'} />}
                    {a.type === 'line' && <polyline points={s.map((p) => `${p.x},${p.y}`).join(' ')} />}
                    {a.type === 'line' && s.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={a.color} />)}
                    {a.type === 'point' && <circle cx={s[0].x} cy={s[0].y} r={isSel ? 8 : 6} fill={a.color} stroke="#fff" strokeWidth={2} />}
                    {(a.label || a === draft) && (
                      <text x={s[0].x + 8} y={s[0].y - 8} fill="#fff" stroke="#000" strokeWidth={3} paintOrder="stroke" fontSize={12} fontWeight={600}>
                        {a.label}
                        {a.type !== 'point' ? `${a.label ? ' · ' : ''}${measure(a)}` : ''}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
            {bar && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
                {fmtLen(bar.um)}
                <div className="mt-1 h-1 bg-white" style={{ width: bar.px }} />
              </div>
            )}
            {!opened && !busy && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">Abre una imagen (JPG/PNG/TIFF convertida) o genera la laminilla demo.</div>
            )}
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 text-sm text-white">
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" /> {busy}
                </span>
              </div>
            )}
          </div>
          {opened && (
            <div className="flex flex-wrap gap-x-4 border-t border-line px-3 py-1.5 text-xs text-muted">
              <span className="truncate">{opened.name}</span>
              {opened.w > 0 && (
                <span>
                  {opened.w}×{opened.h} px
                </span>
              )}
              {hover && mode !== 'nav' && (
                <span className="flex items-center gap-1">
                  <Crosshair className="size-3" /> {hover[0].toFixed(0)}, {hover[1].toFixed(0)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="Calibración">
            <Field label="Micras por píxel (µm/px)" hint="20× ≈ 0.5 · 40× ≈ 0.25. Déjalo en 0 para medir en píxeles.">
              <Input type="number" min={0} step={0.01} value={umpx || ''} placeholder="0" onChange={(e) => setUmpx(Math.max(0, +e.target.value || 0))} />
            </Field>
          </Card>
          <Card
            title={`Anotaciones (${anns.length})`}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => jsonRef.current?.click()} title="Importar JSON">
                  <Upload className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={exportJson} disabled={!anns.length} title="Exportar JSON">
                  <Download className="size-4" />
                </Button>
              </>
            }
          >
            {!anns.length ? (
              <Empty>Elige rectángulo, punto o polilínea y marca sobre la imagen. Polilínea: clic por vértice, doble clic o Enter para terminar.</Empty>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-auto">
                {anns.map((a) => (
                  <li key={a.id} className={cx('flex items-center gap-2 rounded-lg px-2 py-1 text-sm', sel === a.id && 'bg-surface-2')}>
                    <span className="size-3 shrink-0 rounded-full" style={{ background: a.color }} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => focus(a)}>
                      <div className="truncate font-medium">{a.label || '(sin etiqueta)'}</div>
                      <div className="truncate text-xs text-muted">{measure(a)}</div>
                    </button>
                    <button aria-label="Eliminar" className="text-muted hover:text-danger" onClick={() => setAnns((x) => x.filter((y) => y.id !== a.id))}>
                      <Trash className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selAnn && (
              <Field label="Etiqueta de la anotación seleccionada" className="mt-3">
                <Input value={selAnn.label} onChange={(e) => setAnns((x) => x.map((y) => (y.id === selAnn.id ? { ...y, label: e.target.value } : y)))} />
              </Field>
            )}
          </Card>
          <Card title="Guardar">
            <div className="grid gap-2">
              <Button variant="primary" onClick={save} disabled={!opened?.w || !patient}>
                <Save className="size-4" /> Guardar captura anotada
              </Button>
              <Button onClick={() => {
                const u = snapshot()
                if (u) downloadBlob(u, 'patologia-anotada.jpg')
              }} disabled={!opened?.w}>
                <Download className="size-4" /> Descargar captura
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">Para laminillas WSI (.svs, .ndpi, .mrxs) convierte a DZI en servidor (vips dzsave) y abre la URL.</p>
          </Card>
        </div>
      </div>
      <Disclaimer>Visor de apoyo. El diagnóstico histopatológico corresponde al patólogo; las mediciones dependen de la calibración µm/px.</Disclaimer>
    </Page>
  )
}
