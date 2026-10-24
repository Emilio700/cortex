/**
 * Notificación del navegador para cuando GEMS está en otra pestaña (plan 27, §3.5).
 *
 * Sale desde la página, sin servidor de push: funciona mientras GEMS esté
 * abierto en alguna pestaña. El permiso se pide sólo cuando la persona lo
 * activa en el centro de avisos, nunca al cargar.
 *
 * El texto **no lleva el nombre del paciente** (D-4): en recepción la
 * pantalla la ve quien está en el mostrador. El detalle se ve al hacer clic.
 */
import type { Notification } from '../types/notification'

export type EstadoPermiso = 'no-disponible' | 'default' | 'granted' | 'denied'

export function permisoDelNavegador(): EstadoPermiso {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'no-disponible'
  return window.Notification.permission as EstadoPermiso
}

export async function pedirPermiso(): Promise<EstadoPermiso> {
  if (permisoDelNavegador() === 'no-disponible') return 'no-disponible'
  try {
    return (await window.Notification.requestPermission()) as EstadoPermiso
  } catch {
    return permisoDelNavegador()
  }
}

/** Título y texto genéricos por tipo, sin datos del paciente. */
const TEXTOS: Record<string, [string, string]> = {
  patient_arrived: ['Paciente en sala', 'Un paciente te espera en sala.'],
  consultation_completed: ['Consulta por cobrar', 'Terminó una consulta y falta registrar el cobro.'],
  prenatal_review_due: ['Control prenatal sin cita', 'Hay un paciente por llamar para agendar su control.'],
  diagnostic_result_received: ['Llegó un resultado', 'Tienes un resultado por revisar.'],
  appointment_cancelled: ['Cita cancelada', 'Se canceló una cita de tu agenda próxima.'],
  appointment_rescheduled: ['Cita reprogramada', 'Cambió una cita de tu agenda próxima.'],
  system_alert: ['Aviso del sistema', 'Un servicio del servidor no responde.'],
}

export function textoSinDatosDePaciente(aviso: Pick<Notification, 'type'>): [string, string] {
  return TEXTOS[aviso.type] ?? ['Aviso de GEMS', 'Tienes un aviso por atender.']
}

interface OpcionesNotificacion {
  alHacerClic: () => void
  /** Lo urgente clínico se queda hasta que alguien lo toque (Fase 3). */
  persistente?: boolean
  etiqueta?: string
}

/** Muestra la notificación si hay permiso. Devuelve si se mostró. */
export function mostrarNotificacion(titulo: string, texto: string, opciones: OpcionesNotificacion): boolean {
  if (permisoDelNavegador() !== 'granted') return false
  try {
    const notificacion = new window.Notification(titulo, {
      body: texto,
      tag: opciones.etiqueta,
      requireInteraction: opciones.persistente ?? false,
      icon: '/favicon.ico',
    })
    notificacion.onclick = () => {
      window.focus()
      notificacion.close()
      opciones.alHacerClic()
    }
    return true
  } catch {
    // Algunos navegadores en el celular sólo permiten notificaciones desde
    // un service worker; ahí no hay notificación, y el aviso sigue en la página.
    return false
  }
}
