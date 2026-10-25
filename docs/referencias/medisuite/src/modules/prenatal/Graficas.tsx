import { useMemo } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, Scatter, XAxis, YAxis, CartesianGrid, Legend, Tooltip } from 'recharts'
import { Card, Empty, Notice } from '../../components/ui'
import { AU_RANGO_SDG, bandaIOM, categoriaIMC, imc, IOM } from './calc'
import type { DatosConsulta, DatosEmbarazo } from './modelo'

const tick = { fontSize: 11, fill: 'var(--color-muted)' }
const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12, color: 'var(--color-ink)' }

export function GraficaAU({ consultas }: { consultas: DatosConsulta[] }) {
  const datos = useMemo(() => {
    const rows: { x: number; banda?: [number, number]; ref?: number }[] = []
    for (let s = AU_RANGO_SDG[0]; s <= AU_RANGO_SDG[1]; s++) rows.push({ x: s, banda: [s - 2, s + 2], ref: s })
    return rows
  }, [])
  const puntos = consultas.filter((c) => c.au && c.sdgDias !== undefined).map((c) => ({ x: +(c.sdgDias! / 7).toFixed(1), y: c.au! }))
  return (
    <Card title="Altura uterina (cm) vs. semanas de gestación">
      {puntos.length === 0 && <Notice>Sin mediciones de altura uterina registradas.</Notice>}
      <div className="h-72 sm:h-80" role="img" aria-label="Gráfica de altura uterina por semana de gestación con banda de referencia">
        <ResponsiveContainer>
          <ComposedChart data={datos} margin={{ top: 8, right: 12, left: -12, bottom: 16 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" />
            <XAxis dataKey="x" type="number" domain={[12, 42]} ticks={[12, 16, 20, 24, 28, 32, 36, 40]} tick={tick} label={{ value: 'SDG', position: 'insideBottom', offset: -8, fontSize: 11, fill: 'var(--color-muted)' }} />
            <YAxis domain={[8, 42]} ticks={[10, 15, 20, 25, 30, 35, 40]} tick={tick} width={40} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => (Array.isArray(v) ? `${v[0]}–${v[1]} cm` : `${v} cm`)} labelFormatter={(l) => `${l} SDG`} />
            <Area dataKey="banda" name="Referencia SDG ± 2 cm (McDonald)" fill="var(--color-brand)" fillOpacity={0.15} stroke="none" isAnimationActive={false} />
            <Line dataKey="ref" name="AU = SDG" stroke="var(--color-brand)" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Scatter data={puntos} dataKey="y" name="Paciente" fill="var(--color-danger)" line={{ stroke: 'var(--color-danger)' }} isAnimationActive={false} />
            <Legend verticalAlign="top" height={30} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">
        Referencia: regla de McDonald, entre las 20 y 36 SDG la altura de fondo uterino (cm) ≈ SDG ± 2 cm. Es una aproximación clínica; una medición fuera de la banda amerita ultrasonido.
      </p>
    </Card>
  )
}

export function GraficaPeso({ emb, consultas }: { emb: DatosEmbarazo; consultas: DatosConsulta[] }) {
  const cat = emb.pesoPre && emb.talla ? categoriaIMC(imc(emb.pesoPre, emb.talla)) : null
  const datos = useMemo(() => (cat ? Array.from({ length: 41 }, (_, s) => ({ x: s, banda: bandaIOM(cat, s).map((v) => +v.toFixed(2)) as [number, number] })) : []), [cat])
  if (!cat || !emb.pesoPre) return <Card title="Ganancia de peso"><Empty>Captura el peso pregestacional y la talla en los datos del embarazo para graficar la ganancia de peso.</Empty></Card>
  const puntos = consultas.filter((c) => c.peso && c.sdgDias !== undefined).map((c) => ({ x: +(c.sdgDias! / 7).toFixed(1), y: +(c.peso! - emb.pesoPre!).toFixed(1) }))
  const r = IOM[cat]
  return (
    <Card title="Ganancia de peso (kg) vs. recomendación IOM 2009">
      <div className="h-72 sm:h-80" role="img" aria-label="Gráfica de ganancia de peso gestacional con banda recomendada">
        <ResponsiveContainer>
          <ComposedChart data={datos} margin={{ top: 8, right: 12, left: -12, bottom: 16 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" />
            <XAxis dataKey="x" type="number" domain={[0, 40]} ticks={[0, 8, 13, 20, 28, 36, 40]} tick={tick} label={{ value: 'SDG', position: 'insideBottom', offset: -8, fontSize: 11, fill: 'var(--color-muted)' }} />
            <YAxis tick={tick} width={40} domain={['auto', 'auto']} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => (Array.isArray(v) ? `${v[0]}–${v[1]} kg` : `${v} kg`)} labelFormatter={(l) => `${l} SDG`} />
            <Area dataKey="banda" name={`Recomendado IOM (${r.label})`} fill="var(--color-ok)" fillOpacity={0.15} stroke="var(--color-ok)" strokeOpacity={0.4} isAnimationActive={false} />
            <Scatter data={puntos} dataKey="y" name="Ganancia de la paciente" fill="var(--color-brand)" line={{ stroke: 'var(--color-brand)' }} isAnimationActive={false} />
            <Legend verticalAlign="top" height={30} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="mb-1 text-left text-muted">IOM 2009 (embarazo único). Las tasas de 2.º y 3.er trimestre suponen 0.5–2 kg en el 1.er trimestre.</caption>
          <thead className="text-muted">
            <tr><th className="py-1 pr-2">IMC pregestacional</th><th className="pr-2">Ganancia total</th><th>Tasa 2.º–3.er trim. (kg/sem)</th></tr>
          </thead>
          <tbody>
            {(Object.keys(IOM) as (keyof typeof IOM)[]).map((k) => (
              <tr key={k} className={k === cat ? 'font-semibold text-brand-strong' : ''}>
                <td className="py-0.5 pr-2">{IOM[k].label} ({IOM[k].imc})</td>
                <td className="pr-2">{IOM[k].total[0]}–{IOM[k].total[1]} kg</td>
                <td>{IOM[k].tasa} ({IOM[k].tasaRango[0]}–{IOM[k].tasaRango[1]})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
