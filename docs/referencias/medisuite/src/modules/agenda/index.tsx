import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import classicTheme from '@fullcalendar/react/themes/classic'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import esLocale from '@fullcalendar/react/locales/es'
import type { EventChangeInfo, EventInput } from '@fullcalendar/react'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import './agenda.css'
import { ArrowRight, CalendarClock, CalendarPlus, MessageCircle, Send, Stethoscope, Video } from 'lucide-react'
import type { Appointment, EstadoCita } from '../../lib/types'
import { update, useActivePatient, useCollection, useSettings, setActivePatient } from '../../lib/store'
import { cx, nombreCompleto } from '../../lib/utils'
import { Badge, Button, Card, Empty, Page } from '../../components/ui'
import { ESTADOS, TIPOS, esHoy, hora24, siguienteEstado, tituloCita } from './estados'
import { BotonRecordatorio, EstadoRecordatorio, SenalesCita } from './Recordatorio'
import { ultimoPorCita, useMensajes } from '../../lib/mensajes'
import { isServer } from '../../lib/api'
import { CitaModal, type Borrador } from './CitaModal'

export default function Agenda() {
  const citas = useCollection('appointments')
  const patients = useCollection('patients')
  const settings = useSettings()
  const { id: activeId } = useActivePatient()
  const [params] = useSearchParams()
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [verCanceladas, setVerCanceladas] = useState(false)
  const movil = useRef(typeof window !== 'undefined' && window.innerWidth < 640).current
  const pmap = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients])

  const eventos: EventInput[] = useMemo(
    () =>
      citas
        .filter((c) => verCanceladas || c.estado !== 'cancelada')
        .map((c) => ({
          id: c.id,
          title: tituloCita(pmap.get(c.patientId)),
          start: c.inicio,
          end: c.fin,
          color: ESTADOS[c.estado].color,
          contrastColor: '#ffffff',
          classNames: c.estado === 'cancelada' || c.estado === 'no-asistio' ? ['ag-inactiva'] : [],
          extendedProps: { tipo: c.tipo, motivo: c.motivo, estado: c.estado, reagendar: !!c.reagendar },
        })),
    [citas, pmap, verCanceladas],
  )

  const nueva = (inicio: Date, minutos = 30) =>
    setBorrador({ patientId: params.get('p') ?? activeId ?? '', inicio, minutos, tipo: 'subsecuente', motivo: '', estado: 'agendada' })

  const editar = (c: Appointment) =>
    setBorrador({
      id: c.id,
      patientId: c.patientId,
      inicio: new Date(c.inicio),
      minutos: Math.max(5, Math.round((new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 60000)),
      tipo: c.tipo,
      motivo: c.motivo ?? '',
      estado: c.estado,
      notas: c.notas,
    })

  const mover = (info: EventChangeInfo) => {
    const { start, end } = info.event
    if (!start) return info.revert()
    update('appointments', info.event.id, {
      inicio: start.toISOString(),
      fin: (end ?? new Date(start.getTime() + 30 * 60000)).toISOString(),
    })
  }

  return (
    <Page
      title="Agenda"
      subtitle="Arrastra para mover, estira para cambiar la duración y haz clic en un espacio libre para agendar."
      actions={
        <>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} /> Ver canceladas
          </label>
          <Button
            variant="primary"
            onClick={() => {
              const d = new Date()
              d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
              nueva(d)
            }}
          >
            <CalendarPlus className="size-4" /> Nueva cita
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="agenda-cal min-w-0 rounded-xl border border-line bg-surface p-2 shadow-sm sm:p-3">
          <FullCalendar
            plugins={[classicTheme, dayGridPlugin, timeGridPlugin, interactionPlugin]}
            locale={esLocale}
            colorScheme={settings.tema === 'oscuro' ? 'dark' : 'light'}
            initialView={movil ? 'timeGridDay' : 'timeGridWeek'}
            headerToolbar={{ start: 'prev,next today', center: 'title', end: 'dayGridMonth,timeGridWeek,timeGridDay' }}
            todayHint="Hoy"
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            slotDuration="00:30:00"
            slotHeaderFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            displayEventEnd={false}
            snapDuration="00:15:00"
            scrollTime="08:00:00"
            allDaySlot={false}
            nowIndicator
            height="auto"
            expandRows
            businessHours={{ daysOfWeek: [1, 2, 3, 4, 5, 6], startTime: '09:00', endTime: '19:00' }}
            dayMaxEvents={4}
            editable
            selectable
            selectMirror
            events={eventos}
            select={(s) => {
              const ini = new Date(s.start)
              if (s.allDay) {
                ini.setHours(9, 0, 0, 0)
                return nueva(ini, 30)
              }
              const min = Math.round((s.end.getTime() - s.start.getTime()) / 60000)
              nueva(ini, min <= 15 ? 30 : min)
            }}
            eventClick={(i) => {
              const c = citas.find((x) => x.id === i.event.id)
              if (c) editar(c)
            }}
            eventDrop={mover}
            eventResize={mover}
            eventContent={(arg) => {
              const tipo = arg.event.extendedProps.tipo as Appointment['tipo']
              return (
                <div className="ag-ev">
                  <div className="ag-ev-t">
                    {tipo === 'telemedicina' && <Video className="mr-1 inline size-3" />}
                    {arg.event.extendedProps.reagendar && <CalendarClock className="mr-1 inline size-3" aria-label="Pidió reagendar" />}
                    {arg.timeText && <b className="mr-1">{arg.timeText}</b>}
                    {arg.event.title}
                  </div>
                  {!arg.isShort && <div className="ag-ev-m">{(arg.event.extendedProps.motivo as string) || TIPOS[tipo]}</div>}
                </div>
              )
            }}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-3 text-xs text-muted">
            {Object.entries(ESTADOS).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-full" style={{ background: v.color }} />
                {v.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <Video className="size-3" /> Telemedicina
            </span>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <PorReagendar onEditar={editar} />
          <SalaEspera onEditar={editar} />
        </div>
      </div>
      {borrador && <CitaModal inicial={borrador} onClose={() => setBorrador(null)} />}
    </Page>
  )
}

const COLUMNAS: { titulo: string; estados: EstadoCita[] }[] = [
  { titulo: 'Por llegar', estados: ['agendada', 'confirmada'] },
  { titulo: 'En sala', estados: ['en-sala'] },
  { titulo: 'En consulta', estados: ['en-consulta'] },
  { titulo: 'Atendidos', estados: ['atendida', 'no-asistio'] },
]

/** Citas cuyo paciente pidió reagendar por WhatsApp (pendientes de resolver por recepción). */
function PorReagendar({ onEditar }: { onEditar: (c: Appointment) => void }) {
  const citas = useCollection('appointments', (c) => !!c.reagendar && c.estado !== 'cancelada')
  const patients = useCollection('patients')
  if (!citas.length) return null
  return (
    <Card title="Pidieron reagendar" actions={<Badge tone="warn">{citas.length}</Badge>} pad={false}>
      <ul className="divide-y divide-line">
        {[...citas]
          .sort((a, b) => a.inicio.localeCompare(b.inicio))
          .map((c) => {
            const p = patients.find((x) => x.id === c.patientId)
            return (
              <li key={c.id} className="px-4 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{p ? nombreCompleto(p) : '—'}</span>
                  <span className="shrink-0 text-xs text-muted">{new Date(c.inicio).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <SenalesCita c={c} onReprogramar={() => onEditar(c)} compact />
                </div>
              </li>
            )
          })}
      </ul>
    </Card>
  )
}

function SalaEspera({ onEditar }: { onEditar: (c: Appointment) => void }) {
  const citas = useCollection('appointments', (c) => esHoy(c.inicio) && c.estado !== 'cancelada')
  const patients = useCollection('patients')
  const settings = useSettings()
  const mensajes = useMensajes()
  const ultimo = useMemo(() => ultimoPorCita(mensajes), [mensajes])
  const server = isServer()
  const nav = useNavigate()
  const hoy = [...citas].sort((a, b) => a.inicio.localeCompare(b.inicio))

  return (
    <Card title="Sala de espera · hoy" actions={<Badge tone="brand">{hoy.length} citas</Badge>} pad={false}>
      {hoy.length === 0 && (
        <div className="p-4">
          <Empty>No hay citas para hoy.</Empty>
        </div>
      )}
      {hoy.length > 0 &&
        COLUMNAS.map((col) => {
          const items = hoy.filter((c) => col.estados.includes(c.estado))
          return (
            <div key={col.titulo} className="border-b border-line last:border-0">
              <div className="flex items-center justify-between bg-surface-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                {col.titulo}
                <span>{items.length}</span>
              </div>
              {items.length === 0 && <div className="px-4 py-2 text-xs text-muted">—</div>}
              <ul>
                {items.map((c) => {
                  const p = patients.find((x) => x.id === c.patientId)
                  const sig = siguienteEstado(c.estado)
                  const m = ultimo.get(c.id)
                  return (
                    <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                      <span className="w-11 shrink-0 text-xs font-semibold tabular-nums">{hora24(c.inicio)}</span>
                      <button className="min-w-0 flex-1 text-left" onClick={() => onEditar(c)}>
                        <div className={cx('truncate text-sm font-medium', c.estado === 'no-asistio' && 'text-muted line-through')}>{p ? nombreCompleto(p) : '—'}</div>
                        <div className="truncate text-xs text-muted">{c.motivo || TIPOS[c.tipo]}</div>
                        {(m || c.reagendar || c.confirmacion) && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <EstadoRecordatorio m={m} />
                            {c.reagendar && <Badge tone="warn">Pidió reagendar</Badge>}
                            {c.confirmacion && <Badge tone="ok">Confirmó</Badge>}
                          </div>
                        )}
                      </button>
                      {p && col.titulo === 'Por llegar' && <BotonRecordatorio c={c} p={p} settings={settings} compact mensaje={m} />}
                      {sig && (
                        <Button
                          size="sm"
                          variant={sig === 'en-consulta' ? 'primary' : 'secondary'}
                          title={`Pasar a: ${ESTADOS[sig].label}`}
                          onClick={() => {
                            update('appointments', c.id, { estado: sig })
                            if (sig === 'en-consulta' && p) {
                              setActivePatient(p.id)
                              nav('/consulta/nueva?p=' + p.id)
                            }
                          }}
                        >
                          {sig === 'en-consulta' ? <Stethoscope className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                          <span className="hidden sm:inline">{ESTADOS[sig].label}</span>
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      <p className="border-t border-line px-4 py-3 text-xs text-muted">
        {server ? (
          <>
            El botón <Send className="inline size-3 text-ok" aria-hidden /> envía el recordatorio ahora por WhatsApp (o correo); el servidor además los manda automáticamente antes de
            cada cita. El paciente puede confirmar o pedir reagendar desde el mensaje.
          </>
        ) : (
          <>
            El botón <MessageCircle className="inline size-3 text-ok" aria-hidden /> abre WhatsApp con el recordatorio listo para enviar. El envío automático requiere configurar
            WhatsApp Cloud API (plantillas aprobadas por Meta) en el servidor.
          </>
        )}
      </p>
    </Card>
  )
}
