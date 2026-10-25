import { useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { Plus } from 'lucide-react'
import { Page, PatientBar, Card, Tabs, Notice, Button, Field, Input, Select, Badge, Disclaimer, Empty } from '../../components/ui'
import { useActivePatient, useCollection, add } from '../../lib/store'
import { edad, fmtFecha } from '../../lib/utils'
import { DPM, MAX_MESES, interpretar, percentil, valorEnZ, zDePercentil, zscore, type Ind, type Sexo } from './who'

const DIA = 864e5
type Graf = 'wfa' | 'lhfa' | 'bfa' | 'hcfa' | 'wfh'
type Rango = '0-2' | '2-5' | '5-19'
const RANGOS: Record<Rango, [number, number]> = { '0-2': [0, 24], '2-5': [24, 60], '5-19': [61, 228] }
const GRAF: { id: Graf; label: string; y: string }[] = [
  { id: 'wfa', label: 'Peso/edad', y: 'Peso (kg)' },
  { id: 'lhfa', label: 'Talla/edad', y: 'Longitud/talla (cm)' },
  { id: 'bfa', label: 'IMC/edad', y: 'IMC (kg/m²)' },
  { id: 'hcfa', label: 'P. cefálico/edad', y: 'Perímetro cefálico (cm)' },
  { id: 'wfh', label: 'Peso/talla', y: 'Peso (kg)' },
]
const Z_CURVAS = [-3, -2, -1, 0, 1, 2, 3]
const P_CURVAS = [3, 15, 50, 85, 97]
const color = (k: number, pct: boolean) => {
  const a = pct ? Math.abs(k - 50) : Math.abs(k)
  return pct ? (a === 0 ? '#16a34a' : a === 35 ? '#d97706' : '#dc2626') : a === 0 ? '#16a34a' : a === 1 ? '#d9a406' : a === 2 ? '#dc2626' : '#6b7280'
}

interface Medicion {
  fecha: string
  dias: number
  peso?: number
  talla?: number
  pc?: number
}
const edadTxt = (nac: string, fecha: string) => {
  const m = edad(nac, new Date(fecha)).meses
  return m < 24 ? `${m} m` : `${Math.floor(m / 12)} a ${m % 12} m`
}
const zfmt = (z: number | null) => (z === null ? '—' : (z > 0 ? '+' : '') + z.toFixed(2))

function useMediciones(pid: string | null, nac?: string): Medicion[] {
  const obs = useCollection('observations', (o) => o.patientId === pid && ['peso', 'talla', 'perimetro-cefalico'].includes(o.codigo), [pid])
  return useMemo(() => {
    if (!nac) return []
    const n0 = Date.parse(nac + 'T00:00:00')
    const porDia = new Map<string, Medicion>()
    for (const o of [...obs].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const d = new Date(o.fecha)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const m = porDia.get(key) ?? { fecha: o.fecha, dias: Math.max(0, Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - n0) / DIA)) }
      if (o.codigo === 'peso') m.peso = o.valor
      else if (o.codigo === 'talla') m.talla = o.valor
      else m.pc = o.valor
      porDia.set(key, m)
    }
    return [...porDia.values()].sort((a, b) => a.dias - b.dias)
  }, [obs, nac])
}

function evaluar(m: Medicion, sexo: Sexo) {
  const imc = m.peso && m.talla ? m.peso / (m.talla / 100) ** 2 : undefined
  const pt: Ind = m.dias < 731 ? 'wfl' : 'wfh'
  return {
    imc,
    pt,
    wfa: m.peso ? zscore('wfa', sexo, m.dias, m.peso) : null,
    lhfa: m.talla ? zscore('lhfa', sexo, m.dias, m.talla) : null,
    bfa: imc ? zscore('bfa', sexo, m.dias, imc) : null,
    hcfa: m.pc ? zscore('hcfa', sexo, m.dias, m.pc) : null,
    wfh: m.peso && m.talla && m.dias < 1856 ? zscore(pt, sexo, m.talla, m.peso) : null,
  }
}

function Grafica({ g, rango, sexo, meds, pct }: { g: Graf; rango: Rango; sexo: Sexo; meds: Medicion[]; pct: boolean }) {
  const ks = pct ? P_CURVAS : Z_CURVAS
  const zOf = (k: number) => (pct ? zDePercentil(k) : k)
  const pesoTalla = g === 'wfh'
  const { curvas, puntos, xLabel, dominio } = useMemo(() => {
    const ultima = meds[meds.length - 1]
    const ind: Ind = pesoTalla ? (ultima && ultima.dias >= 731 ? 'wfh' : 'wfl') : g
    let xs: number[] = []
    let dominio: [number, number]
    if (pesoTalla) {
      const [a, b] = ind === 'wfl' ? [45, 110] : [65, 120]
      for (let x = a; x <= b; x += 0.5) xs.push(x)
      dominio = [a, b]
    } else {
      const [a, b0] = RANGOS[rango], b = Math.min(b0, MAX_MESES[g])
      const paso = b - a <= 24 ? 0.25 : 1
      for (let x = a; x <= b + 1e-9; x += paso) xs.push(x)
      dominio = [a, b]
      xs = xs.filter((x) => x <= b)
    }
    const curvas = xs.map((x) => {
      const row: Record<string, number | null> = { x }
      for (const k of ks) {
        const v = valorEnZ(ind, sexo, pesoTalla ? x : x * DPM, zOf(k))
        row['c' + k] = v === null ? null : +v.toFixed(2)
      }
      return row
    })
    const puntos = meds
      .map((m) => {
        if (pesoTalla) return m.peso && m.talla && (ind === 'wfl' ? m.dias < 731 : m.dias >= 731 && m.dias < 1856) ? { x: m.talla, y: m.peso } : null
        const y = g === 'wfa' ? m.peso : g === 'lhfa' ? m.talla : g === 'hcfa' ? m.pc : m.peso && m.talla ? m.peso / (m.talla / 100) ** 2 : undefined
        const x = m.dias / DPM
        return y && x >= dominio[0] - 0.01 && x <= dominio[1] + 0.01 ? { x: +x.toFixed(2), y: +y.toFixed(2) } : null
      })
      .filter(Boolean) as { x: number; y: number }[]
    return { curvas, puntos, xLabel: pesoTalla ? (ind === 'wfl' ? 'Longitud (cm)' : 'Talla (cm)') : rango === '5-19' ? 'Edad (años)' : 'Edad (meses)', dominio }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, rango, sexo, meds, pct])

  if (!pesoTalla && RANGOS[rango][0] >= MAX_MESES[g]) return <Empty>La OMS no publica referencia de {GRAF.find((x) => x.id === g)!.label.toLowerCase()} para este rango de edad{g === 'wfa' ? ' (después de los 10 años use IMC/edad)' : ''}.</Empty>
  const span = dominio[1] - dominio[0], paso = span > 60 ? 12 : span > 24 ? 6 : 2
  const ticks = pesoTalla ? undefined : Array.from({ length: 40 }, (_, i) => Math.ceil(dominio[0] / paso) * paso + i * paso).filter((t) => t <= dominio[1])
  return (
    <div className="h-[360px] sm:h-[440px]">
      <ResponsiveContainer>
        <ComposedChart data={curvas} margin={{ top: 10, right: 16, left: -8, bottom: 18 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" />
          <XAxis dataKey="x" type="number" domain={dominio} ticks={ticks} allowDecimals={false} tickFormatter={(t: number) => (rango === '5-19' && !pesoTalla ? `${t / 12}` : String(t))}
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }} label={{ value: xLabel, position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--color-muted)' }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} width={44} />
          {ks.map((k) => (
            <Line key={k} dataKey={'c' + k} name={pct ? `P${k}` : k === 0 ? 'Mediana' : `${k > 0 ? '+' : ''}${k} DE`} dot={false} isAnimationActive={false}
              stroke={color(k, pct)} strokeWidth={(pct ? k === 50 : k === 0) ? 2 : 1.2} strokeDasharray={!pct && Math.abs(k) === 1 ? '4 3' : undefined} connectNulls />
          ))}
          <Scatter data={puntos} dataKey="y" name="Paciente" fill="var(--color-brand)" line={{ stroke: 'var(--color-brand)', strokeWidth: 2 }} isAnimationActive={false} />
          <Legend itemSorter={null} verticalAlign="top" height={28} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function NuevaMedicion({ pid }: { pid: string }) {
  const [f, setF] = useState({ fecha: new Date().toISOString().slice(0, 10), peso: '', talla: '', pc: '' })
  const [ok, setOk] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => (setOk(false), setF({ ...f, [k]: e.target.value }))
  function guardar() {
    const fecha = new Date(f.fecha + 'T12:00:00').toISOString()
    const vals: [string, string, string][] = [['peso', f.peso, 'kg'], ['talla', f.talla, 'cm'], ['perimetro-cefalico', f.pc, 'cm']]
    for (const [codigo, v, unidad] of vals) if (Number(v) > 0) add('observations', { patientId: pid, codigo, valor: Number(v), unidad, fuente: 'manual', fecha })
    setF({ ...f, peso: '', talla: '', pc: '' })
    setOk(true)
  }
  return (
    <Card title="Nueva medición">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" className="col-span-2"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Field>
        <Field label="Peso (kg)"><Input type="number" step="0.01" inputMode="decimal" value={f.peso} onChange={set('peso')} /></Field>
        <Field label="Longitud/talla (cm)"><Input type="number" step="0.1" inputMode="decimal" value={f.talla} onChange={set('talla')} /></Field>
        <Field label="Perímetro cefálico (cm)" className="col-span-2"><Input type="number" step="0.1" inputMode="decimal" value={f.pc} onChange={set('pc')} /></Field>
      </div>
      <Button variant="primary" className="mt-3 w-full" disabled={!f.fecha || !(Number(f.peso) > 0 || Number(f.talla) > 0 || Number(f.pc) > 0)} onClick={guardar}>
        <Plus className="size-4" /> {ok ? 'Guardada · agregar otra' : 'Guardar medición'}
      </Button>
      <p className="mt-2 text-xs text-muted">Menores de 2 años: longitud en decúbito. De 2 años en adelante: talla de pie.</p>
    </Card>
  )
}

const tonoBadge = (t: string) => (t === 'ok' ? 'ok' : t === 'warn' ? 'warn' : 'danger') as 'ok' | 'warn' | 'danger'

export default function Crecimiento() {
  const { id: pid, patient } = useActivePatient()
  const meds = useMediciones(pid, patient?.fechaNac)
  const [sexoO, setSexoO] = useState<Sexo>('F')
  const sexo: Sexo = patient?.sexo === 'M' ? 'M' : patient?.sexo === 'F' ? 'F' : sexoO
  const edadDias = patient ? Math.floor((Date.now() - Date.parse(patient.fechaNac + 'T00:00:00')) / DIA) : 0
  const ultima = meds[meds.length - 1]
  const refMeses = (ultima?.dias ?? edadDias) / DPM
  const rangoAuto: Rango = refMeses < 24 ? '0-2' : refMeses <= 60.9 ? '2-5' : '5-19'
  const [g, setG] = useState<Graf>('wfa')
  const [rango, setRango] = useState<Rango | null>(null)
  const [pct, setPct] = useState(false)
  const r = rango ?? rangoAuto
  const filas = useMemo(() => meds.map((m) => ({ m, e: evaluar(m, sexo) })), [meds, sexo])

  if (!patient) return <Page title="Crecimiento OMS"><PatientBar /></Page>
  const mayor = edadDias / 365.25 > 19

  const resumen = ultima
    ? (() => {
        const e = evaluar(ultima, sexo), meses = ultima.dias / DPM
        return ([['wfa', 'Peso/edad'], ['lhfa', 'Talla/edad'], ['bfa', 'IMC/edad'], ['hcfa', 'P. cefálico/edad'], ['wfh', e.pt === 'wfl' ? 'Peso/longitud' : 'Peso/talla']] as [keyof typeof e, string][])
          .filter(([k]) => typeof e[k] === 'number' && k !== 'imc')
          .map(([k, label]) => {
            const z = e[k] as number, [txt, tono] = interpretar(k === 'wfh' ? e.pt : (k as Ind), z, meses)
            return { label, z, p: percentil(z), txt, tono }
          })
      })()
    : []

  return (
    <Page title="Crecimiento OMS" subtitle="Patrones OMS 2006 (0–5 años) y referencia OMS 2007 (5–19 años)">
      <PatientBar />
      {mayor ? (
        <Notice tone="warn">Las curvas de crecimiento de la OMS aplican de 0 a 19 años. Este paciente tiene {Math.floor(edadDias / 365.25)} años; selecciona un paciente pediátrico.</Notice>
      ) : (
        <>
          {patient.sexo === 'O' && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              Referencia por sexo:
              <Select className="w-40" value={sexoO} onChange={(e) => setSexoO(e.target.value as Sexo)}><option value="F">Niñas</option><option value="M">Niños</option></Select>
            </div>
          )}
          {resumen.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {resumen.map((x) => (
                <div key={x.label} className="rounded-xl border border-line bg-surface p-3">
                  <div className="text-xs text-muted">{x.label}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums">z {zfmt(x.z)} <span className="text-xs font-normal text-muted">P{x.p < 1 ? '<1' : x.p > 99 ? '>99' : x.p.toFixed(0)}</span></div>
                  <Badge tone={tonoBadge(x.tono)}>{x.txt}</Badge>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Card title={`Curvas OMS · ${sexo === 'F' ? 'Niñas' : 'Niños'}`} actions={
              <div className="flex rounded-lg border border-line text-xs">
                <button className={'rounded-l-lg px-2 py-1 ' + (!pct ? 'bg-brand-soft text-brand-strong' : '')} onClick={() => setPct(false)}>Puntaje z</button>
                <button className={'rounded-r-lg px-2 py-1 ' + (pct ? 'bg-brand-soft text-brand-strong' : '')} onClick={() => setPct(true)}>Percentiles</button>
              </div>
            }>
              <Tabs tabs={GRAF.map((x) => ({ id: x.id, label: x.label }))} value={g} onChange={setG} />
              {g !== 'wfh' && (
                <div className="mb-2 flex gap-1">
                  {(Object.keys(RANGOS) as Rango[]).map((k) => (
                    <button key={k} onClick={() => setRango(k)} className={'rounded-full border px-2.5 py-0.5 text-xs ' + (r === k ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-muted')}>
                      {k} años
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted">{GRAF.find((x) => x.id === g)!.y}{g === 'wfh' && ' · menores de 2 años: peso/longitud (45–110 cm); 2–5 años: peso/talla (65–120 cm)'}</div>
              <Grafica g={g} rango={r} sexo={sexo} meds={meds} pct={pct} />
            </Card>
            <NuevaMedicion pid={patient.id} />
          </div>
          <Card title="Mediciones" className="mt-4" pad={false}>
            {filas.length === 0 ? (
              <div className="p-4"><Empty>Sin mediciones de peso, talla o perímetro cefálico.</Empty></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-muted">
                    <tr>{['Fecha', 'Edad', 'Peso', 'Talla', 'IMC', 'P. cefálico', 'Peso/talla', 'Interpretación'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...filas].reverse().map(({ m, e }) => {
                      const meses = m.dias / DPM
                      const cel = (v: number | undefined, z: number | null, u: string) =>
                        v === undefined ? <span className="text-muted">—</span> : (
                          <div><span className="tabular-nums">{v.toFixed(1)} {u}</span>{z !== null && <div className="text-xs text-muted tabular-nums">z {zfmt(z)} · P{percentil(z).toFixed(0)}</div>}</div>
                        )
                      const flags = ([['wfa', e.wfa], ['lhfa', e.lhfa], [meses >= 61 || e.wfh === null ? 'bfa' : e.pt, meses >= 61 || e.wfh === null ? e.bfa : e.wfh], ['hcfa', e.hcfa]] as [Ind, number | null][])
                        .filter(([, z]) => z !== null).map(([k, z]) => interpretar(k, z!, meses)).filter(([, t]) => t !== 'ok')
                      return (
                        <tr key={m.fecha}>
                          <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{edadTxt(patient.fechaNac, m.fecha)}</td>
                          <td className="px-3 py-2">{cel(m.peso, e.wfa, 'kg')}</td>
                          <td className="px-3 py-2">{cel(m.talla, e.lhfa, 'cm')}</td>
                          <td className="px-3 py-2">{cel(e.imc, e.bfa, '')}</td>
                          <td className="px-3 py-2">{cel(m.pc, e.hcfa, 'cm')}</td>
                          <td className="px-3 py-2 tabular-nums">{e.wfh === null ? <span className="text-muted">—</span> : `z ${zfmt(e.wfh)}`}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">{flags.length ? flags.map(([t, tono]) => <Badge key={t} tone={tonoBadge(tono)}>{t}</Badge>) : <Badge tone="ok">Normal</Badge>}</div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Disclaimer>
            Puntos de corte OMS: z &lt; −2 bajo / emaciación / talla baja; z &lt; −3 severo; IMC o peso/talla &gt; +1 riesgo de sobrepeso (0–5 a) o sobrepeso (5–19 a), &gt; +2 sobrepeso / obesidad. Para indicadores de peso con |z| &gt; 3 se aplica el ajuste de colas restringidas de la OMS. En prematuros use edad corregida hasta los 2 años. Herramienta de apoyo; no sustituye el juicio clínico.
          </Disclaimer>
        </>
      )}
    </Page>
  )
}
