import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Save, ExternalLink } from 'lucide-react'
import { Card, Button, Field, Input, Modal, Empty } from '../../components/ui'
import { add, useCollection } from '../../lib/store'
import { cx, fmtFechaHora } from '../../lib/utils'
import type { Observation } from '../../lib/types'
import { horaEnDia, horaPorOmision, hhmm, type Ctx } from './ctx'

export const COLS: { k: string; label: string; unidad: string; step?: string; alerta?: (v: number) => boolean }[] = [
  { k: 'pas', label: 'TA sist.', unidad: 'mmHg', alerta: (v) => v >= 180 || v < 90 },
  { k: 'pad', label: 'TA diast.', unidad: 'mmHg', alerta: (v) => v >= 110 || v < 50 },
  { k: 'fc', label: 'FC', unidad: 'lpm', alerta: (v) => v > 100 || v < 50 },
  { k: 'fr', label: 'FR', unidad: 'rpm', alerta: (v) => v > 24 || v < 10 },
  { k: 'temp', label: 'Temp.', unidad: '°C', step: '0.1', alerta: (v) => v >= 38 || v < 35 },
  { k: 'spo2', label: 'SpO₂', unidad: '%', alerta: (v) => v < 92 },
  { k: 'glucosa', label: 'Glucosa', unidad: 'mg/dL', alerta: (v) => v < 70 || v > 250 },
]

export function useObsTurno(ctx: Ctx) {
  const [a, b] = ctx.rango
  return useCollection('observations', (o) => o.patientId === ctx.pid && COLS.some((c) => c.k === o.codigo) && Date.parse(o.fecha) >= a && Date.parse(o.fecha) < b, [ctx.pid, a, b])
}

function Captura({ ctx, hora, onClose }: { ctx: Ctx; hora: string; onClose: () => void }) {
  const [h, setH] = useState(hora)
  const [v, setV] = useState<Record<string, string>>({})
  const t = horaEnDia(h, ctx.dia0)
  const fuera = t < ctx.rango[0] || t >= ctx.rango[1]
  const hay = COLS.some((c) => v[c.k]?.trim())
  function guardar() {
    const fecha = new Date(t).toISOString()
    for (const c of COLS) {
      const n = Number(v[c.k])
      if (!v[c.k]?.trim() || !Number.isFinite(n)) continue
      add('observations', { patientId: ctx.pid!, fecha, codigo: c.k, valor: n, unidad: c.unidad, fuente: 'manual', etiqueta: 'Hoja de enfermería' })
    }
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Registrar signos vitales">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Hora" hint={fuera ? 'Fuera del turno seleccionado' : undefined}>
          <Input type="time" value={h} onChange={(e) => setH(e.target.value)} />
        </Field>
        {COLS.map((c) => (
          <Field key={c.k} label={`${c.label} (${c.unidad})`}>
            <Input type="number" inputMode="decimal" step={c.step ?? '1'} value={v[c.k] ?? ''} onChange={(e) => setV({ ...v, [c.k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!hay} onClick={guardar}><Save className="size-4" /> Guardar</Button>
      </div>
    </Modal>
  )
}

function UltimaEscala({ obs, nombre }: { obs: Observation[]; nombre: string }) {
  const o = obs.filter((x) => x.etiqueta === nombre).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs text-muted">{nombre}</div>
      {o ? (
        <>
          <div className="text-xl font-semibold tabular-nums">{o.valor} pts</div>
          <div className="text-xs text-muted">{o.interpretacion} · {fmtFechaHora(o.fecha)}</div>
        </>
      ) : (
        <div className="text-sm text-muted">Sin aplicar</div>
      )}
    </div>
  )
}

export default function Signos({ ctx }: { ctx: Ctx }) {
  const obs = useObsTurno(ctx)
  const escalas = useCollection('observations', (o) => o.patientId === ctx.pid && o.codigo === 'escala' && (o.etiqueta === 'Braden' || o.etiqueta === 'Morse'), [ctx.pid])
  const [captura, setCaptura] = useState<string | null>(null)
  const [a, b] = ctx.rango
  const horas: number[] = []
  for (let t = a; t < b; t += 3600000) horas.push(t)
  const celda = (t: number, k: string) =>
    obs.filter((o) => o.codigo === k && Date.parse(o.fecha) >= t && Date.parse(o.fecha) < t + 3600000).sort((x, y) => y.fecha.localeCompare(x.fecha))[0]

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <Card title="Signos vitales por hora" actions={ctx.puedeObs && <Button size="sm" variant="primary" onClick={() => setCaptura(horaPorOmision(ctx.rango))}><Plus className="size-4" /> Registrar</Button>} pad={false}>
        {!ctx.pid ? (
          <div className="p-4"><Empty>Selecciona un paciente.</Empty></div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm tabular-nums">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th scope="col" className="px-2 py-2 text-left font-medium">Hora</th>
                  {COLS.map((c) => <th key={c.k} scope="col" className="px-2 py-2 text-right font-medium">{c.label}<span className="block font-normal">{c.unidad}</span></th>)}
                  <th className="w-10"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {horas.map((t) => (
                  <tr key={t} className="hover:bg-surface-2/60">
                    <th scope="row" className="px-2 py-1.5 text-left font-medium">{hhmm(t)}</th>
                    {COLS.map((c) => {
                      const o = celda(t, c.k)
                      const alerta = o && c.alerta?.(o.valor)
                      return <td key={c.k} className={cx('px-2 py-1.5 text-right', alerta && 'font-semibold text-danger')}>{o ? o.valor : <span className="text-muted">·</span>}</td>
                    })}
                    <td className="px-1 text-right">
                      {ctx.puedeObs && (
                        <button className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Registrar signos a las ${hhmm(t)}`} onClick={() => setCaptura(hhmm(t))}>
                          <Plus className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-muted">Cada valor se guarda como observación (fuente manual) y aparece en Signos vitales y en la línea de tiempo. En rojo: fuera de rangos de alerta orientativos para adulto.</p>
          </div>
        )}
      </Card>
      <Card title="Escalas de enfermería">
        <div className="grid gap-2">
          <UltimaEscala obs={escalas} nombre="Braden" />
          <UltimaEscala obs={escalas} nombre="Morse" />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link to="/escalas?e=braden" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
            Aplicar Braden <ExternalLink className="size-3.5" />
          </Link>
          <Link to="/escalas?e=morse" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
            Aplicar Morse <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </Card>
      {captura && ctx.pid && <Captura ctx={ctx} hora={captura} onClose={() => setCaptura(null)} />}
    </div>
  )
}
