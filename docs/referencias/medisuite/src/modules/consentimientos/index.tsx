import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileCheck2, Loader2, Trash2 } from 'lucide-react'
import { Page, Card, Button, Field, Input, Textarea, Select, Notice, Empty, PatientBar, Badge } from '../../components/ui'
import { add, remove, useActivePatient, useCollection, useSettings } from '../../lib/store'
import { downloadBlob, edad, fileToDataUrl, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { PLANTILLAS, rellenar } from './plantillas'
import { FirmaPad, type FirmaHandle } from './FirmaPad'
import { consentimientoPDF, sha256Hex, type FirmaPDF } from './pdf'
import { confirmar } from '../../components/dialogos'

type Campo = 'procedimiento' | 'riesgos' | 'beneficios' | 'alternativas'
const ETIQ: Record<Campo, string> = { procedimiento: 'Procedimiento / finalidad', riesgos: 'Riesgos y complicaciones', beneficios: 'Beneficios esperados', alternativas: 'Alternativas' }

export default function Consentimientos() {
  const { patient } = useActivePatient()
  const s = useSettings()
  const pid = patient?.id
  const docs = useCollection('documents', (d) => d.patientId === pid && d.tipo === 'consentimiento', [pid])
  const lista = useMemo(() => [...docs].sort((a, b) => b.fecha.localeCompare(a.fecha)), [docs])

  const [pl, setPl] = useState(PLANTILLAS[0].id)
  const plantilla = PLANTILLAS.find((p) => p.id === pl)!
  const [campos, setCampos] = useState<Partial<Record<Campo, string>>>({})
  const [firmante, setFirmante] = useState('')
  const [rolFirmante, setRolFirmante] = useState<'paciente' | 'representante'>('paciente')
  const [testigo, setTestigo] = useState(false)
  const [nomTestigo, setNomTestigo] = useState('')
  const [vacias, setVacias] = useState({ pac: true, med: true, tes: true })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const fPac = useRef<FirmaHandle>(null)
  const fMed = useRef<FirmaHandle>(null)
  const fTes = useRef<FirmaHandle>(null)

  const val = (c: Campo) => campos[c] ?? plantilla.defaults?.[c] ?? ''
  const menor = patient ? edad(patient.fechaNac).anios < 18 : false
  const rol = menor ? 'representante' : rolFirmante
  const nombreFirmante = rol === 'paciente' ? (patient ? nombreCompleto(patient) : '') : firmante

  const texto = useMemo(() => {
    if (!patient) return ''
    const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    return rellenar(plantilla.texto, {
      paciente: nombreCompleto(patient) + (rol === 'representante' && firmante ? `, representado(a) por ${firmante}` : ''),
      edad: edad(patient.fechaNac).texto,
      medico: s.doctor.nombre,
      cedula: s.doctor.cedula,
      especialidad: s.doctor.especialidad,
      clinica: s.clinica,
      direccion: s.doctor.direccion,
      fecha,
      procedimiento: val('procedimiento'),
      riesgos: val('riesgos'),
      beneficios: val('beneficios'),
      alternativas: val('alternativas'),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, plantilla, campos, s, rol, firmante])

  const limpiar = () => {
    fPac.current?.clear()
    fMed.current?.clear()
    fTes.current?.clear()
  }
  // al cambiar de paciente, borrar firmas capturadas
  useEffect(() => {
    limpiar()
    setFirmante('')
    setMsg(null)
  }, [pid])

  const generar = async () => {
    if (!patient) return
    if (fPac.current?.isEmpty()) return setMsg({ tone: 'warn', text: 'Falta la firma del paciente o representante.' })
    if (fMed.current?.isEmpty()) return setMsg({ tone: 'warn', text: 'Falta la firma del médico.' })
    if (!nombreFirmante.trim()) return setMsg({ tone: 'warn', text: 'Escribe el nombre del representante legal.' })
    if (testigo && (fTes.current?.isEmpty() || !nomTestigo.trim())) return setMsg({ tone: 'warn', text: 'Completa nombre y firma del testigo, o desactívalo.' })
    setBusy(true)
    try {
      const firmas: FirmaPDF[] = [
        { rol: rol === 'paciente' ? 'Paciente' : 'Representante legal / tutor', nombre: nombreFirmante, png: fPac.current!.toPNG() },
        { rol: `Médico tratante · Céd. Prof. ${s.doctor.cedula}`, nombre: s.doctor.nombre, png: fMed.current!.toPNG() },
      ]
      if (testigo) firmas.push({ rol: 'Testigo', nombre: nomTestigo, png: fTes.current!.toPNG() })
      const fecha = new Date()
      const folio = 'CI-' + fecha.getTime().toString(36).toUpperCase()
      const hash = await sha256Hex(JSON.stringify({ folio, titulo: plantilla.titulo, texto, fecha: fecha.toISOString(), firmas }))
      const bytes = await consentimientoPDF({ clinica: s.clinica, titulo: plantilla.titulo, texto, firmas, fecha, hash, folio })
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      const nombre = `${plantilla.titulo} - ${nombreCompleto(patient)} - ${fecha.toISOString().slice(0, 10)}.pdf`
      add('documents', {
        patientId: patient.id,
        fecha: fecha.toISOString(),
        tipo: 'consentimiento',
        nombre,
        mime: 'application/pdf',
        dataUrl: await fileToDataUrl(blob),
        meta: { plantilla: plantilla.id, folio, sha256: hash, firmantes: firmas.map((f) => `${f.rol}: ${f.nombre}`) },
      })
      downloadBlob(blob, nombre)
      limpiar()
      setMsg({ tone: 'info', text: `Consentimiento ${folio} firmado y guardado en el expediente. SHA-256: ${hash.slice(0, 16)}…` })
    } catch (e) {
      setMsg({ tone: 'danger', text: 'No se pudo generar el PDF: ' + (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (!patient)
    return (
      <Page title="Consentimientos">
        <PatientBar />
      </Page>
    )

  return (
    <Page title="Consentimientos informados" subtitle="Plantillas, firma en pantalla y PDF con huella SHA-256">
      <PatientBar />
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card title="Documento">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Plantilla" className="sm:col-span-2">
                <Select
                  value={pl}
                  onChange={(e) => {
                    setPl(e.target.value)
                    setCampos({})
                  }}
                >
                  {PLANTILLAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titulo}
                    </option>
                  ))}
                </Select>
              </Field>
              {plantilla.campos.map((c) => (
                <Field key={c} label={ETIQ[c]} className={c === 'procedimiento' ? 'sm:col-span-2' : ''}>
                  {c === 'procedimiento' ? (
                    <Input value={val(c)} onChange={(e) => setCampos((x) => ({ ...x, [c]: e.target.value }))} />
                  ) : (
                    <Textarea value={val(c)} onChange={(e) => setCampos((x) => ({ ...x, [c]: e.target.value }))} />
                  )}
                </Field>
              ))}
            </div>
            <div className="mt-4 max-h-[28rem] overflow-auto rounded-lg border border-line bg-white p-5 text-[13px] leading-relaxed text-gray-800 shadow-inner">
              <h3 className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-gray-900">{plantilla.titulo}</h3>
              <div className="whitespace-pre-wrap">{texto}</div>
            </div>
          </Card>

          <Card title="Firmas">
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <Field label="Firma">
                <Select value={rol} disabled={menor} onChange={(e) => setRolFirmante(e.target.value as 'paciente' | 'representante')}>
                  <option value="paciente">El paciente</option>
                  <option value="representante">Representante legal / tutor</option>
                </Select>
              </Field>
              {rol === 'representante' && (
                <Field label="Nombre del representante" hint={menor ? 'Paciente menor de edad: firma su madre, padre o tutor.' : undefined}>
                  <Input value={firmante} onChange={(e) => setFirmante(e.target.value)} />
                </Field>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FirmaPad ref={fPac} label={rol === 'paciente' ? `Paciente: ${nombreCompleto(patient)}` : `Representante: ${firmante || '—'}`} onChange={(v) => setVacias((x) => ({ ...x, pac: v }))} />
              <FirmaPad ref={fMed} label={`Médico: ${s.doctor.nombre}`} onChange={(v) => setVacias((x) => ({ ...x, med: v }))} />
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={testigo} onChange={(e) => setTestigo(e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> Agregar testigo
            </label>
            {testigo && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Nombre del testigo">
                  <Input value={nomTestigo} onChange={(e) => setNomTestigo(e.target.value)} />
                </Field>
                <FirmaPad ref={fTes} label="Firma del testigo" onChange={(v) => setVacias((x) => ({ ...x, tes: v }))} />
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={generar} disabled={busy || vacias.pac || vacias.med}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />} Firmar y generar PDF
              </Button>
              <Button variant="ghost" onClick={limpiar}>
                Borrar firmas
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              La NOM-004-SSA3-2012 pide nombre y firma de dos testigos en cartas de consentimiento de procedimientos. Firma autógrafa digitalizada; para firma electrónica
              avanzada (e.firma SAT) se requiere integración en el servidor.
            </p>
          </Card>
        </div>

        <Card title="Consentimientos del paciente" className="h-fit min-w-0">
          {lista.length === 0 ? (
            <Empty>Sin consentimientos firmados</Empty>
          ) : (
            <ul className="space-y-2">
              {lista.map((d) => (
                <li key={d.id} className="rounded-lg border border-line p-2.5">
                  <div className="text-sm font-medium leading-snug">{d.nombre.replace(/\.pdf$/, '').split(' - ')[0]}</div>
                  <div className="mt-0.5 text-xs text-muted">{fmtFechaHora(d.fecha)}</div>
                  {typeof d.meta?.sha256 === 'string' && <div className="mt-1 truncate font-mono text-[10px] text-muted" title={d.meta.sha256}>SHA-256 {d.meta.sha256}</div>}
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" onClick={() => downloadBlob(d.dataUrl, d.nombre)}>
                      <Download className="size-3.5" /> Descargar
                    </Button>
                    {typeof d.meta?.folio === 'string' && <Badge>{d.meta.folio}</Badge>}
                    <button
                      className="ml-auto text-muted hover:text-danger"
                      aria-label="Eliminar"
                      onClick={() => void confirmar('¿Eliminar este consentimiento del expediente?', { peligro: true }).then((ok) => ok && remove('documents', d.id))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Page>
  )
}
