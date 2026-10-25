import { useEffect, useRef, useState } from 'react'
import { HeartPulse, Play, Save, Square } from 'lucide-react'
import type { FaceDetector } from '@mediapipe/tasks-vision'
import { Page, Card, Button, Notice, PatientBar, Unsupported, Disclaimer, Badge } from '../../components/ui'
import { add, useActivePatient, useCollection } from '../../lib/store'
import { fmtFechaHora } from '../../lib/utils'
import { analizar, mediana, type Muestra } from './dsp'
import { crearFaceDetector, detener, hayCamara } from './mp'

const DURACION = 25 // s
const VENTANA = 10 // s
const ETIQUETA = 'Pulso por cámara (estimación)'

type Box = { x: number; y: number; w: number; h: number }
type Ui = { fase: 'inactivo' | 'cargando' | 'midiendo' | 'listo' | 'error'; bpm: number | null; sqi: number; progreso: number; guia: string; estable: boolean; msg?: string; fps: number; delegado?: string }

// Regiones de piel relativas al cuadro del rostro: frente y mejillas
const ROIS = [
  [0.3, 0.02, 0.4, 0.16],
  [0.14, 0.5, 0.22, 0.2],
  [0.64, 0.5, 0.22, 0.2],
]

export default function Pulso() {
  const { id } = useActivePatient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const run = useRef<{ stream?: MediaStream; raf?: number; det?: FaceDetector; activo: boolean }>({ activo: false })
  const [ui, setUi] = useState<Ui>({ fase: 'inactivo', bpm: null, sqi: 0, progreso: 0, guia: '', estable: false, fps: 0 })
  const [guardado, setGuardado] = useState(false)
  const previas = useCollection('observations', (o) => o.patientId === id && o.codigo === 'fc' && o.fuente === 'camara', [id])

  const parar = () => {
    const r = run.current
    r.activo = false
    if (r.raf) cancelAnimationFrame(r.raf)
    detener(r.stream)
    r.stream = undefined
    if (videoRef.current) videoRef.current.srcObject = null
  }
  useEffect(() => () => { parar(); run.current.det?.close() }, [])

  const iniciar = async () => {
    parar()
    setGuardado(false)
    setUi({ fase: 'cargando', bpm: null, sqi: 0, progreso: 0, guia: 'Cargando cámara y modelo…', estable: false, fps: 0 })
    const r = run.current
    try {
      const [stream, det] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false }),
        r.det ? Promise.resolve({ task: r.det, delegado: '' }) : crearFaceDetector(),
      ])
      r.stream = stream
      r.det = det.task
      const v = videoRef.current!
      v.srcObject = stream
      await v.play()
      r.activo = true
      bucle(det.delegado)
    } catch (e) {
      parar()
      const err = e as Error
      setUi((u) => ({ ...u, fase: 'error', guia: '', msg: err.name === 'NotAllowedError' ? 'Permiso de cámara denegado.' : 'No se pudo iniciar: ' + err.message }))
    }
  }

  const bucle = (delegado: string) => {
    const r = run.current
    const v = videoRef.current!
    const cv = document.createElement('canvas')
    const ctx = cv.getContext('2d', { willReadFrequently: true })!
    const muestras: Muestra[] = []
    const ests: { t: number; bpm: number; sqi: number }[] = []
    let box: Box | null = null
    let sinRostro = 0, frame = 0, ultimoAnalisis = 0, ultimoUi = 0, mov = 0, luz = 128
    let lastT = -1
    const t0 = performance.now()
    let estado: Ui = { fase: 'midiendo', bpm: null, sqi: 0, progreso: 0, guia: '', estable: false, fps: 0, delegado }
    let filt: number[] = []

    const paso = () => {
      if (!r.activo) return
      r.raf = requestAnimationFrame(paso)
      const now = performance.now()
      if (v.readyState < 2 || v.currentTime === lastT) return
      lastT = v.currentTime
      frame++
      const W = 320, H = Math.round((W * v.videoHeight) / v.videoWidth) || 240
      if (cv.width !== W) { cv.width = W; cv.height = H }
      ctx.drawImage(v, 0, 0, W, H)
      // detectar rostro cada 3 cuadros
      if (frame % 3 === 1 && r.det) {
        const res = r.det.detectForVideo(v, now)
        const bb = res.detections[0]?.boundingBox
        if (bb) {
          const s = W / v.videoWidth
          const nb = { x: bb.originX * s, y: bb.originY * s, w: bb.width * s, h: bb.height * s }
          if (box) {
            mov = 0.7 * mov + 0.3 * (Math.hypot(nb.x + nb.w / 2 - box.x - box.w / 2, nb.y + nb.h / 2 - box.y - box.h / 2) / nb.w)
            box = { x: 0.6 * box.x + 0.4 * nb.x, y: 0.6 * box.y + 0.4 * nb.y, w: 0.6 * box.w + 0.4 * nb.w, h: 0.6 * box.h + 0.4 * nb.h }
          } else box = nb
          sinRostro = 0
        } else if (++sinRostro > 4) box = null
      }
      // promedio RGB en ROI
      const ov = overlayRef.current
      const octx = ov?.getContext('2d')
      if (ov && octx) {
        if (ov.width !== W) { ov.width = W; ov.height = H }
        octx.clearRect(0, 0, W, H)
      }
      if (box) {
        let sr = 0, sg = 0, sb = 0, n = 0
        for (const [rx, ry, rw, rh] of ROIS) {
          const x = Math.max(0, Math.round(box.x + rx * box.w)), y = Math.max(0, Math.round(box.y + ry * box.h))
          const w = Math.min(W - x, Math.round(rw * box.w)), h = Math.min(H - y, Math.round(rh * box.h))
          if (w < 2 || h < 2) continue
          const d = ctx.getImageData(x, y, w, h).data
          for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++ }
          if (octx) { octx.strokeStyle = '#2dd4bf'; octx.lineWidth = 1.5; octx.strokeRect(x, y, w, h) }
        }
        if (octx) { octx.strokeStyle = 'rgba(255,255,255,.5)'; octx.strokeRect(box.x, box.y, box.w, box.h) }
        if (n) {
          muestras.push({ t: now, r: sr / n, g: sg / n, b: sb / n })
          luz = 0.9 * luz + 0.1 * (0.299 * sr + 0.587 * sg + 0.114 * sb) / n
        }
      }
      while (muestras.length && now - muestras[0].t > VENTANA * 1000 + 2000) muestras.shift()

      const trans = (now - t0) / 1000
      if (now - ultimoAnalisis > 500 && muestras.length > 60) {
        ultimoAnalisis = now
        const a = analizar(muestras.filter((m) => now - m.t <= VENTANA * 1000), 30)
        if (a) {
          filt = a.filt.slice(-30 * 8)
          ests.push({ t: now, bpm: a.bpm, sqi: a.sqi })
        }
      }
      if (now - ultimoUi > 250) {
        ultimoUi = now
        const rec = ests.filter((e) => now - e.t < 6000)
        const buenas = rec.filter((e) => e.sqi >= 0.3)
        const sd = rec.length > 3 ? Math.sqrt(rec.reduce((x, e) => x + (e.bpm - mediana(rec.map((q) => q.bpm))) ** 2, 0) / rec.length) : 99
        const estable = buenas.length >= 4 && sd < 4
        const suficiente = muestras.length > 40 && now - (muestras[0]?.t ?? now) > 5000
        const guia = !box ? 'No se detecta el rostro: céntrate frente a la cámara.'
          : luz < 60 ? 'Poca luz: ilumina tu rostro de frente (luz natural o lámpara).'
          : luz > 220 ? 'Demasiada luz o reflejo: evita la luz directa sobre la cámara.'
          : mov > 0.03 ? 'Quédate quieto, sin hablar.'
          : !suficiente ? 'Recolectando señal…'
          : !estable ? 'Estabilizando…' : 'Señal estable'
        const ult = ests[ests.length - 1]
        estado = { ...estado, bpm: ult && suficiente ? Math.round(mediana(rec.map((e) => e.bpm))) : null, sqi: ult?.sqi ?? 0, progreso: Math.min(1, trans / DURACION), guia, estable, fps: Math.round(muestras.filter((m) => now - m.t < 1000).length) }
        if (trans >= DURACION) {
          const finales = ests.filter((e) => now - e.t < VENTANA * 1000)
          const ok = finales.filter((e) => e.sqi >= 0.3)
          const usar = ok.length >= 3 ? ok : finales
          estado = { ...estado, fase: usar.length ? 'listo' : 'error', bpm: usar.length ? Math.round(mediana(usar.map((e) => e.bpm))) : null, sqi: usar.length ? mediana(usar.map((e) => e.sqi)) : 0, guia: '', msg: usar.length ? undefined : 'No se obtuvo señal suficiente. Mejora la iluminación y repite.' }
          setUi(estado)
          dibujar(filt)
          parar()
          return
        }
        setUi(estado)
        dibujar(filt)
      }
    }
    r.raf = requestAnimationFrame(paso)
  }

  const dibujar = (x: number[]) => {
    const c = chartRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth, h = c.clientHeight
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    if (x.length < 2) return
    const mx = Math.max(...x.map(Math.abs)) || 1
    g.strokeStyle = getComputedStyle(c).color
    g.lineWidth = 2
    g.beginPath()
    x.forEach((v, i) => {
      const px = (i / (x.length - 1)) * w, py = h / 2 - (v / mx) * (h / 2 - 6)
      if (i) g.lineTo(px, py); else g.moveTo(px, py)
    })
    g.stroke()
  }

  const midiendo = ui.fase === 'midiendo' || ui.fase === 'cargando'
  const calidad = ui.sqi >= 0.45 ? { t: 'Buena', tone: 'ok' as const } : ui.sqi >= 0.3 ? { t: 'Regular', tone: 'warn' as const } : { t: 'Baja', tone: 'danger' as const }
  const R = 54, C = 2 * Math.PI * R

  return (
    <Page title="Pulso por cámara" subtitle="Fotopletismografía remota (rPPG, algoritmo POS) con la cámara frontal">
      <PatientBar />
      <Notice tone="warn">
        <b>Estimación de bienestar, no es un signo vital clínico.</b> La precisión depende de la luz, el movimiento, el tono de piel y la cámara. No la uses para diagnóstico ni para decisiones de tratamiento; confirma con oxímetro o auscultación.
      </Notice>
      {!hayCamara() && <Unsupported api="Cámara (getUserMedia)" />}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card pad={false} className="overflow-hidden">
          <div className="relative aspect-[4/3] w-full bg-black">
            <div className="absolute inset-0 -scale-x-100">
              <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
              <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
            </div>
            {ui.fase === 'inactivo' && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">
                <div><HeartPulse className="mx-auto mb-2 size-10" />Siéntate frente a la cámara con buena luz de frente. La medición dura {DURACION} s.</div>
              </div>
            )}
            {ui.guia && midiendo && <div className="absolute inset-x-3 bottom-3 rounded-lg bg-black/60 px-3 py-2 text-center text-sm text-white">{ui.guia}</div>}
          </div>
          <div className="border-t border-line p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>Señal rPPG filtrada (0.7–3 Hz)</span>
              <span>{ui.fps ? `${ui.fps} fps` : ''}{ui.delegado ? ` · ${ui.delegado}` : ''}</span>
            </div>
            <canvas ref={chartRef} className="h-24 w-full text-brand" />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-4">
              <svg width="128" height="128" viewBox="0 0 128 128" className="shrink-0">
                <circle cx="64" cy="64" r={R} fill="none" strokeWidth="10" className="stroke-surface-2" />
                <circle cx="64" cy="64" r={R} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-brand transition-all" strokeDasharray={C} strokeDashoffset={C * (1 - ui.progreso)} transform="rotate(-90 64 64)" />
                <text x="64" y="66" textAnchor="middle" className="fill-ink text-[34px] font-semibold tabular-nums">{ui.bpm ?? '--'}</text>
                <text x="64" y="88" textAnchor="middle" className="fill-muted text-[12px]">lpm</text>
              </svg>
              <div className="min-w-0 space-y-1.5 text-sm">
                <div>Estado: <b>{ui.fase === 'listo' ? 'Terminado' : ui.fase === 'midiendo' ? (ui.estable ? 'Estable' : 'Estabilizando') : ui.fase === 'cargando' ? 'Cargando' : ui.fase === 'error' ? 'Error' : 'Listo para medir'}</b></div>
                {(ui.fase === 'midiendo' || ui.fase === 'listo') && <div>Calidad: <Badge tone={calidad.tone}>{calidad.t} ({Math.round(ui.sqi * 100)}%)</Badge></div>}
                {ui.fase === 'midiendo' && <div className="text-muted">{Math.round(ui.progreso * DURACION)} / {DURACION} s</div>}
              </div>
            </div>
            {ui.msg && <p className="mt-3 text-sm text-danger">{ui.msg}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {midiendo ? (
                <Button onClick={() => { parar(); setUi((u) => ({ ...u, fase: 'inactivo', guia: '' })) }}><Square className="size-4" />Detener</Button>
              ) : (
                <Button variant="primary" onClick={iniciar} disabled={!hayCamara()}><Play className="size-4" />{ui.fase === 'listo' ? 'Medir de nuevo' : 'Iniciar medición'}</Button>
              )}
              <Button
                disabled={ui.fase !== 'listo' || !ui.bpm || !id || guardado}
                onClick={() => {
                  add('observations', { patientId: id!, codigo: 'fc', valor: ui.bpm!, unidad: 'lpm', fuente: 'camara', etiqueta: ETIQUETA, interpretacion: `Calidad de señal ${Math.round(ui.sqi * 100)}%` })
                  setGuardado(true)
                }}
              >
                <Save className="size-4" />{guardado ? 'Guardado' : 'Guardar'}
              </Button>
            </div>
          </Card>
          <Card title="Consejos">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Luz uniforme de frente; evita contraluz y luces que parpadean.</li>
              <li>Quédate quieto, sin hablar, con la frente descubierta.</li>
              <li>Retira lentes con reflejos; mantén el rostro a 40–60 cm.</li>
            </ul>
          </Card>
          {previas.length > 0 && (
            <Card title="Mediciones previas">
              <ul className="space-y-1 text-sm">
                {[...previas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5).map((o) => (
                  <li key={o.id} className="flex justify-between"><span className="text-muted">{fmtFechaHora(o.fecha)}</span><b className="tabular-nums">{o.valor} lpm</b></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      <Disclaimer>Estimación de bienestar por cámara (rPPG). No es un dispositivo médico; no sustituye la medición clínica del pulso.</Disclaimer>
    </Page>
  )
}
