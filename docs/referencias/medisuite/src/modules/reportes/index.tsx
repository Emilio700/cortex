import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell as CellColor, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Table2, BarChart3 } from 'lucide-react'
import { Page, Card, Field, Input, Stat, Empty, Button } from '../../components/ui'
import { useCollection, useSettings } from '../../lib/store'
import { edad, mxn } from '../../lib/utils'

// Paleta categórica validada (orden fijo) con pasos distintos para modo claro/oscuro.
const PAL = {
  claro: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  oscuro: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
}
const METODOS = [
  ['efectivo', 'Efectivo'],
  ['tarjeta', 'Tarjeta'],
  ['transferencia', 'Transferencia'],
] as const
const TIPOS: Record<string, string> = { 'primera-vez': 'Primera vez', subsecuente: 'Subsecuente', procedimiento: 'Procedimiento', telemedicina: 'Telemedicina' }
const ESTADOS: Record<string, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  'en-sala': 'En sala',
  'en-consulta': 'En consulta',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
  'no-asistio': 'No asistió',
}
const diaLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const compacto = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 })
const mesCorto = (ym: string) => new Date(ym + '-15T12:00:00').toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })

const ejes = {
  tick: { fill: 'var(--color-muted)', fontSize: 11 },
  axisLine: { stroke: 'var(--color-line)' },
  tickLine: false,
} as const
const tooltip = {
  contentStyle: { background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12, color: 'var(--color-ink)' },
  labelStyle: { color: 'var(--color-ink)', fontWeight: 600 },
  itemStyle: { color: 'var(--color-ink)' },
  cursor: { fill: 'var(--color-surface-2)' },
}

/** Tarjeta de gráfica con alternancia a vista de tabla (accesibilidad). */
function ChartCard<T extends Record<string, unknown>>({
  title,
  rows,
  cols,
  height = 260,
  children,
  className,
}: {
  title: string
  rows: T[]
  cols: { key: keyof T & string; label: string; fmt?: (v: number) => string }[]
  height?: number
  children: ReactNode
  className?: string
}) {
  const [tabla, setTabla] = useState(false)
  return (
    <Card
      title={title}
      className={className}
      actions={
        <Button size="sm" variant="ghost" onClick={() => setTabla((t) => !t)} aria-label={tabla ? 'Ver gráfica' : 'Ver tabla'} title={tabla ? 'Ver gráfica' : 'Ver tabla'}>
          {tabla ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <Empty>Sin datos en el periodo</Empty>
      ) : tabla ? (
        <div className="overflow-auto" style={{ maxHeight: height }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr>
                {cols.map((c, i) => (
                  <th key={c.key} className={i ? 'py-1.5 text-right' : 'py-1.5'}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c, j) => (
                    <td key={c.key} className={j ? 'py-1.5 text-right tabular-nums' : 'py-1.5'}>
                      {typeof r[c.key] === 'number' ? (c.fmt ?? String)(r[c.key] as number) : String(r[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children as ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/** Barras horizontales de una sola serie (rankings). */
function Ranking({ data, color, fmt, ancho = 130 }: { data: { nombre: string; valor: number }[]; color: string; fmt?: (v: number) => string; ancho?: number }) {
  return (
    <BarChart data={data} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }} barCategoryGap={6}>
      <CartesianGrid horizontal={false} stroke="var(--color-line)" strokeDasharray="3 3" />
      <XAxis type="number" {...ejes} tickFormatter={fmt ? (v) => fmt(v) : undefined} allowDecimals={false} />
      <YAxis type="category" dataKey="nombre" {...ejes} width={ancho} tick={{ ...ejes.tick, width: ancho }} interval={0} />
      <Tooltip {...tooltip} formatter={(v) => [fmt ? fmt(Number(v)) : String(v), 'Total']} />
      <Bar dataKey="valor" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: 'right', fill: 'var(--color-muted)', fontSize: 11, formatter: (v: unknown) => (fmt ? fmt(Number(v)) : String(v)) }} />
    </BarChart>
  )
}

export default function Reportes() {
  const s = useSettings()
  const C = s.tema === 'oscuro' ? PAL.oscuro : PAL.claro
  const pagos = useCollection('payments')
  const citas = useCollection('appointments')
  const notas = useCollection('encounters')
  const pacientes = useCollection('patients')

  const [desde, setDesde] = useState(() => diaLocal(new Date(Date.now() - 180 * 86400000)))
  const [hasta, setHasta] = useState(() => diaLocal(new Date()))
  const enRango = (iso: string) => {
    const d = diaLocal(new Date(iso))
    return (!desde || d >= desde) && (!hasta || d <= hasta)
  }
  const preset = (dias: number | null) => {
    setHasta(diaLocal(new Date()))
    setDesde(dias ? diaLocal(new Date(Date.now() - dias * 86400000)) : '')
  }

  const r = useMemo(() => {
    const P = pagos.filter((p) => enRango(p.fecha))
    const A = citas.filter((a) => enRango(a.inicio))
    const E = notas.filter((e) => enRango(e.fecha))

    // Ingresos por mes apilados por método
    const meses = new Map<string, Record<string, number | string>>()
    for (const p of P) {
      const k = diaLocal(new Date(p.fecha)).slice(0, 7)
      const row = meses.get(k) ?? { mes: k, efectivo: 0, tarjeta: 0, transferencia: 0 }
      row[p.metodo] = (row[p.metodo] as number) + p.monto
      meses.set(k, row)
    }
    const porMes = [...meses.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes))).map((x) => ({ ...x, etiqueta: mesCorto(String(x.mes)) }))
    const porMetodo = METODOS.map(([k, l]) => ({ nombre: l, valor: P.filter((p) => p.metodo === k).reduce((s, p) => s + p.monto, 0) }))

    const contar = <T,>(arr: T[], key: (x: T) => string) => {
      const m = new Map<string, number>()
      arr.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1))
      return [...m.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor)
    }
    const porTipo = contar(A, (a) => TIPOS[a.tipo] ?? a.tipo)
    const porEstado = contar(A, (a) => ESTADOS[a.estado] ?? a.estado)
    // Inasistencia: sobre citas cuya fecha ya pasó y no fueron canceladas
    const pasadas = A.filter((a) => new Date(a.inicio).getTime() < Date.now() && a.estado !== 'cancelada')
    const noAsistio = pasadas.filter((a) => a.estado === 'no-asistio').length
    const atendidas = A.filter((a) => a.estado === 'atendida').length

    const dx = contar(
      E.flatMap((e) => e.diagnosticos),
      (d) => `${d.codigo} ${d.nombre}`,
    ).slice(0, 8)

    const conceptos = new Map<string, number>()
    P.forEach((p) => conceptos.set(p.concepto, (conceptos.get(p.concepto) ?? 0) + p.monto))
    const topConceptos = [...conceptos.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8)

    const grupos = ['0–11', '12–17', '18–39', '40–59', '60+']
    const edades = grupos.map((g) => ({ grupo: g, Femenino: 0, Masculino: 0, Otro: 0 }))
    for (const p of pacientes) {
      const a = edad(p.fechaNac).anios
      const i = a < 12 ? 0 : a < 18 ? 1 : a < 40 ? 2 : a < 60 ? 3 : 4
      edades[i][p.sexo === 'F' ? 'Femenino' : p.sexo === 'M' ? 'Masculino' : 'Otro']++
    }
    const total = P.reduce((s, p) => s + p.monto, 0)
    return { P, porMes, porMetodo, porTipo, porEstado, pasadas: pasadas.length, noAsistio, atendidas, dx, topConceptos, edades, total, citas: A.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagos, citas, notas, pacientes, desde, hasta])

  const tasa = r.pasadas ? (r.noAsistio / r.pasadas) * 100 : 0
  const hayOtro = r.edades.some((e) => e.Otro > 0)

  return (
    <Page title="Reportes" subtitle="Indicadores del consultorio">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Desde">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['30 días', 30],
              ['90 días', 90],
              ['12 meses', 365],
              ['Todo', null],
            ] as const
          ).map(([l, d]) => (
            <Button key={l} size="sm" variant="ghost" onClick={() => preset(d)}>
              {l}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ingresos" value={mxn.format(r.total)} sub={`${r.P.length} cobros`} />
        <Stat label="Ticket promedio" value={mxn.format(r.P.length ? r.total / r.P.length : 0)} />
        <Stat label="Citas atendidas" value={r.atendidas} sub={`${r.citas} citas en el periodo`} />
        <Stat
          label="Tasa de inasistencia"
          value={`${tasa.toFixed(1)}%`}
          sub={`${r.noAsistio} de ${r.pasadas} citas pasadas`}
          tone={tasa > 15 ? 'danger' : tasa > 8 ? 'warn' : 'ok'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Ingresos por mes y método de pago"
          rows={r.porMes as { etiqueta: string; efectivo: number; tarjeta: number; transferencia: number }[]}
          cols={[{ key: 'etiqueta', label: 'Mes' }, ...METODOS.map(([k, l]) => ({ key: k, label: l, fmt: (v: number) => mxn.format(v) }))]}
          height={280}
        >
          <BarChart data={r.porMes} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis dataKey="etiqueta" {...ejes} />
            <YAxis {...ejes} tickFormatter={(v) => '$' + compacto.format(v)} width={48} />
            <Tooltip {...tooltip} formatter={(v, n) => [mxn.format(Number(v)), String(n)]} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }} iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: 'var(--color-ink)' }}>{v}</span>} />
            {METODOS.map(([k, l], i) => (
              <Bar key={k} dataKey={k} name={l} stackId="m" fill={C[i]} stroke="var(--color-surface)" strokeWidth={1} maxBarSize={44} radius={i === 2 ? [4, 4, 0, 0] : 0} />
            ))}
          </BarChart>
        </ChartCard>

        <ChartCard title="Ingresos por método" rows={r.porMetodo} cols={[{ key: 'nombre', label: 'Método' }, { key: 'valor', label: 'Total', fmt: (v) => mxn.format(v) }]} height={280}>
          <BarChart data={r.porMetodo} margin={{ left: 0, right: 8, top: 20 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis dataKey="nombre" {...ejes} />
            <YAxis {...ejes} tickFormatter={(v) => '$' + compacto.format(v)} width={48} />
            <Tooltip {...tooltip} formatter={(v) => [mxn.format(Number(v)), 'Total']} />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={56} label={{ position: 'top', fill: 'var(--color-muted)', fontSize: 11, formatter: (v: unknown) => '$' + compacto.format(Number(v)) }}>
              {/* color por entidad: mismo método, mismo color que en la gráfica mensual */}
              {r.porMetodo.map((_, i) => (
                <CellColor key={i} fill={C[i]} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Consultas por tipo" rows={r.porTipo} cols={[{ key: 'nombre', label: 'Tipo' }, { key: 'valor', label: 'Citas' }]} height={220}>
          <Ranking data={r.porTipo} color={C[0]} ancho={100} />
        </ChartCard>

        <ChartCard title="Citas por estado" rows={r.porEstado} cols={[{ key: 'nombre', label: 'Estado' }, { key: 'valor', label: 'Citas' }]} height={220}>
          <Ranking data={r.porEstado} color={C[0]} ancho={90} />
        </ChartCard>

        <ChartCard title="Pacientes por edad y sexo" rows={r.edades} cols={[{ key: 'grupo', label: 'Edad' }, { key: 'Femenino', label: 'F' }, { key: 'Masculino', label: 'M' }, ...(hayOtro ? [{ key: 'Otro' as const, label: 'Otro' }] : [])]} height={220}>
          <BarChart data={r.edades} margin={{ left: -16, right: 8, top: 8 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis dataKey="grupo" {...ejes} />
            <YAxis {...ejes} allowDecimals={false} />
            <Tooltip {...tooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: 'var(--color-ink)' }}>{v}</span>} />
            <Bar dataKey="Femenino" fill={C[4]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Masculino" fill={C[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            {hayOtro && <Bar dataKey="Otro" fill={C[3]} radius={[4, 4, 0, 0]} maxBarSize={22} />}
          </BarChart>
        </ChartCard>

        <ChartCard className="lg:col-span-2" title="Diagnósticos más frecuentes (CIE-10)" rows={r.dx} cols={[{ key: 'nombre', label: 'Diagnóstico' }, { key: 'valor', label: 'Notas' }]} height={Math.max(160, r.dx.length * 34 + 20)}>
          <Ranking data={r.dx.map((d) => ({ ...d, nombre: d.nombre.length > 42 ? d.nombre.slice(0, 40) + '…' : d.nombre }))} color={C[2]} ancho={230} />
        </ChartCard>

        <ChartCard title="Top conceptos por ingreso" rows={r.topConceptos} cols={[{ key: 'nombre', label: 'Concepto' }, { key: 'valor', label: 'Ingreso', fmt: (v) => mxn.format(v) }]} height={Math.max(160, r.topConceptos.length * 34 + 20)}>
          <Ranking data={r.topConceptos} color={C[1]} fmt={(v) => '$' + compacto.format(v)} ancho={120} />
        </ChartCard>
      </div>
      <p className="mt-4 text-xs text-muted">
        La tasa de inasistencia se calcula sobre citas ya pasadas no canceladas. Los diagnósticos provienen de las notas clínicas del periodo; la distribución por edad y sexo
        incluye a todos los pacientes registrados.
      </p>
    </Page>
  )
}
