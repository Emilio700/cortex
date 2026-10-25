import { useEffect, useRef, useState } from 'react'
import { Camera, Upload, Square, Ghost, SwitchCamera } from 'lucide-react'
import type { DocumentFile } from '../../lib/types'
import { Card, Button, Field, Select, Textarea, Notice, Unsupported } from '../../components/ui'
import { fmtFecha } from '../../lib/utils'
import { ZONAS, archivoAJpeg, guardarFoto, meta, recodificar } from './img'

const RES = { '720': [1280, 720], '1080': [1920, 1080], '2160': [3840, 2160] } as const

export default function Captura({ patientId, fotos, guiaId, setGuiaId, onGuardada }: { patientId: string | null; fotos: DocumentFile[]; guiaId: string | null; setGuiaId: (id: string | null) => void; onGuardada: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [activa, setActiva] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [res, setRes] = useState<keyof typeof RES>('1080')
  const [zona, setZona] = useState(ZONAS[0])
  const [nota, setNota] = useState('')
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null)
  const [flash, setFlash] = useState(false)
  const guia = fotos.find((f) => f.id === guiaId)
  const soporte = !!navigator.mediaDevices?.getUserMedia

  const parar = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActiva(false)
  }
  useEffect(() => parar, [])

  const iniciar = async (dev = deviceId, fac = facing, r = res) => {
    parar()
    setMsg(null)
    const [w, h] = RES[r]
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { ...(dev ? { deviceId: { exact: dev } } : { facingMode: { ideal: fac } }), width: { ideal: w }, height: { ideal: h } }, audio: false })
      streamRef.current = s
      videoRef.current!.srcObject = s
      await videoRef.current!.play()
      setActiva(true)
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
      setDevices(list)
      if (!dev) setDeviceId(s.getVideoTracks()[0]?.getSettings().deviceId ?? '')
    } catch (e) {
      setMsg({ t: 'err', s: (e as Error).name === 'NotAllowedError' ? 'Permiso de cámara denegado.' : 'No se pudo abrir la cámara: ' + (e as Error).message })
    }
  }

  const guardar = (img: { dataUrl: string; ancho: number; alto: number }, origen: 'camara' | 'archivo') => {
    if (!patientId) return setMsg({ t: 'err', s: 'Selecciona un paciente.' })
    guardarFoto(patientId, img, { zona, nota: nota.trim() || undefined, origen })
    setMsg({ t: 'ok', s: `Foto guardada en “${zona}” (${img.ancho}×${img.alto}, sin metadatos EXIF).` })
    onGuardada()
  }

  const capturar = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
    guardar(recodificar(v, v.videoWidth, v.videoHeight), 'camara')
  }

  const subir = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      try {
        guardar(await archivoAJpeg(f), 'archivo')
      } catch {
        setMsg({ t: 'err', s: `No se pudo leer ${f.name}` })
      }
    }
  }

  const candidatasGuia = [...fotos].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card pad={false} className="overflow-hidden">
        <div className="relative aspect-[4/3] w-full bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
          {activa && guia && <img src={guia.dataUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-35" />}
          {flash && <div className="absolute inset-0 bg-white/70" />}
          {!activa && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">
              <div><Camera className="mx-auto mb-2 size-10" />Inicia la cámara o sube fotos. Las imágenes se re-codifican (sin EXIF/GPS) y se reducen a máx. 1600 px.</div>
            </div>
          )}
          {activa && guia && <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">Toma guiada · {meta(guia).zona} · {fmtFecha(guia.fecha)}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
          {activa ? (
            <>
              <Button variant="primary" onClick={capturar}><Camera className="size-4" />Tomar foto</Button>
              <Button onClick={parar}><Square className="size-4" />Detener</Button>
              <Button variant="ghost" onClick={() => { const f = facing === 'user' ? 'environment' : 'user'; setFacing(f); setDeviceId(''); iniciar('', f) }}><SwitchCamera className="size-4" />Frontal/trasera</Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => iniciar()} disabled={!soporte}><Camera className="size-4" />Iniciar cámara</Button>
          )}
          <Button onClick={() => fileRef.current?.click()}><Upload className="size-4" />Subir fotos</Button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
        </div>
      </Card>
      <div className="space-y-4">
        {!soporte && <Unsupported api="Cámara (getUserMedia)">Puedes subir fotos desde archivo.</Unsupported>}
        {msg && <Notice tone={msg.t === 'ok' ? 'info' : 'danger'} onClose={() => setMsg(null)}>{msg.s}</Notice>}
        <Card title="Etiquetas">
          <div className="space-y-3">
            <Field label="Zona corporal">
              <Select value={zona} onChange={(e) => setZona(e.target.value)}>{ZONAS.map((z) => <option key={z}>{z}</option>)}</Select>
            </Field>
            <Field label="Nota">
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. lesión 2 cm, borde irregular…" />
            </Field>
          </div>
        </Card>
        <Card title="Cámara">
          <div className="space-y-3">
            <Field label="Dispositivo">
              <Select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); if (activa) iniciar(e.target.value) }} disabled={!devices.length}>
                {!devices.length && <option value="">Inicia la cámara para listar</option>}
                {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${i + 1}`}</option>)}
              </Select>
            </Field>
            <Field label="Resolución solicitada">
              <Select value={res} onChange={(e) => { const r = e.target.value as keyof typeof RES; setRes(r); if (activa) iniciar(deviceId, facing, r) }}>
                <option value="720">HD 1280×720</option><option value="1080">Full HD 1920×1080</option><option value="2160">4K 3840×2160</option>
              </Select>
            </Field>
            <Field label="Toma guiada (fantasma 35%)" hint="Superpone una foto previa para repetir el mismo encuadre.">
              <Select value={guiaId ?? ''} onChange={(e) => setGuiaId(e.target.value || null)}>
                <option value="">Sin guía</option>
                {candidatasGuia.map((f) => <option key={f.id} value={f.id}>{meta(f).zona} · {fmtFecha(f.fecha)}</option>)}
              </Select>
            </Field>
            {guia && <div className="flex items-center gap-2 text-xs text-muted"><Ghost className="size-4" />Alinea la toma con la silueta antes de capturar.</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
