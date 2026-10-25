import { useState } from 'react'
import { Save, Trash2, FileDown, ChevronDown, AlertTriangle } from 'lucide-react'
import { Page, PatientBar, Card, Notice, Button, Field, Input, Select, Textarea, Badge, Empty, Disclaimer, Tabs } from '../../components/ui'
import { confirmar } from '../../components/dialogos'
import { toast } from '../../components/toast'
import { add, remove, useActivePatient, useSettings } from '../../lib/store'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import type { Patient, Registro } from '../../lib/types'
import { cx, downloadBlob } from '../../lib/utils'
import { hoyISO } from '../prenatal/calc'
import {
  CHECKPOINTS, DOMINIOS, DOMINIO_LABEL, GUIA_PADRES, NOTA_EDI, SENALES_ALERTA, checkpointLabel, checkpointParaEdad, edadParaEvaluar, evaluar, hitosDe,
  type Checkpoint, type DatosDesarrollo, type Respuesta, type Resultado,
} from './hitos'

const dd = (r: Registro) => r.datos as unknown as DatosDesarrollo
const fmt = (f: string) => new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const mesesTxt = (m: number) => (m < 24 ? `${m.toFixed(1)} meses` : `${Math.floor(m / 12)} a ${Math.floor(m % 12)} m`)
const NIVEL: Record<Resultado['nivel'], { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  ok: { label: 'Hitos cumplidos', tone: 'ok' },
  vigilar: { label: 'Por confirmar', tone: 'warn' },
  alerta: { label: 'Requiere tamizaje', tone: 'danger' },
}
type Tab = 'evaluar' | 'historial' | 'guia'

export default function Desarrollo() {
  const { id: pid, patient } = useActivePatient()
  const regs = useRegistros('desarrollo', pid ?? '__ninguno__')
  const puede = useCanRegistro('desarrollo', 'write')
  const [tab, setTab] = useState<Tab>('evaluar')
  if (!patient) return <Page title="Desarrollo infantil"><PatientBar /></Page>
  return (
    <Page title="Desarrollo infantil" subtitle='Hitos CDC "Learn the Signs. Act Early." 2022 (2 a 60 meses)'>
      <PatientBar />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'evaluar', label: 'Evaluación' }, { id: 'historial', label: `Historial (${regs.length})` }, { id: 'guia', label: 'Señales de alerta y guía' }]} />
      {tab === 'evaluar' && <Evaluacion key={patient.id} patient={patient} previas={regs} puede={puede} onGuardado={() => setTab('historial')} />}
      {tab === 'historial' && <Historial regs={regs} puede={puede} patient={patient} />}
      {tab === 'guia' && <Guia />}
      <p className="mt-4 text-xs text-muted">
        Fuente: CDC “Learn the Signs. Act Early.” (dominio público) y Zubler JM, Wiggins LD, Macias MM, et al. Evidence-Informed Milestones for Developmental Surveillance Tools. Pediatrics 2022;149(3):e2021052138. Traducción de MediSuite. Cada hito lo alcanza al menos el 75 % de las niñas y niños a esa edad.
      </p>
      <Disclaimer>Lista de vigilancia del desarrollo; no es una prueba de tamizaje ni de diagnóstico.</Disclaimer>
    </Page>
  )
}

// ---------------------------------------------------------------------------
function Evaluacion({ patient, previas, puede, onGuardado }: { patient: Patient; previas: Registro[]; puede: boolean; onGuardado: () => void }) {
  const ultimaSdg = previas.map((r) => dd(r).sdgNacimiento).find((x) => x !== undefined)
  const [fecha, setFecha] = useState(hoyISO())
  const [sdg, setSdg] = useState(ultimaSdg ? String(ultimaSdg) : '')
  const sdgN = sdg.trim() ? Number(sdg) : null
  const e = edadParaEvaluar(patient.fechaNac, fecha, sdgN)
  const auto = checkpointParaEdad(e.corregidaMeses)
  const [cpManual, setCpManual] = useState<Checkpoint | null>(null)
  const cp = cpManual ?? auto
  const [resp, setResp] = useState<Record<string, Respuesta>>({})
  const [perdida, setPerdida] = useState(false)
  const [preocupaciones, setPreocupaciones] = useState('')
  const [notas, setNotas] = useState('')
  const hitos = cp ? hitosDe(cp) : []
  const res = cp ? evaluar(cp, resp, perdida) : null

  function guardar() {
    if (!cp || !res) return
    const datos: DatosDesarrollo = {
      fechaEval: fecha,
      sdgNacimiento: sdgN ?? undefined,
      edadCronologicaMeses: +e.cronologicaMeses.toFixed(2),
      edadCorregidaMeses: +e.corregidaMeses.toFixed(2),
      usaCorregida: e.usaCorregida,
      checkpoint: cp,
      respuestas: Object.fromEntries(hitos.filter((h) => resp[h.id]).map((h) => [h.id, resp[h.id]])),
      perdidaHabilidades: perdida,
      preocupaciones: preocupaciones || undefined,
      notas: notas || undefined,
      nivel: res.nivel,
      noCumplidos: res.no.map((h) => h.id),
    }
    const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined))
    add('registros', { patientId: patient.id, tipo: 'desarrollo', estado: res.nivel, fecha: new Date(fecha + 'T12:00:00').toISOString(), titulo: `Hitos del desarrollo ${checkpointLabel(cp)} · ${NIVEL[res.nivel].label}`, datos: limpio })
    toast('Evaluación del desarrollo guardada', res.nivel === 'alerta' ? 'warn' : 'ok')
    setResp({})
    setPerdida(false)
    setPreocupaciones('')
    setNotas('')
    onGuardado()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,340px)]">
      <div className="grid content-start gap-4">
        <Card title="Datos de la evaluación">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fecha"><Input type="date" value={fecha} max={hoyISO()} onChange={(ev) => setFecha(ev.target.value)} /></Field>
            <Field label="SDG al nacer" hint="Vacío o ≥ 37 = de término"><Input type="number" min={22} max={42} value={sdg} onChange={(ev) => setSdg(ev.target.value)} placeholder="40" /></Field>
            <Field label="Lista por edad">
              <Select value={cp ?? ''} onChange={(ev) => setCpManual(ev.target.value ? (Number(ev.target.value) as Checkpoint) : null)}>
                {!auto && <option value="">— (menor de 2 meses)</option>}
                {CHECKPOINTS.map((c) => <option key={c} value={c}>{checkpointLabel(c)}{c === auto ? ' (por edad)' : ''}</option>)}
              </Select>
            </Field>
          </div>
          <p className="mt-3 text-sm">
            Edad cronológica: <b>{mesesTxt(e.cronologicaMeses)}</b>
            {e.usaCorregida && <> · Edad corregida: <b>{mesesTxt(e.corregidaMeses)}</b> <Badge tone="brand">prematuro</Badge></>}
          </p>
          <p className="mt-1 text-xs text-muted">
            En prematuros (&lt; 37 SDG) se usa la edad corregida (edad cronológica − [40 − SDG al nacer] semanas) hasta los 24 meses. Se aplica la lista de la edad más reciente cumplida, como indica el CDC.
          </p>
          {e.cronologicaMeses > 66 && <Notice tone="warn">Las listas del CDC llegan hasta los 5 años. Para mayores, use otra herramienta de evaluación.</Notice>}
        </Card>
        {!cp ? (
          <Empty>La primera lista del CDC es a los 2 meses{e.usaCorregida ? ' de edad corregida' : ''}.</Empty>
        ) : (
          DOMINIOS.map((d) => (
            <Card key={d} title={DOMINIO_LABEL[d]}>
              <ul className="grid gap-3">
                {hitos.filter((h) => h.dominio === d).map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 basis-60 text-sm">{h.texto}</span>
                    <fieldset className="flex shrink-0 overflow-hidden rounded-lg border border-line" aria-label={h.texto}>
                      {([['si', 'Sí'], ['no', 'Todavía no'], ['nose', 'No sé']] as [Respuesta, string][]).map(([v, l]) => (
                        <label key={v} className={cx('cursor-pointer px-2.5 py-1.5 text-xs font-medium focus-within:ring-2 focus-within:ring-brand', resp[h.id] === v ? (v === 'si' ? 'bg-ok/15 text-ok' : v === 'no' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn') : 'text-muted hover:bg-surface-2')}>
                          <input type="radio" className="sr-only" name={h.id} value={v} checked={resp[h.id] === v} onChange={() => setResp({ ...resp, [h.id]: v })} />
                          {l}
                        </label>
                      ))}
                    </fieldset>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
      {cp && res && (
        <div className="grid content-start gap-4 lg:sticky lg:top-4">
          <Card title={`Resultado · ${checkpointLabel(cp)}`}>
            <div className="flex items-center gap-2"><Badge tone={NIVEL[res.nivel].tone}>{NIVEL[res.nivel].label}</Badge><span className="text-xs text-muted">{res.si}/{res.total} sí · {res.no.length} todavía no · {res.nose.length} no sé</span></div>
            <p className="mt-2 text-sm">{res.mensaje}</p>
            {res.no.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-danger">{res.no.map((h) => <li key={h.id}>{h.texto} <span className="text-xs text-muted">({DOMINIO_LABEL[h.dominio].split(' (')[0]})</span></li>)}</ul>
            )}
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={perdida} onChange={(ev) => setPerdida(ev.target.checked)} /> Ha perdido habilidades que ya tenía
            </label>
            <Field label="Preocupaciones de la familia" className="mt-3"><Textarea value={preocupaciones} onChange={(ev) => setPreocupaciones(ev.target.value)} className="min-h-14" /></Field>
            <Field label="Notas del médico / plan" className="mt-3"><Textarea value={notas} onChange={(ev) => setNotas(ev.target.value)} className="min-h-14" placeholder="p. ej. aplicar EDI, referir a audiología…" /></Field>
            {puede && <Button variant="primary" className="mt-3 w-full" disabled={res.sinResponder === res.total && !perdida} onClick={guardar}><Save className="size-4" /> Guardar evaluación</Button>}
          </Card>
          {res.nivel !== 'ok' && <Notice tone={res.nivel === 'alerta' ? 'danger' : 'warn'}>{NOTA_EDI}</Notice>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Historial({ regs, puede, patient }: { regs: Registro[]; puede: boolean; patient: Patient }) {
  const [abierto, setAbierto] = useState<string | null>(regs[0]?.id ?? null)
  const settings = useSettings()
  async function pdf(r: Registro) {
    const { evaluacionPDF } = await import('./pdf')
    downloadBlob(evaluacionPDF(patient, dd(r), settings), `desarrollo-${patient.nombre.split(' ')[0].toLowerCase()}-${dd(r).fechaEval}.pdf`)
  }
  if (!regs.length) return <Empty>Sin evaluaciones del desarrollo registradas.</Empty>
  return (
    <div className="grid gap-3">
      {regs.map((r) => {
        const d = dd(r)
        const res = evaluar(d.checkpoint, d.respuestas, d.perdidaHabilidades)
        const open = abierto === r.id
        return (
          <article key={r.id} className="rounded-xl border border-line bg-surface">
            <header className="flex flex-wrap items-center gap-2 p-3">
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} onClick={() => setAbierto(open ? null : r.id)}>
                <ChevronDown className={cx('size-4 shrink-0 transition', open && 'rotate-180')} />
                <span className="text-sm font-medium">{fmt(d.fechaEval)} · lista de {checkpointLabel(d.checkpoint)}</span>
              </button>
              <Badge tone={NIVEL[res.nivel].tone}>{NIVEL[res.nivel].label}</Badge>
              <Button size="sm" variant="ghost" aria-label="Descargar PDF para la familia" onClick={() => pdf(r)}><FileDown className="size-4" /></Button>
              {puede && <Button size="sm" variant="ghost" aria-label="Eliminar evaluación" onClick={async () => { if (await confirmar(`¿Eliminar la evaluación del ${fmt(d.fechaEval)}?`, { titulo: 'Eliminar evaluación', aceptar: 'Eliminar', peligro: true })) remove('registros', r.id) }}><Trash2 className="size-4" /></Button>}
            </header>
            {open && (
              <div className="border-t border-line p-3 text-sm">
                <p className="text-muted">
                  Edad cronológica {mesesTxt(d.edadCronologicaMeses)}{d.usaCorregida ? ` · corregida ${mesesTxt(d.edadCorregidaMeses)} (${d.sdgNacimiento} SDG al nacer)` : ''} · {res.si}/{res.total} hitos sí
                </p>
                <p className="mt-1">{res.mensaje}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {DOMINIOS.map((dom) => (
                    <div key={dom}>
                      <div className="text-xs font-medium text-muted">{DOMINIO_LABEL[dom].split(' (')[0]}</div>
                      <ul className="mt-1 space-y-0.5">
                        {hitosDe(d.checkpoint).filter((h) => h.dominio === dom).map((h) => {
                          const v = d.respuestas[h.id]
                          return <li key={h.id} className={cx('text-xs', v === 'no' && 'text-danger', v === 'nose' && 'text-warn', !v && 'text-muted')}>{v === 'si' ? '✓' : v === 'no' ? '✗' : v === 'nose' ? '?' : '–'} {h.texto}</li>
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
                {d.perdidaHabilidades && <p className="mt-2 font-medium text-danger"><AlertTriangle className="mr-1 inline size-4" />Pérdida de habilidades referida.</p>}
                {d.preocupaciones && <p className="mt-2"><b>Preocupaciones:</b> {d.preocupaciones}</p>}
                {d.notas && <p className="mt-1"><b>Notas:</b> {d.notas}</p>}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function Guia() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Señales de alerta">
        <ul className="grid gap-2 text-sm">
          {SENALES_ALERTA.map((s) => (
            <li key={s.texto} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" /><span>{s.texto} <span className="block text-xs text-muted">{s.ref}</span></span></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Ante cualquiera de estas señales, o si un hito de la lista todavía no se observa, aplique una prueba de tamizaje y valore la referencia (estimulación temprana, audiología, neurología o psicología del desarrollo).</p>
      </Card>
      <Card title="Para madres, padres y cuidadores">
        <p className="text-sm">{GUIA_PADRES}</p>
        <h3 className="mt-4 text-sm font-semibold">Tamizaje del desarrollo en México</h3>
        <p className="mt-1 text-sm text-muted">{NOTA_EDI}</p>
      </Card>
    </div>
  )
}
