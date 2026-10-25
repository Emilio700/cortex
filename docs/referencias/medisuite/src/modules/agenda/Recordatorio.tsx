// Recordatorio de una cita: en modo servidor envía con WhatsApp Cloud API/correo y muestra su estado;
// en demo (o sin canal configurado) usa la liga wa.me con el mensaje prellenado.
import { useState } from 'react'
import { CalendarClock, Check, CheckCheck, Loader2, MessageCircle, Send } from 'lucide-react'
import { Badge, Button } from '../../components/ui'
import { isServer } from '../../lib/api'
import { ESTADO_MENSAJE, enviarRecordatorio, puedeVerMensajes } from '../../lib/mensajes'
import { update } from '../../lib/store'
import type { Appointment, Mensaje, Patient, Settings } from '../../lib/types'
import { cx, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { ligaWhatsApp } from './estados'

const VIGENTE = (c: Appointment) => !['cancelada', 'atendida', 'no-asistio'].includes(c.estado)

/** Insignia con el estado del último recordatorio de la cita. */
export function EstadoRecordatorio({ m, className }: { m?: Mensaje; className?: string }) {
  if (!m) return null
  const e = ESTADO_MENSAJE[m.estado] ?? { label: m.estado, tone: 'neutral' as const }
  const Icon = m.estado === 'leido' || m.estado === 'respondido' ? CheckCheck : m.estado === 'entregado' ? CheckCheck : Check
  const titulo = `${m.canal === 'email' ? 'Correo' : 'WhatsApp'} · ${e.label}${m.enviadoEn ? ' · ' + fmtFechaHora(m.enviadoEn) : ''}${m.error ? ' · ' + m.error : ''}${m.respuesta ? ' · respondió ' + m.respuesta : ''}`
  return (
    <span className={cx('inline-flex', className)} title={titulo}>
      <Badge tone={e.tone}>
        <Icon className="mr-0.5 size-3" aria-hidden />
        <span className="sr-only">Recordatorio: </span>
        {e.label}
      </Badge>
    </span>
  )
}

/** Señales de la cita que vienen de WhatsApp: pidió reagendar / confirmó. */
export function SenalesCita({ c, onReprogramar, compact }: { c: Appointment; onReprogramar?: () => void; compact?: boolean }) {
  return (
    <>
      {c.reagendar && (
        <span className="inline-flex items-center gap-1">
          <Badge tone="warn">
            <CalendarClock className="mr-0.5 size-3" aria-hidden /> Pidió reagendar
          </Badge>
          {onReprogramar && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={onReprogramar}>
              Reprogramar
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 px-1.5" title="Marcar como resuelto" onClick={() => update('appointments', c.id, { reagendar: false })}>
            {compact ? <Check className="size-3.5" aria-label="Marcar reagendar como resuelto" /> : 'Resuelto'}
          </Button>
        </span>
      )}
      {c.confirmacion && !compact && (
        <span className="text-xs text-ok" title={fmtFechaHora(c.confirmacion.fecha)}>
          Confirmó por {c.confirmacion.canal === 'whatsapp' ? 'WhatsApp' : c.confirmacion.canal}
        </span>
      )}
    </>
  )
}

/** Botón «Enviar recordatorio» (servidor) o liga wa.me (demo). */
export function BotonRecordatorio({ c, p, settings, compact, mensaje }: { c: Appointment; p: Patient; settings: Settings; compact?: boolean; mensaje?: Mensaje }) {
  const [busy, setBusy] = useState(false)
  const wa = ligaWhatsApp(c, p, settings)
  if (isServer() && puedeVerMensajes()) {
    if (!VIGENTE(c)) return null
    const label = mensaje ? 'Reenviar recordatorio' : 'Enviar recordatorio'
    const run = async () => {
      setBusy(true)
      await enviarRecordatorio(c, wa)
      setBusy(false)
    }
    return compact ? (
      <button
        onClick={run}
        disabled={busy}
        title={label}
        aria-label={`${label} a ${nombreCompleto(p)}`}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-ok hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </button>
    ) : (
      <Button size="sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 text-ok" />} {label}
      </Button>
    )
  }
  if (!wa) return compact ? null : <span className="self-center text-xs text-muted">Sin teléfono válido para WhatsApp</span>
  return compact ? (
    <a href={wa} target="_blank" rel="noreferrer" title="Recordatorio por WhatsApp" aria-label={`Recordatorio por WhatsApp a ${nombreCompleto(p)}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-ok hover:bg-surface-2">
      <MessageCircle className="size-4" />
    </a>
  ) : (
    <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium hover:bg-surface-2">
      <MessageCircle className="size-4 text-ok" /> Recordatorio WhatsApp
    </a>
  )
}
