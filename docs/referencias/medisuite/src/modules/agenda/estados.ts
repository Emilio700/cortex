// Catálogos de la agenda (compartidos con Inicio)
import type { Appointment, EstadoCita, Patient, Settings } from '../../lib/types'
import { nombreCompleto } from '../../lib/utils'

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger'

export const ESTADOS: Record<EstadoCita, { label: string; tone: Tone; color: string }> = {
  agendada: { label: 'Agendada', tone: 'neutral', color: '#64748b' },
  confirmada: { label: 'Confirmada', tone: 'brand', color: '#0284c7' },
  'en-sala': { label: 'En sala', tone: 'warn', color: '#d97706' },
  'en-consulta': { label: 'En consulta', tone: 'brand', color: '#7c3aed' },
  atendida: { label: 'Atendida', tone: 'ok', color: '#16a34a' },
  cancelada: { label: 'Cancelada', tone: 'danger', color: '#dc2626' },
  'no-asistio': { label: 'No asistió', tone: 'danger', color: '#9f1239' },
}

export const TIPOS: Record<Appointment['tipo'], string> = {
  'primera-vez': 'Primera vez',
  subsecuente: 'Subsecuente',
  procedimiento: 'Procedimiento',
  telemedicina: 'Telemedicina',
}

// Flujo de la sala de espera
export const FLUJO: EstadoCita[] = ['confirmada', 'en-sala', 'en-consulta', 'atendida']

export function siguienteEstado(e: EstadoCita): EstadoCita | null {
  if (e === 'agendada' || e === 'confirmada') return 'en-sala'
  if (e === 'en-sala') return 'en-consulta'
  if (e === 'en-consulta') return 'atendida'
  return null
}

export function esHoy(iso: string, ref = new Date()) {
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate()
}

export function mensajeRecordatorio(a: Appointment, p: Patient, s: Settings) {
  const d = new Date(a.inicio)
  const fecha = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return (
    `Hola ${p.nombre.split(' ')[0]}, le recordamos su cita en ${s.clinica} con ${s.doctor.nombre} ` +
    `el ${fecha} a las ${hora}` +
    (a.tipo === 'telemedicina' ? ' (videoconsulta; le enviaremos el enlace).' : `. Dirección: ${s.doctor.direccion}.`) +
    ' Por favor responda SÍ para confirmar o avísenos si necesita cambiarla. ¡Gracias!'
  )
}

/** Liga wa.me con el mensaje prellenado. Devuelve null si no hay teléfono válido. */
export function ligaWhatsApp(a: Appointment, p: Patient, s: Settings): string | null {
  let tel = (p.telefono ?? '').replace(/\D/g, '')
  if (tel.length === 12 && tel.startsWith('52')) tel = tel.slice(2)
  if (tel.length === 13 && tel.startsWith('521')) tel = tel.slice(3)
  if (tel.length !== 10) return null
  return `https://wa.me/52${tel}?text=${encodeURIComponent(mensajeRecordatorio(a, p, s))}`
}

export function tituloCita(p?: Patient) {
  return p ? nombreCompleto(p) : 'Paciente eliminado'
}

export const hora24 = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
