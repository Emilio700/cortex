import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, CalendarDays, Check, ChevronLeft, ChevronRight, Columns3, GripVertical, List, MessageSquare, Repeat, Search, UserRound } from 'lucide-react'
import { Badge, Button, Card, Empty, Input, Notice, Page, Select, Tabs } from '../../components/ui'
import { useCollection } from '../../lib/store'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import { cx, nombreCompleto } from '../../lib/utils'
import type { Patient } from '../../lib/types'
import {
  ESTADOS,
  ESTADO_LABEL,
  ETIQUETAS,
  ETIQUETA_LABEL,
  PRIORIDAD_LABEL,
  aTarea,
  activa,
  contarVencidas,
  diasSemana,
  fechaLocal,
  filtrar,
  ordenar,
  sumarDias,
  textoVence,
  vencida,
  type EstadoTarea,
  type Filtro,
  type Tarea,
} from './tareas'
import { TareaModal, cambiarEstado } from './TareaModal'
import { NuevaTareaBoton } from './NuevaTareaBoton'
import { useEquipo } from './equipo'

type Vista = 'tablero' | 'lista' | 'semana'
const LS_VISTA = 'medisuite.tareas.vista'
const DIAS_CERRADAS = 14

function leerVista(): Vista {
  try {
    const v = localStorage.getItem(LS_VISTA)
    return v === 'lista' || v === 'semana' ? v : 'tablero'
  } catch {
    return 'tablero'
  }
}

/** Reloj que avanza cada minuto (para que «vencida» cambie a medianoche sin recargar). */
function useAhora() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function Tareas() {
  const regs = useRegistros('tarea')
  const puede = useCanRegistro('tarea', 'write')
  const patients = useCollection('patients')
  const now = useAhora()
  const tareas = useMemo(() => regs.map(aTarea), [regs])
  const pacientes = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients])
  const [vista, setVista] = useState<Vista>(leerVista)
  const [abierta, setAbierta] = useState<string | null>(null)
  const tarea = tareas.find((t) => t.id === abierta)
  const nVencidas = contarVencidas(tareas, now)

  useEffect(() => {
    try {
      localStorage.setItem(LS_VISTA, vista)
    } catch {
      /* sin almacenamiento */
    }
  }, [vista])

  return (
    <Page
      title="Tareas del equipo"
      subtitle="Pendientes operativos de la clínica: llamadas, resultados por entregar, cobros, insumos."
      actions={
        <>
          {nVencidas > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-semibold text-danger" role="status">
              <AlarmClock className="size-3.5" /> {nVencidas} vencida
              {nVencidas === 1 ? '' : 's'}
            </span>
          )}
          {puede && <NuevaTareaBoton variant="primary" />}
        </>
      }
    >
      <Tabs<Vista>
        value={vista}
        onChange={setVista}
        tabs={[
          {
            id: 'tablero',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Columns3 className="size-4" /> Tablero
              </span>
            ),
          },
          {
            id: 'lista',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <List className="size-4" /> Lista
              </span>
            ),
          },
          {
            id: 'semana',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" /> Esta semana
              </span>
            ),
          },
        ]}
      />
      {vista === 'tablero' && <Kanban puede={puede} tareas={tareas} pacientes={pacientes} now={now} onOpen={setAbierta} />}
      {vista === 'lista' && <Lista puede={puede} tareas={tareas} pacientes={pacientes} patients={patients} now={now} onOpen={setAbierta} />}
      {vista === 'semana' && <Semana tareas={tareas} pacientes={pacientes} now={now} onOpen={setAbierta} />}
      <p className="mt-4 text-xs text-muted">Las tareas son visibles para todo el equipo (incluida recepción). No registres información clínica en ellas.</p>
      <TareaModal open={!!tarea} onClose={() => setAbierta(null)} tarea={tarea} />
    </Page>
  )
}

// ---------- Elementos comunes ----------
const tonoPrioridad = (p: string) => (p === 'urgente' ? 'danger' : p === 'alta' ? 'warn' : p === 'baja' ? 'neutral' : 'brand') as 'danger' | 'warn' | 'neutral' | 'brand'

function Meta({ t, pacientes, now }: { t: Tarea; pacientes: Map<string, Patient>; now: number }) {
  const p = t.patientId ? pacientes.get(t.patientId) : undefined
  const venc = vencida(t, now)
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <Badge tone={tonoPrioridad(t.datos.prioridad)}>{PRIORIDAD_LABEL[t.datos.prioridad]}</Badge>
      {t.datos.vence && (
        <span className={cx('inline-flex items-center gap-1', venc && 'font-semibold text-danger')}>
          <AlarmClock className="size-3" /> {venc ? 'Venció ' : ''}
          {textoVence(t.datos.vence, now)}
        </span>
      )}
      {t.datos.recurrencia && (
        <span className="inline-flex items-center gap-0.5" title="Recurrente">
          <Repeat className="size-3" />
          <span className="sr-only">Recurrente</span>
        </span>
      )}
      {t.datos.asignadoNombre && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <UserRound className="size-3 shrink-0" /> <span className="truncate">{t.datos.asignadoNombre}</span>
        </span>
      )}
      {p && (
        <Link to={`/pacientes/${p.id}`} className="truncate text-brand underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
          {nombreCompleto(p)}
        </Link>
      )}
      {t.datos.comentarios.length > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <MessageSquare className="size-3" /> {t.datos.comentarios.length}
          <span className="sr-only"> comentarios</span>
        </span>
      )}
      {t.datos.etiquetas.map((e) => (
        <span key={e} className="rounded-full border border-line px-1.5 py-px">
          {ETIQUETA_LABEL[e] ?? e}
        </span>
      ))}
    </div>
  )
}

// ---------- Tablero (Kanban) ----------
interface Arrastre {
  id: string
  pointerId: number
  x0: number
  y0: number
  x: number
  y: number
  w: number
  activo: boolean
  sobre: EstadoTarea | null
}

function columnaEn(x: number, y: number): EstadoTarea | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const col = (el as HTMLElement).closest?.('[data-col]')
    if (col) return col.getAttribute('data-col') as EstadoTarea
  }
  return null
}

function Kanban({ puede, tareas, pacientes, now, onOpen }: { puede: boolean; tareas: Tarea[]; pacientes: Map<string, Patient>; now: number; onOpen: (id: string) => void }) {
  const [drag, setDrag] = useState<Arrastre | null>(null)
  const [anuncio, setAnuncio] = useState('')
  const enfocar = useRef<string | null>(null)
  const limite = now - DIAS_CERRADAS * 864e5

  const porEstado = useMemo(() => {
    const m: Record<EstadoTarea, Tarea[]> = {
      abierta: [],
      'en-curso': [],
      hecha: [],
      cancelada: [],
    }
    for (const t of ordenar(tareas, now)) {
      if (!activa(t) && Date.parse(t.datos.completadaEn ?? t.fecha) < limite) continue
      m[t.estado].push(t)
    }
    return m
  }, [tareas, now, limite])

  useEffect(() => {
    if (!enfocar.current) return
    document.querySelector<HTMLElement>(`[data-handle="${CSS.escape(enfocar.current)}"]`)?.focus()
    enfocar.current = null
  })

  function mover(t: Tarea, estado: EstadoTarea, foco = false) {
    if (t.estado === estado) return
    cambiarEstado(t, estado)
    setAnuncio(`«${t.titulo}» movida a ${ESTADO_LABEL[estado]}.`)
    if (foco) enfocar.current = t.id
  }

  function onDown(e: RPointerEvent<HTMLElement>, t: Tarea) {
    if (e.button !== 0) return
    const card = (e.currentTarget as HTMLElement).closest('[data-card]') as HTMLElement
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      id: t.id,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      w: card?.offsetWidth ?? 260,
      activo: false,
      sobre: null,
    })
  }
  function onMove(e: RPointerEvent<HTMLElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return
    const activo = drag.activo || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5
    setDrag({
      ...drag,
      x: e.clientX,
      y: e.clientY,
      activo,
      sobre: activo ? columnaEn(e.clientX, e.clientY) : null,
    })
  }
  function onUp(e: RPointerEvent<HTMLElement>, t: Tarea) {
    if (!drag || e.pointerId !== drag.pointerId) return
    if (drag.activo && drag.sobre) mover(t, drag.sobre)
    setDrag(null)
  }
  function onKey(e: RKeyboardEvent<HTMLElement>, t: Tarea) {
    const i = ESTADOS.findIndex((s) => s.id === t.estado)
    let j = -1
    if (e.key === 'ArrowRight') j = i + 1
    else if (e.key === 'ArrowLeft') j = i - 1
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = ESTADOS.length - 1
    else return
    e.preventDefault()
    if (j < 0 || j >= ESTADOS.length) return
    mover(t, ESTADOS[j].id, true)
  }

  const arrastrada = drag?.activo ? tareas.find((t) => t.id === drag.id) : undefined

  return (
    <>
      <p id="kanban-ayuda" className="mb-3 text-xs text-muted">
        Arrastra una tarjeta por su asa <GripVertical className="inline size-3" aria-hidden /> para cambiarla de columna. Con teclado: enfoca el asa y usa ← → (Inicio/Fin para la
        primera/última columna). Las hechas y canceladas se muestran {DIAS_CERRADAS} días; el historial completo está en «Lista».
      </p>
      <div className="sr-only" aria-live="polite">
        {anuncio}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ESTADOS.map((s) => {
          const xs = porEstado[s.id]
          const sobre = drag?.activo && drag.sobre === s.id
          return (
            <section
              key={s.id}
              data-col={s.id}
              aria-label={`${s.label}: ${xs.length} tareas`}
              className={cx('flex min-h-32 min-w-0 flex-col rounded-xl border bg-surface-2/60 p-2 transition-colors', sobre ? 'border-brand bg-brand-soft/60' : 'border-line')}
            >
              <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
                {s.label} <Badge>{xs.length}</Badge>
              </h2>
              <ul className="flex flex-1 flex-col gap-2">
                {xs.length === 0 && <li className="rounded-lg border border-dashed border-line p-3 text-center text-xs text-muted">Sin tareas</li>}
                {xs.map((t) => (
                  <li
                    key={t.id}
                    data-card
                    className={cx(
                      'flex min-w-0 gap-1 rounded-lg border bg-surface p-2 shadow-sm',
                      vencida(t, now) ? 'border-danger/50' : 'border-line',
                      drag?.activo && drag.id === t.id && 'opacity-40',
                    )}
                  >
                    {puede && (
                      <button
                        type="button"
                        data-handle={t.id}
                        aria-label={`Mover «${t.titulo}» (columna actual: ${s.label})`}
                        aria-describedby="kanban-ayuda"
                        className="-my-1 -ml-1 flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
                        onPointerDown={(e) => onDown(e, t)}
                        onPointerMove={onMove}
                        onPointerUp={(e) => onUp(e, t)}
                        onPointerCancel={() => setDrag(null)}
                        onKeyDown={(e) => onKey(e, t)}
                      >
                        <GripVertical className="size-4" />
                      </button>
                    )}
                    <button type="button" className="min-w-0 flex-1 rounded-md text-left" onClick={() => onOpen(t.id)}>
                      <span className={cx('block break-words text-sm font-medium', t.estado === 'cancelada' && 'text-muted line-through')}>{t.titulo}</span>
                      <Meta t={t} pacientes={pacientes} now={now} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      {arrastrada && drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rotate-1 rounded-lg border border-brand bg-surface p-2 text-sm font-medium shadow-xl"
          style={{
            left: drag.x - 16,
            top: drag.y - 16,
            width: Math.min(drag.w, 320),
          }}
        >
          {arrastrada.titulo}
        </div>
      )}
    </>
  )
}

// ---------- Lista con filtros ----------
function Lista({
  puede,
  tareas,
  pacientes,
  patients,
  now,
  onOpen,
}: {
  puede: boolean
  tareas: Tarea[]
  pacientes: Map<string, Patient>
  patients: Patient[]
  now: number
  onOpen: (id: string) => void
}) {
  const { yo } = useEquipo()
  const [f, setF] = useState<Filtro>({
    vista: 'activas',
    estado: '',
    etiqueta: '',
    patientId: '',
    texto: '',
  })
  const xs = useMemo(() => ordenar(filtrar(tareas, f, yo, now), now), [tareas, f, yo, now])
  const chips: { id: NonNullable<Filtro['vista']>; label: string }[] = [
    { id: 'activas', label: 'Pendientes' },
    { id: 'mias', label: 'Mis tareas' },
    { id: 'vencidas', label: `Vencidas (${contarVencidas(tareas, now)})` },
    { id: 'todas', label: 'Todas' },
  ]
  return (
    <Card pad={false}>
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Vista rápida">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={f.vista === c.id}
              onClick={() => setF({ ...f, vista: c.id })}
              className={cx(
                'rounded-full border px-3 py-1 text-xs font-medium',
                f.vista === c.id ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-muted hover:bg-surface-2',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {f.vista === 'mias' && !yo && <p className="text-xs text-warn">Configura el nombre del médico en Configuración para usar «Mis tareas» en modo demo.</p>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
            <Input className="pl-8" placeholder="Buscar…" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
          </label>
          <Select aria-label="Paciente" value={f.patientId} onChange={(e) => setF({ ...f, patientId: e.target.value })}>
            <option value="">Todos los pacientes</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {nombreCompleto(p)}
              </option>
            ))}
          </Select>
          <Select aria-label="Etiqueta" value={f.etiqueta} onChange={(e) => setF({ ...f, etiqueta: e.target.value })}>
            <option value="">Todas las etiquetas</option>
            {ETIQUETAS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as EstadoTarea | '' })}>
            <option value="">Cualquier estado</option>
            {ESTADOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {xs.length === 0 ? (
        <div className="p-4">
          <Empty>No hay tareas con estos filtros.</Empty>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {xs.map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
              <button
                type="button"
                aria-label={t.estado === 'hecha' ? `Reabrir «${t.titulo}»` : `Marcar «${t.titulo}» como hecha`}
                aria-pressed={t.estado === 'hecha'}
                disabled={!puede || t.estado === 'cancelada'}
                onClick={() => cambiarEstado(t, t.estado === 'hecha' ? 'abierta' : 'hecha')}
                className={cx(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border',
                  t.estado === 'hecha' ? 'border-ok bg-ok text-white dark:text-black' : 'border-line hover:border-brand',
                  t.estado === 'cancelada' && 'opacity-40',
                )}
              >
                {t.estado === 'hecha' && <Check className="size-3.5" />}
              </button>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(t.id)}>
                <span className={cx('block break-words text-sm font-medium', !activa(t) && 'text-muted line-through')}>{t.titulo}</span>
                <Meta t={t} pacientes={pacientes} now={now} />
              </button>
              <Badge tone={t.estado === 'en-curso' ? 'brand' : t.estado === 'hecha' ? 'ok' : 'neutral'}>{ESTADO_LABEL[t.estado]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---------- Esta semana ----------
function Semana({ tareas, pacientes, now, onOpen }: { tareas: Tarea[]; pacientes: Map<string, Patient>; now: number; onOpen: (id: string) => void }) {
  const hoy = fechaLocal(now)
  const [ref, setRef] = useState(hoy)
  const dias = diasSemana(ref)
  const actual = dias.includes(hoy)
  const atrasadas = ordenar(
    tareas.filter((t) => vencida(t, now) && t.datos.vence! < dias[0]),
    now,
  )
  const sinFecha = tareas.filter((t) => activa(t) && !t.datos.vence)
  const rango = `${fmtDia(dias[0], { day: 'numeric', month: 'short' })} – ${fmtDia(dias[6], { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" aria-label="Semana anterior" onClick={() => setRef(sumarDias(ref, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" onClick={() => setRef(hoy)} disabled={actual}>
          Hoy
        </Button>
        <Button size="sm" aria-label="Semana siguiente" onClick={() => setRef(sumarDias(ref, 7))}>
          <ChevronRight className="size-4" />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {rango}
        </span>
      </div>
      {actual && atrasadas.length > 0 && (
        <Notice tone="danger">
          <b>
            {atrasadas.length} tarea{atrasadas.length === 1 ? '' : 's'} vencida
            {atrasadas.length === 1 ? '' : 's'} de semanas anteriores:
          </b>{' '}
          {atrasadas.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ' · '}
              <button type="button" className="underline" onClick={() => onOpen(t.id)}>
                {t.titulo}
              </button>
            </span>
          ))}
        </Notice>
      )}
      <div className="grid gap-2 lg:grid-cols-7">
        {dias.map((d) => {
          const xs = ordenar(
            tareas.filter((t) => t.datos.vence === d && t.estado !== 'cancelada'),
            now,
          )
          const esHoy = d === hoy
          return (
            <section
              key={d}
              aria-label={fmtDia(d, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              className={cx('min-w-0 rounded-xl border bg-surface p-2', esHoy ? 'border-brand' : 'border-line')}
            >
              <h3 className={cx('mb-1.5 flex items-baseline gap-1.5 text-xs font-semibold uppercase tracking-wide', esHoy ? 'text-brand' : 'text-muted')}>
                {fmtDia(d, { weekday: 'short' })} <span className="text-base text-ink">{Number(d.slice(8))}</span>
                {esHoy && <span className="normal-case">· hoy</span>}
              </h3>
              {xs.length === 0 ? (
                <p className="text-xs text-muted lg:py-2">—</p>
              ) : (
                <ul className="space-y-1.5">
                  {xs.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(t.id)}
                        className={cx(
                          'w-full rounded-md border-l-4 bg-surface-2 px-2 py-1 text-left text-xs',
                          t.estado === 'hecha'
                            ? 'border-ok text-muted line-through'
                            : vencida(t, now)
                              ? 'border-danger'
                              : t.datos.prioridad === 'urgente' || t.datos.prioridad === 'alta'
                                ? 'border-warn'
                                : 'border-brand',
                        )}
                      >
                        <span className="block break-words font-medium">{t.titulo}</span>
                        {t.datos.asignadoNombre && <span className="block truncate text-muted">{t.datos.asignadoNombre}</span>}
                        {t.patientId && pacientes.get(t.patientId) && <span className="block truncate text-muted">{nombreCompleto(pacientes.get(t.patientId)!)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
      {sinFecha.length > 0 && (
        <p className="text-xs text-muted">
          {sinFecha.length} tarea{sinFecha.length === 1 ? '' : 's'} pendiente
          {sinFecha.length === 1 ? '' : 's'} sin fecha límite (ver «Lista»).
        </p>
      )}
    </div>
  )
}

function fmtDia(ymd: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', opts)
}
