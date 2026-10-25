import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, History, ListPlus, Printer, Save, Scale, Trash2, Utensils, Wand2 } from 'lucide-react'
import { Page, PatientBar, Card, Button, Field, Input, Select, Textarea, Notice, Empty, Badge, Tabs, Disclaimer } from '../../components/ui'
import { toast } from '../../components/toast'
import { add, useActivePatient, useCollection, useSettings } from '../../lib/store'
import { useCan } from '../../lib/session'
import { usePreferencia } from '../../lib/preferencias'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import { cx, edad, fmtFecha } from '../../lib/utils'
import type { Patient, Registro } from '../../lib/types'
import {
  COMIDAS, FACTORES_ACTIVIDAD, SMAE, adecuacion, clasificaIMC, distribuir, gramosMeta, grupo, harrisBenedict, icc, ict, imc, mifflin, nombreGrupo,
  opcionesPorOmision, resolverEquivalentes, riesgoCintura, riesgoICC, riesgoICT, sumaFila, tonoAdecuacion, totalesPlan,
  type ComidaId, type Distribucion, type Equivalentes, type Macros, type OpcionesSolver,
} from './nutri'
import { imprimirPlan, type AlimentoClinica } from './imprimir'

type Antro = Record<'peso' | 'talla' | 'cintura' | 'cadera' | 'grasa' | 'brazo', string>
export interface DatosNutricion {
  antro: Antro
  ecuacion: 'mifflin' | 'harris'
  factorId: string
  factor: number
  ajuste: number
  kcal: number
  macros: Macros
  opciones: OpcionesSolver
  eq: Equivalentes
  dist: Distribucion
  pcts: Record<ComidaId, number>
  objetivo: string
  notas: string
  resultados?: { imc?: number; icc?: number; ict?: number; get?: number; geb?: number }
}

const num = (s: string | undefined) => (s && s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : NaN)
const f1 = (x: number, d = 1) => (Number.isFinite(x) ? x.toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')
const PCTS0 = Object.fromEntries(COMIDAS.map((c) => [c.id, c.pct])) as Record<ComidaId, number>
const edadAnios = (p: Patient) => (Date.now() - Date.parse(p.fechaNac)) / (365.25 * 864e5)

function inicial(p: Patient | null, ultimo: (c: string) => number | undefined): DatosNutricion {
  const s = (x?: number) => (x != null ? String(x) : '')
  const kcal = 1800
  return {
    antro: { peso: s(ultimo('peso')), talla: s(ultimo('talla')), cintura: s(ultimo('cintura')), cadera: '', grasa: s(ultimo('grasa')), brazo: '' },
    ecuacion: 'mifflin', factorId: 'sedentario', factor: 1.2, ajuste: 0, kcal, macros: { hc: 50, prot: 20, lip: 30 },
    opciones: opcionesPorOmision(kcal), eq: {}, dist: {}, pcts: PCTS0, objetivo: p ? '' : '', notas: '',
  }
}

function Indicador({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{valor}</div>
      {sub && <div className={cx('text-xs', tono === 'danger' ? 'text-danger' : tono === 'warn' ? 'text-warn' : tono === 'ok' ? 'text-ok' : 'text-muted')}>{sub}</div>}
    </div>
  )
}

function NumIn({ value, onChange, label, step = '0.5', className }: { value: number; onChange: (n: number) => void; label: string; step?: string; className?: string }) {
  return (
    <input
      type="number" min={0} step={step} inputMode="decimal" aria-label={label}
      value={Number.isFinite(value) && value !== 0 ? value : ''}
      placeholder="0"
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className={cx('w-full rounded-md border border-line bg-surface px-1.5 py-1 text-center text-sm tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/20', className)}
    />
  )
}

// ---------- Evaluación ----------
function Evaluacion({ p, d, set }: { p: Patient; d: DatosNutricion; set: (x: Partial<DatosNutricion>) => void }) {
  const a = d.antro
  const peso = num(a.peso), talla = num(a.talla), cintura = num(a.cintura), cadera = num(a.cadera), grasa = num(a.grasa)
  const vImc = imc(peso, talla)
  const cImc = clasificaIMC(vImc)
  const vIcc = icc(cintura, cadera)
  const vIct = ict(cintura, talla)
  const anios = edadAnios(p)
  const pediatrico = anios < 18
  const geb = d.ecuacion === 'mifflin' ? mifflin(p.sexo, peso, talla, anios) : harrisBenedict(p.sexo, peso, talla, anios)
  const get = geb * d.factor
  const setA = (k: keyof Antro, v: string) => set({ antro: { ...a, [k]: v } })
  const sumaMacros = d.macros.hc + d.macros.prot + d.macros.lip
  const campos: { k: keyof Antro; label: string; step?: string }[] = [
    { k: 'peso', label: 'Peso (kg)', step: '0.1' },
    { k: 'talla', label: 'Talla (cm)', step: '0.1' },
    { k: 'cintura', label: 'Cintura (cm)', step: '0.1' },
    { k: 'cadera', label: 'Cadera (cm)', step: '0.1' },
    { k: 'grasa', label: '% grasa (bioimpedancia)', step: '0.1' },
    { k: 'brazo', label: 'Circ. de brazo (cm)', step: '0.1' },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Antropometría">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {campos.map((c) => (
            <Field key={c.k} label={c.label}>
              <Input type="number" inputMode="decimal" step={c.step} min={0} value={a[c.k]} onChange={(e) => setA(c.k, e.target.value)} />
            </Field>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Indicador label="IMC (kg/m²)" valor={f1(vImc)} sub={pediatrico ? 'Use percentiles en Crecimiento' : cImc.texto} tono={pediatrico ? undefined : cImc.tono} />
          <Indicador label="Índice cintura-cadera" valor={f1(vIcc, 2)} sub={Number.isFinite(vIcc) ? (riesgoICC(vIcc, p.sexo) ? `Riesgo (≥ ${p.sexo === 'F' ? '0.85' : '0.90'})` : 'Sin riesgo aumentado') : undefined} tono={riesgoICC(vIcc, p.sexo) ? 'danger' : 'ok'} />
          <Indicador label="Índice cintura-talla" valor={f1(vIct, 2)} sub={Number.isFinite(vIct) ? (riesgoICT(vIct) ? 'Riesgo (≥ 0.5)' : 'Sin riesgo (< 0.5)') : undefined} tono={riesgoICT(vIct) ? 'danger' : 'ok'} />
          <Indicador label="Cintura" valor={Number.isFinite(cintura) ? `${cintura} cm` : '—'} sub={Number.isFinite(cintura) ? (riesgoCintura(cintura, p.sexo) ? `Aumentada (≥ ${p.sexo === 'F' ? 80 : 90})` : 'Normal') : undefined} tono={riesgoCintura(cintura, p.sexo) ? 'danger' : 'ok'} />
          <Indicador label="Masa grasa" valor={Number.isFinite(peso * grasa) ? `${f1((peso * grasa) / 100)} kg` : '—'} sub={Number.isFinite(peso * grasa) ? `Masa libre de grasa ${f1(peso - (peso * grasa) / 100)} kg` : undefined} />
        </div>
        <p className="mt-3 text-xs text-muted">
          IMC: OMS (TRS 894, 2000). ICC: OMS, <i>Waist circumference and waist–hip ratio</i> (2008). ICT ≥ 0.5: Ashwell M, et al. Obes Rev 2012;13:275-86. Cintura ≥ 90/80 cm: IDF (2006) para población de Centro y Sudamérica.
        </p>
      </Card>

      <Card title="Requerimiento energético">
        {pediatrico ? (
          <Notice tone="warn">
            Paciente menor de 18 años: las ecuaciones de adultos no aplican. Evalúe con percentiles en <Link to="/crecimiento" className="font-medium text-brand underline">Crecimiento</Link> y capture la energía manualmente.
          </Notice>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ecuación">
                <Select value={d.ecuacion} onChange={(e) => set({ ecuacion: e.target.value as DatosNutricion['ecuacion'] })}>
                  <option value="mifflin">Mifflin-St Jeor (recomendada)</option>
                  <option value="harris">Harris-Benedict (1919)</option>
                </Select>
              </Field>
              <Field label="Actividad física">
                <Select value={d.factorId} onChange={(e) => { const fa = FACTORES_ACTIVIDAD.find((x) => x.id === e.target.value); set({ factorId: e.target.value, ...(fa ? { factor: fa.f } : {}) }) }}>
                  {FACTORES_ACTIVIDAD.map((x) => <option key={x.id} value={x.id}>{x.label} · {x.f}</option>)}
                  <option value="otro">Otro factor…</option>
                </Select>
              </Field>
              {d.factorId === 'otro' && (
                <Field label="Factor de actividad"><Input type="number" step="0.05" min={1} max={2.5} value={d.factor} onChange={(e) => set({ factor: Number(e.target.value) || 1 })} /></Field>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Indicador label="Gasto en reposo (GER)" valor={`${f1(geb, 0)} kcal`} sub={`${p.sexo === 'F' ? 'Mujer' : 'Hombre'}, ${Math.floor(anios)} años`} />
              <Indicador label="Gasto total (GER × factor)" valor={`${f1(get, 0)} kcal`} sub={`Factor ${d.factor}`} />
            </div>
            {vImc >= 30 && <p className="mt-2 text-xs text-warn">En obesidad, Mifflin-St Jeor con peso actual es la ecuación con mejor exactitud en adultos (Frankenfield D, et al. J Am Diet Assoc 2005;105:775-89).</p>}
          </>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {!pediatrico && (
            <Field label="Ajuste (kcal)" hint="Ej. −500 para pérdida de peso">
              <Input type="number" step={50} value={d.ajuste} onChange={(e) => set({ ajuste: Number(e.target.value) || 0 })} />
            </Field>
          )}
          <Field label="Energía del plan (kcal/día)">
            <div className="flex gap-2">
              <Input type="number" step={50} min={0} value={d.kcal} onChange={(e) => set({ kcal: Math.max(0, Number(e.target.value) || 0) })} />
              {!pediatrico && Number.isFinite(get) && (
                <Button onClick={() => set({ kcal: Math.round((get + d.ajuste) / 50) * 50 })} aria-label="Usar el gasto total calculado más el ajuste">Usar</Button>
              )}
            </div>
          </Field>
        </div>
        <h3 className="mt-4 mb-2 text-sm font-semibold">Distribución de macronutrimentos</h3>
        <div className="grid grid-cols-3 gap-3">
          {(['hc', 'prot', 'lip'] as const).map((k) => {
            const g = gramosMeta(d.kcal, d.macros)[k]
            return (
              <Field key={k} label={`${k === 'hc' ? 'HC' : k === 'prot' ? 'Proteínas' : 'Lípidos'} (%)`} hint={`${f1(g, 0)} g${k === 'prot' && peso > 0 ? ` · ${f1(g / peso, 2)} g/kg` : ''}`}>
                <Input type="number" min={0} max={100} value={d.macros[k]} onChange={(e) => set({ macros: { ...d.macros, [k]: Math.max(0, Number(e.target.value) || 0) } })} />
              </Field>
            )
          })}
        </div>
        {sumaMacros !== 100 && <p className="mt-1 text-xs text-danger">La suma es {sumaMacros} %; debe ser 100 %.</p>}
        <Field label="Objetivo del plan" className="mt-3">
          <Input value={d.objetivo} onChange={(e) => set({ objetivo: e.target.value })} placeholder="Ej. reducción de 5–10 % del peso en 6 meses" />
        </Field>
        <p className="mt-3 text-xs text-muted">Mifflin MD, St Jeor ST, et al. Am J Clin Nutr 1990;51:241-7. Harris JA, Benedict FG. Carnegie Inst. 1919. Factores de actividad 1.2–1.9 de uso clínico común (verificar con su guía).</p>
      </Card>
    </div>
  )
}

// ---------- Plan ----------
function Plan({ d, set, alimentos }: { d: DatosNutricion; set: (x: Partial<DatosNutricion>) => void; alimentos: AlimentoClinica[] }) {
  const meta = gramosMeta(d.kcal, d.macros)
  const t = totalesPlan(d.eq)
  const [todos, setTodos] = useState(false)
  const o = d.opciones
  const setO = (x: Partial<OpcionesSolver>) => set({ opciones: { ...o, ...x } })
  const visibles = SMAE.filter((g) => todos || (d.eq[g.id] ?? 0) > 0)
  function sugerir() {
    const eq = resolverEquivalentes(meta, o)
    set({ eq, dist: distribuir(eq, d.pcts) })
  }
  const setEq = (id: string, n: number) => {
    const eq = { ...d.eq, [id]: n }
    if (!n) delete eq[id]
    set({ eq, dist: { ...d.dist, ...distribuir({ [id]: n }, d.pcts) } })
  }
  const setDist = (g: string, c: ComidaId, n: number) => set({ dist: { ...d.dist, [g]: { ...(d.dist[g] ?? (Object.fromEntries(COMIDAS.map((x) => [x.id, 0])) as Record<ComidaId, number>)), [c]: n } } })
  const kcalComida = (c: ComidaId) => Object.entries(d.dist).reduce((s, [g, f]) => s + (grupo(g)?.kcal ?? 0) * (d.eq[g] ? f[c] || 0 : 0), 0)
  const sumaPcts = COMIDAS.reduce((s, c) => s + (d.pcts[c.id] || 0), 0)
  const filas: { k: 'kcal' | 'hc' | 'prot' | 'lip'; label: string }[] = [
    { k: 'kcal', label: 'Energía (kcal)' },
    { k: 'hc', label: 'Hidratos de C. (g)' },
    { k: 'prot', label: 'Proteínas (g)' },
    { k: 'lip', label: 'Lípidos (g)' },
  ]
  const conAlimentos = (id: string) => alimentos.filter((a) => a.grupo === id)
  return (
    <div className="space-y-4">
      <Card title="Sugerencia automática" actions={<Button size="sm" variant="primary" onClick={sugerir}><Wand2 className="size-4" /> Calcular equivalentes</Button>}>
        <p className="mb-3 text-sm text-muted">Se fijan verduras, frutas, leche, leguminosas y azúcares; los cereales completan los hidratos de carbono, los alimentos de origen animal la proteína y los aceites los lípidos. Todo es editable.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Verduras"><Input type="number" min={0} step={0.5} value={o.verduras} onChange={(e) => setO({ verduras: Number(e.target.value) || 0 })} /></Field>
          <Field label="Frutas"><Input type="number" min={0} step={0.5} value={o.frutas} onChange={(e) => setO({ frutas: Number(e.target.value) || 0 })} /></Field>
          <Field label="Leguminosas"><Input type="number" min={0} step={0.5} value={o.leguminosas} onChange={(e) => setO({ leguminosas: Number(e.target.value) || 0 })} /></Field>
          <Field label="Leche"><Input type="number" min={0} step={0.5} value={o.leche} onChange={(e) => setO({ leche: Number(e.target.value) || 0 })} /></Field>
          <Field label="Tipo de leche">
            <Select value={o.lecheTipo} onChange={(e) => setO({ lecheTipo: e.target.value })}>{SMAE.filter((g) => g.grupo === 'Leche').map((g) => <option key={g.id} value={g.id}>{g.sub}</option>)}</Select>
          </Field>
          <Field label="Azúcares"><Input type="number" min={0} step={0.5} value={o.azucares} onChange={(e) => setO({ azucares: Number(e.target.value) || 0 })} /></Field>
          <Field label="Cereales">
            <Select value={o.cerealTipo} onChange={(e) => setO({ cerealTipo: e.target.value })}>{SMAE.filter((g) => g.grupo.startsWith('Cereales')).map((g) => <option key={g.id} value={g.id}>{g.sub}</option>)}</Select>
          </Field>
          <Field label="Origen animal">
            <Select value={o.aoaTipo} onChange={(e) => setO({ aoaTipo: e.target.value })}>{SMAE.filter((g) => g.id.startsWith('aoa')).map((g) => <option key={g.id} value={g.id}>{g.sub}</option>)}</Select>
          </Field>
          <Field label="Grasas">
            <Select value={o.grasaTipo} onChange={(e) => setO({ grasaTipo: e.target.value })}>{SMAE.filter((g) => g.id.startsWith('grasas')).map((g) => <option key={g.id} value={g.id}>{g.sub}</option>)}</Select>
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-3">
            <Button variant="ghost" onClick={() => set({ opciones: opcionesPorOmision(d.kcal) })}>Valores fijos sugeridos para {d.kcal} kcal</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Equivalentes del día (SMAE)" actions={<label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} className="accent-[var(--color-brand)]" /> Todos los grupos</label>} pad={false}>
          {visibles.length === 0 ? (
            <div className="p-4"><Empty>Pulsa «Calcular equivalentes» o muestra todos los grupos para capturarlos.</Empty></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm tabular-nums">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr><th className="px-3 py-2 text-left font-medium">Grupo</th><th className="w-20 px-1 font-medium">Equiv.</th><th className="px-2 text-right font-medium">kcal</th><th className="px-2 text-right font-medium">HC</th><th className="px-2 text-right font-medium">Prot</th><th className="px-2 text-right font-medium">Líp</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibles.map((g) => {
                    const n = d.eq[g.id] ?? 0
                    return (
                      <tr key={g.id}>
                        <th scope="row" className="px-3 py-1.5 text-left font-normal">
                          {g.grupo}{g.sub && <span className="text-muted"> · {g.sub}</span>}
                          {g.verificar && <span className="ml-1 text-xs text-warn">(verificar)</span>}
                          <span className="block text-xs text-muted">{g.kcal} kcal · {g.hc} HC · {g.prot} P · {g.lip} L por equiv.</span>
                        </th>
                        <td className="px-1"><NumIn label={`Equivalentes de ${nombreGrupo(g)}`} value={n} onChange={(v) => setEq(g.id, v)} /></td>
                        <td className="px-2 text-right">{n ? g.kcal * n : ''}</td>
                        <td className="px-2 text-right">{n ? g.hc * n : ''}</td>
                        <td className="px-2 text-right">{n ? g.prot * n : ''}</td>
                        <td className="px-2 text-right">{n ? g.lip * n : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Total vs. meta">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted"><tr><th className="text-left font-medium" /><th className="text-right font-medium">Plan</th><th className="text-right font-medium">Meta</th><th className="text-right font-medium">Adec.</th></tr></thead>
            <tbody className="divide-y divide-line">
              {filas.map((r) => {
                const pct = adecuacion(t[r.k], meta[r.k])
                const tono = tonoAdecuacion(pct)
                return (
                  <tr key={r.k}>
                    <th scope="row" className="py-1.5 text-left font-normal">{r.label}</th>
                    <td className="text-right">{Math.round(t[r.k])}</td>
                    <td className="text-right text-muted">{Math.round(meta[r.k])}</td>
                    <td className="text-right"><Badge tone={tono}>{Number.isFinite(pct) ? `${Math.round(pct)} %` : '—'}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">Adecuación aceptable 95–105 % (criterio usual de cálculo dietético; verificar). Valores por equivalente: Pérez Lizaur AB, et al. <i>Sistema Mexicano de Alimentos Equivalentes</i>, 4.ª ed., 2014.</p>
        </Card>
      </div>

      <Card
        title="Distribución por tiempo de comida"
        actions={<Button size="sm" onClick={() => set({ dist: distribuir(d.eq, d.pcts) })}><Calculator className="size-4" /> Repartir según %</Button>}
        pad={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Grupo</th>
                {COMIDAS.map((c) => (
                  <th key={c.id} className="px-1 py-2 font-medium">
                    {c.label}
                    <span className="mt-1 flex items-center justify-center gap-0.5">
                      <NumIn label={`% de energía en ${c.label} (${c.id})`} step="5" value={d.pcts[c.id]} onChange={(v) => set({ pcts: { ...d.pcts, [c.id]: v } })} className="w-14" />%
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Object.keys(d.eq).filter((g) => d.eq[g] > 0).map((g) => {
                const fila = d.dist[g] ?? (Object.fromEntries(COMIDAS.map((x) => [x.id, 0])) as Record<ComidaId, number>)
                const s = sumaFila(fila)
                const ej = conAlimentos(g)
                return (
                  <tr key={g}>
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      {nombreGrupo(grupo(g)!)}
                      {ej.length > 0 && <span className="block truncate text-xs text-muted" title={ej.map((a) => `${a.porcion} ${a.alimento}`).join(', ')}>p. ej. {ej.slice(0, 2).map((a) => a.alimento).join(', ')}</span>}
                    </th>
                    {COMIDAS.map((c) => <td key={c.id} className="px-1 py-1"><NumIn label={`${nombreGrupo(grupo(g)!)} en ${c.label} (${c.id})`} value={fila[c.id]} onChange={(v) => setDist(g, c.id, v)} /></td>)}
                    <td className={cx('px-2 text-center font-medium', s !== d.eq[g] && 'text-danger')}>{s}/{d.eq[g]}</td>
                  </tr>
                )
              })}
              <tr className="bg-surface-2/60 text-xs text-muted">
                <th scope="row" className="px-3 py-1.5 text-left font-medium">kcal por tiempo</th>
                {COMIDAS.map((c) => <td key={c.id} className="px-1 text-center">{Math.round(kcalComida(c.id))}</td>)}
                <td className={cx('px-2 text-center', sumaPcts !== 100 && 'text-danger')}>{sumaPcts} %</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Recomendaciones para el paciente">
        <Textarea value={d.notas} onChange={(e) => set({ notas: e.target.value })} placeholder="Ej. beber 2 L de agua natural al día; preferir cereales integrales; actividad física 150 min/semana…" className="min-h-24" />
      </Card>
    </div>
  )
}

// ---------- Alimentos de la clínica ----------
function Alimentos() {
  const [lista, setLista, meta] = usePreferencia<AlimentoClinica[]>('nutricion.alimentos', 'org', [])
  const [g, setG] = useState(SMAE[0].id)
  const [alimento, setAlimento] = useState('')
  const [porcion, setPorcion] = useState('')
  function agregar() {
    if (!alimento.trim() || !porcion.trim()) return
    setLista([...lista, { id: Math.random().toString(36).slice(2, 10), grupo: g, alimento: alimento.trim(), porcion: porcion.trim() }])
    setAlimento('')
    setPorcion('')
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card title="Agregar alimento de ejemplo">
        <Notice tone="info">Las listas de alimentos del SMAE están protegidas por derechos de autor y no se incluyen. Capture aquí las porciones que su clínica usa; aparecerán en el plan impreso.</Notice>
        {meta.puedeEscribir ? (
          <div className="grid gap-3">
            <Field label="Grupo"><Select value={g} onChange={(e) => setG(e.target.value)}>{SMAE.map((x) => <option key={x.id} value={x.id}>{nombreGrupo(x)}</option>)}</Select></Field>
            <Field label="Cantidad de 1 equivalente" hint="Ej. «1 pieza», «½ taza», «30 g»"><Input value={porcion} onChange={(e) => setPorcion(e.target.value)} /></Field>
            <Field label="Alimento"><Input value={alimento} onChange={(e) => setAlimento(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} /></Field>
            <Button variant="primary" disabled={!alimento.trim() || !porcion.trim()} onClick={agregar}><ListPlus className="size-4" /> Agregar</Button>
          </div>
        ) : (
          <p className="text-sm text-muted">Solo administración y médicos pueden editar este catálogo.</p>
        )}
      </Card>
      <Card title={`Catálogo de la clínica (${lista.length})`}>
        {lista.length === 0 ? (
          <Empty>Sin alimentos capturados.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {SMAE.filter((x) => lista.some((a) => a.grupo === x.id)).map((x) => (
              <div key={x.id}>
                <h3 className="mb-1 text-xs font-semibold text-muted uppercase">{nombreGrupo(x)}</h3>
                <ul className="divide-y divide-line text-sm">
                  {lista.filter((a) => a.grupo === x.id).map((a) => (
                    <li key={a.id} className="flex items-center gap-2 py-1">
                      <span className="flex-1">{a.porcion} · {a.alimento}</span>
                      {meta.puedeEscribir && <button className="rounded p-1 text-muted hover:text-danger" aria-label={`Quitar ${a.alimento}`} onClick={() => setLista(lista.filter((y) => y.id !== a.id))}><Trash2 className="size-4" /></button>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------- Historial ----------
function Historial({ planes, onCargar }: { planes: Registro[]; onCargar: (r: Registro) => void }) {
  if (!planes.length) return <Empty>Sin planes guardados para este paciente.</Empty>
  return (
    <Card title="Planes anteriores" pad={false}>
      <ul className="divide-y divide-line text-sm">
        {planes.map((r) => {
          const d = r.datos as unknown as DatosNutricion
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="w-28 text-muted">{fmtFecha(r.fecha)}</span>
              <span className="min-w-0 flex-1">{r.titulo}{d.objetivo && <span className="block text-xs text-muted">{d.objetivo}</span>}</span>
              {d.antro?.peso && <Badge>{d.antro.peso} kg</Badge>}
              {d.resultados?.imc != null && <Badge>IMC {f1(d.resultados.imc)}</Badge>}
              <Button size="sm" onClick={() => onCargar(r)}>Abrir como base</Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function Consulta({ p }: { p: Patient }) {
  const settings = useSettings()
  const obs = useCollection('observations', (o) => o.patientId === p.id, [p.id])
  const ultimo = (c: string) => obs.filter((o) => o.codigo === c).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.valor
  const planes = useRegistros('nutricion', p.id)
  const puede = useCanRegistro('nutricion', 'write')
  const puedeObs = useCan('obs.escribir')
  const [alimentos] = usePreferencia<AlimentoClinica[]>('nutricion.alimentos', 'org', [])
  const [tab, setTab] = useState<'eval' | 'plan' | 'alimentos' | 'historial'>('eval')
  const [d, setD] = useState<DatosNutricion>(() => {
    const prev = planes[0]?.datos as unknown as DatosNutricion | undefined
    const base = inicial(p, ultimo)
    if (!prev) return base
    // mediciones más recientes del expediente; lo que falte se toma del plan anterior
    const antro = { ...base.antro }
    for (const k of Object.keys(antro) as (keyof Antro)[]) if (!antro[k] && prev.antro?.[k]) antro[k] = prev.antro[k]
    return { ...base, ...prev, antro }
  })
  const set = (x: Partial<DatosNutricion>) => setD((v) => ({ ...v, ...x }))
  const meta = gramosMeta(d.kcal, d.macros)
  const resultados = useMemo(() => {
    const peso = num(d.antro.peso), talla = num(d.antro.talla), cintura = num(d.antro.cintura), cadera = num(d.antro.cadera)
    const anios = edadAnios(p)
    const geb = anios >= 18 ? (d.ecuacion === 'mifflin' ? mifflin(p.sexo, peso, talla, anios) : harrisBenedict(p.sexo, peso, talla, anios)) : NaN
    const fin = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : undefined)
    return { imc: fin(imc(peso, talla)), icc: fin(icc(cintura, cadera)), ict: fin(ict(cintura, talla)), geb: fin(geb), get: fin(geb * d.factor) }
  }, [d.antro, d.ecuacion, d.factor, p])

  function guardar() {
    const fecha = new Date().toISOString()
    let n = 0
    if (puedeObs) {
      const o = (codigo: string, valor: number, unidad: string, fuente: 'manual' | 'calculadora' = 'manual', interpretacion?: string) => {
        if (!Number.isFinite(valor) || valor <= 0) return
        add('observations', { patientId: p.id, fecha, codigo, valor: Math.round(valor * 100) / 100, unidad, fuente, etiqueta: 'Nutrición', interpretacion })
        n++
      }
      o('peso', num(d.antro.peso), 'kg')
      o('talla', num(d.antro.talla), 'cm')
      o('cintura', num(d.antro.cintura), 'cm')
      o('grasa', num(d.antro.grasa), '%', 'manual', 'Bioimpedancia')
      if (resultados.imc && edadAnios(p) >= 18) o('imc', resultados.imc, 'kg/m²', 'calculadora', clasificaIMC(resultados.imc).texto)
    }
    const datos: DatosNutricion = { ...d, resultados }
    add('registros', { patientId: p.id, fecha, tipo: 'nutricion', estado: 'activo', titulo: `Plan de alimentación ${Math.round(d.kcal)} kcal (${d.macros.hc}/${d.macros.prot}/${d.macros.lip})`, datos: datos as unknown as Record<string, unknown> })
    toast(`Plan guardado${n ? ` y ${n} mediciones registradas` : ''}`, 'ok')
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'eval', label: <span className="inline-flex items-center gap-1.5"><Scale className="size-4" /> Evaluación</span> },
            { id: 'plan', label: <span className="inline-flex items-center gap-1.5"><Utensils className="size-4" /> Plan</span> },
            { id: 'alimentos', label: <span className="inline-flex items-center gap-1.5"><ListPlus className="size-4" /> Alimentos</span> },
            { id: 'historial', label: <span className="inline-flex items-center gap-1.5"><History className="size-4" /> Historial ({planes.length})</span> },
          ]}
        />
        <div className="flex gap-2">
          <Button onClick={() => imprimirPlan({ p, s: settings, meta, eq: d.eq, dist: d.dist, pcts: d.pcts, alimentos, notas: d.notas, objetivo: d.objetivo })} disabled={!Object.keys(d.eq).length}>
            <Printer className="size-4" /> Imprimir plan
          </Button>
          {puede && <Button variant="primary" onClick={guardar}><Save className="size-4" /> Guardar consulta</Button>}
        </div>
      </div>
      {tab === 'eval' && <Evaluacion p={p} d={d} set={set} />}
      {tab === 'plan' && <Plan d={d} set={set} alimentos={alimentos} />}
      {tab === 'alimentos' && <Alimentos />}
      {tab === 'historial' && <Historial planes={planes} onCargar={(r) => { setD({ ...inicial(p, ultimo), ...(r.datos as unknown as DatosNutricion) }); setTab('plan') }} />}
      <Disclaimer>Herramienta de apoyo para el cálculo dietético. La prescripción nutricia corresponde al profesional de la nutrición o al médico tratante.</Disclaimer>
    </>
  )
}

export default function Nutricion() {
  const { patient } = useActivePatient()
  return (
    <Page title="Nutrición" subtitle={patient ? `Consulta de nutrición · ${edad(patient.fechaNac).texto}` : 'Antropometría, requerimiento energético y plan por equivalentes (SMAE)'}>
      <PatientBar />
      {patient ? <Consulta key={patient.id} p={patient} /> : <Empty>Selecciona un paciente.</Empty>}
    </Page>
  )
}
