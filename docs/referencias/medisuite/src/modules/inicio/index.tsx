import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import {
  Activity, ArrowRight, Bluetooth, Calculator, CalendarDays, CalendarPlus, ClipboardList, FilePen, FileText, FlaskConical,
  Stethoscope, UserPlus, Users, Wallet, Clock, CheckCircle2, DoorOpen, ListTodo, type LucideIcon,
} from 'lucide-react'
import type { EstadoCita } from '../../lib/types'
import { setActivePatient, update, useCollection, useDB, useSettings } from '../../lib/store'
import { cx, fmtFecha, mxn, nombreCompleto, edad } from '../../lib/utils'
import { Avatar, Badge, Button, Card, Empty } from '../../components/ui'
import { ESTADOS, TIPOS, esHoy, hora24 } from '../agenda/estados'
import { BotonRecordatorio, EstadoRecordatorio } from '../agenda/Recordatorio'
import { ultimoPorCita, useMensajes } from '../../lib/mensajes'
import { canOpenPath } from '../registry'
import { can, useSession } from '../../lib/session'
import { canReadRegistro } from '../../lib/registros'

const ACCESOS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/consulta/nueva', label: 'Nueva consulta', icon: Stethoscope },
  { to: '/receta', label: 'Receta', icon: FileText },
  { to: '/pacientes/nuevo', label: 'Nuevo paciente', icon: UserPlus },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/vitales', label: 'Signos vitales', icon: Bluetooth },
  { to: '/calculadoras', label: 'Calculadoras', icon: Calculator },
  { to: '/escalas', label: 'Escalas', icon: ClipboardList },
  { to: '/caja', label: 'Caja', icon: Wallet },
]

const ACCIONES: { estado: EstadoCita; label: string; icon: LucideIcon }[] = [
  { estado: 'en-sala', label: 'En sala', icon: DoorOpen },
  { estado: 'en-consulta', label: 'En consulta', icon: Stethoscope },
  { estado: 'atendida', label: 'Atendida', icon: CheckCircle2 },
]

function saludo() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export default function Inicio() {
  const ses = useSession()
  const puede = (to: string) => canOpenPath(to, ses.mode, ses.user) && (!to.startsWith('/consulta/nueva') || can('notas.escribir', ses.user))
  const db = useDB()
  const settings = useSettings()
  const nav = useNavigate()
  const mensajes = useMensajes()
  const ultimo = useMemo(() => ultimoPorCita(mensajes), [mensajes])
  const citasHoy = useCollection('appointments', (a) => esHoy(a.inicio) && a.estado !== 'cancelada')
  const hoy = useMemo(() => [...citasHoy].sort((a, b) => a.inicio.localeCompare(b.inicio)), [citasHoy])
  const pmap = useMemo(() => new Map(db.patients.map((p) => [p.id, p])), [db.patients])

  const stats = useMemo(() => {
    const now = new Date()
    const mes = (d: Date) => d.getFullYear() * 12 + d.getMonth()
    const m = mes(now)
    let ingresos = 0
    let anterior = 0
    const porMes = new Map<number, number>()
    for (const p of db.payments) {
      const d = new Date(p.fecha)
      const k = mes(d)
      porMes.set(k, (porMes.get(k) ?? 0) + p.monto)
      if (k === m) ingresos += p.monto
      // mismo periodo del mes anterior, para comparar justo
      if (k === m - 1 && d.getDate() <= now.getDate()) anterior += p.monto
    }
    const serie = Array.from({ length: 6 }, (_, i) => {
      const k = m - 5 + i
      const d = new Date(Math.floor(k / 12), k % 12, 1)
      return { mes: d.toLocaleDateString('es-MX', { month: 'short' }), total: porMes.get(k) ?? 0 }
    })
    const sinFirmar = db.encounters.filter((e) => !e.firmada)
    const porCerrar = db.appointments.filter(
      (a) => new Date(a.fin) < now && ['agendada', 'confirmada', 'en-sala', 'en-consulta'].includes(a.estado) && now.getTime() - new Date(a.fin).getTime() < 7 * 864e5,
    )
    const nuevos = db.patients.filter((p) => mes(new Date(p.creado)) === m).length
    return { ingresos, anterior, serie, sinFirmar, porCerrar, nuevos }
  }, [db])

  const atendidas = hoy.filter((c) => c.estado === 'atendida').length
  const enSala = hoy.filter((c) => c.estado === 'en-sala').length
  const delta = stats.anterior ? Math.round(((stats.ingresos - stats.anterior) / stats.anterior) * 100) : null

  const actividad = useMemo(() => {
    type Item = { fecha: string; icon: LucideIcon; texto: string; pid: string; to: string }
    const items: Item[] = []
    for (const e of db.encounters)
      items.push({ fecha: e.firmadaEn ?? e.fecha, icon: FilePen, texto: `${e.firmada ? 'Nota firmada' : 'Borrador de nota'}: ${e.motivo || e.plantilla}`, pid: e.patientId, to: '/consulta/' + e.id })
    for (const r of db.prescriptions) items.push({ fecha: r.fecha, icon: FileText, texto: `Receta ${r.folio} · ${r.items.length} medicamento(s)`, pid: r.patientId, to: '/pacientes/' + r.patientId })
    for (const p of db.payments.slice(-15)) items.push({ fecha: p.fecha, icon: Wallet, texto: `Pago ${mxn.format(p.monto)} · ${p.concepto}`, pid: p.patientId, to: '/caja' })
    for (const d of db.documents) items.push({ fecha: d.fecha, icon: FlaskConical, texto: `Documento: ${d.nombre}`, pid: d.patientId, to: '/pacientes/' + d.patientId })
    // observaciones agrupadas por paciente y día
    const vistos = new Set<string>()
    const obsRecientes = [...db.observations].sort((a, b) => b.fecha.localeCompare(a.fecha))
    for (const o of obsRecientes) {
      if (vistos.size >= 3) break
      const k = o.patientId + o.fecha.slice(0, 10)
      if (vistos.has(k)) continue
      vistos.add(k)
      items.push({ fecha: o.fecha, icon: Activity, texto: 'Registro de signos / laboratorios', pid: o.patientId, to: '/pacientes/' + o.patientId })
    }
    const ahora = Date.now()
    return items
      .filter((i) => new Date(i.fecha).getTime() <= ahora + 60000)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 8)
  }, [db])

  const fechaLarga = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      {/* Encabezado */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-brand-soft/70 to-transparent p-5">
          <div className="min-w-[220px] flex-1">
            <div className="text-sm text-muted">{fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}</div>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
              {saludo()}, {settings.doctor.nombre.split(' ').slice(0, 2).join(' ')}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {hoy.length === 0
                ? 'No tienes citas programadas para hoy.'
                : `Tienes ${hoy.length} cita${hoy.length > 1 ? 's' : ''} hoy · ${atendidas} atendida${atendidas === 1 ? '' : 's'}${enSala ? ` · ${enSala} en sala` : ''}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {puede('/consulta/nueva') && (
              <Button variant="primary" onClick={() => nav('/consulta/nueva')}>
                <Stethoscope className="size-4" /> Nueva consulta
              </Button>
            )}
            <Button onClick={() => nav('/agenda')}>
              <CalendarPlus className="size-4" /> Agendar
            </Button>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={CalendarDays} label="Citas hoy" value={hoy.length} sub={`${atendidas} atendidas · ${hoy.length - atendidas} pendientes`} />
        <Kpi icon={Users} label="Pacientes" value={db.patients.length} sub={`${stats.nuevos} nuevos este mes`} />
        <Kpi
          icon={Wallet}
          label="Ingresos del mes"
          value={mxn.format(stats.ingresos)}
          sub={
            delta === null ? (
              'sin datos del mes anterior'
            ) : (
              <span className={delta >= 0 ? 'text-ok' : 'text-danger'}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs. mismo periodo
              </span>
            )
          }
        />
        <Kpi
          icon={Clock}
          label="Pendientes"
          value={stats.sinFirmar.length + stats.porCerrar.length}
          tone={stats.sinFirmar.length + stats.porCerrar.length ? 'warn' : undefined}
          sub={`${stats.sinFirmar.length} notas sin firmar · ${stats.porCerrar.length} citas sin cerrar`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <Card
            title="Citas de hoy"
            pad={false}
            actions={
              <Link to="/agenda" className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                Ver agenda <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            {hoy.length === 0 ? (
              <div className="p-4">
                <Empty>Sin citas hoy. Aprovecha para revisar notas pendientes.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {hoy.map((c) => {
                  const p = pmap.get(c.patientId)
                  const est = ESTADOS[c.estado]
                  const m = ultimo.get(c.id)
                  return (
                    <li key={c.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-3', c.estado === 'en-consulta' && 'bg-brand-soft/30')}>
                      <div className="w-12 shrink-0 text-center">
                        <div className="text-sm font-semibold tabular-nums">{hora24(c.inicio)}</div>
                        <div className="mx-auto mt-1 h-1 w-6 rounded-full" style={{ background: est.color }} />
                      </div>
                      {p && <Avatar p={p} size={36} />}
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          if (!p) return
                          setActivePatient(p.id)
                          nav('/pacientes/' + p.id)
                        }}
                      >
                        <div className="truncate font-medium">{p ? nombreCompleto(p) : 'Paciente eliminado'}</div>
                        <div className="truncate text-xs text-muted">
                          {p && edad(p.fechaNac).texto} · {TIPOS[c.tipo]}
                          {c.motivo ? ` · ${c.motivo}` : ''}
                          {p && p.alergias.length > 0 && <span className="ml-1 font-medium text-danger">· Alergias: {p.alergias.join(', ')}</span>}
                        </div>
                      </button>
                      <Badge tone={est.tone}>{est.label}</Badge>
                      <EstadoRecordatorio m={m} />
                      {c.reagendar && <Badge tone="warn">Pidió reagendar</Badge>}
                      <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
                        {ACCIONES.map((a) => (
                          <button
                            key={a.estado}
                            title={a.label}
                            onClick={() => {
                              update('appointments', c.id, { estado: a.estado })
                              if (a.estado === 'en-consulta' && p) {
                                setActivePatient(p.id)
                                nav('/consulta/nueva?p=' + p.id)
                              }
                            }}
                            className={cx(
                              'inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition',
                              c.estado === a.estado ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line hover:bg-surface-2',
                            )}
                          >
                            <a.icon className="size-3.5" />
                            <span className="lg:hidden xl:inline">{a.label}</span>
                          </button>
                        ))}
                        {p && ['agendada', 'confirmada'].includes(c.estado) && (
                          <span className="rounded-lg border border-line">
                            <BotonRecordatorio c={c} p={p} settings={settings} compact mensaje={m} />
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card title="Ingresos de los últimos 6 meses" actions={<Link to="/reportes" className="text-xs font-medium text-brand">Reportes</Link>}>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.serie} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'var(--color-surface-2)' }}
                    formatter={(v) => [mxn.format(Number(v)), 'Ingresos']}
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--color-ink)' }}
                  />
                  <Bar dataKey="total" fill="var(--color-brand)" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card title="Accesos rápidos">
            <div className="grid grid-cols-4 gap-2 lg:grid-cols-4">
              {ACCESOS.filter((a) => puede(a.to)).map((a) => (
                <Link key={a.to} to={a.to} className="group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center hover:bg-surface-2">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-strong transition group-hover:scale-105">
                    <a.icon className="size-5" />
                  </span>
                  <span className="text-[11px] font-medium leading-tight">{a.label}</span>
                </Link>
              ))}
            </div>
          </Card>

          <OrdenesTareas />

          <Card title="Pendientes" pad={false}>
            {stats.sinFirmar.length + stats.porCerrar.length === 0 ? (
              <p className="p-4 text-sm text-muted">Todo al día.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {stats.sinFirmar.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <Link to={'/consulta/' + e.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2">
                      <FilePen className="size-4 shrink-0 text-warn" />
                      <span className="min-w-0 flex-1 truncate">
                        Firmar nota · {pmap.get(e.patientId) ? nombreCompleto(pmap.get(e.patientId)!) : '—'}
                      </span>
                      <span className="text-xs text-muted">{fmtFecha(e.fecha, { day: '2-digit', month: 'short' })}</span>
                    </Link>
                  </li>
                ))}
                {stats.porCerrar.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link to="/agenda" className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2">
                      <CalendarDays className="size-4 shrink-0 text-warn" />
                      <span className="min-w-0 flex-1 truncate">
                        Cerrar cita · {pmap.get(a.patientId) ? nombreCompleto(pmap.get(a.patientId)!) : '—'}
                      </span>
                      <span className="text-xs text-muted">
                        {fmtFecha(a.inicio, { day: '2-digit', month: 'short' })} {hora24(a.inicio)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Actividad reciente" pad={false}>
            {actividad.length === 0 ? (
              <p className="p-4 text-sm text-muted">Sin actividad.</p>
            ) : (
              <ol className="relative px-4 py-3">
                {actividad.map((a, i) => {
                  const p = pmap.get(a.pid)
                  return (
                    <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                      {i < actividad.length - 1 && <span className="absolute top-7 bottom-0 left-[13px] w-px bg-line" />}
                      <span className="z-10 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-muted">
                        <a.icon className="size-3.5" />
                      </span>
                      <Link to={a.to} onClick={() => p && setActivePatient(p.id)} className="min-w-0 flex-1 hover:underline">
                        <div className="truncate text-sm">{a.texto}</div>
                        <div className="truncate text-xs text-muted">
                          {p ? nombreCompleto(p) : '—'} · {relativo(a.fecha)}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * Órdenes de estudios pendientes y tareas abiertas (registros `orden` con estado 'pendiente' y `tarea` con estado
 * 'abierta'; con sesión, solo las asignadas a mí — `datos.asignadoA` — o sin asignar). Solo los tipos que el rol lee.
 */
function OrdenesTareas() {
  const ses = useSession()
  const regs = useCollection('registros')
  const verOrdenes = canReadRegistro(ses.user?.rol, 'orden') && canOpenPath('/ordenes', ses.mode, ses.user)
  const verTareas = canReadRegistro(ses.user?.rol, 'tarea') && canOpenPath('/tareas', ses.mode, ses.user)
  const { ordenes, tareas } = useMemo(() => {
    let ordenes = 0
    let tareas = 0
    const yo = ses.user?.id
    for (const r of regs) {
      if (r.tipo === 'orden' && r.estado === 'pendiente') ordenes++
      else if (r.tipo === 'tarea' && r.estado === 'abierta') {
        const asignado = r.datos?.asignadoA
        if (!yo || !asignado || asignado === yo) tareas++
      }
    }
    return { ordenes, tareas }
  }, [regs, ses.user?.id])
  if (!verOrdenes && !verTareas) return null
  const filas = [
    verOrdenes && { to: '/ordenes', icon: FlaskConical, label: 'Órdenes de estudios pendientes', n: ordenes },
    verTareas && { to: '/tareas', icon: ListTodo, label: ses.user ? 'Tareas abiertas para mí o sin asignar' : 'Tareas abiertas', n: tareas },
  ].filter(Boolean) as { to: string; icon: LucideIcon; label: string; n: number }[]
  return (
    <Card title="Órdenes y tareas" pad={false}>
      <ul className="divide-y divide-line text-sm">
        {filas.map((f) => (
          <li key={f.to}>
            <Link to={f.to} className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2">
              <f.icon className={cx('size-4 shrink-0', f.n ? 'text-warn' : 'text-muted')} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{f.label}</span>
              <Badge tone={f.n ? 'warn' : 'neutral'}>{f.n}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={cx('grid size-8 place-items-center rounded-lg', tone === 'warn' ? 'bg-warn/15 text-warn' : 'bg-brand-soft text-brand-strong')}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

function relativo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'justo ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `hace ${d} día${d > 1 ? 's' : ''}`
  return fmtFecha(iso)
}
