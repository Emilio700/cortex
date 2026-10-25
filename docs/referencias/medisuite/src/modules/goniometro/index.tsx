import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Upload, Square, Save, RotateCcw, FlipHorizontal } from 'lucide-react'
import type { PoseLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, CartesianGrid } from 'recharts'
import { Page, Card, Button, Field, Select, Stat, Notice, PatientBar, Unsupported, Disclaimer, Empty, Badge } from '../../components/ui'
import { add, useActivePatient, useCollection } from '../../lib/store'
import { fmtFecha } from '../../lib/utils'
import { crearPoseLandmarker, detener, hayCamara } from '../pulso/mp'

type Modo = 'flex' | 'directo' | 'tobillo'
type Preset = { id: string; nombre: string; idx: [number, number, number]; modo: Modo; normal: [number, number]; nota: string }

// Índices de MediaPipe Pose (izquierda/derecha = lado del paciente)
const PRESETS: Preset[] = [
  { id: 'rodD', nombre: 'Flexión de rodilla derecha', idx: [24, 26, 28], modo: 'flex', normal: [0, 135], nota: 'Vista lateral, paciente en decúbito o de pie.' },
  { id: 'rodI', nombre: 'Flexión de rodilla izquierda', idx: [23, 25, 27], modo: 'flex', normal: [0, 135], nota: 'Vista lateral, paciente en decúbito o de pie.' },
  { id: 'cadD', nombre: 'Flexión de cadera derecha', idx: [12, 24, 26], modo: 'flex', normal: [0, 120], nota: 'Vista lateral; tronco como brazo fijo.' },
  { id: 'cadI', nombre: 'Flexión de cadera izquierda', idx: [11, 23, 25], modo: 'flex', normal: [0, 120], nota: 'Vista lateral; tronco como brazo fijo.' },
  { id: 'homD', nombre: 'Abducción de hombro derecho', idx: [24, 12, 14], modo: 'directo', normal: [0, 180], nota: 'Vista frontal, brazo en plano coronal.' },
  { id: 'homI', nombre: 'Abducción de hombro izquierdo', idx: [23, 11, 13], modo: 'directo', normal: [0, 180], nota: 'Vista frontal, brazo en plano coronal.' },
  { id: 'codD', nombre: 'Flexión de codo derecho', idx: [12, 14, 16], modo: 'flex', normal: [0, 150], nota: 'Vista lateral, antebrazo en supinación.' },
  { id: 'codI', nombre: 'Flexión de codo izquierdo', idx: [11, 13, 15], modo: 'flex', normal: [0, 150], nota: 'Vista lateral, antebrazo en supinación.' },
  { id: 'tobD', nombre: 'Flexión de tobillo derecho', idx: [26, 28, 32], modo: 'tobillo', normal: [-20, 50], nota: 'Vista lateral. Negativo = dorsiflexión (0–20°), positivo = plantiflexión (0–50°).' },
  { id: 'tobI', nombre: 'Flexión de tobillo izquierdo', idx: [25, 27, 31], modo: 'tobillo', normal: [-20, 50], nota: 'Vista lateral. Negativo = dorsiflexión (0–20°), positivo = plantiflexión (0–50°).' },
]

const CONEX: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], [0, 11], [0, 12]]

type P = { x: number; y: number }
function interior(a: P, b: P, c: P) {
  const v1 = Math.atan2(a.y - b.y, a.x - b.x), v2 = Math.atan2(c.y - b.y, c.x - b.x)
  let d = Math.abs(v1 - v2)
  if (d > Math.PI) d = 2 * Math.PI - d
  return (d * 180) / Math.PI
}
function medir(p: Preset, ang: number) {
  return p.modo === 'flex' ? 180 - ang : p.modo === 'tobillo' ? ang - 90 : ang
}

type Stats = { actual: number | null; min: number | null; max: number | null; reps: number; visible: boolean }

export default function Goniometro() {
  const { id } = useActivePatient()
  const [presetId, setPresetId] = useState('rodD')
  const preset = PRESETS.find((p) => p.id === presetId)!
  const presetRef = useRef(preset)
  presetRef.current = preset
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const run = useRef<{ stream?: MediaStream; raf?: number; pose?: PoseLandmarker; activo: boolean; url?: string }>({ activo: false })
  const acc = useRef({ min: Infinity, max: -Infinity, reps: 0, arriba: false, ema: NaN })
  const [fuente, setFuente] = useState<'ninguna' | 'camara' | 'video'>('ninguna')
  const [espejo, setEspejo] = useState(true)
  const espejoRef = useRef(espejo)
  espejoRef.current = espejo
  const [estado, setEstado] = useState<{ cargando: boolean; error?: string; delegado?: string }>({ cargando: false })
  const [st, setSt] = useState<Stats>({ actual: null, min: null, max: null, reps: 0, visible: false })
  const [ok, setOk] = useState('')

  const reset = () => {
    acc.current = { min: Infinity, max: -Infinity, reps: 0, arriba: false, ema: NaN }
    setSt({ actual: null, min: null, max: null, reps: 0, visible: false })
  }
  useEffect(reset, [presetId])

  const parar = () => {
    const r = run.current
    r.activo = false
    if (r.raf) cancelAnimationFrame(r.raf)
    detener(r.stream)
    r.stream = undefined
    const v = videoRef.current
    if (v) { v.pause(); v.srcObject = null; v.removeAttribute('src'); v.load() }
    if (r.url) URL.revokeObjectURL(r.url)
    r.url = undefined
    setFuente('ninguna')
  }
  useEffect(() => () => { parar(); run.current.pose?.close() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const prepararModelo = async () => {
    const r = run.current
    if (r.pose) return
    const { task, delegado } = await crearPoseLandmarker()
    r.pose = task
    setEstado((e) => ({ ...e, delegado }))
  }

  const iniciar = async (tipo: 'camara' | 'video', file?: File) => {
    parar()
    reset()
    setOk('')
    setEstado((e) => ({ ...e, cargando: true, error: undefined }))
    const r = run.current
    const v = videoRef.current!
    try {
      if (tipo === 'camara') {
        const [stream] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }), prepararModelo()])
        r.stream = stream
        v.srcObject = stream
        setEspejo(true)
      } else if (file) {
        await prepararModelo()
        r.url = URL.createObjectURL(file)
        v.src = r.url
        v.loop = true
        setEspejo(false)
      }
      await v.play()
      setFuente(tipo)
      r.activo = true
      bucle()
    } catch (e) {
      parar()
      const err = e as Error
      setEstado((s) => ({ ...s, error: err.name === 'NotAllowedError' ? 'Permiso de cámara denegado.' : 'No se pudo iniciar: ' + err.message }))
    } finally {
      setEstado((e) => ({ ...e, cargando: false }))
    }
  }

  const bucle = () => {
    const r = run.current
    const v = videoRef.current!
    const c = canvasRef.current!
    const g = c.getContext('2d')!
    let lastT = -1, ultimoUi = 0, lastTs = 0
    const paso = () => {
      if (!r.activo) return
      r.raf = requestAnimationFrame(paso)
      if (v.readyState < 2 || v.currentTime === lastT || !r.pose) return
      lastT = v.currentTime
      const W = v.videoWidth, H = v.videoHeight
      if (c.width !== W) { c.width = W; c.height = H }
      const ts = Math.max(performance.now(), lastTs + 1)
      lastTs = ts
      const res = r.pose.detectForVideo(v, ts)
      const lm = res.landmarks[0]
      g.clearRect(0, 0, W, H)
      const p = presetRef.current
      let visible = false
      if (lm) {
        const m = espejoRef.current
        const pt = (l: NormalizedLandmark): P => ({ x: (m ? 1 - l.x : l.x) * W, y: l.y * H })
        const esc = Math.max(2, W / 400)
        g.lineWidth = esc
        g.strokeStyle = 'rgba(255,255,255,.7)'
        for (const [a, b] of CONEX) {
          if ((lm[a].visibility ?? 1) < 0.3 || (lm[b].visibility ?? 1) < 0.3) continue
          const A = pt(lm[a]), B = pt(lm[b])
          g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke()
        }
        g.fillStyle = '#fff'
        for (let i = 11; i < 33; i++) if ((lm[i].visibility ?? 1) > 0.3) { const q = pt(lm[i]); g.beginPath(); g.arc(q.x, q.y, esc * 1.6, 0, 7); g.fill() }
        const [A, B, C] = p.idx.map((i) => pt(lm[i]))
        visible = p.idx.every((i) => (lm[i].visibility ?? 1) > 0.5)
        const ang = interior(A, B, C)
        const val = medir(p, ang)
        const a = acc.current
        a.ema = Number.isNaN(a.ema) ? val : 0.6 * a.ema + 0.4 * val
        if (visible) {
          a.min = Math.min(a.min, a.ema)
          a.max = Math.max(a.max, a.ema)
          const [lo, hi] = p.normal
          const alto = lo + 0.6 * (hi - lo), bajo = lo + 0.2 * (hi - lo)
          if (!a.arriba && a.ema > alto) a.arriba = true
          else if (a.arriba && a.ema < bajo) { a.arriba = false; a.reps++ }
        }
        // segmentos y arco del ángulo
        const color = visible ? '#2dd4bf' : '#f59e0b'
        g.strokeStyle = color
        g.lineWidth = esc * 2.5
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(C.x, C.y); g.stroke()
        const a1 = Math.atan2(A.y - B.y, A.x - B.x)
        let d = Math.atan2(C.y - B.y, C.x - B.x) - a1
        if (d > Math.PI) d -= 2 * Math.PI
        if (d < -Math.PI) d += 2 * Math.PI
        const rad = Math.min(Math.hypot(A.x - B.x, A.y - B.y), Math.hypot(C.x - B.x, C.y - B.y)) * 0.35
        g.fillStyle = visible ? 'rgba(45,212,191,.25)' : 'rgba(245,158,11,.25)'
        g.beginPath(); g.moveTo(B.x, B.y); g.arc(B.x, B.y, rad, a1, a1 + d, d < 0); g.closePath(); g.fill()
        g.lineWidth = esc * 1.5
        g.beginPath(); g.arc(B.x, B.y, rad, a1, a1 + d, d < 0); g.stroke()
        const fs = Math.round(esc * 11)
        g.font = `600 ${fs}px system-ui, sans-serif`
        const txt = `${Math.round(a.ema)}°`
        const tx = B.x + rad * 0.6 * Math.cos(a1 + d / 2) + esc * 8, ty = B.y + rad * 0.6 * Math.sin(a1 + d / 2)
        g.lineWidth = esc * 3
        g.strokeStyle = 'rgba(0,0,0,.7)'
        g.strokeText(txt, tx, ty)
        g.fillStyle = '#fff'
        g.fillText(txt, tx, ty)
      }
      const now = performance.now()
      if (now - ultimoUi > 150) {
        ultimoUi = now
        const a = acc.current
        setSt({ actual: lm ? Math.round(a.ema) : null, min: Number.isFinite(a.min) ? Math.round(a.min) : null, max: Number.isFinite(a.max) ? Math.round(a.max) : null, reps: a.reps, visible })
      }
    }
    r.raf = requestAnimationFrame(paso)
  }

  const guardar = (valor: number, que: string) => {
    if (!id) return
    add('observations', { patientId: id, codigo: 'rom', valor, unidad: '°', fuente: 'camara', etiqueta: preset.nombre, interpretacion: `${que}; normal AAOS ${preset.normal[0]}–${preset.normal[1]}°` })
    setOk(`${que} guardado: ${valor}°`)
  }

  const hist = useCollection('observations', (o) => o.patientId === id && o.codigo === 'rom' && o.etiqueta === preset.nombre, [id, preset.nombre])
  const datos = useMemo(() => [...hist].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((o) => ({ f: fmtFecha(o.fecha, { day: '2-digit', month: 'short' }), v: o.valor })), [hist])
  const fuera = st.actual != null && (st.actual < preset.normal[0] - 5 || st.actual > preset.normal[1] + 5)

  return (
    <Page title="Goniómetro" subtitle="Rango de movimiento articular con estimación de pose (MediaPipe)">
      <PatientBar />
      {!hayCamara() && <Unsupported api="Cámara (getUserMedia)">Puedes analizar un video subido.</Unsupported>}
      {estado.error && <Notice tone="danger">{estado.error}</Notice>}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card pad={false} className="overflow-hidden">
            <div className="relative aspect-video w-full bg-black">
              <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-contain" style={{ transform: espejo ? 'scaleX(-1)' : undefined }} />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
              {fuente === 'ninguna' && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">
                  {estado.cargando ? 'Cargando modelo de pose…' : 'Inicia la cámara o sube un video. Encuadra el cuerpo completo del segmento a medir.'}
                </div>
              )}
              {fuente !== 'ninguna' && st.actual != null && !st.visible && (
                <div className="absolute inset-x-3 bottom-3 rounded-lg bg-black/60 px-3 py-2 text-center text-sm text-white">Articulación poco visible: ajusta el encuadre o la luz.</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
              {fuente === 'ninguna' ? (
                <>
                  <Button variant="primary" onClick={() => iniciar('camara')} disabled={estado.cargando || !hayCamara()}><Camera className="size-4" />Cámara</Button>
                  <Button onClick={() => fileRef.current?.click()} disabled={estado.cargando}><Upload className="size-4" />Subir video</Button>
                </>
              ) : (
                <Button onClick={parar}><Square className="size-4" />Detener</Button>
              )}
              <Button variant="ghost" onClick={() => setEspejo((x) => !x)}><FlipHorizontal className="size-4" />Espejo {espejo ? 'sí' : 'no'}</Button>
              {estado.delegado && <span className="ml-auto text-xs text-muted">Procesamiento: {estado.delegado}</span>}
              <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) iniciar('video', f); e.target.value = '' }} />
            </div>
          </Card>
          {espejo && <p className="-mt-2 text-xs text-muted">Vista en espejo: el lado <b>derecho del paciente</b> aparece a la <b>derecha</b> de la pantalla. Los presets D/I siempre se refieren al lado del paciente.</p>}
        </div>

        <div className="space-y-4">
          <Card>
            <Field label="Movimiento" hint={preset.nota}>
              <Select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Select>
            </Field>
            <div className="mt-4 text-center">
              <div className="text-xs text-muted">Ángulo actual</div>
              <div className="text-5xl font-semibold tabular-nums">{st.actual ?? '--'}°</div>
              <div className="mt-1"><Badge tone={fuera ? 'warn' : 'neutral'}>Normal AAOS {preset.normal[0]}–{preset.normal[1]}°</Badge></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Mín" value={st.min != null ? `${st.min}°` : '—'} />
              <Stat label="Máx" value={st.max != null ? `${st.max}°` : '—'} />
              <Stat label="Reps" value={st.reps} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" disabled={!id || st.actual == null} onClick={() => guardar(st.actual!, 'Ángulo capturado')}><Save className="size-4" />Capturar</Button>
              <Button disabled={!id || st.max == null} onClick={() => guardar(st.max!, 'Máximo de la sesión')}>Guardar máx.</Button>
              <Button variant="ghost" onClick={reset}><RotateCcw className="size-4" />Reiniciar</Button>
            </div>
            {ok && <p className="mt-2 text-sm text-ok">{ok}</p>}
          </Card>
          <Card title={`Historial · ${preset.nombre}`}>
            {datos.length ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={datos} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                    <ReferenceArea y1={preset.normal[0]} y2={preset.normal[1]} fill="var(--color-ok)" fillOpacity={0.08} />
                    <XAxis dataKey="f" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                    <YAxis domain={[Math.min(preset.normal[0], 0), preset.normal[1] + 10]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                    <Tooltip formatter={(v) => [`${v}°`, 'ROM']} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="v" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty>Sin mediciones previas de este movimiento.</Empty>}
            <p className="mt-2 text-xs text-muted">Banda verde: rango normal de referencia (AAOS).</p>
          </Card>
        </div>
      </div>
      <Disclaimer>Medición 2D estimada por visión computacional; el error aumenta si la articulación no está en el plano de la cámara. Confirma con goniómetro manual cuando el resultado modifique el tratamiento.</Disclaimer>
    </Page>
  )
}
