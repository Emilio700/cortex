import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { Pencil, MoveUpRight, Type, Ruler, Pentagon, Crosshair, Undo2, Trash2, Save } from 'lucide-react'
import type { DocumentFile } from '../../lib/types'
import { Card, Button, Field, Input, Select, Empty, Notice } from '../../components/ui'
import { cx, fmtFecha } from '../../lib/utils'
import { cargarImagen, guardarFoto, meta, recodificar } from './img'
import { pedirTexto } from '../../components/dialogos'

type Pt = { x: number; y: number }
type Forma =
  | { t: 'lapiz'; pts: Pt[]; c: string }
  | { t: 'flecha' | 'regla' | 'calib'; a: Pt; b: Pt; c: string }
  | { t: 'texto'; p: Pt; s: string; c: string }
  | { t: 'area'; pts: Pt[]; c: string; cerrada: boolean }
type Herr = 'lapiz' | 'flecha' | 'texto' | 'regla' | 'area' | 'calib'

const HERR: { id: Herr; label: string; icon: typeof Pencil }[] = [
  { id: 'lapiz', label: 'Lápiz', icon: Pencil },
  { id: 'flecha', label: 'Flecha', icon: MoveUpRight },
  { id: 'texto', label: 'Texto', icon: Type },
  { id: 'calib', label: 'Calibrar', icon: Crosshair },
  { id: 'regla', label: 'Regla', icon: Ruler },
  { id: 'area', label: 'Área', icon: Pentagon },
]
const COLORES = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#000000']
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const areaPx = (p: Pt[]) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q.x * r.y - r.x * q.y }, 0)) / 2

export default function Anotar({ fotos, fotoId, setFotoId, patientId, onGuardada }: { fotos: DocumentFile[]; fotoId: string | null; setFotoId: (id: string | null) => void; patientId: string | null; onGuardada: () => void }) {
  const foto = fotos.find((f) => f.id === fotoId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [formas, setFormas] = useState<Forma[]>([])
  const [actual, setActual] = useState<Forma | null>(null)
  const [herr, setHerr] = useState<Herr>('lapiz')
  const [color, setColor] = useState(COLORES[0])
  const [refMm, setRefMm] = useState('10')
  const [mmPx, setMmPx] = useState<number | null>(null)
  const [ok, setOk] = useState('')

  useEffect(() => {
    setFormas([]); setActual(null); setOk('')
    setMmPx(foto ? meta(foto).mmPorPx ?? null : null)
    if (!foto) return
    let vivo = true
    cargarImagen(foto.dataUrl).then((i) => { if (vivo) { imgRef.current = i; dibujar() } })
    return () => { vivo = false }
  }, [foto?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmtLen = (px: number) => (mmPx ? `${(px * mmPx).toFixed(1)} mm` : `${Math.round(px)} px`)
  const fmtArea = (px2: number) => (mmPx ? `${(px2 * mmPx * mmPx).toFixed(1)} mm²` : `${Math.round(px2)} px²`)

  const dibujar = (extra: Forma | null = actual, lista = formas) => {
    const c = canvasRef.current, img = imgRef.current
    if (!c || !img) return
    if (c.width !== img.naturalWidth) { c.width = img.naturalWidth; c.height = img.naturalHeight }
    const g = c.getContext('2d')!
    const lw = Math.max(2, c.width / 350)
    g.drawImage(img, 0, 0)
    g.lineCap = 'round'; g.lineJoin = 'round'
    g.font = `600 ${Math.round(lw * 7)}px system-ui, sans-serif`
    const etiqueta = (s: string, p: Pt, col: string) => {
      g.lineWidth = lw * 1.6; g.strokeStyle = col === '#000000' ? '#fff' : 'rgba(0,0,0,.75)'; g.strokeText(s, p.x, p.y)
      g.fillStyle = col; g.fillText(s, p.x, p.y)
    }
    for (const f of [...lista, ...(extra ? [extra] : [])]) {
      g.strokeStyle = f.c; g.fillStyle = f.c; g.lineWidth = lw
      if (f.t === 'lapiz') {
        g.beginPath(); f.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke()
      } else if (f.t === 'texto') {
        etiqueta(f.s, f.p, f.c)
      } else if (f.t === 'area') {
        g.beginPath(); f.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
        if (f.cerrada) g.closePath()
        g.stroke()
        g.globalAlpha = 0.2; if (f.cerrada) g.fill(); g.globalAlpha = 1
        f.pts.forEach((p) => { g.beginPath(); g.arc(p.x, p.y, lw * 1.5, 0, 7); g.fill() })
        if (f.cerrada && f.pts.length > 2) {
          const cx_ = f.pts.reduce((s, p) => s + p.x, 0) / f.pts.length, cy = f.pts.reduce((s, p) => s + p.y, 0) / f.pts.length
          etiqueta(fmtArea(areaPx(f.pts)), { x: cx_, y: cy }, f.c)
        }
      } else {
        const { a, b } = f
        g.setLineDash(f.t === 'calib' ? [lw * 3, lw * 2] : [])
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke()
        g.setLineDash([])
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        if (f.t === 'flecha') {
          const h = lw * 6
          g.beginPath(); g.moveTo(b.x, b.y)
          g.lineTo(b.x - h * Math.cos(ang - 0.45), b.y - h * Math.sin(ang - 0.45))
          g.lineTo(b.x - h * Math.cos(ang + 0.45), b.y - h * Math.sin(ang + 0.45)); g.closePath(); g.fill()
        } else {
          const t = lw * 4, nx = -Math.sin(ang) * t, ny = Math.cos(ang) * t
          for (const p of [a, b]) { g.beginPath(); g.moveTo(p.x - nx, p.y - ny); g.lineTo(p.x + nx, p.y + ny); g.stroke() }
          const mid = { x: (a.x + b.x) / 2 + nx * 1.5, y: (a.y + b.y) / 2 + ny * 1.5 }
          etiqueta(f.t === 'calib' ? `ref ${refMm} mm` : fmtLen(dist(a, b)), mid, f.c)
        }
      }
    }
  }
  useEffect(() => dibujar(), [formas, actual, mmPx]) // eslint-disable-line react-hooks/exhaustive-deps

  const punto = (e: RPE<HTMLCanvasElement>): Pt => {
    const c = canvasRef.current!, r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }

  const down = (e: RPE<HTMLCanvasElement>) => {
    const p = punto(e)
    if (herr === 'texto') {
      void pedirTexto('Texto de la anotación').then((s) => {
        if (s) setFormas((fs) => [...fs, { t: 'texto', p, s, c: color }])
      })
      return
    }
    if (herr === 'area') {
      if (actual?.t === 'area' && !actual.cerrada) {
        const f = actual.pts[0]
        if (actual.pts.length > 2 && dist(f, p) < canvasRef.current!.width / 60) return cerrarArea()
        if (dist(actual.pts[actual.pts.length - 1], p) < 2) return // doble clic
        setActual({ ...actual, pts: [...actual.pts, p] })
      } else setActual({ t: 'area', pts: [p], c: color, cerrada: false })
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setActual(herr === 'lapiz' ? { t: 'lapiz', pts: [p], c: color } : { t: herr, a: p, b: p, c: herr === 'calib' ? '#facc15' : color })
  }
  const move = (e: RPE<HTMLCanvasElement>) => {
    if (!actual || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const p = punto(e)
    if (actual.t === 'lapiz') setActual({ ...actual, pts: [...actual.pts, p] })
    else if ('a' in actual) setActual({ ...actual, b: p })
  }
  const up = () => {
    if (!actual || actual.t === 'area') return
    if ('a' in actual && dist(actual.a, actual.b) < 3) return setActual(null)
    if (actual.t === 'calib') {
      const mm = parseFloat(refMm.replace(',', '.'))
      if (mm > 0) setMmPx(mm / dist(actual.a, actual.b))
      setFormas([...formas.filter((f) => f.t !== 'calib'), actual])
    } else setFormas([...formas, actual])
    setActual(null)
  }
  const cerrarArea = () => {
    if (actual?.t === 'area' && actual.pts.length > 2) setFormas([...formas, { ...actual, cerrada: true }])
    setActual(null)
  }

  const guardar = () => {
    const c = canvasRef.current
    if (!c || !foto || !patientId) return
    dibujar(null)
    const m = meta(foto)
    guardarFoto(patientId, recodificar(c, c.width, c.height, 0.9), { zona: m.zona ?? 'Otra', nota: [m.nota, 'Copia anotada'].filter(Boolean).join(' · '), origen: 'anotada', baseId: foto.id, mmPorPx: mmPx ?? undefined })
    setOk('Copia anotada guardada en la galería.')
    onGuardada()
  }

  const ordenadas = [...fotos].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Foto" className="min-w-56 flex-1">
            <Select value={fotoId ?? ''} onChange={(e) => setFotoId(e.target.value || null)}>
              <option value="">Elegir…</option>
              {ordenadas.map((f) => <option key={f.id} value={f.id}>{meta(f).zona} · {fmtFecha(f.fecha)}{meta(f).origen === 'anotada' ? ' (anotada)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Referencia de calibración (mm)" className="w-48">
            <Input type="number" min="0.1" step="0.1" value={refMm} onChange={(e) => setRefMm(e.target.value)} />
          </Field>
          <div className="pb-1 text-sm">{mmPx ? <span className="text-ok">Calibrado: {(1 / mmPx).toFixed(2)} px/mm</span> : <span className="text-muted">Sin calibrar (medidas en px)</span>}</div>
        </div>
      </Card>
      {!foto ? <Empty>Elige una foto para anotar y medir.</Empty> : (
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-1 border-b border-line p-2">
            {HERR.map((h) => (
              <Button key={h.id} size="sm" variant={herr === h.id ? 'primary' : 'ghost'} onClick={() => { if (actual?.t === 'area') cerrarArea(); setHerr(h.id) }} title={h.label}>
                <h.icon className="size-4" /><span className="hidden sm:inline">{h.label}</span>
              </Button>
            ))}
            <span className="mx-1 h-6 w-px bg-line" />
            {COLORES.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={'Color ' + c} className={cx('size-6 rounded-full border-2', color === c ? 'border-brand' : 'border-line')} style={{ background: c }} />
            ))}
            <span className="mx-1 h-6 w-px bg-line" />
            {actual?.t === 'area' && <Button size="sm" onClick={cerrarArea}>Cerrar polígono</Button>}
            <Button size="sm" variant="ghost" onClick={() => setFormas(formas.slice(0, -1))} disabled={!formas.length} title="Deshacer"><Undo2 className="size-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => { setFormas([]); setActual(null) }} title="Borrar todo"><Trash2 className="size-4" /></Button>
            <Button size="sm" variant="primary" className="ml-auto" onClick={guardar} disabled={!patientId}><Save className="size-4" />Guardar copia</Button>
          </div>
          <div className="bg-black/90 p-2">
            <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={cerrarArea}
              className="mx-auto block max-h-[70vh] max-w-full touch-none cursor-crosshair" />
          </div>
          <div className="p-3 text-xs text-muted">
            {herr === 'calib' && 'Traza una línea sobre un objeto de tamaño conocido (p. ej. una regla o calcomanía de 10 mm) para convertir píxeles a milímetros.'}
            {herr === 'regla' && 'Arrastra para medir una distancia.'}
            {herr === 'area' && 'Haz clic en cada vértice; cierra con doble clic, tocando el primer punto o “Cerrar polígono”.'}
            {herr === 'texto' && 'Toca donde quieras colocar el texto.'}
            {(herr === 'lapiz' || herr === 'flecha') && 'Dibuja sobre la foto. La original no se modifica: se guarda una copia.'}
          </div>
        </Card>
      )}
      {ok && <Notice onClose={() => setOk('')}>{ok}</Notice>}
      <p className="text-xs text-muted">La medición asume que la referencia está en el mismo plano y a la misma distancia que la lesión, con la cámara perpendicular.</p>
    </div>
  )
}
