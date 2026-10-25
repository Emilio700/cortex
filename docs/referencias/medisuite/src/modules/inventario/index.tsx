import { useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Download, FileUp, History, Lock, Package, Pencil, Plus, Power, Search } from 'lucide-react'
import { Page, Card, Button, Field, Input, Textarea, Select, Badge, Notice, Empty, Stat, Tabs, Modal } from '../../components/ui'
import { toast } from '../../components/toast'
import { confirmar } from '../../components/dialogos'
import { add, update, useActivePatient, useCollection } from '../../lib/store'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import { cx, downloadBlob, fmtFecha, fmtFechaHora, mxn, nombreCompleto } from '../../lib/utils'
import { registrarExportacion } from '../../lib/auditoria'
import { useQuien } from '../ordenes/acciones'
import {
  CATEGORIAS,
  COLUMNAS_CSV,
  MOTIVOS,
  SIN_LOTE,
  ajustesPorConteo,
  alertas as calcAlertas,
  bandaCaducidad,
  diasParaCaducar,
  kardex,
  lotesDe,
  movimientoDe,
  parseCSV,
  productoDe,
  productosACSV,
  productosDesdeCSV,
  stockPorProducto,
  sugerirFEFO,
  toCSV,
  valuacion,
  type Categoria,
  type Movimiento,
  type MotivoSalida,
  type Producto,
  type TipoMov,
} from './stock'

type Tab = 'existencias' | 'alertas' | 'movimiento' | 'kardex' | 'catalogo'
interface Prod {
  id: string
  p: Producto
  activo: boolean
}
const hoy = () => new Date().toLocaleDateString('en-CA')
const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
const nombreProd = (p: Producto) => `${p.nombre}${p.presentacion ? ` ${p.presentacion}` : ''}`

function useInventario() {
  const regsP = useRegistros('inventario', null)
  const regsM = useRegistros('movimiento-inventario')
  return useMemo(() => {
    const productos: Prod[] = regsP.map((r) => ({ id: r.id, p: productoDe(r), activo: r.estado !== 'inactivo' })).sort((a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es'))
    const movs: Movimiento[] = regsM.map(movimientoDe)
    const stock = stockPorProducto(movs)
    return { productos, movs, stock, regsP }
  }, [regsP, regsM])
}
type Inv = ReturnType<typeof useInventario>

export default function Inventario() {
  const inv = useInventario()
  const [tab, setTab] = useState<Tab>('existencias')
  const [sel, setSel] = useState<string>('')
  const puedeMov = useCanRegistro('movimiento-inventario', 'write')
  const puedeCat = useCanRegistro('inventario', 'write')
  const al = useMemo(() => calcAlertas(inv.productos.filter((x) => x.activo), inv.movs, hoy(), 90), [inv])
  const nAl = al.bajoMinimo.length + al.caducados.length + al.porCaducar.filter((x) => x.dias <= 30).length
  const abrir = (id: string, t: Tab) => {
    setSel(id)
    setTab(t)
  }
  return (
    <Page title="Inventario" subtitle="Medicamentos e insumos: existencias por lote, caducidades (FEFO), kárdex y costo promedio.">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'existencias', label: 'Existencias' },
          { id: 'alertas', label: <span className="inline-flex items-center gap-1.5">Alertas {nAl > 0 && <Badge tone="danger">{nAl}</Badge>}</span> },
          ...(puedeMov ? [{ id: 'movimiento' as const, label: 'Registrar movimiento' }] : []),
          { id: 'kardex', label: 'Kárdex' },
          { id: 'catalogo', label: 'Catálogo' },
        ]}
      />
      {tab === 'existencias' && <Existencias inv={inv} al={al} onAbrir={abrir} puedeMov={puedeMov} />}
      {tab === 'alertas' && <Alertas inv={inv} onAbrir={abrir} puedeMov={puedeMov} />}
      {tab === 'movimiento' && puedeMov && <RegistrarMovimiento inv={inv} sel={sel} setSel={setSel} />}
      {tab === 'kardex' && <Kardex inv={inv} sel={sel} setSel={setSel} />}
      {tab === 'catalogo' && <Catalogo inv={inv} puede={puedeCat} />}
      <p className="mt-4 flex items-start gap-1.5 text-xs text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Medicamentos controlados (estupefacientes y psicotrópicos, Ley General de Salud art. 226 fracc. I a III): su resguardo exige además el <b>libro de control</b> autorizado por COFEPRIS, receta especial o retenida según el grupo y balance periódico (Reglamento de Insumos para la Salud; verificar los numerales vigentes). Este inventario no sustituye ese libro. Los movimientos no se editan ni se borran: los errores se corrigen con un ajuste.
        </span>
      </p>
    </Page>
  )
}

function SelProducto({ inv, value, onChange, soloActivos = true, label = 'Producto' }: { inv: Inv; value: string; onChange: (id: string) => void; soloActivos?: boolean; label?: string }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecciona…</option>
        {inv.productos
          .filter((x) => !soloActivos || x.activo || x.id === value)
          .map((x) => (
            <option key={x.id} value={x.id}>
              {nombreProd(x.p)} — {fmtN(inv.stock.get(x.id) ?? 0)} {x.p.unidad}
            </option>
          ))}
      </Select>
    </Field>
  )
}

function Caducidad({ fecha }: { fecha?: string }) {
  if (!fecha) return <span className="text-muted">—</span>
  const d = diasParaCaducar(fecha, hoy())
  const b = bandaCaducidad(d)
  const tone = d < 0 ? 'danger' : b === 30 ? 'danger' : b === 60 ? 'warn' : b === 90 ? 'brand' : 'neutral'
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {fmtFecha(fecha + 'T12:00:00')}
      {(d < 0 || b) && <Badge tone={tone}>{d < 0 ? 'Caducado' : `${d} d`}</Badge>}
    </span>
  )
}

// ---------------------------------------------------------------- Existencias
function Existencias({ inv, al, onAbrir, puedeMov }: { inv: Inv; al: ReturnType<typeof calcAlertas>; onAbrir: (id: string, t: Tab) => void; puedeMov: boolean }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [soloAl, setSoloAl] = useState(false)
  const activos = inv.productos.filter((x) => x.activo)
  const valor = useMemo(() => valuacion(activos.map((x) => x.id), inv.movs), [activos, inv.movs])
  const conAlerta = new Set([...al.bajoMinimo.map((x) => x.productoId), ...al.caducados.map((x) => x.productoId), ...al.porCaducar.filter((x) => x.dias <= 30).map((x) => x.productoId)])
  const t = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const lista = activos.filter(
    (x) =>
      (!cat || x.p.categoria === cat) &&
      (!soloAl || conAlerta.has(x.id)) &&
      (!t || `${x.p.nombre} ${x.p.presentacion ?? ''} ${x.p.codigo ?? ''} ${x.p.ubicacion ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t)),
  )
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Productos activos" value={activos.length} />
        <Stat label="Valor del inventario" value={mxn.format(valor)} sub="Al costo promedio ponderado" />
        <Stat label="Bajo mínimo" value={al.bajoMinimo.length} tone={al.bajoMinimo.length ? 'warn' : 'ok'} />
        <Stat label="Lotes caducados / ≤ 30 días" value={`${al.caducados.length} / ${al.porCaducar.filter((x) => x.dias <= 30).length}`} tone={al.caducados.length ? 'danger' : undefined} />
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_14rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, código o ubicación…" className="pl-9" aria-label="Buscar producto" />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {Object.entries(CATEGORIAS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={soloAl} onChange={(e) => setSoloAl(e.target.checked)} /> Solo con alerta
        </label>
      </div>
      {lista.length === 0 ? (
        <Empty>{activos.length ? 'Sin productos con este filtro.' : 'Aún no hay productos. Agrégalos en la pestaña Catálogo o importa un CSV.'}</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {lista.map((x) => {
              const s = inv.stock.get(x.id) ?? 0
              const lotes = lotesDe(inv.movs, x.id).filter((l) => l.cantidad > 0)
              const prox = lotes.find((l) => l.caducidad)?.caducidad
              const bajo = x.p.stockMinimo > 0 && s <= x.p.stockMinimo
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
                      {nombreProd(x.p)}
                      {x.p.controlado && (
                        <Badge tone="danger">
                          <Lock className="mr-0.5 size-3" /> Controlado
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {CATEGORIAS[x.p.categoria]}
                      {x.p.ubicacion && <> · {x.p.ubicacion}</>}
                      {x.p.codigo && <> · {x.p.codigo}</>} · {lotes.length} lote{lotes.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="w-28 text-sm">
                    <div className={cx('font-semibold tabular-nums', bajo && 'text-warn', s < 0 && 'text-danger')}>
                      {fmtN(s)} <span className="font-normal text-muted">{x.p.unidad}</span>
                    </div>
                    <div className="text-xs text-muted">mín. {x.p.stockMinimo}</div>
                  </div>
                  <div className="w-36 text-xs">
                    <div className="text-muted">Próx. caducidad</div>
                    <Caducidad fecha={prox} />
                  </div>
                  <div className="flex gap-1.5">
                    {puedeMov && (
                      <Button size="sm" onClick={() => onAbrir(x.id, 'movimiento')} aria-label={`Movimiento de ${x.p.nombre}`}>
                        <Plus className="size-4" /> Mov.
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => onAbrir(x.id, 'kardex')} aria-label={`Kárdex de ${x.p.nombre}`}>
                      <History className="size-4" /> Kárdex
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Alertas
function Alertas({ inv, onAbrir, puedeMov }: { inv: Inv; onAbrir: (id: string, t: Tab) => void; puedeMov: boolean }) {
  const [horizonte, setHorizonte] = useState(90)
  const al = useMemo(() => calcAlertas(inv.productos.filter((x) => x.activo), inv.movs, hoy(), horizonte), [inv, horizonte])
  const prod = (id: string) => inv.productos.find((x) => x.id === id)!
  const fila = (id: string, extra: ReactNode, accion?: { label: string; tab: Tab }) => (
    <li key={id + String(extra)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{nombreProd(prod(id).p)}</div>
        <div className="text-xs text-muted">{extra}</div>
      </div>
      {accion && (
        <Button size="sm" onClick={() => onAbrir(id, accion.tab)}>
          {accion.label}
        </Button>
      )}
    </li>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={`Bajo existencia mínima (${al.bajoMinimo.length})`}>
        {al.bajoMinimo.length === 0 ? (
          <Empty>Todo por encima del mínimo.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {al.bajoMinimo.map((a) => fila(a.productoId, `Existencia ${fmtN(a.stock)} · mínimo ${a.minimo} ${prod(a.productoId).p.unidad}`, puedeMov ? { label: 'Registrar entrada', tab: 'movimiento' } : undefined))}
          </ul>
        )}
      </Card>
      <Card title={`Lotes caducados con existencia (${al.caducados.length})`}>
        {al.caducados.length === 0 ? (
          <Empty>Sin lotes caducados.</Empty>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {al.caducados.map((a) =>
                fila(a.productoId, `Lote ${a.lote} · ${fmtN(a.cantidad)} ${prod(a.productoId).p.unidad} · caducó ${fmtFecha(a.caducidad + 'T12:00:00')}`, puedeMov ? { label: 'Dar de baja', tab: 'movimiento' } : undefined),
              )}
            </ul>
            <p className="mt-2 text-xs text-muted">Separe físicamente los caducados y dé de baja con salida «Baja por caducidad». La disposición de medicamentos caducados debe hacerse por un gestor autorizado (residuos; NOM-052-SEMARNAT-2005).</p>
          </>
        )}
      </Card>
      <Card
        title={`Por caducar (${al.porCaducar.length})`}
        actions={
          <Select value={horizonte} onChange={(e) => setHorizonte(Number(e.target.value))} aria-label="Horizonte de caducidad" className="h-8 w-28 py-0 text-xs">
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
          </Select>
        }
      >
        {al.porCaducar.length === 0 ? (
          <Empty>Ningún lote caduca en los próximos {horizonte} días.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {al.porCaducar.map((a) => (
              <li key={a.productoId + a.lote} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{nombreProd(prod(a.productoId).p)}</div>
                  <div className="text-xs text-muted">
                    Lote {a.lote} · {fmtN(a.cantidad)} {prod(a.productoId).p.unidad}
                  </div>
                </div>
                <Caducidad fecha={a.caducidad} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- Movimientos
function RegistrarMovimiento({ inv, sel, setSel }: { inv: Inv; sel: string; setSel: (id: string) => void }) {
  const [tipo, setTipo] = useState<TipoMov>('entrada')
  const prod = inv.productos.find((x) => x.id === sel)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card>
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Tipo de movimiento">
          {(
            [
              ['entrada', 'Entrada', ArrowDownToLine],
              ['salida', 'Salida', ArrowUpFromLine],
              ['ajuste', 'Conteo físico', ClipboardCheck],
            ] as const
          ).map(([k, l, Icon]) => (
            <button key={k} role="radio" aria-checked={tipo === k} onClick={() => setTipo(k)} className={cx('flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium', tipo === k ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink')}>
              <Icon className="size-4" /> {l}
            </button>
          ))}
        </div>
        <SelProducto inv={inv} value={sel} onChange={setSel} />
        {prod && tipo === 'entrada' && <Entrada key={prod.id} prod={prod} />}
        {prod && tipo === 'salida' && <Salida key={prod.id} prod={prod} inv={inv} />}
        {prod && tipo === 'ajuste' && <Conteo key={prod.id} prod={prod} inv={inv} />}
      </Card>
      {prod && <LotesCard prod={prod} inv={inv} />}
    </div>
  )
}

function LotesCard({ prod, inv }: { prod: Prod; inv: Inv }) {
  const lotes = lotesDe(inv.movs, prod.id)
  return (
    <Card title={`Lotes · ${prod.p.nombre}`} className="self-start">
      {lotes.length === 0 ? (
        <Empty>Sin existencias.</Empty>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {lotes.map((l) => (
            <li key={l.lote} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5">
              <span className="font-mono text-xs">{l.lote}</span>
              <Caducidad fecha={l.caducidad} />
              <span className={cx('font-semibold tabular-nums', l.cantidad < 0 && 'text-danger')}>
                {fmtN(l.cantidad)} {prod.p.unidad}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Ordenados FEFO: primero el que caduca antes.</p>
    </Card>
  )
}

function useRegistrar() {
  const quien = useQuien()
  return (prod: Prod, m: Omit<Movimiento, 'id' | 'fecha' | 'productoId'> & { fecha: string }, patientId?: string) => {
    const { fecha, ...datos } = m
    const signo = m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '−' : m.cantidad >= 0 ? '+' : '−'
    const etiqueta = m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'ajuste' ? 'Ajuste' : m.motivo === 'aplicacion' ? 'Aplicación' : MOTIVOS[m.motivo ?? 'consumo']
    const ahora = new Date()
    const f = fecha === hoy() ? ahora.toISOString() : new Date(fecha + 'T' + ahora.toTimeString().slice(0, 8)).toISOString()
    add('registros', {
      tipo: 'movimiento-inventario',
      fecha: f,
      ...(patientId ? { patientId } : {}),
      titulo: `${etiqueta}: ${nombreProd(prod.p)} (${signo}${fmtN(Math.abs(m.cantidad))} ${prod.p.unidad})`,
      datos: { ...Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined && v !== '')), productoId: prod.id, ...(quien ? { usuario: quien } : {}) },
    })
  }
}

function Entrada({ prod }: { prod: Prod }) {
  const registrar = useRegistrar()
  const [f, setF] = useState({ cantidad: '', lote: '', caducidad: '', costo: '', proveedor: '', factura: '', fecha: hoy(), nota: '' })
  const q = Number(f.cantidad)
  const ok = q > 0 && (!f.costo || Number(f.costo) >= 0)
  const avisoCad = f.caducidad && diasParaCaducar(f.caducidad, hoy()) < 90
  const guardar = () => {
    registrar(prod, {
      tipo: 'entrada',
      cantidad: q,
      lote: f.lote.trim().toUpperCase() || undefined,
      caducidad: f.caducidad || undefined,
      costoUnitario: f.costo ? Number(f.costo) : undefined,
      proveedor: f.proveedor.trim() || undefined,
      factura: f.factura.trim() || undefined,
      nota: f.nota.trim() || undefined,
      fecha: f.fecha,
    })
    toast(`Entrada de ${q} ${prod.p.unidad} registrada.`, 'ok')
    setF({ ...f, cantidad: '', lote: '', caducidad: '', costo: '', factura: '', nota: '' })
  }
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label={`Cantidad (${prod.p.unidad})`}>
        <Input type="number" min={0} step="any" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
      </Field>
      <Field label="Costo unitario (MXN, opcional)">
        <Input type="number" min={0} step="0.01" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} />
      </Field>
      <Field label="Lote">
        <Input value={f.lote} onChange={(e) => setF({ ...f, lote: e.target.value })} placeholder="Como viene en el empaque" />
      </Field>
      <Field label="Caducidad" hint={avisoCad ? 'Atención: caduca en menos de 90 días.' : undefined}>
        <Input type="date" value={f.caducidad} onChange={(e) => setF({ ...f, caducidad: e.target.value })} />
      </Field>
      <Field label="Proveedor">
        <Input value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} />
      </Field>
      <Field label="Factura / remisión">
        <Input value={f.factura} onChange={(e) => setF({ ...f, factura: e.target.value })} />
      </Field>
      <Field label="Fecha">
        <Input type="date" value={f.fecha} max={hoy()} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
      </Field>
      <Field label="Nota (opcional)">
        <Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
      </Field>
      {prod.p.controlado && !f.lote.trim() && <Notice tone="warn">Medicamento controlado: registre lote y caducidad (también en el libro de control).</Notice>}
      <div className="sm:col-span-2">
        <Button variant="primary" disabled={!ok} onClick={guardar}>
          <ArrowDownToLine className="size-4" /> Registrar entrada
        </Button>
      </div>
    </div>
  )
}

function Salida({ prod, inv }: { prod: Prod; inv: Inv }) {
  const registrar = useRegistrar()
  const { id: activo } = useActivePatient()
  const pacientes = useCollection('patients')
  const [motivo, setMotivo] = useState<MotivoSalida>('consumo')
  const [cantidad, setCantidad] = useState('')
  const [modo, setModo] = useState<'fefo' | string>('fefo')
  const [paciente, setPaciente] = useState(activo ?? '')
  const [nota, setNota] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const q = Number(cantidad)
  const lotes = lotesDe(inv.movs, prod.id).filter((l) => l.cantidad > 0)
  const plan =
    modo === 'fefo'
      ? sugerirFEFO(lotes, q, hoy(), motivo === 'caducado')
      : (() => {
          const l = lotes.find((x) => x.lote === modo)
          const n = Math.min(q, l?.cantidad ?? 0)
          return { asignacion: l && n > 0 ? [{ lote: l.lote, caducidad: l.caducidad, cantidad: n }] : [], faltante: q - n, omitidosCaducados: [] as string[] }
        })()
  const loteSel = lotes.find((l) => l.lote === modo)
  const usaCaducado = loteSel?.caducidad && diasParaCaducar(loteSel.caducidad, hoy()) < 0 && motivo !== 'caducado'
  const ok = q > 0 && plan.faltante <= 1e-9 && (motivo !== 'aplicacion' || paciente) && !usaCaducado
  const guardar = () => {
    for (const a of plan.asignacion)
      registrar(
        prod,
        { tipo: 'salida', cantidad: a.cantidad, motivo, lote: a.lote === SIN_LOTE ? undefined : a.lote, caducidad: a.caducidad, nota: nota.trim() || undefined, fecha },
        motivo === 'aplicacion' ? paciente : undefined,
      )
    toast(`Salida de ${q} ${prod.p.unidad} registrada${plan.asignacion.length > 1 ? ` en ${plan.asignacion.length} lotes` : ''}.`, 'ok')
    setCantidad('')
    setNota('')
  }
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label="Motivo">
        <Select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoSalida)}>
          {Object.entries(MOTIVOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`Cantidad (${prod.p.unidad})`}>
        <Input type="number" min={0} step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
      </Field>
      {motivo === 'aplicacion' && (
        <Field label="Paciente" className="sm:col-span-2" hint="Quedará en la línea de tiempo del paciente.">
          <Select value={paciente} onChange={(e) => setPaciente(e.target.value)}>
            <option value="">Selecciona…</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {nombreCompleto(p)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Lote">
        <Select value={modo} onChange={(e) => setModo(e.target.value)}>
          <option value="fefo">Sugerencia FEFO (primero en caducar)</option>
          {lotes.map((l) => (
            <option key={l.lote} value={l.lote}>
              {l.lote} · {fmtN(l.cantidad)} · cad. {l.caducidad ?? '—'}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Fecha">
        <Input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} />
      </Field>
      <Field label="Nota (opcional)" className="sm:col-span-2">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={motivo === 'venta' ? 'Ej. ticket 123' : ''} />
      </Field>
      {q > 0 && (
        <div className="rounded-lg bg-surface-2 p-3 text-sm sm:col-span-2">
          <div className="mb-1 font-medium">Se descontará de:</div>
          {plan.asignacion.length === 0 ? (
            <span className="text-muted">Ningún lote disponible.</span>
          ) : (
            <ul className="space-y-0.5">
              {plan.asignacion.map((a) => (
                <li key={a.lote}>
                  Lote <b className="font-mono">{a.lote}</b>: {fmtN(a.cantidad)} {prod.p.unidad} {a.caducidad && <span className="text-muted">(cad. {fmtFecha(a.caducidad + 'T12:00:00')})</span>}
                </li>
              ))}
            </ul>
          )}
          {plan.faltante > 1e-9 && <p className="mt-1 text-danger">Faltan {fmtN(plan.faltante)} {prod.p.unidad}: no hay existencia suficiente{modo !== 'fefo' && ' en ese lote'}. Si el conteo físico difiere, registre primero un ajuste.</p>}
          {plan.omitidosCaducados.length > 0 && <p className="mt-1 text-warn">Se omitieron lotes caducados ({plan.omitidosCaducados.join(', ')}): no deben surtirse; dé de baja con «Baja por caducidad».</p>}
          {usaCaducado && <p className="mt-1 text-danger">El lote seleccionado está caducado: solo puede salir como «Baja por caducidad».</p>}
        </div>
      )}
      <div className="sm:col-span-2">
        <Button variant="primary" disabled={!ok} onClick={guardar}>
          <ArrowUpFromLine className="size-4" /> Registrar salida
        </Button>
      </div>
    </div>
  )
}

function Conteo({ prod, inv }: { prod: Prod; inv: Inv }) {
  const registrar = useRegistrar()
  const lotes = lotesDe(inv.movs, prod.id)
  const [conteo, setConteo] = useState<Record<string, string>>({})
  const [nuevo, setNuevo] = useState({ lote: '', caducidad: '', cantidad: '' })
  const [nota, setNota] = useState('')
  const nums: Record<string, number | undefined> = Object.fromEntries(Object.entries(conteo).map(([k, v]) => [k, v === '' ? undefined : Number(v)]))
  if (nuevo.lote.trim() && Number(nuevo.cantidad) > 0) nums[nuevo.lote.trim().toUpperCase()] = Number(nuevo.cantidad)
  const ajustes = ajustesPorConteo(lotes, nums)
  const guardar = () => {
    for (const a of ajustes)
      registrar(prod, {
        tipo: 'ajuste',
        cantidad: a.diferencia,
        lote: a.lote === SIN_LOTE ? undefined : a.lote,
        caducidad: a.caducidad ?? (a.lote === nuevo.lote.trim().toUpperCase() ? nuevo.caducidad || undefined : undefined),
        nota: `Conteo físico: sistema ${fmtN(a.sistema)}, físico ${fmtN(a.fisico)}.${nota.trim() ? ' ' + nota.trim() : ''}`,
        fecha: hoy(),
      })
    toast(`${ajustes.length} ajuste${ajustes.length === 1 ? '' : 's'} registrado${ajustes.length === 1 ? '' : 's'}.`, 'ok')
    setConteo({})
    setNuevo({ lote: '', caducidad: '', cantidad: '' })
    setNota('')
  }
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted">Captura lo que cuentas físicamente por lote. Se crea un movimiento de ajuste por cada diferencia; los lotes que dejes vacíos no cambian.</p>
      {lotes.length > 0 && (
        <ul className="space-y-2">
          {lotes.map((l) => (
            <li key={l.lote} className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm sm:grid-cols-[1fr_8rem_6.5rem]">
              <span className="min-w-0">
                <span className="font-mono text-xs">{l.lote}</span> <span className="text-xs text-muted">cad. {l.caducidad ?? '—'}</span>
              </span>
              <span className="hidden text-right text-muted sm:block">sistema: {fmtN(l.cantidad)}</span>
              <Input type="number" min={0} step="any" aria-label={`Conteo físico lote ${l.lote}`} placeholder={fmtN(l.cantidad)} value={conteo[l.lote] ?? ''} onChange={(e) => setConteo({ ...conteo, [l.lote]: e.target.value })} />
            </li>
          ))}
        </ul>
      )}
      <fieldset className="rounded-lg border border-dashed border-line p-3">
        <legend className="px-1 text-xs text-muted">Lote encontrado que no está en el sistema (opcional)</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input aria-label="Lote nuevo" placeholder="Lote" value={nuevo.lote} onChange={(e) => setNuevo({ ...nuevo, lote: e.target.value })} />
          <Input aria-label="Caducidad del lote nuevo" type="date" value={nuevo.caducidad} onChange={(e) => setNuevo({ ...nuevo, caducidad: e.target.value })} />
          <Input aria-label="Cantidad del lote nuevo" type="number" min={0} placeholder="Cantidad" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} />
        </div>
      </fieldset>
      <Field label="Observaciones del conteo">
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. inventario mensual; 2 piezas dañadas" className="min-h-14" />
      </Field>
      {ajustes.length > 0 && (
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          {ajustes.map((a) => (
            <div key={a.lote}>
              Lote <b className="font-mono">{a.lote}</b>: {fmtN(a.sistema)} → {fmtN(a.fisico)} (<span className={a.diferencia < 0 ? 'text-danger' : 'text-ok'}>{a.diferencia > 0 ? '+' : ''}{fmtN(a.diferencia)}</span>)
            </div>
          ))}
        </div>
      )}
      <Button variant="primary" disabled={!ajustes.length} onClick={async () => {
          if (await confirmar(`Se registrarán ${ajustes.length} movimiento(s) de ajuste. Los movimientos no se pueden editar ni borrar; un error se corrige con otro ajuste.`, { titulo: 'Confirmar ajuste por conteo', aceptar: 'Registrar' })) guardar()
        }}>
        <ClipboardCheck className="size-4" /> Registrar {ajustes.length || ''} ajuste{ajustes.length === 1 ? '' : 's'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- Kárdex
function Kardex({ inv, sel, setSel }: { inv: Inv; sel: string; setSel: (id: string) => void }) {
  const prod = inv.productos.find((x) => x.id === sel)
  const pacientes = useCollection('patients')
  const filas = useMemo(() => (prod ? kardex(inv.movs, prod.id) : []), [inv.movs, prod])
  const ult = filas[filas.length - 1]
  const exportar = () => {
    if (!prod) return
    const csv = toCSV([
      ['fecha', 'concepto', 'lote', 'entrada', 'salida', 'saldo', 'costo_unitario', 'costo_promedio', 'valor_saldo'],
      ...filas.map((f) => [f.fecha.slice(0, 16).replace('T', ' '), f.concepto, f.lote, f.entrada || '', f.salida || '', f.saldo, f.costoUnitario?.toFixed(2), f.costoPromedio.toFixed(2), f.valorSaldo.toFixed(2)]),
    ])
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `kardex-${prod.p.nombre.replace(/\W+/g, '-').toLowerCase()}.csv`)
    void registrarExportacion('inventario', { formato: 'csv', recursos: filas.length })
  }
  return (
    <>
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <SelProducto inv={inv} value={sel} onChange={setSel} soloActivos={false} />
        {prod && (
          <Button onClick={exportar}>
            <Download className="size-4" /> Exportar CSV
          </Button>
        )}
      </div>
      {!prod ? (
        <Empty>Selecciona un producto para ver su kárdex.</Empty>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Existencia" value={`${fmtN(ult?.saldo ?? 0)} ${prod.p.unidad}`} />
            <Stat label="Costo promedio" value={mxn.format(ult?.costoPromedio ?? 0)} />
            <Stat label="Valor" value={mxn.format(ult?.valorSaldo ?? 0)} />
            <Stat label="Movimientos" value={filas.length} />
          </div>
          {filas.length === 0 ? (
            <Empty>Sin movimientos.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">Kárdex de {prod.p.nombre}</caption>
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Concepto</th>
                    <th className="px-3 py-2 text-left font-medium">Lote</th>
                    <th className="px-3 py-2 text-right font-medium">Entrada</th>
                    <th className="px-3 py-2 text-right font-medium">Salida</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    <th className="px-3 py-2 text-right font-medium">C. prom.</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...filas].reverse().map((f) => {
                    const pac = f.patientId ? pacientes.find((p) => p.id === f.patientId) : undefined
                    return (
                      <tr key={f.id}>
                        <td className="px-3 py-1.5 whitespace-nowrap">{fmtFechaHora(f.fecha)}</td>
                        <td className="px-3 py-1.5">
                          {f.concepto}
                          {pac && <span className="text-muted"> · {nombreCompleto(pac)}</span>}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">{f.lote}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ok">{f.entrada ? fmtN(f.entrada) : ''}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-danger">{f.salida ? fmtN(f.salida) : ''}</td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">{fmtN(f.saldo)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{mxn.format(f.costoPromedio)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{mxn.format(f.valorSaldo)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">Costo promedio ponderado: cada entrada con costo recalcula el promedio; salidas y ajustes se valúan al promedio vigente.</p>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Catálogo
const VACIO: Producto = { nombre: '', presentacion: '', unidad: 'pieza', categoria: 'medicamento', stockMinimo: 0, ubicacion: '', controlado: false }

function Catalogo({ inv, puede }: { inv: Inv; puede: boolean }) {
  const [edit, setEdit] = useState<{ id?: string; p: Producto } | null>(null)
  const [imp, setImp] = useState<{ productos: Producto[]; errores: string[]; nuevos: number } | null>(null)
  const [verInactivos, setVerInactivos] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const guardarProducto = (id: string | undefined, p: Producto) => {
    const datos = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '')) as Record<string, unknown>
    if (id) {
      const prev = inv.regsP.find((r) => r.id === id)
      update('registros', id, { titulo: nombreProd(p), datos: { ...(prev?.datos ?? {}), ...datos, ...(p.precioVenta === undefined ? { precioVenta: undefined } : {}) } })
    } else add('registros', { tipo: 'inventario', estado: 'activo', titulo: nombreProd(p), datos })
  }
  const leerCSV = async (f?: File) => {
    if (!f) return
    const texto = await f.text()
    const r = productosDesdeCSV(parseCSV(texto))
    const existentes = new Set(inv.productos.map((x) => nombreProd(x.p).toLowerCase()))
    setImp({ ...r, nuevos: r.productos.filter((p) => !existentes.has(nombreProd(p).toLowerCase())).length })
    if (fileRef.current) fileRef.current.value = ''
  }
  const importar = () => {
    if (!imp) return
    const porNombre = new Map(inv.productos.map((x) => [nombreProd(x.p).toLowerCase(), x]))
    let n = 0
    let a = 0
    for (const p of imp.productos) {
      const ex = porNombre.get(nombreProd(p).toLowerCase())
      if (ex) {
        guardarProducto(ex.id, { ...ex.p, ...p })
        a++
      } else {
        guardarProducto(undefined, p)
        n++
      }
    }
    toast(`${n} producto(s) nuevos y ${a} actualizado(s).`, 'ok')
    setImp(null)
  }
  const exportar = () => {
    const activos = inv.productos.filter((x) => x.activo)
    const csv = productosACSV(activos.map((x) => ({ p: x.p, stock: inv.stock.get(x.id) ?? 0, costoPromedio: kardex(inv.movs, x.id).at(-1)?.costoPromedio ?? 0 })))
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `inventario-${hoy()}.csv`)
    void registrarExportacion('inventario', { formato: 'csv', recursos: activos.length })
  }
  const plantilla = () => downloadBlob(new Blob([toCSV([[...COLUMNAS_CSV], ['Paracetamol', '500 mg 10 tabletas', 'caja', 'medicamento', 5, 'Estante A1', 35, 'no', '']])], { type: 'text/csv;charset=utf-8' }), 'plantilla-inventario.csv')
  const lista = inv.productos.filter((x) => verInactivos || x.activo)
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {puede && (
          <Button variant="primary" onClick={() => setEdit({ p: { ...VACIO } })}>
            <Plus className="size-4" /> Nuevo producto
          </Button>
        )}
        {puede && (
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => leerCSV(e.target.files?.[0])} />
            <Button onClick={() => fileRef.current?.click()}>
              <FileUp className="size-4" /> Importar CSV
            </Button>
            <Button variant="ghost" onClick={plantilla}>
              Plantilla CSV
            </Button>
          </>
        )}
        <Button onClick={exportar}>
          <Download className="size-4" /> Exportar CSV
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver inactivos
        </label>
      </div>
      {!puede && <Notice>Tu rol puede consultar el catálogo pero no modificarlo.</Notice>}
      {lista.length === 0 ? (
        <Empty>Sin productos.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {lista.map((x) => (
            <li key={x.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-2.5', !x.activo && 'opacity-60')}>
              <Package className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {nombreProd(x.p)} {x.p.controlado && <Badge tone="danger">Controlado</Badge>} {!x.activo && <Badge>Inactivo</Badge>}
                </div>
                <div className="text-xs text-muted">
                  {CATEGORIAS[x.p.categoria]} · {x.p.unidad} · mín. {x.p.stockMinimo}
                  {x.p.ubicacion && <> · {x.p.ubicacion}</>}
                  {x.p.precioVenta !== undefined && <> · venta {mxn.format(x.p.precioVenta)}</>}
                </div>
              </div>
              {puede && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ id: x.id, p: x.p })} aria-label={`Editar ${x.p.nombre}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => update('registros', x.id, { estado: x.activo ? 'inactivo' : 'activo' })} aria-label={`${x.activo ? 'Desactivar' : 'Activar'} ${x.p.nombre}`}>
                    <Power className="size-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {edit && <EditorProducto inicial={edit.p} titulo={edit.id ? 'Editar producto' : 'Nuevo producto'} onClose={() => setEdit(null)} onGuardar={(p) => (guardarProducto(edit.id, p), setEdit(null))} />}
      <Modal open={!!imp} onClose={() => setImp(null)} title="Importar catálogo desde CSV">
        {imp && (
          <div className="space-y-3 text-sm">
            <p>
              {imp.productos.length} producto(s) leídos: <b>{imp.nuevos}</b> nuevos y <b>{imp.productos.length - imp.nuevos}</b> que actualizarán uno existente con el mismo nombre y presentación. Las existencias no se importan: regístralas como entradas o conteo físico.
            </p>
            {imp.errores.length > 0 && (
              <Notice tone="warn">
                <ul className="list-disc pl-4">
                  {imp.errores.slice(0, 8).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <p className="text-xs text-muted">Columnas: {COLUMNAS_CSV.join(', ')}. Separador coma o punto y coma; controlado «sí/no».</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setImp(null)}>Cancelar</Button>
              <Button variant="primary" disabled={!imp.productos.length} onClick={importar}>
                Importar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function EditorProducto({ inicial, titulo, onClose, onGuardar }: { inicial: Producto; titulo: string; onClose: () => void; onGuardar: (p: Producto) => void }) {
  const [p, setP] = useState<Producto>(inicial)
  const [precio, setPrecio] = useState(inicial.precioVenta === undefined ? '' : String(inicial.precioVenta))
  return (
    <Modal open onClose={onClose} title={titulo}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre (genérico)" className="sm:col-span-2">
          <Input value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} placeholder="Ej. Ketorolaco" />
        </Field>
        <Field label="Presentación">
          <Input value={p.presentacion ?? ''} onChange={(e) => setP({ ...p, presentacion: e.target.value })} placeholder="Ej. 30 mg/1 mL solución inyectable" />
        </Field>
        <Field label="Unidad de conteo">
          <Input value={p.unidad} onChange={(e) => setP({ ...p, unidad: e.target.value })} list="inv-unidades" />
          <datalist id="inv-unidades">
            {['pieza', 'caja', 'ampolleta', 'frasco', 'tableta', 'sobre', 'paquete', 'rollo', 'par', 'jeringa', 'vial'].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <Field label="Categoría">
          <Select value={p.categoria} onChange={(e) => setP({ ...p, categoria: e.target.value as Categoria })}>
            {Object.entries(CATEGORIAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Existencia mínima">
          <Input type="number" min={0} value={p.stockMinimo} onChange={(e) => setP({ ...p, stockMinimo: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
        <Field label="Ubicación">
          <Input value={p.ubicacion ?? ''} onChange={(e) => setP({ ...p, ubicacion: e.target.value })} placeholder="Ej. Refrigerador, Estante B2" />
        </Field>
        <Field label="Precio de venta (opcional)">
          <Input type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </Field>
        <Field label="Código / clave (opcional)">
          <Input value={p.codigo ?? ''} onChange={(e) => setP({ ...p, codigo: e.target.value })} placeholder="EAN o clave interna" />
        </Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={p.controlado} onChange={(e) => setP({ ...p, controlado: e.target.checked })} />
          <span>
            Medicamento controlado (estupefaciente o psicotrópico)
            <span className="block text-xs text-muted">Requiere además el libro de control autorizado por COFEPRIS; este sistema no lo sustituye.</span>
          </span>
        </label>
      </div>
      {p.controlado && (
        <p className="mt-2 flex items-center gap-1 text-xs text-warn">
          <AlertTriangle className="size-3.5" /> Registre siempre lote y caducidad en entradas y salidas.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!p.nombre.trim() || !p.unidad.trim()} onClick={() => onGuardar({ ...p, nombre: p.nombre.trim(), precioVenta: precio === '' ? undefined : Math.max(0, Number(precio) || 0) })}>
          Guardar
        </Button>
      </div>
    </Modal>
  )
}
