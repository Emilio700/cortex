import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Card, Button, Field, Input, Select, Notice, Empty } from '../../components/ui'
import { cx } from '../../lib/utils'
import {
  PI_FACTOR_ADULTO, TURNOS, TURNO_LABEL, VIAS_EGRESO, VIAS_INGRESO, gastoUrinario, rangoTurno, totales,
  type Movimiento, type Totales, type Turno, type ViaEgreso, type ViaIngreso,
} from './calc'
import { horaEnDia, horaPorOmision, hhmm, nuevoId, usePeso, type Ctx } from './ctx'

/** Horas transcurridas del intervalo (si está en curso, solo hasta ahora). */
export function horasEfectivas([a, b]: [number, number], ahora = Date.now()) {
  return Math.max(0, (Math.min(b, ahora) - a) / 3600000)
}

export function totalesTurno(ctx: Ctx, turno: Turno, peso: number | undefined): Totales & { horas: number } {
  const r = rangoTurno(ctx.dia0, turno, ctx.cfg)
  const movs = ctx.datos.movimientos.filter((m) => Date.parse(m.hora) >= r[0] && Date.parse(m.hora) < r[1])
  const horas = horasEfectivas(r)
  return { ...totales(movs, peso ?? 0, horas, ctx.datos.factorPI ?? PI_FACTOR_ADULTO), horas }
}

/** Oliguria según KDIGO: < 0.5 mL/kg/h durante ≥ 6 h. */
const bajo = (gu: number, horas: number) => Number.isFinite(gu) && horas >= 6 && gu < 0.5
const fmt = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n)}`

export default function Balance({ ctx }: { ctx: Ctx }) {
  const peso = usePeso(ctx)
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso')
  const [via, setVia] = useState<string>('oral')
  const [ml, setMl] = useState('')
  const [hora, setHora] = useState(() => horaPorOmision(ctx.rango))
  const [nota, setNota] = useState('')
  const factor = ctx.datos.factorPI ?? PI_FACTOR_ADULTO
  const [a, b] = ctx.rango
  const movs = ctx.datos.movimientos.filter((m) => Date.parse(m.hora) >= a && Date.parse(m.hora) < b).sort((x, y) => x.hora.localeCompare(y.hora))
  const porTurno = TURNOS.map((t) => ({ t, tot: totalesTurno(ctx, t, peso) }))
  const dia = porTurno.reduce(
    (s, { tot }) => ({ ingresos: s.ingresos + tot.ingresos, medidos: s.medidos + tot.medidos, insensibles: s.insensibles + tot.insensibles, egresos: s.egresos + tot.egresos, balance: s.balance + tot.balance, horas: s.horas + tot.horas, diuresis: s.diuresis + (tot.porVia.diuresis ?? 0) }),
    { ingresos: 0, medidos: 0, insensibles: 0, egresos: 0, balance: 0, horas: 0, diuresis: 0 },
  )
  const actual = porTurno.find((x) => x.t === ctx.turno)!.tot
  const gu = peso ? gastoUrinario(actual.porVia.diuresis ?? 0, peso, actual.horas) : NaN
  const gu24 = peso ? gastoUrinario(dia.diuresis, peso, dia.horas) : NaN

  function agregar() {
    const n = Number(ml)
    if (!(n > 0)) return
    const m: Movimiento = { id: nuevoId(), hora: new Date(horaEnDia(hora, ctx.dia0)).toISOString(), tipo, via: via as ViaIngreso | ViaEgreso, ml: n, nota: nota.trim() || undefined }
    ctx.guardar((d) => ({ ...d, movimientos: [...d.movimientos, m] }))
    setMl('')
    setNota('')
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        {ctx.puede && (
          <Card title="Registrar ingreso o egreso">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="Tipo">
                <Select value={tipo} onChange={(e) => { const t = e.target.value as 'ingreso' | 'egreso'; setTipo(t); setVia(t === 'ingreso' ? 'oral' : 'diuresis') }}>
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                </Select>
              </Field>
              <Field label="Vía">
                <Select value={via} onChange={(e) => setVia(e.target.value)}>
                  {Object.entries(tipo === 'ingreso' ? VIAS_INGRESO : VIAS_EGRESO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Volumen (mL)">
                <Input type="number" min={0} inputMode="numeric" value={ml} onChange={(e) => setMl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} />
              </Field>
              <Field label="Hora">
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </Field>
              <Field label="Nota" className="col-span-2 sm:col-span-1">
                <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
              </Field>
            </div>
            <Button variant="primary" className="mt-3" disabled={!(Number(ml) > 0)} onClick={agregar}><Plus className="size-4" /> Agregar</Button>
          </Card>
        )}
        <Card title={`Movimientos del turno ${TURNO_LABEL[ctx.turno].toLowerCase()}`} pad={false}>
          {movs.length === 0 ? (
            <div className="p-4"><Empty>Sin registros en este turno.</Empty></div>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {movs.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-12 tabular-nums text-muted">{hhmm(Date.parse(m.hora))}</span>
                  <span className={cx('w-16 text-xs font-medium', m.tipo === 'ingreso' ? 'text-brand' : 'text-warn')}>{m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</span>
                  <span className="min-w-0 flex-1 truncate">{(VIAS_INGRESO as Record<string, string>)[m.via] ?? (VIAS_EGRESO as Record<string, string>)[m.via]}{m.nota && <span className="text-muted"> · {m.nota}</span>}</span>
                  <span className="tabular-nums font-medium">{m.ml} mL</span>
                  {ctx.puede && (
                    <button className="rounded p-1 text-muted hover:text-danger" aria-label="Eliminar movimiento" onClick={() => ctx.guardar((d) => ({ ...d, movimientos: d.movimientos.filter((x) => x.id !== m.id) }))}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Totales">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label="Peso (kg)" hint={ctx.datos.peso == null && peso ? 'Último peso registrado' : undefined}>
              <Input type="number" step="0.1" value={peso ?? ''} disabled={!ctx.puede} onChange={(e) => { const v = Number(e.target.value); ctx.guardar((d) => ({ ...d, peso: v > 0 ? v : undefined })) }} />
            </Field>
            <Field label="P. insensibles (mL/kg/h)" hint="Adulto 0.5 (verificar)">
              <Input type="number" step="0.1" min={0} value={factor} disabled={!ctx.puede} onChange={(e) => { const v = Number(e.target.value); ctx.guardar((d) => ({ ...d, factorPI: v >= 0 ? v : undefined })) }} />
            </Field>
          </div>
          {!peso && <Notice tone="warn">Captura el peso para estimar pérdidas insensibles y gasto urinario.</Notice>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">mL</th>
                  {TURNOS.map((t) => <th key={t} className={cx('py-1 text-right font-medium', t === ctx.turno && 'text-brand')}>{TURNO_LABEL[t].slice(0, 3)}.</th>)}
                  <th className="py-1 text-right font-semibold">24 h</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr><th scope="row" className="py-1 text-left font-normal">Ingresos</th>{porTurno.map(({ t, tot }) => <td key={t} className="text-right">{tot.ingresos}</td>)}<td className="text-right font-semibold">{dia.ingresos}</td></tr>
                <tr><th scope="row" className="py-1 text-left font-normal">Egresos medidos</th>{porTurno.map(({ t, tot }) => <td key={t} className="text-right">{tot.medidos}</td>)}<td className="text-right font-semibold">{dia.medidos}</td></tr>
                <tr><th scope="row" className="py-1 text-left font-normal">P. insensibles</th>{porTurno.map(({ t, tot }) => <td key={t} className="text-right">{tot.insensibles}</td>)}<td className="text-right font-semibold">{dia.insensibles}</td></tr>
                <tr><th scope="row" className="py-1 text-left font-medium">Balance</th>{porTurno.map(({ t, tot }) => <td key={t} className={cx('text-right font-medium', tot.balance < 0 ? 'text-warn' : 'text-ink')}>{fmt(tot.balance)}</td>)}<td className={cx('text-right font-bold', dia.balance < 0 ? 'text-warn' : 'text-ink')}>{fmt(dia.balance)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
            <div>Gasto urinario del turno: <b className={cx(bajo(gu, actual.horas) && 'text-danger')}>{Number.isFinite(gu) ? gu.toFixed(2) : '—'}</b> mL/kg/h <span className="text-xs text-muted">({actual.horas.toFixed(1)} h)</span></div>
            <div>Gasto urinario acumulado: <b className={cx(bajo(gu24, dia.horas) && 'text-danger')}>{Number.isFinite(gu24) ? gu24.toFixed(2) : '—'}</b> mL/kg/h <span className="text-xs text-muted">({dia.horas.toFixed(1)} h)</span></div>
            {(bajo(gu, actual.horas) || bajo(gu24, dia.horas)) && <div className="mt-1 text-xs text-danger">&lt; 0.5 mL/kg/h sostenido 6–12 h es criterio de lesión renal aguda (KDIGO 2012). Avise al médico.</div>}
          </div>
          <p className="mt-3 text-xs text-muted">
            Pérdidas insensibles = peso × factor × horas transcurridas del turno. El factor 0.5 mL/kg/h es una convención usual para adultos (verificar con el protocolo de su institución; aumente en fiebre, taquipnea o ventilación mecánica; en pediatría use el cálculo por superficie corporal). Gasto urinario: KDIGO Clinical Practice Guideline for Acute Kidney Injury, 2012.
          </p>
        </Card>
      </div>
    </div>
  )
}
