import { useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, History, Plus, Printer, Save, Trash2 } from 'lucide-react'
import { Page, PatientBar, Card, Button, Input, Textarea, Badge, Empty, Notice } from '../../components/ui'
import { usePreferencia } from '../../lib/preferencias'
import { imprimirHTML } from '../../lib/imprimir'
import { useActivePatient, useCollection, useSettings, add } from '../../lib/store'
import { cx, fmtFecha, fmtFechaHora, mxn, nombreCompleto } from '../../lib/utils'
import type { DocumentFile } from '../../lib/types'
import {
  ARCADAS, COLOR_CARA, HERR_CARA, HERR_DIENTE, NOMBRE_CARA, PRECIOS_BASE, cpod, esSuperior, generarPlan, ladoDerechoPaciente, vacio,
  type Cara, type EstadoCara, type EstadoDiente, type Odo,
} from './modelo'
import { confirmar } from '../../components/dialogos'

type Herr = { tipo: 'cara'; id: EstadoCara } | { tipo: 'diente'; id: EstadoDiente } | { tipo: 'borrar' }
const S = 36, G = 5, MID = 16
const ANCHO = 16 * S + 15 * G + MID
const KEY_PRECIOS = 'medisuite.odontograma.precios'

// Polígonos de las 5 caras dentro de un cuadro S×S (arriba, abajo, izquierda, derecha, centro)
const a = 12, b = S - 12
const POLY = {
  top: `0,0 ${S},0 ${b},${a} ${a},${a}`,
  bottom: `0,${S} ${S},${S} ${b},${b} ${a},${b}`,
  left: `0,0 ${a},${a} ${a},${b} 0,${S}`,
  right: `${S},0 ${b},${a} ${b},${b} ${S},${S}`,
  center: `${a},${a} ${b},${a} ${b},${b} ${a},${b}`,
}
function caraDe(pos: keyof typeof POLY, n: number): Cara {
  if (pos === 'center') return 'O'
  if (pos === 'top') return esSuperior(n) ? 'V' : 'L'
  if (pos === 'bottom') return esSuperior(n) ? 'L' : 'V'
  const mesialDerecha = ladoDerechoPaciente(n)
  return (pos === 'right') === mesialDerecha ? 'M' : 'D'
}

function Diente({ n, o, onFace }: { n: number; o: Odo; onFace: (n: number, c: Cara) => void }) {
  const est = o.dientes[n] ?? []
  const col = (c: EstadoDiente) => HERR_DIENTE.find((h) => h.id === c)!.color
  return (
    <g>
      {(Object.keys(POLY) as (keyof typeof POLY)[]).map((pos) => {
        const c = caraDe(pos, n), e = o.caras[n]?.[c]
        return (
          <polygon key={pos} points={POLY[pos]} fill={e ? COLOR_CARA[e] : est.includes('ausente') ? '#f1f5f9' : '#ffffff'} stroke="#64748b" strokeWidth={1}
            className="cursor-pointer hover:opacity-70" onClick={() => onFace(n, c)}>
            <title>{`Diente ${n} · ${NOMBRE_CARA(c, n)}${e ? ' · ' + e : ''}`}</title>
          </polygon>
        )
      })}
      <g pointerEvents="none" fill="none" strokeLinecap="round">
        {(['ausente', 'extraccion'] as const).filter((x) => est.includes(x)).map((x) => (
          <path key={x} d={`M3,3 L${S - 3},${S - 3} M${S - 3},3 L3,${S - 3}`} stroke={col(x)} strokeWidth={3} />
        ))}
        {(['corona', 'corona-ind'] as const).filter((x) => est.includes(x)).map((x) => <circle key={x} cx={S / 2} cy={S / 2} r={S / 2 - 1.5} stroke={col(x)} strokeWidth={2.5} />)}
        {(['endodoncia', 'endo-ind'] as const).filter((x) => est.includes(x)).map((x) => <path key={x} d={`M${S / 2},2 L${S / 2},${S - 2}`} stroke={col(x)} strokeWidth={3} />)}
        {est.includes('fractura') && <polyline points={`4,10 14,16 10,22 22,26 18,32 32,34`} stroke={col('fractura')} strokeWidth={2.5} />}
        {est.includes('implante') && <text x={S / 2} y={S / 2 + 7} textAnchor="middle" fontSize={20} fontWeight={800} fill={col('implante')}>I</text>}
      </g>
    </g>
  )
}

function Odontograma({ o, onFace, svgRef }: { o: Odo; onFace: (n: number, c: Cara) => void; svgRef?: React.Ref<SVGSVGElement> }) {
  const filas: { dientes: number[]; arriba: boolean }[] = [
    { dientes: ARCADAS.supPerm, arriba: true },
    ...(o.temporal ? [{ dientes: ARCADAS.supTemp, arriba: true }, { dientes: ARCADAS.infTemp, arriba: false }] : []),
    { dientes: ARCADAS.infPerm, arriba: false },
  ]
  const H = S + 16, sep = 14
  const alto = filas.length * H + (filas.length - 1) * 6 + sep
  const nSup = filas.filter((f) => f.arriba).length
  const yFila = (i: number) => i * (H + 6) + (i >= nSup ? sep : 0)
  const corte = yFila(nSup) - sep / 2 - 3
  return (
    <svg ref={svgRef} viewBox={`-4 -4 ${ANCHO + 8} ${alto + 8}`} className="w-full select-none" xmlns="http://www.w3.org/2000/svg" fontFamily="Inter, system-ui, sans-serif">
      <line x1={ANCHO / 2} x2={ANCHO / 2} y1={0} y2={alto} stroke="#cbd5e1" strokeDasharray="3 3" />
      {filas.map((f, fi) => {
        const w = f.dientes.length * S + (f.dientes.length - 1) * G + MID, off = (ANCHO - w) / 2, y0 = yFila(fi)
        return (
          <g key={fi}>
            {f.dientes.map((n, i) => {
              const x = off + i * (S + G) + (i >= f.dientes.length / 2 ? MID : 0)
              return (
                <g key={n} transform={`translate(${x},${y0 + (f.arriba ? 15 : 0)})`}>
                  <text x={S / 2} y={f.arriba ? -4 : S + 12} textAnchor="middle" fontSize={11} fill="#64748b">{n}</text>
                  <Diente n={n} o={o} onFace={onFace} />
                </g>
              )
            })}
          </g>
        )
      })}
      <line x1={0} x2={ANCHO} y1={corte} y2={corte} stroke="#cbd5e1" strokeDasharray="3 3" />
    </svg>
  )
}

// Lista de precios de procedimientos dentales: preferencia `odontograma.precios` (scope org) en modo servidor
function usePrecios() {
  const base = useMemo(() => Object.fromEntries(Object.entries(PRECIOS_BASE).map(([k, v]) => [k, v.precio])), [])
  const [guardados, setGuardados] = usePreferencia<Record<string, number>>('odontograma.precios', 'org', {}, { lsKey: KEY_PRECIOS })
  const p = useMemo(() => ({ ...base, ...(guardados && typeof guardados === 'object' ? guardados : {}) }), [base, guardados])
  const set = (k: string, v: number) => setGuardados((prev) => ({ ...(prev ?? {}), [k]: v }))
  return [p, set] as const
}

export default function OdontogramaPage() {
  const { id: pid, patient } = useActivePatient()
  const settings = useSettings()
  const docs = useCollection('documents', (d) => d.patientId === pid && !!d.meta?.odontograma, [pid])
  const historial = useMemo(() => [...docs].sort((x, y) => y.fecha.localeCompare(x.fecha)), [docs])
  const [o, setO] = useState<Odo>(vacio)
  const [base, setBase] = useState<DocumentFile | null>(null)
  const [sucio, setSucio] = useState(false)
  const [herr, setHerr] = useState<Herr>({ tipo: 'cara', id: 'caries' })
  const [precios, setPrecio] = usePrecios()
  const [extra, setExtra] = useState({ concepto: '', precio: '' })
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const ult = historial[0] ?? null
    setO(ult ? { ...vacio(), ...(ult.meta!.odontograma as Odo) } : vacio())
    setBase(ult)
    setSucio(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid])

  const cambiar = (f: (x: Odo) => Odo) => {
    setO(f)
    setSucio(true)
  }
  function onFace(n: number, c: Cara) {
    cambiar((x) => {
      if (herr.tipo === 'borrar') {
        const caras = { ...x.caras }, dientes = { ...x.dientes }
        delete caras[n]
        delete dientes[n]
        return { ...x, caras, dientes }
      }
      if (herr.tipo === 'cara') {
        const actual = { ...(x.caras[n] ?? {}) }
        if (actual[c] === herr.id) delete actual[c]
        else actual[c] = herr.id
        return { ...x, caras: { ...x.caras, [n]: actual } }
      }
      const est = x.dientes[n] ?? []
      return { ...x, dientes: { ...x.dientes, [n]: est.includes(herr.id) ? est.filter((e) => e !== herr.id) : [...est, herr.id] } }
    })
  }

  const plan = generarPlan(o)
  const incluido = (k: string, def: boolean) => (def ? !o.excluidos.includes(k) : o.excluidos.includes('+' + k))
  const toggle = (k: string, def: boolean) =>
    cambiar((x) => {
      const key = def ? k : '+' + k
      return { ...x, excluidos: x.excluidos.includes(key) ? x.excluidos.filter((e) => e !== key) : [...x.excluidos, key] }
    })
  const total = plan.reduce((s, i) => s + (incluido(i.clave, i.incluidoPorDefecto) ? precios[i.tipo] ?? 0 : 0), 0) + o.extras.reduce((s, e) => s + e.precio, 0)
  const ind = cpod(o)

  function svgTexto() {
    const s = svgRef.current!.cloneNode(true) as SVGSVGElement
    s.removeAttribute('class')
    s.setAttribute('width', '760')
    return new XMLSerializer().serializeToString(s)
  }
  function guardar() {
    if (!pid) return
    const svg = svgTexto()
    const d = add('documents', {
      patientId: pid, tipo: 'otro', nombre: `Odontograma ${fmtFecha(new Date().toISOString())}`, mime: 'image/svg+xml',
      dataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), meta: { modulo: 'odontograma', odontograma: o, presupuesto: total, cpod: ind },
    })
    setBase(d)
    setSucio(false)
  }
  function imprimir() {
    if (!patient) return
    const filas = [
      ...plan.filter((i) => incluido(i.clave, i.incluidoPorDefecto)).map((i) => [String(i.diente), PRECIOS_BASE[i.tipo].label, i.detalle, precios[i.tipo] ?? 0] as const),
      ...o.extras.map((e) => ['—', e.concepto, '', e.precio] as const),
    ]
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    imprimirHTML(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto dental</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}th{background:#f3f4f6}.r{text-align:right}.muted{color:#666;font-size:12px}.tot{font-size:16px;font-weight:700}</style></head><body>
<h1>${esc(settings.clinica)}</h1><div class="muted">${esc(settings.doctor.nombre)} · Céd. ${esc(settings.doctor.cedula)} · ${esc(settings.doctor.telefono)}</div>
<h2 style="font-size:16px;margin-top:20px">Odontograma y presupuesto</h2>
<div>Paciente: <b>${esc(nombreCompleto(patient))}</b> · Fecha: ${fmtFecha(new Date().toISOString())} · CPO-D: ${ind.total} (C ${ind.c}, P ${ind.p}, O ${ind.o})</div>
<div style="margin-top:12px">${svgTexto()}</div>
<div class="muted">Rojo: por tratar · Azul: tratamiento existente · Gris: amalgama · Verde: sellador · Morado: implante</div>
<table><thead><tr><th>Diente</th><th>Tratamiento</th><th>Detalle</th><th class="r">Precio</th></tr></thead><tbody>
${filas.map((f) => `<tr><td>${f[0]}</td><td>${esc(f[1])}</td><td>${esc(f[2])}</td><td class="r">${mxn.format(f[3])}</td></tr>`).join('')}
<tr><td colspan="3" class="r tot">Total</td><td class="r tot">${mxn.format(total)}</td></tr></tbody></table>
${o.notas ? `<p><b>Notas:</b> ${esc(o.notas)}</p>` : ''}
<p class="muted">Presupuesto informativo con vigencia de 30 días. Puede modificarse según hallazgos clínicos durante el tratamiento.</p>
</body></html>`, 'Presupuesto dental')
  }

  const btn = (activo: boolean) => cx('flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium', activo ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface hover:bg-surface-2')

  return (
    <Page title="Odontograma" subtitle="Notación FDI · clic en cada cara o en el diente con la herramienta seleccionada"
      actions={<>
        <Button onClick={imprimir} disabled={!patient}><Printer className="size-4" /> Imprimir presupuesto</Button>
        <Button variant="primary" onClick={guardar} disabled={!pid}><Save className="size-4" /> Guardar{sucio ? ' *' : ''}</Button>
      </>}>
      <PatientBar />
      {base && !sucio && <Notice>Mostrando el odontograma guardado el {fmtFechaHora(base.fecha)}. Al guardar se crea una nueva instantánea en Documentos del paciente.</Notice>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card title="Herramientas" actions={
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={o.temporal} onChange={(e) => cambiar((x) => ({ ...x, temporal: e.target.checked }))} /> Dentición temporal
            </label>
          }>
            <div className="flex flex-wrap gap-1.5">
              <span className="w-full text-[11px] font-semibold tracking-wider text-muted uppercase">Por cara</span>
              {HERR_CARA.map((h) => (
                <button key={h.id} className={btn(herr.tipo === 'cara' && herr.id === h.id)} onClick={() => setHerr({ tipo: 'cara', id: h.id })}>
                  <span className="size-3 rounded-sm" style={{ background: h.color }} /> {h.label}
                </button>
              ))}
              <span className="mt-2 w-full text-[11px] font-semibold tracking-wider text-muted uppercase">Diente completo</span>
              {HERR_DIENTE.map((h) => (
                <button key={h.id} className={btn(herr.tipo === 'diente' && herr.id === h.id)} onClick={() => setHerr({ tipo: 'diente', id: h.id })}>
                  <span className="size-3 rounded-full border-2" style={{ borderColor: h.color }} /> {h.label}
                </button>
              ))}
              <button className={btn(herr.tipo === 'borrar')} onClick={() => setHerr({ tipo: 'borrar' })}><Eraser className="size-3.5" /> Borrar diente</button>
            </div>
            <p className="mt-2 text-xs text-muted">Convención: <b className="text-danger">rojo</b> = por tratar; azul/gris/verde = existente. Superior: vestibular arriba; inferior: vestibular abajo. Mesial hacia la línea media.</p>
          </Card>
          <Card pad={false}>
            <div className="overflow-x-auto p-3 sm:p-4">
              <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Derecha del paciente</span><span>Izquierda del paciente</span></div>
              <div className="min-w-[580px] rounded-lg bg-white p-2">
                <Odontograma o={o} onFace={onFace} svgRef={svgRef} />
              </div>
            </div>
          </Card>
          <Card title="Notas">
            <Textarea value={o.notas} placeholder="Hallazgos, oclusión, higiene, tejidos blandos…" onChange={(e) => cambiar((x) => ({ ...x, notas: e.target.value }))} />
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="Índice CPO-D">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[['C', ind.c], ['P', ind.p], ['O', ind.o], ['CPO-D', ind.total]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 p-2"><div className="text-lg font-semibold tabular-nums">{v}</div><div className="text-[11px] text-muted">{k}</div></div>
              ))}
            </div>
          </Card>
          <Card title="Plan de tratamiento" pad={false}>
            {plan.length === 0 && o.extras.length === 0 ? (
              <div className="p-4"><Empty>Marca caries, extracciones u otros hallazgos para generar el plan.</Empty></div>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {plan.map((i) => (
                  <li key={i.clave} className="flex items-center gap-2 px-4 py-2">
                    <input type="checkbox" checked={incluido(i.clave, i.incluidoPorDefecto)} onChange={() => toggle(i.clave, i.incluidoPorDefecto)} />
                    <Badge tone="brand">{i.diente}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{PRECIOS_BASE[i.tipo].label}</div>
                      <div className="truncate text-xs text-muted">{i.detalle}</div>
                    </div>
                    <span className={cx('tabular-nums', !incluido(i.clave, i.incluidoPorDefecto) && 'text-muted line-through')}>{mxn.format(precios[i.tipo] ?? 0)}</span>
                  </li>
                ))}
                {o.extras.map((e, k) => (
                  <li key={'x' + k} className="flex items-center gap-2 px-4 py-2">
                    <button onClick={() => cambiar((x) => ({ ...x, extras: x.extras.filter((_, j) => j !== k) }))} aria-label="Quitar"><Trash2 className="size-4 text-muted" /></button>
                    <div className="min-w-0 flex-1 truncate">{e.concepto}</div>
                    <span className="tabular-nums">{mxn.format(e.precio)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 border-t border-line p-3">
              <Input placeholder="Otro concepto (p. ej. limpieza)" value={extra.concepto} onChange={(e) => setExtra({ ...extra, concepto: e.target.value })} />
              <div className="w-24 shrink-0"><Input type="number" placeholder="$" value={extra.precio} onChange={(e) => setExtra({ ...extra, precio: e.target.value })} /></div>
              <Button size="sm" className="h-auto" disabled={!extra.concepto || !(Number(extra.precio) >= 0)} onClick={() => (cambiar((x) => ({ ...x, extras: [...x.extras, { concepto: extra.concepto, precio: Number(extra.precio) }] })), setExtra({ concepto: '', precio: '' }))} aria-label="Agregar"><Plus className="size-4" /></Button>
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <span className="font-medium">Presupuesto total</span>
              <span className="text-xl font-semibold tabular-nums">{mxn.format(total)}</span>
            </div>
          </Card>
          <Card title="Lista de precios">
            <div className="space-y-2">
              {Object.entries(PRECIOS_BASE).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">{v.label}</span>
                  <div className="w-28 shrink-0"><Input className="text-right" type="number" min={0} value={precios[k]} onChange={(e) => setPrecio(k, Number(e.target.value) || 0)} /></div>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Se guarda en este navegador para todos los pacientes.</p>
          </Card>
          <Card title={<span className="flex items-center gap-2"><History className="size-4" /> Historial</span>}>
            {historial.length === 0 ? (
              <Empty>Sin instantáneas guardadas.</Empty>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {historial.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div>{fmtFechaHora(d.fecha)}</div>
                      <div className="text-xs text-muted">Presupuesto {mxn.format(Number(d.meta?.presupuesto ?? 0))}</div>
                    </div>
                    {base?.id === d.id && !sucio ? <Badge tone="brand">Abierto</Badge> : (
                      <Button size="sm" onClick={() => void (sucio ? confirmar('Hay cambios sin guardar. ¿Abrir esta instantánea?') : Promise.resolve(true)).then((ok) => ok && (setO({ ...vacio(), ...(d.meta!.odontograma as Odo) }), setBase(d), setSucio(false)))}>Abrir</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Page>
  )
}
