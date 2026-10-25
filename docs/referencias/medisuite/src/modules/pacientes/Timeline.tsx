import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, Apple, Baby, CalendarDays, ClipboardList, ClipboardPlus, Ear, Eye, FileBadge, FilePen, FileText, FlaskConical, ListTodo, Milestone, Package,
  Paperclip, Send, ShieldCheck, Siren, Syringe, ThumbsUp, Wallet, type LucideIcon,
} from 'lucide-react'
import type { Patient } from '../../lib/types'
import { setActivePatient, useDB } from '../../lib/store'
import { REGISTRO_INFO, registroLabel } from '../../lib/registros'
import { useSession } from '../../lib/session'
import { canOpenPath } from '../registry'
import { OBS_LABELS, cx, fmtFecha, fmtHora, mxn } from '../../lib/utils'
import { Empty } from '../../components/ui'
import { ESTADOS, TIPOS } from '../agenda/estados'
import { sinEncabezados } from './texto'

type Kind = 'nota' | 'receta' | 'obs' | 'doc' | 'registro' | 'cita' | 'pago'
type Item = { fecha: string; kind: Kind; titulo: string; detalle?: string; to?: string; icon?: LucideIcon; id?: string }

/** Icono por tipo de registro (herramientas de especialidad y operación). */
const ICONO_REGISTRO: Record<string, LucideIcon> = {
  prenatal: Baby,
  vacuna: Syringe,
  desarrollo: Milestone,
  'agudeza-visual': Eye,
  audiometria: Ear,
  tamizaje: ShieldCheck,
  triaje: Siren,
  enfermeria: ClipboardPlus,
  nutricion: Apple,
  orden: FlaskConical,
  certificado: FileBadge,
  referencia: Send,
  inventario: Package,
  'movimiento-inventario': Package,
  tarea: ListTodo,
  encuesta: ThumbsUp,
}

const KINDS: Record<Kind, { label: string; icon: LucideIcon; cls: string }> = {
  nota: { label: 'Notas', icon: FilePen, cls: 'bg-brand-soft text-brand-strong' },
  receta: { label: 'Recetas', icon: FileText, cls: 'bg-ok/15 text-ok' },
  obs: { label: 'Mediciones', icon: Activity, cls: 'bg-warn/15 text-warn' },
  doc: { label: 'Documentos', icon: Paperclip, cls: 'bg-surface-2 text-ink' },
  registro: { label: 'Herramientas', icon: ClipboardList, cls: 'bg-brand-soft text-brand' },
  cita: { label: 'Citas', icon: CalendarDays, cls: 'bg-surface-2 text-muted' },
  pago: { label: 'Pagos', icon: Wallet, cls: 'bg-surface-2 text-muted' },
}

const etiqueta = (codigo: string, etq?: string) => etq ?? OBS_LABELS[codigo]?.label ?? codigo

export default function Timeline({ p }: { p: Patient }) {
  const db = useDB()
  const ses = useSession()
  const [activos, setActivos] = useState<Set<Kind>>(new Set(['nota', 'receta', 'obs', 'doc', 'registro', 'cita']))

  const grupos = useMemo(() => {
    const it: Item[] = []
    for (const e of db.encounters.filter((x) => x.patientId === p.id))
      it.push({
        fecha: e.fecha, kind: 'nota', to: '/consulta/' + e.id,
        titulo: `${e.motivo || 'Nota clínica'} · ${e.plantilla}${e.firmada ? '' : ' (borrador)'}`,
        detalle: e.diagnosticos.map((d) => `${d.codigo} ${d.nombre}`).join(' · ') || sinEncabezados(e.analisis),
      })
    for (const r of db.prescriptions.filter((x) => x.patientId === p.id))
      it.push({ fecha: r.fecha, kind: 'receta', titulo: `Receta ${r.folio}`, detalle: r.items.map((i) => `${i.medicamento} ${i.dosis} ${i.frecuencia}`).join(' · ') })
    for (const d of db.documents.filter((x) => x.patientId === p.id))
      it.push({ fecha: d.fecha, kind: 'doc', titulo: d.nombre, detalle: d.tipo, to: `/pacientes/${p.id}?tab=documentos` })
    for (const r of db.registros.filter((x) => x.patientId === p.id)) {
      const info = REGISTRO_INFO[r.tipo]
      it.push({
        fecha: r.fecha, kind: 'registro', id: r.id, to: info && canOpenPath(info.ruta, ses.mode, ses.user) ? info.ruta : undefined, icon: ICONO_REGISTRO[r.tipo],
        titulo: r.titulo || registroLabel(r.tipo),
        detalle: [r.titulo ? registroLabel(r.tipo) : '', r.estado ?? ''].filter(Boolean).join(' · ') || undefined,
      })
    }
    for (const a of db.appointments.filter((x) => x.patientId === p.id))
      it.push({ fecha: a.inicio, kind: 'cita', titulo: `Cita ${TIPOS[a.tipo].toLowerCase()} · ${ESTADOS[a.estado].label}`, detalle: `${fmtHora(a.inicio)}${a.motivo ? ' · ' + a.motivo : ''}` })
    for (const pg of db.payments.filter((x) => x.patientId === p.id))
      it.push({ fecha: pg.fecha, kind: 'pago', titulo: `${pg.concepto} · ${mxn.format(pg.monto)}`, detalle: pg.metodo })
    // observaciones agrupadas por día
    const porDia = new Map<string, typeof db.observations>()
    for (const o of db.observations.filter((x) => x.patientId === p.id)) {
      const k = o.fecha.slice(0, 10)
      porDia.set(k, [...(porDia.get(k) ?? []), o])
    }
    for (const obs of porDia.values()) {
      const pas = obs.find((o) => o.codigo === 'pas')
      const pad = obs.find((o) => o.codigo === 'pad')
      const partes = obs
        .filter((o) => !(pas && pad && (o.codigo === 'pas' || o.codigo === 'pad')))
        .map((o) => `${etiqueta(o.codigo, o.etiqueta)} ${o.valor} ${o.unidad}`)
      if (pas && pad) partes.unshift(`PA ${pas.valor}/${pad.valor} mmHg`)
      it.push({ fecha: obs[0].fecha, kind: 'obs', titulo: `${obs.length} medición(es)`, detalle: partes.join(' · '), to: `/pacientes/${p.id}?tab=signos` })
    }
    const fil = it.filter((i) => activos.has(i.kind)).sort((a, b) => b.fecha.localeCompare(a.fecha))
    const g = new Map<string, Item[]>()
    for (const i of fil) {
      const d = new Date(i.fecha)
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      g.set(k, [...(g.get(k) ?? []), i])
    }
    return [...g.values()]
  }, [db, p.id, activos, ses.mode, ses.user])

  const toggle = (k: Kind) => setActivos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const hoy = new Date().toISOString()

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(KINDS) as Kind[]).map((k) => {
          const K = KINDS[k]
          return (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium', activos.has(k) ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-muted')}
            >
              <K.icon className="size-3.5" /> {K.label}
            </button>
          )
        })}
      </div>
      {grupos.length === 0 ? (
        <Empty>Sin eventos para los filtros elegidos.</Empty>
      ) : (
        <ol className="space-y-5">
          {grupos.map((items) => (
            <li key={items[0].fecha} className="grid gap-2 sm:grid-cols-[120px_1fr]">
              <div className="text-sm font-semibold sm:pt-2 sm:text-right">
                {fmtFecha(items[0].fecha)}
                {items[0].fecha > hoy && <span className="ml-1 text-xs font-normal text-brand">(próxima)</span>}
              </div>
              <ul className="space-y-2 border-l-2 border-line pl-4">
                {items.map((i, n) => {
                  const K = KINDS[i.kind]
                  const Icon = i.icon ?? K.icon
                  const body = (
                    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 shadow-sm transition hover:border-brand/40">
                      <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', K.cls)}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{i.titulo}</div>
                        {i.detalle && <div className="mt-0.5 text-xs break-words text-muted">{i.detalle}</div>}
                      </div>
                    </div>
                  )
                  return (
                    <li key={i.id ?? n}>
                      {i.to ? (
                        // Las herramientas trabajan con el paciente activo: se fija antes de navegar.
                        <Link to={i.to} onClick={() => setActivePatient(p.id)} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
