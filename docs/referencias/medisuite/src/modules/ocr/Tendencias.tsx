import { useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea } from 'recharts'
import { useCollection } from '../../lib/store'
import { fmtFecha } from '../../lib/utils'
import { Card, Empty } from '../../components/ui'
import { ANALITOS } from './parser'

/** Gráficas de tendencia de los analitos de laboratorio del paciente, con banda de referencia. */
export default function Tendencias({ patientId }: { patientId: string }) {
  const obs = useCollection('observations', (o) => o.patientId === patientId, [patientId])
  const series = useMemo(
    () =>
      ANALITOS.map((a) => ({
        a,
        datos: obs
          .filter((o) => o.codigo === a.codigo)
          .sort((x, y) => x.fecha.localeCompare(y.fecha))
          .map((o) => ({ t: new Date(o.fecha).getTime(), valor: o.valor, unidad: o.unidad, ocr: o.fuente === 'ocr' })),
      })).filter((s) => s.datos.length > 0),
    [obs],
  )
  if (!series.length) return <Empty>Aún no hay resultados de laboratorio para este paciente.</Empty>
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {series.map(({ a, datos }) => {
        const ult = datos[datos.length - 1]
        const vals = datos.map((d) => d.valor).concat([a.ref[0] ?? Infinity, a.ref[1] ?? -Infinity].filter(Number.isFinite))
        const lo = Math.min(...vals), hi = Math.max(...vals)
        const pad = (hi - lo || hi || 1) * 0.15
        const paso = 10 ** Math.floor(Math.log10(hi - lo + 2 * pad || 1))
        const y0 = Math.max(0, Math.floor((lo - pad) / paso) * paso), y1 = Math.ceil((hi + pad) / paso) * paso
        const ref = a.ref[0] != null && a.ref[1] != null ? `${a.ref[0]}–${a.ref[1]}` : a.ref[1] != null ? `< ${a.ref[1]}` : `> ${a.ref[0]}`
        return (
          <Card key={a.id} title={a.label} actions={<span className="text-xs text-muted">Último: <b className="text-ink">{ult.valor} {ult.unidad}</b></span>}>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={datos} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtFecha(new Date(t).toISOString(), { month: 'short', year: '2-digit' })} fontSize={11} padding={{ left: 10, right: 10 }} />
                  <YAxis domain={[y0, y1]} fontSize={11} tickFormatter={(v: number) => String(+v.toPrecision(3))} />
                  <ReferenceArea y1={a.ref[0] ?? y0} y2={a.ref[1] ?? y1} fill="var(--color-ok)" fillOpacity={0.1} ifOverflow="hidden" />
                  <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }} labelFormatter={(t) => fmtFecha(new Date(t as number).toISOString())} formatter={(v) => [`${v} ${ult.unidad}`, a.label]} />
                  <Line dataKey="valor" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 text-xs text-muted">
              Banda verde: referencia {ref} {a.unidad} (adulto, orientativa) · {datos.length} resultado(s)
            </div>
          </Card>
        )
      })}
    </div>
  )
}
