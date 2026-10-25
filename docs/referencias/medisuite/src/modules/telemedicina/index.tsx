import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, MessageCircle, RefreshCw, Video, VideoOff, ExternalLink, Mic, Square } from 'lucide-react'
import { Page, Card, Button, Field, Select, Textarea, Notice, PatientBar, Tabs, Unsupported, Badge } from '../../components/ui'
import { useActivePatient, useCollection, useSettings } from '../../lib/store'
import { claveSegura, usePreferencia } from '../../lib/preferencias'
import { isServer } from '../../lib/api'
import { asset, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { pedirTexto } from '../../components/dialogos'

const Pizarra = lazy(() => import('./Pizarra'))
// Fuentes autoalojadas: si existe /public/excalidraw-assets/fonts (copia de node_modules/@excalidraw/excalidraw/dist/prod/fonts)
// se usan; si no, Excalidraw recurre a su CDN. Debe definirse antes de cargar Excalidraw.
;(window as unknown as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH ??= asset('excalidraw-assets/')

const JITSI = 'https://meet.jit.si/'
const LS_SALAS = 'medisuite.telemed.salas'

function nuevaSala() {
  const a = crypto.getRandomValues(new Uint8Array(8))
  return 'medisuite-' + Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
}

function PruebaEquipo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const run = useRef<{ stream?: MediaStream; ctx?: AudioContext; raf?: number }>({})
  const [nivel, setNivel] = useState(0)
  const [activo, setActivo] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  const parar = () => {
    const r = run.current
    if (r.raf) cancelAnimationFrame(r.raf)
    r.stream?.getTracks().forEach((t) => t.stop())
    r.ctx?.close().catch(() => {})
    run.current = {}
    if (videoRef.current) videoRef.current.srcObject = null
    setActivo(false)
    setNivel(0)
  }
  useEffect(() => parar, [])

  const iniciar = async () => {
    parar()
    setErr('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true } })
      run.current.stream = s
      videoRef.current!.srcObject = s
      await videoRef.current!.play()
      const ctx = new AudioContext()
      run.current.ctx = ctx
      ctx.resume().catch(() => {})
      const an = ctx.createAnalyser()
      an.fftSize = 1024
      ctx.createMediaStreamSource(s).connect(an)
      const buf = new Float32Array(an.fftSize)
      const loop = () => {
        an.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8)
        setNivel(Math.max(0, Math.min(1, (db + 60) / 50)))
        run.current.raf = requestAnimationFrame(loop)
      }
      loop()
      const vt = s.getVideoTracks()[0]?.getSettings(), at = s.getAudioTracks()[0]
      setInfo(`${s.getVideoTracks()[0]?.label || 'Cámara'} ${vt?.width ?? ''}×${vt?.height ?? ''} · ${at?.label || 'Micrófono'}`)
      setActivo(true)
    } catch (e) {
      setErr((e as Error).name === 'NotAllowedError' ? 'Permiso de cámara/micrófono denegado.' : 'No se pudo acceder: ' + (e as Error).message)
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) return <Unsupported api="Cámara y micrófono (getUserMedia)" />
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_280px]">
      <Card pad={false} className="overflow-hidden">
        <div className="relative aspect-video bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-contain" />
          {!activo && <div className="absolute inset-0 grid place-items-center text-sm text-white/80">Vista previa apagada</div>}
        </div>
      </Card>
      <Card title="Prueba de equipo">
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="mb-1 flex items-center gap-2 text-sm"><Mic className="size-4" />Nivel del micrófono</div>
        <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={Math.round(nivel * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Nivel de micrófono">
          <div className={nivel > 0.85 ? 'h-full bg-danger' : 'h-full bg-ok'} style={{ width: `${nivel * 100}%`, transition: 'width 60ms' }} />
        </div>
        <p className="mt-2 text-xs text-muted">{activo ? 'Habla: la barra debe moverse. ' + info : 'Verifica cámara y micrófono antes de la consulta.'}</p>
        <div className="mt-3">
          {activo ? <Button onClick={parar}><Square className="size-4" />Detener prueba</Button> : <Button variant="primary" onClick={iniciar}><Video className="size-4" />Probar cámara y micrófono</Button>}
        </div>
      </Card>
    </div>
  )
}

export default function Telemedicina() {
  const { id, patient } = useActivePatient()
  const settings = useSettings()
  const dark = settings.tema === 'oscuro'
  const citas = useCollection('appointments', (a) => a.patientId === id && a.estado !== 'cancelada' && a.estado !== 'atendida', [id])
  const proximas = useMemo(() => [...citas].sort((a, b) => (a.tipo === 'telemedicina' ? -1 : 0) - (b.tipo === 'telemedicina' ? -1 : 0) || a.inicio.localeCompare(b.inicio)), [citas])
  const [citaId, setCitaId] = useState('')
  // Sala por cita/paciente: compartida por la clínica (preferencia `telemedicina.salas`, scope org) para que
  // recepción, enfermería y el médico usen el mismo enlace; en demo, este navegador.
  const [salasRaw, setSalasPref, salasMeta] = usePreferencia<Record<string, string>>('telemedicina.salas', 'org', {}, { lsKey: LS_SALAS })
  const [salasLocales, setSalasLocales] = useState<Record<string, string>>({}) // si el rol no puede guardar en la clínica
  const salas = useMemo(() => ({ ...salasLocales, ...(salasRaw && typeof salasRaw === 'object' ? salasRaw : {}) }), [salasRaw, salasLocales])
  const clave = citaId ? 'cita:' + citaId : id ? 'pac:' + id : 'general'
  const sala = salas[clave] ?? ''
  const guardarSala = (k: string, v: string) => {
    if (!salasMeta.puedeEscribir) return setSalasLocales((l) => ({ ...l, [k]: v }))
    setSalasPref((prev) => {
      const n = { ...(prev ?? {}), [k]: v }
      const keys = Object.keys(n)
      for (const old of keys.slice(0, Math.max(0, keys.length - 300))) delete n[old] // conserva las 300 más recientes
      return n
    })
  }
  const [tab, setTab] = useState<'consulta' | 'prueba' | 'pizarra'>('consulta')
  const [pizarraVista, setPizarraVista] = useState(false)
  const [enLlamada, setEnLlamada] = useState(false)
  // Notas rápidas por sala: privadas del usuario (`telemedicina.notas.<sala>`, scope user)
  const [notasPref, setNotasPref] = usePreferencia<string>(sala ? 'telemedicina.notas.' + claveSegura(sala) : null, 'user', '', { lsKey: sala ? 'medisuite.telemed.notas.' + sala : undefined })
  const [notas, setNotas] = useState('')
  const [copiado, setCopiado] = useState(false)

  // sala por cita/paciente, persistida
  useEffect(() => {
    if (!salasMeta.cargando && !salas[clave]) guardarSala(clave, nuevaSala())
  }, [clave, salasMeta.cargando]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setEnLlamada(false), [sala])
  useEffect(() => setNotas(typeof notasPref === 'string' ? notasPref : ''), [notasPref])
  useEffect(() => { if (tab === 'pizarra') setPizarraVista(true) }, [tab])
  useEffect(() => setCitaId(''), [id])

  const regenerar = () => guardarSala(clave, nuevaSala())
  const link = JITSI + sala
  const cita = proximas.find((c) => c.id === citaId)
  const mensaje = `Hola${patient ? ' ' + patient.nombre.split(' ')[0] : ''}, le comparto el enlace para su videoconsulta${cita ? ' del ' + fmtFechaHora(cita.inicio) : ''} con ${settings.doctor.nombre || 'su médico'}: ${link}\nAbra el enlace desde su celular o computadora y permita el acceso a cámara y micrófono.`
  const tel = (patient?.telefono ?? '').replace(/\D/g, '')
  const wa = `https://wa.me/${tel ? (tel.length === 10 ? '52' + tel : tel) : ''}?text=${encodeURIComponent(mensaje)}`
  const nombreDr = settings.doctor.nombre || 'Médico'
  const src = `${link}#config.prejoinPageEnabled=true&config.disableDeepLinking=true&userInfo.displayName=${encodeURIComponent(JSON.stringify(nombreDr))}&interfaceConfig.LANG_DETECTION=false&config.defaultLanguage="es"`

  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { void pedirTexto('Copia el enlace', { inicial: link, aceptar: 'Listo' }) }
  }

  return (
    <Page title="Telemedicina" subtitle="Videoconsulta con Jitsi Meet, prueba de equipo y pizarra compartible">
      <PatientBar />
      <Tabs tabs={[{ id: 'consulta', label: 'Videoconsulta' }, { id: 'prueba', label: 'Probar cámara y micrófono' }, { id: 'pizarra', label: 'Pizarra' }]} value={tab} onChange={setTab} />

      <div className={tab === 'consulta' ? 'grid gap-4 lg:grid-cols-[1fr_340px]' : 'hidden'}>
        <Card pad={false} className="overflow-hidden">
          {enLlamada ? (
            <iframe title="Videoconsulta" src={src} allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write" className="block h-[70vh] min-h-[420px] w-full border-0 bg-black" />
          ) : (
            <div className="grid h-[50vh] min-h-[320px] place-items-center bg-surface-2 p-6 text-center">
              <div>
                <Video className="mx-auto mb-3 size-12 text-muted" />
                <div className="mb-1 font-medium">Sala {sala}</div>
                <p className="mb-4 text-sm text-muted">Comparte el enlace con el paciente y entra a la sala cuando estés listo.</p>
                <Button variant="primary" onClick={() => setEnLlamada(true)} disabled={!sala}><Video className="size-4" />Entrar a la videoconsulta</Button>
              </div>
            </div>
          )}
          {enLlamada && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-2">
              <Button size="sm" variant="danger" onClick={() => setEnLlamada(false)}><VideoOff className="size-4" />Salir de la sala</Button>
              <a href={link} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-brand hover:underline">Abrir en otra pestaña <ExternalLink className="size-3.5" /></a>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Sala">
            <div className="space-y-3">
              <Field label="Cita">
                <Select value={citaId} onChange={(e) => setCitaId(e.target.value)}>
                  <option value="">Sin cita (sala del paciente)</option>
                  {proximas.map((c) => <option key={c.id} value={c.id}>{fmtFechaHora(c.inicio)} · {c.tipo}{c.motivo ? ' · ' + c.motivo : ''}</option>)}
                </Select>
              </Field>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
                <button onClick={regenerar} title="Generar otra sala" aria-label="Generar otra sala" className="text-muted hover:text-ink"><RefreshCw className="size-4" /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={copiar}><Copy className="size-4" />{copiado ? 'Copiado' : 'Copiar enlace'}</Button>
                <a href={wa} target="_blank" rel="noreferrer"><Button size="sm"><MessageCircle className="size-4" />Enviar por WhatsApp</Button></a>
              </div>
              {patient && !tel && <p className="text-xs text-warn">{nombreCompleto(patient)} no tiene teléfono registrado; WhatsApp pedirá elegir el contacto.</p>}
            </div>
          </Card>
          <Card title="Notas rápidas" actions={<Badge>{isServer() ? 'privadas, en tu cuenta' : 'se guardan en este equipo'}</Badge>}>
            <Textarea aria-label="Notas rápidas de la videoconsulta" className="min-h-40" value={notas} placeholder="Motivo, hallazgos referidos, acuerdos…" onChange={(e) => { setNotas(e.target.value); setNotasPref(e.target.value || null) }} />
            <p className="mt-1 text-xs text-muted">Por sala ({sala}). Pásalas a la nota clínica al terminar.</p>
          </Card>
          <Notice tone="warn">
            El servidor público <b>meet.jit.si</b> puede pedir que un moderador inicie sesión (Google/GitHub) y no ofrece acuerdo de confidencialidad. Para uso clínico en producción usa un Jitsi propio o LiveKit con cifrado y aviso de privacidad.
          </Notice>
        </div>
      </div>

      {tab === 'prueba' && <PruebaEquipo />}
      {(tab === 'pizarra' || pizarraVista) && (
        <div className={tab === 'pizarra' ? '' : 'hidden'}>
          <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Cargando pizarra…</div>}>
            <Pizarra patientId={id} dark={dark} sala={sala} />
          </Suspense>
        </div>
      )}
    </Page>
  )
}
