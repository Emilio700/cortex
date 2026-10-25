import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Save, FileDown, Shuffle, Syringe, Trophy } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { Card, Button, Field, Select, Badge, Notice, Empty, PatientBar } from '../../components/ui'
import { add, uid, useActivePatient } from '../../lib/store'
import { cx, nombreCompleto } from '../../lib/utils'
import { buildModel, SEG, SEGMENTS, SYNTAX_W, type Artery, type Dominance, type Model, type Stenosis } from './anatomy'
import { CARM_PRESETS } from './data'
import { Viewer3D, FluoroView, angLabel } from './viewers'
import type { Heart3D, Fluoro } from './views'
import { ARTERY_NAME, CarmControls, PresetSelect, Range, Seg, SegList, type Carm } from './tabs'

const grade = (p: number) => (p >= 100 ? 'Oclusión total' : p >= 70 ? 'Severa' : p >= 50 ? 'Moderada' : 'Leve')
const tone = (p: number) => (p >= 70 ? 'danger' : p >= 50 ? 'warn' : 'neutral') as 'danger' | 'warn' | 'neutral'
const order = (id: string) => SEGMENTS.findIndex((s) => s.id === id)

export function summarize(st: Stenosis[], dom: Dominance, available: string[]) {
  const rows = st.filter((s) => available.includes(s.seg)).sort((a, b) => order(a.seg) - order(b.seg))
  const lm = rows.some((s) => s.seg === '5' && s.pct >= 50)
  const vessels = (['DA', 'Cx', 'CD'] as Artery[]).filter((a) => rows.some((s) => SEG[s.seg].artery === a && s.pct >= 70))
  const score = rows.filter((s) => s.pct >= 50).reduce((acc, s) => acc + (SYNTAX_W[dom][s.seg] ?? 0) * (s.pct >= 100 ? 5 : 2), 0)
  const texto = !vessels.length && !lm ? 'Sin enfermedad coronaria significativa' : [vessels.length ? `Enfermedad de ${vessels.length} vaso${vessels.length > 1 ? 's' : ''} (${vessels.join(', ')})` : '', lm ? 'enfermedad de tronco (TCI ≥ 50 %)' : ''].filter(Boolean).join(' + ')
  return { rows, lm, vessels, score, texto }
}

function composite(a: string, b: string): Promise<string> {
  return new Promise((res) => {
    const ia = new Image(), ib = new Image()
    let n = 0
    const done = () => {
      if (++n < 2) return
      const h = 600, wa = (ia.width / ia.height) * h, wb = (ib.width / ib.height) * h
      const c = document.createElement('canvas')
      c.width = wa + wb
      c.height = h
      const g = c.getContext('2d')!
      g.fillStyle = '#0b1120'
      g.fillRect(0, 0, c.width, h)
      g.drawImage(ia, 0, 0, wa, h)
      g.drawImage(ib, wa, 0, wb, h)
      res(c.toDataURL('image/png'))
    }
    ia.onload = ib.onload = done
    ia.src = a
    ib.src = b
  })
}

export function TabEstenosis(p: { model: Model; dom: Dominance; ramus: boolean; stenoses: Stenosis[]; setStenoses: (s: Stenosis[]) => void; carm: Carm; setCarm: (c: Carm) => void }) {
  const [mode, setMode] = useState<'editor' | 'juego'>('editor')
  return (
    <div>
      <div className="mb-3">
        <Seg value={mode} onChange={setMode} options={[{ id: 'editor', label: 'Editor y reporte' }, { id: 'juego', label: 'Modo entrenamiento' }]} />
      </div>
      {mode === 'editor' ? <Editor {...p} /> : <Juego dom={p.dom} ramus={p.ramus} available={p.model.available} />}
    </div>
  )
}

function Editor(p: { model: Model; dom: Dominance; stenoses: Stenosis[]; setStenoses: (s: Stenosis[]) => void; carm: Carm; setCarm: (c: Carm) => void }) {
  const [seg, setSeg] = useState('6')
  const [pct, setPct] = useState(75)
  const [len, setLen] = useState(10)
  const [pos, setPos] = useState(0.5)
  const [inj, setInj] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const h3 = useRef<Heart3D | null>(null), fl = useRef<Fluoro | null>(null)
  const { id: pid, patient } = useActivePatient()
  const sum = summarize(p.stenoses, p.dom, p.model.available)

  const addSt = () => p.setStenoses([...p.stenoses.filter((s) => s.seg !== seg), { id: uid('st'), seg, pct, len, pos }])
  const shots = () => ({ img3d: h3.current?.snapshot() ?? '', fluoro: fl.current?.snapshot() ?? '' })
  const reportJson = () => ({
    modulo: 'cardio3d', simulacion: true, dominancia: p.dom === 'R' ? 'derecha' : 'izquierda', proyeccion: angLabel(p.carm.lao, p.carm.cra),
    estenosis: sum.rows.map((s) => ({ segmento: SEG[s.seg].num, id: s.seg, nombre: SEG[s.seg].name, porcentaje: s.pct, longitudMm: s.len, grado: grade(s.pct) })),
    resumen: sum.texto, tronco: sum.lm, vasos: sum.vessels, puntajeAnatomicoSimplificado: sum.score,
  })

  const save = async () => {
    if (!pid) return
    const s = shots()
    const img = await composite(s.img3d, s.fluoro)
    add('documents', { patientId: pid, tipo: 'estudio', nombre: `Angiografía coronaria simulada (Cardio 3D) – ${sum.texto}`, mime: 'image/png', dataUrl: img, meta: { reporte: reportJson(), fluoroPng: s.fluoro } })
    setMsg('Estudio guardado en el expediente del paciente.')
  }
  const pdf = () => {
    const s = shots(), doc = new jsPDF({ unit: 'mm', format: 'a4' })
    let y = 16
    doc.setFontSize(15).text('Angiografía coronaria simulada – Cardio 3D', 14, y)
    doc.setFontSize(9).setTextColor(120).text('SIMULACIÓN EDUCATIVA · No es un estudio diagnóstico', 14, (y += 6))
    doc.setTextColor(0).setFontSize(10)
    doc.text(`Paciente: ${patient ? nombreCompleto(patient) : '—'}    Fecha: ${new Date().toLocaleDateString('es-MX')}`, 14, (y += 7))
    doc.text(`Dominancia: ${p.dom === 'R' ? 'derecha' : 'izquierda'}    Proyección: ${angLabel(p.carm.lao, p.carm.cra)}`, 14, (y += 5))
    doc.setFillColor(11, 17, 32).rect(14, (y += 4), 88, 88, 'F')
    if (s.img3d) doc.addImage(s.img3d, 'PNG', 14, y, 88, 88)
    if (s.fluoro) doc.addImage(s.fluoro, 'PNG', 108, y, 88, 88)
    y += 96
    doc.setFontSize(11).text('Lesiones', 14, y)
    doc.setFontSize(9)
    y += 6
    doc.text('Seg.', 14, y); doc.text('Nombre', 28, y); doc.text('% estenosis', 120, y); doc.text('Long. (mm)', 145, y); doc.text('Grado', 170, y)
    if (!sum.rows.length) doc.text('Sin lesiones registradas', 28, (y += 5))
    sum.rows.forEach((r) => {
      y += 5
      doc.text(SEG[r.seg].num, 14, y); doc.text(SEG[r.seg].name.slice(0, 50), 28, y); doc.text(`${r.pct} %`, 120, y); doc.text(String(r.len), 145, y); doc.text(grade(r.pct), 170, y)
    })
    y += 9
    doc.setFontSize(11).text(`Resumen: ${sum.texto}`, 14, y, { maxWidth: 180 })
    doc.setFontSize(9).text(`Puntaje anatómico simplificado (peso SYNTAX × 2 / × 5 por oclusión, sin características adversas): ${sum.score}`, 14, (y += 7), { maxWidth: 180 })
    doc.setTextColor(120).text('Generado por MediSuite · Herramienta educativa de simulación; no sustituye la coronariografía ni el juicio clínico.', 14, 287)
    doc.save(`angiografia-simulada-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <div className="space-y-4">
      <PatientBar />
      {msg && <Notice onClose={() => setMsg(null)}>{msg}</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        <Viewer3D model={p.model} highlight={[seg]} onPick={(id) => id && setSeg(id)} labels inst={h3} className="aspect-square w-full" />
        <FluoroView model={p.model} lao={p.carm.lao} cra={p.carm.cra} sys={p.carm.sys} injectKey={inj} inst={fl} className="aspect-square w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Colocar estenosis">
          <div className="space-y-3">
            <Field label="Segmento (también puedes tocarlo en el modelo 3D)">
              <Select value={seg} onChange={(e) => setSeg(e.target.value)}>
                {SEGMENTS.filter((s) => p.model.available.includes(s.id)).map((s) => (
                  <option key={s.id} value={s.id}>{s.num === '—' ? '' : s.num + ' · '}{s.name}</option>
                ))}
              </Select>
            </Field>
            <Range label="Estenosis" value={pct} min={0} max={100} onChange={setPct} fmt={(v) => `${v} % (${grade(v).toLowerCase()})`} />
            <Range label="Longitud" value={len} min={3} max={30} onChange={setLen} fmt={(v) => `${v} mm`} />
            <Range label="Posición en el segmento" value={pos} min={0.1} max={0.9} step={0.05} onChange={setPos} fmt={(v) => `${Math.round(v * 100)} %`} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={addSt}><Plus className="size-4" /> Agregar / reemplazar</Button>
              {p.stenoses.length > 0 && <Button variant="ghost" onClick={() => p.setStenoses([])}>Limpiar todo</Button>}
            </div>
          </div>
        </Card>
        <Card title="Proyección">
          <div className="space-y-3">
            <PresetSelect carm={p.carm} setCarm={(c) => (p.setCarm(c), setInj((k) => k + 1))} />
            <CarmControls carm={p.carm} setCarm={p.setCarm} onInject={() => setInj((k) => k + 1)} />
          </div>
        </Card>
      </div>
      <Card
        title="Reporte por segmento"
        actions={
          <>
            <Button size="sm" onClick={pdf}><FileDown className="size-4" /> PDF</Button>
            <Button size="sm" variant="primary" onClick={save} disabled={!pid}><Save className="size-4" /> Guardar en expediente</Button>
          </>
        }
      >
        {sum.rows.length === 0 ? (
          <Empty>Sin lesiones. Elige un segmento y agrega una estenosis.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-1 pr-2">Seg.</th><th className="pr-2">Nombre</th><th className="pr-2">%</th><th className="pr-2">mm</th><th className="pr-2">Grado</th><th /></tr>
              </thead>
              <tbody>
                {sum.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-1.5 pr-2 font-medium">{SEG[r.seg].num}</td>
                    <td className="pr-2">{SEG[r.seg].name}</td>
                    <td className="pr-2 tabular-nums">{r.pct}</td>
                    <td className="pr-2 tabular-nums">{r.len}</td>
                    <td className="pr-2"><Badge tone={tone(r.pct)}>{grade(r.pct)}</Badge></td>
                    <td className="text-right"><Button size="sm" variant="ghost" aria-label="Eliminar" onClick={() => p.setStenoses(p.stenoses.filter((s) => s.id !== r.id))}><Trash2 className="size-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-surface-2 p-3 sm:col-span-2">
            <div className="text-xs text-muted">Resumen tipo SYNTAX</div>
            <div className={cx('font-semibold', (sum.vessels.length > 0 || sum.lm) && 'text-danger')}>{sum.texto}</div>
            <div className="mt-1 text-xs text-muted">Vaso significativo: ≥ 70 % (≥ 50 % en TCI). Incluye ramas de cada arteria.</div>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs text-muted">Puntaje anatómico simplificado</div>
            <div className="text-2xl font-semibold tabular-nums">{sum.score}</div>
            <div className="text-[11px] text-muted">Peso SYNTAX del segmento × 2 (× 5 si oclusión); sin características adversas. No es el SYNTAX score completo.</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

interface Case { st: Stenosis; lao: number; cra: number; name: string }
function Juego({ dom, ramus, available }: { dom: Dominance; ramus: boolean; available: string[] }) {
  const pool = available.filter((s) => SEG[s].num !== '—')
  const mk = (): Case => {
    const seg = pool[Math.floor(Math.random() * pool.length)]
    const sys = SEG[seg].sys
    const good = CARM_PRESETS.filter((x) => x.sys === sys && x.best.includes(seg))
    const any = CARM_PRESETS.filter((x) => x.sys === sys || sys === 'L')
    const pr = Math.random() < 0.65 && good.length ? good[Math.floor(Math.random() * good.length)] : any[Math.floor(Math.random() * any.length)]
    return { st: { id: 'g', seg, pct: Math.random() < 0.2 ? 100 : 70 + Math.floor(Math.random() * 25), len: 6 + Math.floor(Math.random() * 10), pos: 0.3 + Math.random() * 0.4 }, lao: pr.lao, cra: pr.cra, name: pr.name }
  }
  const [c, setC] = useState<Case>(mk)
  const [inj, setInj] = useState(1)
  const [ans, setAns] = useState<string | null>(null)
  const [score, setScore] = useState({ pts: 0, ok: 0, n: 0 })
  const model = useMemo(() => buildModel({ dominance: dom, ramus, stenoses: [c.st] }), [dom, ramus, c])
  useEffect(() => () => model.dispose(), [model])
  const next = () => (setC(mk()), setAns(null), setInj((k) => k + 1))
  const answer = (id: string) => {
    if (ans) return
    setAns(id)
    const exact = id === c.st.seg, same = SEG[id].artery === SEG[c.st.seg].artery
    setScore((s) => ({ pts: s.pts + (exact ? 10 : same ? 3 : 0), ok: s.ok + (exact ? 1 : 0), n: s.n + 1 }))
  }
  const truth = SEG[c.st.seg]
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <FluoroView model={model} lao={c.lao} cra={c.cra} sys={truth.sys} injectKey={inj} className="aspect-square w-full max-w-[640px]" />
        {ans && <Viewer3D model={model} highlight={[c.st.seg]} labels className="aspect-[4/3] w-full max-w-[640px]" />}
      </div>
      <div className="space-y-4">
        <Card title={<span className="flex items-center gap-2"><Trophy className="size-4" /> Puntaje: {score.pts}</span>} actions={<Badge tone="brand">{score.ok}/{score.n} exactos</Badge>}>
          <p className="text-sm text-muted">Se colocó una lesión oculta. Observa la fluoroscopía ({c.name}) y elige el segmento afectado. Exacto = 10 pts; misma arteria = 3 pts.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setInj((k) => k + 1)}><Syringe className="size-4" /> Repetir inyección</Button>
            <Button size="sm" variant="primary" onClick={next}><Shuffle className="size-4" /> Nuevo caso</Button>
          </div>
        </Card>
        <Card title="¿Qué segmento tiene la lesión?">
          <SegList model={{ ...model, available: pool.filter((s) => SEG[s].sys === truth.sys) }} sel={ans} onSel={answer} />
          {ans && (
            <Notice tone={ans === c.st.seg ? 'info' : 'warn'}>
              {ans === c.st.seg ? '¡Correcto! ' : `Respuesta: segmento ${truth.num}. `}
              {truth.name} · {ARTERY_NAME[truth.artery]} · estenosis {c.st.pct} %.
            </Notice>
          )}
        </Card>
      </div>
    </div>
  )
}
