import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Model } from 'survey-core'
import { Survey } from 'survey-react-ui'
import 'survey-core/survey-core.min.css'
import 'survey-core/i18n/spanish'
import './survey-theme.css'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { AlertOctagon, Check, ClipboardList, RotateCcw, Save } from 'lucide-react'
import { Page, PatientBar, Card, Button, Badge, Select, Notice, Disclaimer, Empty } from '../../components/ui'
import { useActivePatient, useCollection, add } from '../../lib/store'
import { cx, fmtFecha } from '../../lib/utils'
import { ESCALAS, puntuar, type Ctx, type Escala } from './escalas'

const AREAS = Array.from(new Set(ESCALAS.map((e) => e.area)))

function useCtx(): Ctx {
  const { id, patient } = useActivePatient()
  const obs = useCollection('observations', (o) => o.patientId === id, [id])
  return useMemo(() => {
    const last = (c: string) => obs.filter((o) => o.codigo === c).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.valor
    const peso = last('peso'), talla = last('talla')
    return {
      sexo: patient?.sexo,
      edad: patient ? (Date.now() - Date.parse(patient.fechaNac)) / (365.25 * 864e5) : undefined,
      imc: last('imc') ?? (peso && talla ? peso / (talla / 100) ** 2 : undefined),
      cintura: last('cintura'),
    }
  }, [obs, patient])
}

function AlertaSuicidio() {
  return (
    <div className="mb-4 rounded-xl border-2 border-danger bg-danger/10 p-4">
      <div className="flex items-center gap-2 text-base font-semibold text-danger">
        <AlertOctagon className="size-5" /> Ítem 9 positivo: ideación de muerte o autolesión
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Evalúe el riesgo suicida <b>hoy</b>, independientemente del puntaje total (plan, intención, medios, intentos previos).</li>
        <li>No deje solo al paciente si hay riesgo inminente; considere valoración psiquiátrica urgente.</li>
        <li>Línea de la Vida (México, 24 h, gratuita): <b>800 911 2000</b>. Emergencias: <b>911</b>.</li>
      </ul>
    </div>
  )
}

function Historial({ escala }: { escala: Escala }) {
  const { id } = useActivePatient()
  const obs = useCollection('observations', (o) => o.patientId === id && o.codigo === 'escala' && o.etiqueta === escala.nombre, [id, escala.nombre])
  const datos = [...obs].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((o) => ({ ...o, f: fmtFecha(o.fecha, { day: '2-digit', month: 'short' }) }))
  return (
    <Card title={`Historial de ${escala.nombre}`}>
      {datos.length === 0 ? (
        <Empty>Sin aplicaciones previas para este paciente.</Empty>
      ) : (
        <>
          {datos.length > 1 && (
            <div className="h-40">
              <ResponsiveContainer>
                <LineChart data={datos} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="f" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                  <YAxis domain={[escala.min, escala.max]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="valor" name="Puntaje" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-2 divide-y divide-line text-sm">
            {[...datos].reverse().slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-muted">{fmtFecha(o.fecha)}</span>
                <span className="truncate text-xs text-muted">{o.interpretacion}</span>
                <span className="font-semibold tabular-nums">{o.valor}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function Aplicacion({ escala, ctx }: { escala: Escala; ctx: Ctx }) {
  const { id: pid } = useActivePatient()
  const [run, setRun] = useState(0)
  const [res, setRes] = useState<Record<string, number> | null>(null)
  const [live, setLive] = useState<Record<string, number>>({})
  const [guardado, setGuardado] = useState(false)
  const items = useMemo(() => escala.items(ctx), [escala, ctx])

  const model = useMemo(() => {
    const def = escala.defaults?.(ctx) ?? {}
    const m = new Model({
      locale: 'es',
      showQuestionNumbers: 'on',
      completeText: 'Calcular puntaje',
      showCompletedPage: false,
      questionErrorLocation: 'bottom',
      elements: items.map((i) => ({
        type: 'radiogroup', name: i.name, title: i.title, isRequired: i.scored !== false || escala.id === 'apgar',
        choices: i.choices.map(([value, text]) => ({ value, text })), defaultValue: def[i.name], colCount: i.choices.length <= 4 && i.choices.every(([, t]) => t.length < 34) ? 2 : 1,
      })),
    })
    m.onValueChanged.add((s) => setLive({ ...s.data }))
    m.onComplete.add((s) => setRes({ ...s.data }))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escala, items, run])
  useEffect(() => {
    setLive({ ...model.data })
  }, [model])

  const data = res ?? live
  const p = puntuar(escala, ctx, data)
  const [banda, tono] = escala.banda(p, ctx, data)
  const det = res ? escala.detalle?.(res, p) : undefined
  const alerta9 = escala.id === 'phq9' && Number(data.q9) > 0
  const contestadas = items.filter((i) => data[i.name] !== undefined).length

  function guardar() {
    if (!pid || !res) return
    add('observations', { patientId: pid, codigo: 'escala', valor: p, unidad: 'pts', etiqueta: escala.nombre, fuente: 'escala', interpretacion: banda + (det ? ` · ${det}` : '') + (alerta9 ? ' · Ítem 9 positivo' : '') })
    setGuardado(true)
  }
  function reiniciar() {
    setRes(null)
    setGuardado(false)
    setRun((r) => r + 1)
  }

  return (
    <>
      {alerta9 && <AlertaSuicidio />}
      <Card
        title={escala.titulo}
        actions={!res && <span className="text-xs text-muted tabular-nums">{contestadas}/{items.length} · {p} pts</span>}
      >
        {escala.instrucciones && !res && <p className="mb-2 text-sm font-medium">{escala.instrucciones}</p>}
        {res ? (
          <div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="text-5xl font-semibold tabular-nums">{p}</div>
              <div className="pb-1 text-sm text-muted">de {escala.max} puntos{escala.menorEsPeor ? ' (menor = peor)' : ''}</div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={tono === 'neutral' ? 'neutral' : tono}>{banda}</Badge>
              {det && <Badge tone="brand">{det}</Badge>}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={cx('h-full rounded-full', tono === 'danger' ? 'bg-danger' : tono === 'warn' ? 'bg-warn' : 'bg-ok')} style={{ width: `${((p - escala.min) / (escala.max - escala.min)) * 100}%` }} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={guardar} disabled={!pid || guardado}>
                {guardado ? <><Check className="size-4" /> Guardado</> : <><Save className="size-4" /> Guardar en expediente</>}
              </Button>
              <Button onClick={reiniciar}><RotateCcw className="size-4" /> Aplicar de nuevo</Button>
            </div>
            <p className="mt-4 text-xs text-muted">Referencia: {escala.ref}</p>
            <Disclaimer>Instrumento de tamizaje/valoración. No es diagnóstico por sí mismo; interprete en el contexto clínico.</Disclaimer>
          </div>
        ) : (
          <div className="ms-survey -mx-2">
            <Survey model={model} />
          </div>
        )}
      </Card>
    </>
  )
}

export default function Escalas() {
  const ctx = useCtx()
  const { id: pid } = useActivePatient()
  const [sp] = useSearchParams()
  // ?e=<id> abre directamente una escala (p. ej. desde la hoja de enfermería)
  const [sel, setSel] = useState(() => ESCALAS.find((e) => e.id === sp.get('e'))?.id ?? ESCALAS[0].id)
  const escala = ESCALAS.find((e) => e.id === sel)!
  return (
    <Page title="Escalas clínicas" subtitle="Cuestionarios con puntaje automático y bandas de severidad">
      <PatientBar />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        <nav className="hidden lg:block">
          {AREAS.map((a) => (
            <div key={a} className="mb-3">
              <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{a}</div>
              {ESCALAS.filter((e) => e.area === a).map((e) => (
                <button key={e.id} onClick={() => setSel(e.id)} className={cx('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm', sel === e.id ? 'bg-brand-soft font-medium text-brand-strong' : 'hover:bg-surface-2')}>
                  <ClipboardList className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {e.nombre}
                    <span className="block text-xs font-normal text-muted">{e.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="lg:hidden">
          <Select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Escala">
            {AREAS.map((a) => (
              <optgroup key={a} label={a}>
                {ESCALAS.filter((e) => e.area === a).map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.desc}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          {!pid && <Notice tone="warn">Sin paciente activo: puedes aplicar la escala pero no guardarla.</Notice>}
          <Aplicacion key={sel + pid} escala={escala} ctx={ctx} />
        </div>
        <div className="min-w-0">
          <Historial escala={escala} />
        </div>
      </div>
    </Page>
  )
}
