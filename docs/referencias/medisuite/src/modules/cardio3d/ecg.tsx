import { useState } from 'react'
import { Card, Notice, Select, Field, Badge } from '../../components/ui'
import { cx } from '../../lib/utils'
import type { Artery, Dominance } from './anatomy'
import { BULL, INFARCTS, LEADS, LEAD_INFO, TERR_COLOR, ecgAt, leadsForArtery, territory, type Lead, type Phase, type Terr } from './data'
import { ARTERY_NAME, Seg } from './tabs'

function sector(cx0: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${(cx0 + r * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(cy + r * Math.sin((a * Math.PI) / 180)).toFixed(2)}`
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}Z`
}

function BullsEye({ dom, active, infarct, onSeg }: { dom: Dominance; active: Artery | null; infarct: number[] | null; onSeg: (s: number) => void }) {
  // Orientación AHA: anterior arriba, septum a la izquierda, lateral a la derecha, inferior abajo.
  const cells: { n: number; d: string; c: [number, number] }[] = []
  const add = (n: number, r0: number, r1: number, mid: number, span: number) => {
    const a0 = mid - span / 2, a1 = mid + span / 2, rm = (r0 + r1) / 2, am = (mid * Math.PI) / 180
    cells.push({ n, d: sector(100, 100, r0, r1, a0, a1), c: [100 + rm * Math.cos(am), 100 + rm * Math.sin(am)] })
  }
  for (let k = 0; k < 6; k++) add(k + 1, 70, 96, -90 - 60 * k, 60)
  for (let k = 0; k < 6; k++) add(k + 7, 44, 70, -90 - 60 * k, 60)
  for (let k = 0; k < 4; k++) add(k + 13, 19, 44, -90 - 90 * k, 90)
  const terrOf = (n: number): Terr => territory(n, dom)
  const lit = (n: number) => (infarct ? infarct.includes(n) : !active ? true : active === 'TCI' ? terrOf(n) !== 'CD' : terrOf(n) === active)
  return (
    <svg viewBox="-30 -14 260 228" className="mx-auto w-full max-w-[340px]" role="img" aria-label="Diagrama de 17 segmentos">
      {cells.map((c) => (
        <g key={c.n} onClick={() => onSeg(c.n)} className="cursor-pointer">
          <path d={c.d} fill={infarct && lit(c.n) ? '#7f1d1d' : TERR_COLOR[terrOf(c.n)]} opacity={lit(c.n) ? 0.9 : 0.18} stroke="white" strokeWidth={1.2}>
            <title>{`${c.n}. ${BULL[c.n - 1]} – ${terrOf(c.n)}`}</title>
          </path>
          <text x={c.c[0]} y={c.c[1] + 3.5} textAnchor="middle" fontSize={10} fill="white" fontWeight={600} pointerEvents="none">{c.n}</text>
        </g>
      ))}
      <g onClick={() => onSeg(17)} className="cursor-pointer">
        <circle cx={100} cy={100} r={19} fill={infarct && lit(17) ? '#7f1d1d' : TERR_COLOR[terrOf(17)]} opacity={lit(17) ? 0.9 : 0.18} stroke="white" strokeWidth={1.2}><title>17. Ápex – DA</title></circle>
        <text x={100} y={103.5} textAnchor="middle" fontSize={10} fill="white" fontWeight={600} pointerEvents="none">17</text>
      </g>
      <g fontSize={8} fill="currentColor" className="text-muted" textAnchor="middle">
        <text x={100} y={-4}>Anterior</text><text x={100} y={210}>Inferior</text>
        <text x={-28} y={103} textAnchor="start">Septal</text><text x={228} y={103} textAnchor="end">Lateral</text>
      </g>
    </svg>
  )
}

function ECG12({ st, phase, hr }: { st: Partial<Record<Lead, number>>; phase: Phase; hr: number }) {
  // 25 mm/s, 10 mm/mV; cada celda 2.5 s (62.5 mm), 3 filas + tira de ritmo DII
  const rr = 60 / hr, layout: Lead[][] = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']]
  const trace = (lead: Lead, x0: number, y0: number, dur: number, t0: number) => {
    const pts: string[] = []
    for (let t = 0; t <= dur; t += 0.004) {
      const tt = (t + t0) % rr
      pts.push(`${(x0 + t * 25).toFixed(2)},${(y0 - ecgAt(tt, lead, st[lead] ?? 0, phase, rr) * 10).toFixed(2)}`)
    }
    return pts.join(' ')
  }
  return (
    <svg viewBox="0 0 250 128" className="w-full rounded-md bg-[#fff7f7]" role="img" aria-label="ECG de 12 derivaciones simulado">
      <defs>
        <pattern id="c3d-g1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#f6c6c6" strokeWidth={0.08} /></pattern>
        <pattern id="c3d-g5" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#c3d-g1)" /><path d="M5 0H0V5" fill="none" stroke="#ec9a9a" strokeWidth={0.2} /></pattern>
      </defs>
      <rect width="250" height="128" fill="url(#c3d-g5)" />
      {layout.map((row, r) =>
        row.map((lead, c) => {
          const s = st[lead] ?? 0
          return (
            <g key={lead}>
              <polyline points={trace(lead, c * 62.5, 18 + r * 28, 2.5, c * 2.5)} fill="none" stroke="#111" strokeWidth={0.35} strokeLinejoin="round" />
              <text x={c * 62.5 + 1.5} y={8 + r * 28} fontSize={4} fontWeight={700} fill={s > 0.04 ? '#dc2626' : s < -0.04 ? '#2563eb' : '#111'}>{lead}{s > 0.04 ? ' ↑' : s < -0.04 ? ' ↓' : ''}</text>
            </g>
          )
        }),
      )}
      <polyline points={trace('II', 0, 112, 10, 0)} fill="none" stroke="#111" strokeWidth={0.35} />
      <text x={1.5} y={102} fontSize={4} fontWeight={700}>II</text>
    </svg>
  )
}

export function TabECG({ dom, setDom, hr }: { dom: Dominance; setDom: (d: Dominance) => void; hr: number }) {
  const [art, setArt] = useState<Artery | null>(null)
  const [inf, setInf] = useState('')
  const [phase, setPhase] = useState<Phase>('aguda')
  const scen = INFARCTS.find((x) => x.id === inf)
  const leads = scen ? (Object.keys(scen.up) as Lead[]) : art ? leadsForArtery(art, dom) : []
  const st: Partial<Record<Lead, number>> = {}
  if (scen) {
    LEADS.forEach((l) => (st[l] = (scen.up[l] ?? 0) - (scen.down[l] ?? 0)))
  }
  return (
    <div className="space-y-4">
      <Notice tone="warn">Contenido educativo: patrones típicos simplificados. Un ECG real depende de la anatomía individual, el tiempo de evolución y otros factores; no usar para diagnóstico.</Notice>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card title="Territorios coronarios (17 segmentos AHA)">
          <BullsEye dom={dom} active={art} infarct={scen?.bull ?? null} onSeg={(n) => (setInf(''), setArt(territory(n, dom) as Artery))} />
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {(['DA', 'Cx', 'CD', 'TCI'] as Artery[]).map((a) => (
              <button key={a} onClick={() => (setInf(''), setArt(art === a ? null : a))} className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', art === a && !scen ? 'border-transparent text-white' : 'border-line')} style={art === a && !scen ? { background: a === 'TCI' ? '#7c3aed' : TERR_COLOR[a as Terr] } : undefined}>
                {a === 'TCI' ? 'TCI' : a}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-center">
            <Seg value={dom} onChange={setDom} options={[{ id: 'R', label: 'Dom. derecha' }, { id: 'L', label: 'Dom. izquierda' }]} />
          </div>
          <p className="mt-2 text-center text-xs text-muted">{art && !scen ? ARTERY_NAME[art] : 'Toca una arteria o un segmento'}</p>
        </Card>
        <Card title="Derivación → territorio">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1 pr-2">Derivaciones</th><th className="pr-2">Pared</th><th>Arteria habitual</th></tr></thead>
              <tbody>
                {LEAD_INFO.map((r) => {
                  const on = r.leads.some((l) => leads.includes(l))
                  return (
                    <tr key={r.pared} className={cx('border-t border-line', on && 'bg-brand-soft/60')}>
                      <td className="py-1.5 pr-2 font-medium">{r.leads.join(', ')}</td>
                      <td className="pr-2">{r.pared}</td>
                      <td className="text-muted">{r.arteria(dom)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Simular infarto (oclusión aguda)">
              <Select value={inf} onChange={(e) => setInf(e.target.value)}>
                <option value="">— Ninguno (ECG normal) —</option>
                {INFARCTS.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}{x.dom === 'L' ? ' *' : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Fase">
              <Select value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
                <option value="hiper">Hiperaguda (T altas)</option>
                <option value="aguda">Aguda (elevación del ST)</option>
                <option value="evol">Evolucionada (Q patológica, T invertida)</option>
              </Select>
            </Field>
          </div>
          {scen && (
            <div className="mt-3 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {LEADS.filter((l) => scen.up[l]).map((l) => <Badge key={l} tone="danger">{l} ST↑</Badge>)}
                {LEADS.filter((l) => scen.down[l]).map((l) => <Badge key={l} tone="brand">{l} ST↓</Badge>)}
              </div>
              <p className="mt-2 text-muted">{scen.nota}{scen.dom === 'L' && dom === 'R' ? ' (* escenario de dominancia izquierda)' : ''}</p>
            </div>
          )}
        </Card>
      </div>
      <Card title={`ECG de 12 derivaciones esquemático · ${hr} lpm · 25 mm/s · 10 mm/mV`}>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <ECG12 st={st} phase={phase} hr={hr} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Rojo: elevación del ST · Azul: depresión recíproca. Trazos generados con un modelo PQRST sintético por derivación (educativo).</p>
      </Card>
    </div>
  )
}
