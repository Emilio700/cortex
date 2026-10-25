import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mic, Square, Upload, Copy, FileText, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { Page, Card, Button, Field, Input, Select, Textarea, Badge, Notice, Tabs, PatientBar, Unsupported } from '../../components/ui'
import { useActivePatient, useSettings } from '../../lib/store'
import { a16kMono, whisperNavegador, whisperServidor, tieneWebGPU, type EventoWorker } from './audio'

type Motor = 'web' | 'local' | 'servidor'

const MODELOS = [
  { id: 'onnx-community/whisper-tiny', label: 'Whisper tiny (≈40 MB, rápido)' },
  { id: 'onnx-community/whisper-base', label: 'Whisper base (≈80 MB, recomendado)' },
  { id: 'onnx-community/whisper-small', label: 'Whisper small (≈250 MB, más preciso)' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function Modulo() {
  const settings = useSettings()
  const { id: activeId } = useActivePatient()
  const nav = useNavigate()
  const [motor, setMotor] = useState<Motor>(SR ? 'web' : 'local')
  const [texto, setTexto] = useState('')
  const [interino, setInterino] = useState('')
  const [grabando, setGrabando] = useState(false)
  const [seg, setSeg] = useState(0)
  const [nivel, setNivel] = useState(0)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [estado, setEstado] = useState('')
  const [archivos, setArchivos] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [modelo, setModelo] = useState(MODELOS[1].id)
  const [gpu, setGpu] = useState<boolean | null>(null)
  const [usarGpu, setUsarGpu] = useState(true)
  const [modeloSrv, setModeloSrv] = useState('Systran/faster-whisper-small')
  const [copiado, setCopiado] = useState(false)

  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const actx = useRef<AudioContext | null>(null)
  const raf = useRef(0)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sr = useRef<any>(null)
  const grabandoRef = useRef(false)

  useEffect(() => {
    tieneWebGPU().then(setGpu)
    return () => {
      if (rec.current) rec.current.onstop = null
      grabandoRef.current = false
      detener()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  const agrega = (t: string) => setTexto((x) => (x && t ? x.replace(/\s*$/, '') + ' ' : x) + t.trim())

  // ---------- Medidor de nivel y temporizador ----------
  function iniciaMedidor(s: MediaStream) {
    const ctx = new AudioContext()
    actx.current = ctx
    const an = ctx.createAnalyser()
    an.fftSize = 512
    ctx.createMediaStreamSource(s).connect(an)
    const buf = new Float32Array(an.fftSize)
    const loop = () => {
      an.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      setNivel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
      raf.current = requestAnimationFrame(loop)
    }
    loop()
    const t0 = Date.now()
    setSeg(0)
    timer.current = setInterval(() => setSeg((Date.now() - t0) / 1000), 250)
  }

  function detener() {
    cancelAnimationFrame(raf.current)
    clearInterval(timer.current)
    void actx.current?.close().catch(() => {})
    actx.current = null
    if (rec.current?.state === 'recording') rec.current.stop()
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    try { sr.current?.stop() } catch { /* ignorar */ }
    setGrabando(false)
    setNivel(0)
  }

  // ---------- Motor A: Web Speech API ----------
  function iniciarWebSpeech() {
    setError('')
    const r = new SR()
    r.lang = 'es-MX'
    r.continuous = true
    r.interimResults = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let inter = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) agrega(res[0].transcript)
        else inter += res[0].transcript
      }
      setInterino(inter)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') setError('Reconocimiento de voz: ' + e.error) }
    r.onend = () => {
      // Chrome corta tras silencios; reanudamos mientras el usuario no detenga
      if (sr.current === r && grabandoRef.current) try { r.start() } catch { /* ignorar */ }
      else setInterino('')
    }
    sr.current = r
    r.start()
    setGrabando(true)
    grabandoRef.current = true
    const t0 = Date.now()
    timer.current = setInterval(() => setSeg((Date.now() - t0) / 1000), 250)
  }

  // ---------- Motores B/C: grabación con MediaRecorder ----------
  async function iniciarGrabacion() {
    setError('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = s
      const chunks: Blob[] = []
      const mr = new MediaRecorder(s)
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      mr.onstop = () => {
        const b = new Blob(chunks, { type: mr.mimeType || 'audio/webm' })
        setAudio(b)
        setAudioUrl(URL.createObjectURL(b))
        void transcribir(b)
      }
      rec.current = mr
      mr.start(1000)
      iniciaMedidor(s)
      setGrabando(true)
    } catch (e) {
      setError('No se pudo acceder al micrófono: ' + (e as Error).message)
    }
  }

  function parar() {
    grabandoRef.current = false
    detener()
  }

  function onArchivo(f?: File) {
    if (!f) return
    setAudio(f)
    setAudioUrl(URL.createObjectURL(f))
    if (motor === 'web') setMotor('local')
    void transcribir(f, motor === 'web' ? 'local' : motor)
  }

  async function transcribir(b: Blob, m: Motor = motor) {
    setOcupado(true)
    setError('')
    setArchivos({})
    try {
      if (m === 'servidor') {
        if (!settings.servicios.whisper) throw new Error('Configura la URL del servidor Whisper en Servicios.')
        setEstado('Enviando audio al servidor…')
        agrega(await whisperServidor(settings.servicios.whisper, b, modeloSrv))
      } else {
        setEstado('Decodificando audio a 16 kHz…')
        const pcm = await a16kMono(b)
        const t = await whisperNavegador(pcm, modelo, gpu && usarGpu ? 'webgpu' : 'wasm', (e: EventoWorker) => {
          if (e.type === 'estado') setEstado(e.texto)
          if (e.type === 'progreso' && e.file && e.status === 'progress') setArchivos((a) => ({ ...a, [e.file!]: e.progress ?? 0 }))
          if (e.type === 'progreso' && e.file && e.status === 'done') setArchivos((a) => ({ ...a, [e.file!]: 100 }))
        })
        agrega(t)
      }
      setEstado('')
    } catch (e) {
      setError((e as Error).message)
      setEstado('')
    } finally {
      setOcupado(false)
    }
  }

  function enviarNota() {
    try { sessionStorage.setItem('medisuite.dictado', texto) } catch { /* ignorar */ }
    nav(`/consulta/nueva${activeId ? `?p=${activeId}` : ''}`)
  }
  function estructurar() {
    try { sessionStorage.setItem('medisuite.transcripcion', texto) } catch { /* ignorar */ }
    nav('/asistente?tarea=soap')
  }
  async function copiar() {
    await navigator.clipboard?.writeText(texto).catch(() => {})
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  const soportaRec = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const descargas = Object.entries(archivos)

  return (
    <Page title="Dictado" subtitle="Voz a texto para notas clínicas: en el navegador, con Whisper local o en tu servidor">
      <PatientBar />
      <Notice tone="warn">Antes de grabar, informa al paciente y obtén su consentimiento. No grabes datos que no sean necesarios para la nota.</Notice>

      <Tabs<Motor>
        value={motor}
        onChange={(m) => { if (!grabando) setMotor(m) }}
        tabs={[
          { id: 'web', label: 'Navegador (Web Speech)' },
          { id: 'local', label: 'Whisper en el equipo' },
          { id: 'servidor', label: 'Whisper servidor' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title="Captura">
          {motor === 'web' && (
            <>
              {!SR && <Unsupported api="Web Speech API">Usa Chrome o Edge, o elige Whisper en el equipo.</Unsupported>}
              <p className="mb-3 text-xs text-muted">Transcripción en vivo (es-MX). <b>Privacidad:</b> en Chrome el audio se envía a los servidores de Google para reconocerse. Para datos sensibles usa Whisper en el equipo o en tu servidor.</p>
            </>
          )}
          {motor === 'local' && (
            <div className="mb-3 space-y-3">
              <Field label="Modelo" hint="Se descarga de Hugging Face la primera vez y queda en caché; después funciona sin internet.">
                <Select value={modelo} onChange={(e) => setModelo(e.target.value)} disabled={ocupado}>
                  {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={usarGpu && !!gpu} disabled={!gpu} onChange={(e) => setUsarGpu(e.target.checked)} />
                Acelerar con WebGPU {gpu === null ? '' : gpu ? <Badge tone="ok">disponible</Badge> : <Badge>no disponible · se usa WASM</Badge>}
              </label>
            </div>
          )}
          {motor === 'servidor' && (
            <div className="mb-3 space-y-3">
              {settings.servicios.whisper ? (
                <p className="text-xs text-muted">Servidor: <code>{settings.servicios.whisper}</code> (API compatible con OpenAI). El audio no sale de tu red.</p>
              ) : (
                <Notice tone="warn">No hay servidor Whisper configurado. <Link className="underline" to="/servicios">Configúralo en Servicios</Link>.</Notice>
              )}
              <Field label="Modelo del servidor">
                <Input value={modeloSrv} onChange={(e) => setModeloSrv(e.target.value)} />
              </Field>
            </div>
          )}

          <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-2 p-5">
            <div className="text-3xl font-semibold tabular-nums" aria-label="Tiempo de grabación">{mmss(grabando ? seg : 0)}</div>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-line" aria-label="Nivel de audio">
              <div className="h-full bg-brand transition-[width] duration-75" style={{ width: `${grabando ? (motor === 'web' ? 100 : nivel * 100) : 0}%`, opacity: motor === 'web' && grabando ? 0.4 : 1 }} />
            </div>
            {grabando ? (
              <Button variant="danger" onClick={parar}><Square className="size-4" /> Detener</Button>
            ) : (
              <Button
                variant="primary"
                disabled={ocupado || (motor === 'web' ? !SR : !soportaRec)}
                onClick={motor === 'web' ? iniciarWebSpeech : iniciarGrabacion}
              >
                <Mic className="size-4" /> {motor === 'web' ? 'Dictar' : 'Grabar'}
              </Button>
            )}
            {grabando && motor === 'web' && <span className="animate-pulse text-xs text-brand">Escuchando…</span>}
          </div>

          {motor !== 'web' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">
                <Upload className="size-4" /> Subir audio
                <input type="file" accept="audio/*,video/webm" className="hidden" onChange={(e) => onArchivo(e.target.files?.[0])} disabled={ocupado || grabando} />
              </label>
              {audio && !ocupado && <Button size="sm" onClick={() => transcribir(audio)}><Wand2 className="size-4" /> Transcribir de nuevo</Button>}
            </div>
          )}
          {audioUrl && motor !== 'web' && <audio controls src={audioUrl} className="mt-3 w-full" />}

          {(ocupado || estado) && (
            <div className="mt-3 space-y-1.5 text-xs" aria-live="polite">
              <div className="font-medium text-brand">{estado || 'Procesando…'}</div>
              {descargas.map(([f, p]) => (
                <div key={f}>
                  <div className="flex justify-between text-muted"><span className="truncate">{f}</span><span>{Math.round(p)}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-brand" style={{ width: `${p}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          {error && <div className="mt-3"><Notice tone="danger" onClose={() => setError('')}>{error}</Notice></div>}
        </Card>

        <Card
          title="Texto"
          actions={<Button size="sm" variant="ghost" onClick={() => setTexto('')} disabled={!texto}><Trash2 className="size-4" /> Limpiar</Button>}
        >
          <Textarea
            value={texto + (interino ? (texto ? ' ' : '') + interino : '')}
            onChange={(e) => { setInterino(''); setTexto(e.target.value) }}
            className="min-h-72"
            placeholder="El texto dictado aparecerá aquí. Puedes editarlo."
            data-testid="dictado-texto"
          />
          <div className="mt-1 text-xs text-muted">{texto.trim() ? texto.trim().split(/\s+/).length : 0} palabras</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={copiar} disabled={!texto}><Copy className="size-4" /> {copiado ? 'Copiado' : 'Copiar'}</Button>
            <Button onClick={enviarNota} disabled={!texto}><FileText className="size-4" /> Enviar a nota</Button>
            <Button variant="primary" onClick={estructurar} disabled={!texto}><Sparkles className="size-4" /> Estructurar con IA</Button>
          </div>
          <p className="mt-3 text-xs text-muted">Revisa la transcripción: nombres de medicamentos, dosis y cifras pueden reconocerse mal.</p>
        </Card>
      </div>
    </Page>
  )
}
