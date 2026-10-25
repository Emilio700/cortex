import { useState } from 'react'
import { Card, Field, Input, Select, Tabs, Disclaimer } from '../../components/ui'
import { cx } from '../../lib/utils'
import { UNIDADES_DOSIS, concentracion, dosisDesdeVelocidad, fmtDuracion, gotasPorMinuto, mlHDesdeVolumen, tiempoInfusionH, velocidadMlH, type UnidadCantidad, type UnidadDosis } from './calc'
import { usePeso, type Ctx } from './ctx'

const n = (s: string) => (s.trim() === '' ? NaN : Number(s))
const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toLocaleString('es-MX', { maximumFractionDigits: d }) : '—')

function Resultado({ label, value, unidad, grande }: { label: string; value: string; unidad: string; grande?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('font-semibold tabular-nums', grande ? 'text-3xl text-brand' : 'text-xl')}>
        {value} <span className="text-sm font-normal text-muted">{unidad}</span>
      </div>
    </div>
  )
}

function PorDosis({ pesoInicial }: { pesoInicial?: number }) {
  const [dosis, setDosis] = useState('5')
  const [ud, setUd] = useState<UnidadDosis>('mcg/kg/min')
  const [cant, setCant] = useState('400')
  const [uc, setUc] = useState<UnidadCantidad>('mg')
  const [vol, setVol] = useState('250')
  const [peso, setPeso] = useState(pesoInicial ? String(pesoInicial) : '')
  const [velInv, setVelInv] = useState('')
  const porKg = ud.includes('/kg/')
  const c = concentracion(n(cant), uc, n(vol), ud)
  const mlh = velocidadMlH(n(dosis), ud, c, n(peso))
  const inv = dosisDesdeVelocidad(n(velInv), ud, c, n(peso))
  const base = ud.split('/')[0]
  const mezclaInvalida = (uc === 'U') !== (base === 'U')
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dosis indicada"><Input type="number" inputMode="decimal" step="any" value={dosis} onChange={(e) => setDosis(e.target.value)} /></Field>
        <Field label="Unidad de dosis">
          <Select value={ud} onChange={(e) => { const u = e.target.value as UnidadDosis; setUd(u); if (u.startsWith('U')) setUc('U'); else if (uc === 'U') setUc('mg') }}>
            {UNIDADES_DOSIS.map((u) => <option key={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Cantidad de fármaco en la mezcla"><Input type="number" inputMode="decimal" step="any" value={cant} onChange={(e) => setCant(e.target.value)} /></Field>
        <Field label="Unidad">
          <Select value={uc} onChange={(e) => setUc(e.target.value as UnidadCantidad)}>
            <option value="mg">mg</option>
            <option value="mcg">mcg</option>
            <option value="U">U (unidades)</option>
          </Select>
        </Field>
        <Field label="Volumen total de la mezcla (mL)"><Input type="number" inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} /></Field>
        <Field label={`Peso (kg)${porKg ? '' : ' — no se usa'}`}><Input type="number" inputMode="decimal" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} disabled={!porKg} /></Field>
      </div>
      <div className="space-y-3">
        {mezclaInvalida && <p className="text-sm text-danger">No se puede convertir unidades (U) a masa (mg/mcg).</p>}
        <div className="grid grid-cols-2 gap-3">
          <Resultado label="Velocidad de infusión" value={f(mlh, 1)} unidad="mL/h" grande />
          <Resultado label="Concentración" value={f(c, 3)} unidad={`${base}/mL`} />
          <Resultado label="Macrogotero (20 gotas/mL)" value={f(gotasPorMinuto(mlh, 20), 0)} unidad="gotas/min" />
          <Resultado label="Microgotero (60 µgotas/mL)" value={f(gotasPorMinuto(mlh, 60), 0)} unidad="µgotas/min" />
          <Resultado label="Duración de la mezcla" value={fmtDuracion(tiempoInfusionH(n(vol), mlh))} unidad="" />
        </div>
        <Field label="Inverso: la bomba está a (mL/h)" hint={Number.isFinite(inv) ? `= ${f(inv, 3)} ${ud}` : 'Escriba la velocidad para conocer la dosis que recibe'}>
          <Input type="number" inputMode="decimal" step="any" value={velInv} onChange={(e) => setVelInv(e.target.value)} />
        </Field>
        <p className="text-xs text-muted">
          mL/h = dosis {porKg ? '× peso ' : ''}{ud.endsWith('/min') ? '× ' : ''}{ud.endsWith('/min') ? '60 ' : ''}÷ concentración ({base}/mL). Gotas/min = mL/h × factor de goteo ÷ 60. Duración = volumen ÷ mL/h.
        </p>
      </div>
    </div>
  )
}

function PorVolumen() {
  const [vol, setVol] = useState('1000')
  const [h, setH] = useState('8')
  const [min, setMin] = useState('0')
  const horas = n(h) + (n(min) || 0) / 60
  const mlh = mlHDesdeVolumen(n(vol), horas)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Volumen (mL)"><Input type="number" inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} /></Field>
        <Field label="Horas"><Input type="number" inputMode="numeric" min={0} value={h} onChange={(e) => setH(e.target.value)} /></Field>
        <Field label="Minutos"><Input type="number" inputMode="numeric" min={0} max={59} value={min} onChange={(e) => setMin(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Resultado label="Velocidad" value={f(mlh, 1)} unidad="mL/h" grande />
        <Resultado label="Macrogotero (20)" value={f(gotasPorMinuto(mlh, 20), 0)} unidad="gotas/min" />
        <Resultado label="Microgotero (60)" value={f(gotasPorMinuto(mlh, 60), 0)} unidad="µgotas/min" />
        <Resultado label="Gotero de 15 gotas/mL" value={f(gotasPorMinuto(mlh, 15), 0)} unidad="gotas/min" />
        <p className="col-span-2 text-xs text-muted">Gotas/min = volumen (mL) × factor de goteo ÷ tiempo (min). Con macrogotero (20) equivale a mL/h ÷ 3; con microgotero (60), a los mL/h. Redondee al entero para ajustar el regulador.</p>
      </div>
    </div>
  )
}

export default function Infusiones({ ctx }: { ctx: Ctx }) {
  const peso = usePeso(ctx)
  const [modo, setModo] = useState<'dosis' | 'volumen'>('dosis')
  return (
    <Card title="Calculadora de infusiones">
      <Tabs value={modo} onChange={setModo} tabs={[{ id: 'dosis', label: 'Por dosis (bomba)' }, { id: 'volumen', label: 'Por volumen y tiempo (goteo)' }]} />
      {modo === 'dosis' ? <PorDosis pesoInicial={peso} /> : <PorVolumen />}
      <p className="mt-4 text-xs text-muted">Fórmulas estándar de cálculo de dosis y goteo IV (p. ej., Gray Morris D. <i>Calculate with Confidence</i>, 7.ª ed., Elsevier, 2018). Verifique siempre con doble chequeo independiente los fármacos de alto riesgo.</p>
      <Disclaimer />
    </Card>
  )
}
