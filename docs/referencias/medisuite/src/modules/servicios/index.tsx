import { useCallback, useEffect, useState } from 'react'
import { Server, RefreshCw, Upload, ExternalLink, Save, Copy } from 'lucide-react'
import { Page, Card, Button, Field, Input, Badge, Notice, Empty } from '../../components/ui'
import { updateSettings, useSettings } from '../../lib/store'
import type { Settings } from '../../lib/types'

type Clave = keyof Settings['servicios']
type Estado = 'revisando' | 'en-linea' | 'fuera' | 'sin-configurar'

const SERVICIOS: { id: Clave; nombre: string; para: string; ejemplo: string; ruta: string }[] = [
  { id: 'orthanc', nombre: 'Orthanc (PACS)', para: 'Almacena estudios DICOM (rayos X, TAC, RM, US) y los sirve por DICOMweb al visor.', ejemplo: 'http://localhost:8080/orthanc', ruta: '/system' },
  { id: 'ohif', nombre: 'Visor OHIF', para: 'Visor radiológico web profesional conectado a Orthanc (MPR, mediciones, series).', ejemplo: 'http://localhost:3000', ruta: '/' },
  { id: 'whisper', nombre: 'Whisper (speaches)', para: 'Transcripción de voz en tu servidor con API compatible con OpenAI; el audio no sale de tu red.', ejemplo: 'http://localhost:8080/whisper', ruta: '/health' },
  { id: 'presidio', nombre: 'Presidio (analizador)', para: 'Detecta datos personales en texto libre antes de enviarlo a una IA externa.', ejemplo: 'http://localhost:8080/presidio-analyzer', ruta: '/health' },
]

const PREMIUM = [
  ['TotalSegmentator', 'Segmentación automática de >100 estructuras en TAC/RM', 'GPU recomendada'],
  ['MedSAM', 'Segmentación interactiva de lesiones en imagen médica', 'GPU'],
  ['PaddleOCR / Docling', 'OCR de PDF y reportes complejos (tablas, varias páginas)', 'CPU'],
  ['CFDI 4.0 / PAC', 'Timbrado de facturas con un PAC autorizado por el SAT', 'Servicio externo'],
  ['Keycloak', 'Inicio de sesión, usuarios, roles y 2FA para el consultorio', 'CPU'],
  ['Medplum', 'Servidor FHIR para expediente multi-usuario y sincronización', 'CPU + PostgreSQL'],
]

// noCors: para servicios sin encabezados CORS (OHIF); una respuesta opaca basta para saber que responde
async function ping(url: string, noCors = false, ms = 4000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store', mode: noCors ? 'no-cors' : 'cors' })
    return noCors || r.ok
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

const base = (u?: string) => (u ?? '').trim().replace(/\/$/, '')

interface Estudio { ID: string; MainDicomTags: Record<string, string>; PatientMainDicomTags: Record<string, string>; Series: string[] }

export default function Modulo() {
  const settings = useSettings()
  const [urls, setUrls] = useState<Settings['servicios']>(settings.servicios)
  const [estado, setEstado] = useState<Partial<Record<Clave, Estado>>>({})
  const [guardado, setGuardado] = useState(false)
  const [subida, setSubida] = useState<{ total: number; ok: number; err: number; actual?: string } | null>(null)
  const [estudios, setEstudios] = useState<Estudio[] | null>(null)
  const [errEst, setErrEst] = useState('')

  useEffect(() => setUrls(settings.servicios), [settings.servicios])

  const revisar = useCallback(async (svc = settings.servicios) => {
    const next: Partial<Record<Clave, Estado>> = {}
    SERVICIOS.forEach((s) => (next[s.id] = base(svc[s.id]) ? 'revisando' : 'sin-configurar'))
    setEstado(next)
    await Promise.all(
      SERVICIOS.map(async (s) => {
        const b = base(svc[s.id])
        if (!b) return
        let ok = await ping(b + s.ruta, s.id === 'ohif')
        if (!ok && s.id === 'whisper') ok = await ping(b + '/v1/models')
        setEstado((e) => ({ ...e, [s.id]: ok ? 'en-linea' : 'fuera' }))
      }),
    )
  }, [settings.servicios])

  useEffect(() => { void revisar() }, [revisar])

  function guardar() {
    const limpio = Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, base(v) || undefined])) as Settings['servicios']
    updateSettings({ servicios: limpio })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 1500)
  }

  async function cargarEstudios() {
    const o = base(settings.servicios.orthanc)
    if (!o) return
    setErrEst('')
    try {
      const r = await fetch(`${o}/studies?expand`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setEstudios(await r.json())
    } catch (e) {
      setErrEst('No se pudo consultar Orthanc: ' + (e as Error).message)
      setEstudios(null)
    }
  }

  async function subir(files: FileList | null) {
    const o = base(settings.servicios.orthanc)
    if (!o || !files?.length) return
    const lista = [...files]
    let ok = 0, err = 0
    setSubida({ total: lista.length, ok, err })
    for (const f of lista) {
      setSubida({ total: lista.length, ok, err, actual: f.name })
      try {
        const r = await fetch(`${o}/instances`, { method: 'POST', headers: { 'Content-Type': 'application/dicom' }, body: f })
        if (r.ok) ok++
        else err++
      } catch {
        err++
      }
      setSubida({ total: lista.length, ok, err })
    }
    void cargarEstudios()
  }

  const badge = (e?: Estado) =>
    e === 'en-linea' ? <Badge tone="ok">En línea</Badge> : e === 'fuera' ? <Badge tone="danger">Fuera de línea</Badge> : e === 'revisando' ? <Badge tone="warn">Revisando…</Badge> : <Badge>Sin configurar</Badge>

  const ohif = base(settings.servicios.ohif)
  const cmd = 'cd servidor\ncp .env.example .env   # opcional: ajusta puertos\ndocker compose up -d --build\ndocker compose ps'

  return (
    <Page
      title="Servicios del servidor"
      subtitle="Opcionales: MediSuite funciona solo en el navegador; estos servicios agregan PACS, transcripción privada y desidentificación"
      actions={<Button onClick={() => revisar()}><RefreshCw className="size-4" /> Revisar estado</Button>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {SERVICIOS.map((s) => (
          <Card key={s.id} title={<span className="flex items-center gap-2"><Server className="size-4 text-brand" />{s.nombre}</span>} actions={badge(estado[s.id])}>
            <p className="mb-3 text-sm text-muted">{s.para}</p>
            <Field label="URL" hint={`Ejemplo: ${s.ejemplo} · se verifica ${s.ruta}`}>
              <Input value={urls[s.id] ?? ''} onChange={(e) => setUrls({ ...urls, [s.id]: e.target.value })} placeholder={s.ejemplo} inputMode="url" />
            </Field>
          </Card>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button onClick={() => setUrls(Object.fromEntries(SERVICIOS.map((s) => [s.id, s.ejemplo])) as Settings['servicios'])}>Usar valores locales por defecto</Button>
        <Button variant="primary" onClick={() => { guardar(); setTimeout(() => revisar(), 50) }}><Save className="size-4" /> {guardado ? 'Guardado' : 'Guardar y revisar'}</Button>
      </div>

      <Card title="Orthanc: subir DICOM y ver estudios" className="mt-6">
        {!settings.servicios.orthanc ? (
          <Empty>Configura y guarda la URL de Orthanc para usar esta sección.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong dark:text-black">
                <Upload className="size-4" /> Subir archivos DICOM
                <input type="file" multiple accept=".dcm,application/dicom,*/*" className="hidden" onChange={(e) => subir(e.target.files)} />
              </label>
              <Button onClick={cargarEstudios}><RefreshCw className="size-4" /> Listar estudios</Button>
            </div>
            {subida && (
              <div className="mt-3 text-sm">
                <div className="mb-1 text-xs text-muted">
                  {subida.ok + subida.err}/{subida.total} · {subida.ok} correctos{subida.err ? ` · ${subida.err} con error` : ''}{subida.actual ? ` · ${subida.actual}` : ''}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-brand transition-all" style={{ width: `${((subida.ok + subida.err) / subida.total) * 100}%` }} />
                </div>
              </div>
            )}
            {errEst && <div className="mt-3"><Notice tone="danger">{errEst}</Notice></div>}
            {estudios && (
              <div className="-mx-4 mt-3 overflow-x-auto">
                {estudios.length === 0 ? <div className="px-4"><Empty>Orthanc no tiene estudios.</Empty></div> : (
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="px-4 py-2">Paciente</th><th>Fecha</th><th>Descripción</th><th>Series</th><th className="pr-4"></th></tr></thead>
                    <tbody>
                      {estudios.map((e) => {
                        const uid = e.MainDicomTags.StudyInstanceUID
                        const f = e.MainDicomTags.StudyDate
                        return (
                          <tr key={e.ID} className="border-b border-line">
                            <td className="px-4 py-2">{(e.PatientMainDicomTags.PatientName ?? '—').replace(/\^/g, ' ')}</td>
                            <td>{f ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : '—'}</td>
                            <td>{e.MainDicomTags.StudyDescription || '—'}</td>
                            <td>{e.Series.length}</td>
                            <td className="pr-4 text-right">
                              {ohif ? (
                                <a className="inline-flex items-center gap-1 text-brand hover:underline" href={`${ohif}/viewer?StudyInstanceUIDs=${encodeURIComponent(uid)}`} target="_blank" rel="noreferrer">
                                  Abrir en OHIF <ExternalLink className="size-3.5" />
                                </a>
                              ) : <span className="text-xs text-muted">Configura OHIF</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Inicio rápido (Docker)" actions={<Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(cmd)}><Copy className="size-4" /> Copiar</Button>}>
          <p className="mb-2 text-sm text-muted">En un equipo de la clínica (Linux, Windows o Mac con Docker), desde la carpeta <code>servidor/</code> del proyecto:</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs"><code>{cmd}</code></pre>
          <ul className="break-words [&_code]:break-all mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
            <li>Proxy con CORS en <code>http://localhost:8080</code> (rutas /orthanc, /whisper, /presidio-analyzer, /presidio-anonymizer).</li>
            <li>OHIF en <code>http://localhost:3000</code>. Orthanc Explorer en <code>http://localhost:8080/orthanc/app/explorer.html</code>.</li>
            <li>Si abres MediSuite por HTTPS en otro equipo, el servidor también debe tener HTTPS (el navegador bloquea contenido mixto).</li>
            <li>Detalles, seguridad y respaldos en <code>servidor/README.md</code>.</li>
          </ul>
        </Card>
        <Card title="Servicios premium planeados" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="px-4 py-2">Servicio</th><th>Para qué</th><th>Requiere</th><th className="pr-4">Estado</th></tr></thead>
              <tbody>
                {PREMIUM.map(([n, d, r]) => (
                  <tr key={n} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{n}</td>
                    <td className="py-2 text-muted">{d}</td>
                    <td className="py-2 text-xs">{r}</td>
                    <td className="whitespace-nowrap py-2 pr-4"><Badge tone="warn">por integrar</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Page>
  )
}
