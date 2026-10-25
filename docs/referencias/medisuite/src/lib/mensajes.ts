// Recordatorios y mensajes (modo servidor, docs/api.md v1.1 «Mensajes y recordatorios»).
// Caché en memoria de GET /api/mensajes (más recientes primero) para mostrar el estado del recordatorio de cada cita.
import { useEffect, useSyncExternalStore } from 'react'
import { api, ApiError, errorMessage, isServer } from './api'
import { getSession } from './session'
import { toast } from '../components/toast'
import type { Appointment, EstadoMensaje, ID, Mensaje } from './types'

let lista: Mensaje[] = []
let cargadoEn = 0
let cargando: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Roles que pueden leer mensajes (enfermería no). */
export function puedeVerMensajes(): boolean {
  const u = getSession().user
  return isServer() && !!u && ['admin', 'medico', 'recepcion'].includes(u.rol)
}

export function refreshMensajes(force = false): Promise<void> {
  if (!puedeVerMensajes()) return Promise.resolve()
  if (cargando) return cargando
  if (!force && Date.now() - cargadoEn < 20_000) return Promise.resolve()
  const desde = new Date(Date.now() - 14 * 86400_000).toISOString()
  cargando = api<Mensaje[]>('/mensajes', { query: { desde, limit: 500 } })
    .then((r) => {
      lista = Array.isArray(r) ? r : []
      cargadoEn = Date.now()
      emit()
    })
    .catch(() => {
      /* sin permiso o sin red: se queda lo último */
    })
    .finally(() => {
      cargando = null
    })
  return cargando
}

export function clearMensajes() {
  lista = []
  cargadoEn = 0
  emit()
}

function agregar(m: Mensaje) {
  lista = [m, ...lista.filter((x) => x.id !== m.id)]
  emit()
}

/** Mensajes recientes (se refrescan cada 60 s mientras haya un componente que los use). */
export function useMensajes(): Mensaje[] {
  const l = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => lista,
  )
  useEffect(() => {
    if (!puedeVerMensajes()) return
    void refreshMensajes()
    const t = setInterval(() => document.visibilityState === 'visible' && refreshMensajes(true), 60_000)
    return () => clearInterval(t)
  }, [])
  return l
}

/** Último mensaje (recordatorio automático o manual) de cada cita. */
export function ultimoPorCita(l: Mensaje[]): Map<ID, Mensaje> {
  const m = new Map<ID, Mensaje>()
  for (const x of l) {
    if (!x.appointmentId || x.tipo === 'prueba') continue
    const prev = m.get(x.appointmentId)
    if (!prev || x.creadoEn > prev.creadoEn) m.set(x.appointmentId, x)
  }
  return m
}

export const ESTADO_MENSAJE: Record<EstadoMensaje, { label: string; tone: 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' }> = {
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  enviado: { label: 'Enviado', tone: 'brand' },
  entregado: { label: 'Entregado', tone: 'brand' },
  leido: { label: 'Leído', tone: 'ok' },
  respondido: { label: 'Respondido', tone: 'ok' },
  fallido: { label: 'Fallido', tone: 'danger' },
}

/**
 * Envía el recordatorio ya (POST /appointments/:id/recordatorio). Si el servidor no tiene WhatsApp ni correo
 * (503 whatsapp_no_configurado), ofrece abrir la liga wa.me con el mensaje prellenado.
 */
export async function enviarRecordatorio(cita: Appointment, waFallback: string | null): Promise<Mensaje | null> {
  try {
    const m = await api<Mensaje>(`/appointments/${encodeURIComponent(cita.id)}/recordatorio`, { method: 'POST', timeout: 30_000 })
    if (m && typeof m === 'object') agregar(m)
    toast(m?.canal === 'email' ? `Recordatorio enviado por correo a ${m.destino}.` : `Recordatorio enviado por WhatsApp${m?.destino ? ' a ' + m.destino : ''}.`, 'ok')
    return m
  } catch (e) {
    const a = e instanceof ApiError ? e : null
    if (a?.code === 'whatsapp_no_configurado') {
      toast('El servidor no tiene WhatsApp ni correo configurados. Puedes enviarlo desde tu WhatsApp.', 'warn', {
        title: 'Recordatorio no enviado',
        ms: 12000,
        action: waFallback ? { label: 'Abrir WhatsApp', onClick: () => window.open(waFallback, '_blank', 'noopener') } : undefined,
      })
    } else if (a?.code === 'sin_contacto') toast('El paciente no tiene teléfono válido ni correo. Agrégalos en su expediente.', 'warn', { title: 'Recordatorio no enviado' })
    else if (a?.code === 'cita_no_vigente') toast('La cita está cancelada, atendida o marcada como no asistió.', 'warn', { title: 'Recordatorio no enviado' })
    else if (a?.code === 'paciente_bloqueado') toast('El paciente está bloqueado (derechos ARCO): no recibe recordatorios.', 'warn', { title: 'Recordatorio no enviado' })
    else {
      toast(errorMessage(e), 'danger', { title: 'Recordatorio no enviado' })
      void refreshMensajes(true)
    }
    return null
  }
}

/** Mensaje de prueba (admin). */
export async function mensajePrueba(telefono: string): Promise<Mensaje> {
  const m = await api<Mensaje>('/mensajes/prueba', { method: 'POST', body: { telefono }, timeout: 30_000 })
  if (m && typeof m === 'object') agregar(m)
  return m
}
