import { useMemo, useState } from 'react'
import { Calculator, Check, Save, Search } from 'lucide-react'
import { Page, PatientBar, Input, Select, Field, Button, Badge, Notice, Modal, Disclaimer, Empty } from '../../components/ui'
import { useActivePatient, useCollection, add } from '../../lib/store'
import { cx } from '../../lib/utils'
import { CALCS, AREAS, PRESETS_DOSIS, type Calc, type Ctx, type Vals } from './defs'

function useCtx(): Ctx {
  const { id, patient } = useActivePatient()
  const obs = useCollection('observations', (o) => o.patientId === id, [id])
  return useMemo(() => {
    const last: Record<string, number> = {}
    const fechas: Record<string, string> = {}
    for (const o of obs) if (!fechas[o.codigo] || o.fecha > fechas[o.codigo]) ((fechas[o.codigo] = o.fecha), (last[o.codigo] = o.valor))
    const edad = patient ? (Date.now() - Date.parse(patient.fechaNac + 'T00:00:00')) / (365.25 * 86400000) : undefined
    const sexo = patient?.sexo === 'M' ? 'M' : patient?.sexo === 'F' ? 'F' : undefined
    return { edad, sexo, obs: last }
  }, [obs, patient])
}

const tonoBadge = { ok: 'ok', warn: 'warn', danger: 'danger', neutral: 'neutral' } as const

function CalcForm({ calc, ctx }: { calc: Calc; ctx: Ctx }) {
  const { id: pid, patient } = useActivePatient()
  const pre = useMemo(() => {
    const p = calc.prefill?.(ctx) ?? {}
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== undefined))
  }, [calc, ctx])
  const [v, setV] = useState<Vals>(() => ({ ...Object.fromEntries(calc.campos.map((k) => [k.id, k.def ?? ''])), ...pre }))
  const [guardado, setGuardado] = useState(false)
  const set = (k: string, x: string) => {
    setGuardado(false)
    setV((o) => (k === 'preset' && PRESETS_DOSIS[x] ? { ...o, ...PRESETS_DOSIS[x], preset: x } : { ...o, [k]: x }))
  }
  const r = useMemo(() => {
    try {
      return calc.calc(v)
    } catch {
      return null
    }
  }, [calc, v])
  const alergia = v.preset && patient?.alergias.find((a) => v.preset.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(v.preset.toLowerCase()))
  const checks = calc.campos.filter((k) => k.tipo === 'chk')
  const otros = calc.campos.filter((k) => k.tipo !== 'chk')

  function guardar() {
    if (!r?.obs || !pid) return
    add('observations', { patientId: pid, codigo: r.obs.codigo, valor: r.obs.valor, unidad: r.obs.unidad, etiqueta: r.obs.etiqueta ?? calc.nombre, fuente: 'calculadora', interpretacion: r.banda })
    setGuardado(true)
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        {otros.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {otros.map((k) => (
              <Field key={k.id} label={k.label + (k.unidad ? ` (${k.unidad})` : '')} className={k.tipo === 'sel' && (k.opciones?.length ?? 0) > 3 ? 'col-span-2' : ''}
                hint={pre[k.id] !== undefined && v[k.id] === pre[k.id] ? 'Del expediente' : undefined}>
                {k.tipo === 'sel' ? (
                  <Select value={v[k.id]} onChange={(e) => set(k.id, e.target.value)}>
                    {k.opciones!.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
                  </Select>
                ) : (
                  <Input type={k.tipo === 'fecha' ? 'date' : 'number'} inputMode="decimal" step="any" value={v[k.id]} onChange={(e) => set(k.id, e.target.value)} />
                )}
              </Field>
            ))}
          </div>
        )}
        {checks.length > 0 && (
          <div className="divide-y divide-line rounded-lg border border-line">
            {checks.map((k) => (
              <label key={k.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={v[k.id] === '1'} onChange={(e) => set(k.id, e.target.checked ? '1' : '')} />
                <span className="flex-1">{k.label}</span>
                <span className="text-xs tabular-nums text-muted">{(k.puntos ?? 1) > 0 ? '+' : ''}{k.puntos ?? 1}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <div className="text-xs font-medium text-muted">Resultado</div>
          {r ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{r.valor}</span>
                {r.unidad && <span className="text-sm text-muted">{r.unidad}</span>}
              </div>
              {r.banda && <div className="mt-2"><Badge tone={tonoBadge[r.tono ?? 'neutral']}>{r.banda}</Badge></div>}
              {r.extra?.length ? <ul className="mt-3 space-y-1 text-sm">{r.extra.map((x) => <li key={x}>• {x}</li>)}</ul> : null}
            </>
          ) : (
            <div className="mt-2 text-sm text-muted">Completa los datos para calcular.</div>
          )}
        </div>
        {alergia && <div className="mt-3"><Notice tone="danger">El paciente tiene alergia registrada a <b>{alergia}</b>.</Notice></div>}
        {r?.avisos?.map((a) => <div key={a} className="mt-3"><Notice tone="warn">{a}</Notice></div>)}
        {r?.obs && (
          <Button variant="primary" className="mt-3 w-full" disabled={!pid || guardado} onClick={guardar}>
            {guardado ? <><Check className="size-4" /> Guardado en expediente</> : <><Save className="size-4" /> Guardar en expediente</>}
          </Button>
        )}
        <details className="mt-3 rounded-lg border border-line p-3 text-sm" open>
          <summary className="cursor-pointer font-medium">Fórmula y referencia</summary>
          <p className="mt-2 font-mono text-xs leading-relaxed">{calc.formula}</p>
          <p className="mt-2 text-xs text-muted">{calc.ref}</p>
        </details>
        <Disclaimer />
      </div>
    </div>
  )
}

export default function Calculadoras() {
  const ctx = useCtx()
  const { id: pid } = useActivePatient()
  const [q, setQ] = useState('')
  const [area, setArea] = useState('')
  const [abierta, setAbierta] = useState<Calc | null>(null)
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const lista = CALCS.filter((c) => (!area || c.area === area) && norm(c.nombre + ' ' + c.desc + ' ' + c.area).includes(norm(q)))

  return (
    <Page title="Calculadoras clínicas" subtitle="Se autollenan con los datos más recientes del paciente activo">
      <PatientBar />
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" />
          <Input className="pl-9" placeholder="Buscar calculadora (IMC, TFG, MELD, dosis…)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['', ...AREAS].map((a) => (
            <button key={a} onClick={() => setArea(a)} className={cx('shrink-0 rounded-full border px-3 py-1 text-xs font-medium', area === a ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface text-muted hover:text-ink')}>
              {a || 'Todas'}
            </button>
          ))}
        </div>
      </div>
      {lista.length === 0 && <Empty>Sin resultados para “{q}”.</Empty>}
      {AREAS.filter((a) => lista.some((c) => c.area === a)).map((a) => (
        <section key={a} className="mb-5">
          <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">{a}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lista.filter((c) => c.area === a).map((c) => (
              <button key={c.id} onClick={() => setAbierta(c)} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left shadow-sm transition hover:border-brand/50 hover:bg-surface-2">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong"><Calculator className="size-4" /></div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.nombre}</div>
                  <div className="text-xs text-muted">{c.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
      <Modal open={!!abierta} onClose={() => setAbierta(null)} title={abierta?.nombre ?? ''} wide>
        {abierta && <CalcForm key={abierta.id + pid} calc={abierta} ctx={ctx} />}
      </Modal>
    </Page>
  )
}
