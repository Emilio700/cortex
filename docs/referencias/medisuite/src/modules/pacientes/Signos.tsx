import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus, Trash2 } from 'lucide-react'
import type { Observation, Patient } from '../../lib/types'
import { add, remove, useCollection } from '../../lib/store'
import { OBS_LABELS, cx, fmtFecha, fmtFechaHora } from '../../lib/utils'
import { Button, Card, Disclaimer, Empty, Field, Input, Select } from '../../components/ui'
import { confirmar } from '../../components/dialogos'

// Rangos de referencia orientativos (adulto) para sombrear la gráfica
const RANGOS: Record<string, [number, number]> = {
  pas: [90, 130], fc: [60, 100], fr: [12, 20], temp: [36, 37.5], spo2: [95, 100], glucosa: [70, 100], hba1c: [4, 5.7],
  colesterol: [0, 200], trigliceridos: [0, 150], ldl: [0, 100], creatinina: [0.6, 1.2], imc: [18.5, 24.9],
}

const FUENTES: Record<Observation['fuente'], string> = {
  manual: 'Manual', bluetooth: 'Bluetooth', ocr: 'OCR', camara: 'Cámara', escala: 'Escala', calculadora: 'Calculadora', ecg: 'ECG', importado: 'Importado (FHIR)',
}

const serieKey = (o: Observation) => (o.etiqueta && !OBS_LABELS[o.codigo]) || o.codigo === 'escala' || o.codigo === 'rom' ? `${o.codigo}|${o.etiqueta ?? ''}` : o.codigo
const pad2 = (n: number) => String(n).padStart(2, '0')
const localDT = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`

export default function Signos({ p }: { p: Patient }) {
  const obs = useCollection('observations', (o) => o.patientId === p.id, [p.id])

  const series = useMemo(() => {
    const m = new Map<string, { label: string; unidad: string; n: number; codigo: string }>()
    for (const o of obs) {
      if (o.codigo === 'pad') continue // va junto con la sistólica
      const k = serieKey(o)
      const prev = m.get(k)
      const label = o.codigo === 'pas' ? 'Presión arterial' : k.includes('|') ? `${OBS_LABELS[o.codigo]?.label ?? o.codigo}: ${o.etiqueta}` : OBS_LABELS[o.codigo]?.label ?? o.etiqueta ?? o.codigo
      m.set(k, { label, unidad: o.unidad, n: (prev?.n ?? 0) + 1, codigo: o.codigo })
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [obs])

  const [sel, setSel] = useState<string>('')
  const actual = series.find(([k]) => k === sel) ? sel : series[0]?.[0] ?? ''
  const info = series.find(([k]) => k === actual)?.[1]

  const datos = useMemo((): { t: number; valor?: number; pas?: number; pad?: number }[] => {
    if (!actual) return []
    const rows = obs.filter((o) => serieKey(o) === actual || (actual === 'pas' && o.codigo === 'pad')).sort((a, b) => a.fecha.localeCompare(b.fecha))
    if (actual !== 'pas') return rows.map((o) => ({ t: new Date(o.fecha).getTime(), valor: o.valor }))
    // combinar sistólica/diastólica de la misma toma
    const m = new Map<string, { t: number; pas?: number; pad?: number }>()
    for (const o of rows) {
      const k = o.fecha.slice(0, 16)
      const r = m.get(k) ?? { t: new Date(o.fecha).getTime() }
      r[o.codigo as 'pas' | 'pad'] = o.valor
      m.set(k, r)
    }
    return [...m.values()]
  }, [obs, actual])

  const tabla = useMemo(
    () => obs.filter((o) => serieKey(o) === actual || (actual === 'pas' && o.codigo === 'pad')).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [obs, actual],
  )
  const rango = info ? RANGOS[info.codigo] : undefined

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        {series.length === 0 ? (
          <Empty>Sin mediciones registradas. Agrega la primera con el formulario.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {series.map(([k, s]) => (
                <button
                  key={k}
                  onClick={() => setSel(k)}
                  className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', k === actual ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-muted hover:text-ink')}
                >
                  {s.label} <span className="opacity-60">({s.n})</span>
                </button>
              ))}
            </div>
            <Card title={`${info?.label} (${info?.unidad})`}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={datos} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(t) => fmtFecha(new Date(t).toISOString(), { month: 'short', year: '2-digit' })}
                      tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                      stroke="var(--color-line)"
                    />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} stroke="var(--color-line)" width={48} />
                    {rango && <ReferenceArea y1={rango[0]} y2={rango[1]} fill="var(--color-ok)" fillOpacity={0.08} />}
                    {actual === 'pas' && <ReferenceArea y1={60} y2={80} fill="var(--color-ok)" fillOpacity={0.06} />}
                    <Tooltip
                      labelFormatter={(t) => fmtFechaHora(new Date(Number(t)).toISOString())}
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 }}
                    />
                    {actual === 'pas' ? (
                      <>
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="pas" name="Sistólica" stroke="var(--color-danger)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="pad" name="Diastólica" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </>
                    ) : (
                      <Line type="monotone" dataKey="valor" name={info?.label} stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 3 }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {rango && <Disclaimer>Banda verde: rango de referencia orientativo para adultos ({rango[0]}–{rango[1]} {info?.unidad}). Interpretar según el contexto clínico.</Disclaimer>}
            </Card>
            <Card title="Valores" pad={false}>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Fecha</th>
                      <th className="px-2 py-2 text-left font-medium">Medición</th>
                      <th className="px-2 py-2 text-right font-medium">Valor</th>
                      <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">Fuente</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {tabla.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-1.5 whitespace-nowrap">{fmtFechaHora(o.fecha)}</td>
                        <td className="px-2 py-1.5">{o.etiqueta ?? OBS_LABELS[o.codigo]?.label ?? o.codigo}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                          {o.valor} <span className="text-xs font-normal text-muted">{o.unidad}</span>
                        </td>
                        <td className="hidden px-2 py-1.5 text-xs text-muted sm:table-cell">{FUENTES[o.fuente] ?? o.fuente}</td>
                        <td className="pr-2">
                          <button
                            className="grid size-7 place-items-center rounded text-muted hover:bg-surface-2 hover:text-danger"
                            aria-label="Eliminar medición"
                            onClick={() => void confirmar('¿Eliminar esta medición?', { peligro: true }).then((ok) => ok && remove('observations', o.id))}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
      <NuevaObs p={p} onAdded={(k) => setSel(k)} />
    </div>
  )
}

function NuevaObs({ p, onAdded }: { p: Patient; onAdded: (k: string) => void }) {
  const [codigo, setCodigo] = useState('peso')
  const [valor, setValor] = useState('')
  const [valor2, setValor2] = useState('')
  const [fecha, setFecha] = useState(localDT())
  const [etiqueta, setEtiqueta] = useState('')
  const [unidad, setUnidad] = useState('')
  const otro = codigo === 'otro'
  const esPA = codigo === 'pas'

  const guardar = () => {
    const v = parseFloat(valor.replace(',', '.'))
    if (!Number.isFinite(v)) return
    const iso = new Date(fecha).toISOString()
    const cod = otro ? etiqueta.trim().toLowerCase().replace(/\s+/g, '-') || 'otro' : codigo
    const nueva = add('observations', {
      patientId: p.id, fecha: iso, codigo: cod, valor: v, unidad: otro ? unidad : OBS_LABELS[codigo].unidad, fuente: 'manual',
      etiqueta: otro ? etiqueta.trim() || undefined : undefined,
    })
    const v2 = parseFloat(valor2.replace(',', '.'))
    if (esPA && Number.isFinite(v2)) add('observations', { patientId: p.id, fecha: iso, codigo: 'pad', valor: v2, unidad: 'mmHg', fuente: 'manual' })
    setValor('')
    setValor2('')
    onAdded(serieKey(nueva))
  }

  return (
    <Card title="Agregar medición">
      <div className="space-y-3">
        <Field label="Tipo">
          <Select value={codigo} onChange={(e) => setCodigo(e.target.value)}>
            {Object.entries(OBS_LABELS)
              .filter(([k]) => k !== 'pad' && k !== 'escala' && k !== 'rom')
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {k === 'pas' ? 'Presión arterial' : v.label} ({v.unidad})
                </option>
              ))}
            <option value="otro">Otro…</option>
          </Select>
        </Field>
        {otro && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre">
              <Input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Ej. TSH" />
            </Field>
            <Field label="Unidad">
              <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="µUI/mL" />
            </Field>
          </div>
        )}
        <div className={cx('grid gap-2', esPA && 'grid-cols-2')}>
          <Field label={esPA ? 'Sistólica (mmHg)' : `Valor${otro ? '' : ` (${OBS_LABELS[codigo]?.unidad})`}`}>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} />
          </Field>
          {esPA && (
            <Field label="Diastólica (mmHg)">
              <Input inputMode="decimal" value={valor2} onChange={(e) => setValor2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} />
            </Field>
          )}
        </div>
        <Field label="Fecha y hora">
          <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" onClick={guardar} disabled={!valor || (otro && !etiqueta.trim())}>
          <Plus className="size-4" /> Guardar medición
        </Button>
      </div>
    </Card>
  )
}
