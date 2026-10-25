// Lógica pura del tablero de tareas del equipo (sin React ni store).
import type { ID, Registro } from '../../lib/types'

export type EstadoTarea = 'abierta' | 'en-curso' | 'hecha' | 'cancelada'
export type Prioridad = 'baja' | 'media' | 'alta' | 'urgente'
export type Recurrencia = 'diaria' | 'semanal' | 'mensual'

export const ESTADOS: { id: EstadoTarea; label: string }[] = [
  { id: 'abierta', label: 'Abierta' },
  { id: 'en-curso', label: 'En curso' },
  { id: 'hecha', label: 'Hecha' },
  { id: 'cancelada', label: 'Cancelada' },
]
export const ESTADO_LABEL: Record<EstadoTarea, string> = Object.fromEntries(ESTADOS.map((e) => [e.id, e.label])) as Record<EstadoTarea, string>

export const PRIORIDADES: { id: Prioridad; label: string; peso: number }[] = [
  { id: 'urgente', label: 'Urgente', peso: 4 },
  { id: 'alta', label: 'Alta', peso: 3 },
  { id: 'media', label: 'Media', peso: 2 },
  { id: 'baja', label: 'Baja', peso: 1 },
]
export const PRIORIDAD_LABEL: Record<Prioridad, string> = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.label])) as Record<Prioridad, string>
const PESO: Record<string, number> = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.peso]))

export const ETIQUETAS: { id: string; label: string }[] = [
  { id: 'llamar-paciente', label: 'Llamar paciente' },
  { id: 'resultado-pendiente', label: 'Resultado pendiente' },
  { id: 'cobro', label: 'Cobro' },
  { id: 'insumos', label: 'Insumos' },
  { id: 'administrativo', label: 'Administrativo' },
]
export const ETIQUETA_LABEL: Record<string, string> = Object.fromEntries(ETIQUETAS.map((e) => [e.id, e.label]))

export const RECURRENCIAS: { id: Recurrencia; label: string }[] = [
  { id: 'diaria', label: 'Cada día' },
  { id: 'semanal', label: 'Cada semana' },
  { id: 'mensual', label: 'Cada mes' },
]

export interface Comentario {
  fecha: string // ISO
  autor: string
  texto: string
}

export interface DatosTarea {
  descripcion: string
  asignadoA?: ID // id del usuario asignado (modo servidor; contrato de registros v1.2)
  asignadoNombre?: string
  prioridad: Prioridad
  vence?: string // YYYY-MM-DD (fecha local)
  etiquetas: string[]
  comentarios: Comentario[]
  recurrencia?: Recurrencia
  creadoPorNombre?: string
  completadaEn?: string
}

export interface Tarea {
  id: ID
  patientId?: ID
  fecha: string
  titulo: string
  estado: EstadoTarea
  datos: DatosTarea
}

const esEstado = (s: unknown): s is EstadoTarea => s === 'abierta' || s === 'en-curso' || s === 'hecha' || s === 'cancelada'
const esPrioridad = (s: unknown): s is Prioridad => typeof s === 'string' && s in PESO

/** Normaliza un Registro tipo `tarea` (tolera datos incompletos o de versiones anteriores). */
export function aTarea(r: Registro): Tarea {
  const d = (r.datos ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  return {
    id: r.id,
    patientId: r.patientId,
    fecha: r.fecha,
    titulo: r.titulo || str(d.titulo) || 'Tarea sin título',
    estado: esEstado(r.estado) ? r.estado : 'abierta',
    datos: {
      descripcion: str(d.descripcion) ?? '',
      asignadoA: str(d.asignadoA) ?? str(d.asignadoId),
      asignadoNombre: str(d.asignadoNombre),
      prioridad: esPrioridad(d.prioridad) ? d.prioridad : 'media',
      vence: typeof d.vence === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.vence) ? d.vence : undefined,
      etiquetas: Array.isArray(d.etiquetas) ? d.etiquetas.filter((x): x is string => typeof x === 'string') : [],
      comentarios: Array.isArray(d.comentarios)
        ? (d.comentarios as unknown[]).filter((c): c is Comentario => !!c && typeof c === 'object' && typeof (c as Comentario).texto === 'string')
        : [],
      recurrencia: d.recurrencia === 'diaria' || d.recurrencia === 'semanal' || d.recurrencia === 'mensual' ? d.recurrencia : undefined,
      creadoPorNombre: str(d.creadoPorNombre),
      completadaEn: str(d.completadaEn),
    },
  }
}

/** Fecha local YYYY-MM-DD. */
export function fechaLocal(t: number | Date): string {
  const d = typeof t === 'number' ? new Date(t) : t
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Suma días a una fecha YYYY-MM-DD (sin problemas de horario de verano). */
export function sumarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return fechaLocal(new Date(y, m - 1, d + dias))
}

export const activa = (t: Pick<Tarea, 'estado'>) => t.estado === 'abierta' || t.estado === 'en-curso'

/** Vencida: activa y con fecha límite anterior a hoy. */
export function vencida(t: Tarea, now: number): boolean {
  return activa(t) && !!t.datos.vence && t.datos.vence < fechaLocal(now)
}
export const venceHoy = (t: Tarea, now: number) => activa(t) && t.datos.vence === fechaLocal(now)

export function contarVencidas(ts: Tarea[], now: number): number {
  return ts.filter((t) => vencida(t, now)).length
}

export interface Usuario {
  id?: ID
  nombre: string
}

/** ¿La tarea está asignada al usuario? Por id (modo servidor) o por nombre (modo demo / texto libre). */
export function esMia(t: Tarea, u: Usuario | null): boolean {
  if (!u) return false
  if (u.id && t.datos.asignadoA) return u.id === t.datos.asignadoA
  const a = normalizar(t.datos.asignadoNombre ?? '')
  return !!a && a === normalizar(u.nombre)
}

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface Filtro {
  vista?: 'todas' | 'mias' | 'vencidas' | 'activas'
  patientId?: ID
  etiqueta?: string
  estado?: EstadoTarea | ''
  texto?: string
}

export function filtrar(ts: Tarea[], f: Filtro, usuario: Usuario | null, now: number): Tarea[] {
  const q = normalizar(f.texto ?? '')
  return ts.filter((t) => {
    if (f.vista === 'mias' && !esMia(t, usuario)) return false
    if (f.vista === 'vencidas' && !vencida(t, now)) return false
    if (f.vista === 'activas' && !activa(t)) return false
    if (f.patientId && t.patientId !== f.patientId) return false
    if (f.etiqueta && !t.datos.etiquetas.includes(f.etiqueta)) return false
    if (f.estado && t.estado !== f.estado) return false
    if (q && !normalizar(`${t.titulo} ${t.datos.descripcion} ${t.datos.asignadoNombre ?? ''}`).includes(q)) return false
    return true
  })
}

/** Orden de trabajo: vencidas primero, luego por fecha límite (sin fecha al final), prioridad y antigüedad. */
export function ordenar(ts: Tarea[], now: number): Tarea[] {
  return [...ts].sort((a, b) => {
    const va = vencida(a, now) ? 0 : 1
    const vb = vencida(b, now) ? 0 : 1
    if (va !== vb) return va - vb
    const fa = a.datos.vence ?? '9999-12-31'
    const fb = b.datos.vence ?? '9999-12-31'
    if (fa !== fb) return fa < fb ? -1 : 1
    const p = (PESO[b.datos.prioridad] ?? 0) - (PESO[a.datos.prioridad] ?? 0)
    if (p) return p
    return a.fecha.localeCompare(b.fecha)
  })
}

/** Lunes (YYYY-MM-DD) de la semana que contiene `ymd`. */
export function inicioSemana(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay() // 0 = domingo
  return sumarDias(ymd, dow === 0 ? -6 : 1 - dow)
}

/** Los 7 días (lunes a domingo) de la semana de `ymd`. */
export function diasSemana(ymd: string): string[] {
  const lunes = inicioSemana(ymd)
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/** Siguiente fecha límite de una tarea recurrente (si no tenía fecha, se cuenta desde `hoy`). */
export function siguienteVence(vence: string | undefined, rec: Recurrencia, hoy: string): string {
  const base = vence ?? hoy
  if (rec === 'diaria') return sumarDias(base, 1)
  if (rec === 'semanal') return sumarDias(base, 7)
  const [y, m, d] = base.split('-').map(Number)
  // mismo día del mes siguiente; si no existe (31 → 30/28), último día del mes
  const ultimo = new Date(y, m + 1, 0).getDate()
  return fechaLocal(new Date(y, m, Math.min(d, ultimo)))
}

/**
 * Al completar una tarea recurrente se crea la siguiente: mismo contenido, estado «abierta»,
 * sin comentarios y con la nueva fecha límite. Devuelve null si no es recurrente.
 */
export function siguienteRecurrente(t: Tarea, hoy: string): Omit<Registro, 'id' | 'fecha'> | null {
  const rec = t.datos.recurrencia
  if (!rec) return null
  // si la tarea se atrasó varios periodos, la siguiente no debe nacer ya vencida
  let vence = siguienteVence(t.datos.vence, rec, hoy)
  for (let i = 0; i < 400 && vence < hoy; i++) vence = siguienteVence(vence, rec, hoy)
  return {
    tipo: 'tarea',
    patientId: t.patientId,
    estado: 'abierta',
    titulo: t.titulo,
    datos: {
      ...t.datos,
      vence,
      comentarios: [],
      completadaEn: undefined,
    } as unknown as Record<string, unknown>,
  }
}

/** Datos para guardar (quita claves vacías para no ensuciar el JSON). */
export function datosLimpios(d: DatosTarea): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || v === '' || v === null) continue
    out[k] = v
  }
  if (!out.etiquetas) out.etiquetas = []
  if (!out.comentarios) out.comentarios = []
  return out
}

/** Texto de la fecha límite relativo a hoy. */
export function textoVence(vence: string | undefined, now: number): string {
  if (!vence) return 'Sin fecha'
  const hoy = fechaLocal(now)
  if (vence === hoy) return 'Hoy'
  if (vence === sumarDias(hoy, 1)) return 'Mañana'
  if (vence === sumarDias(hoy, -1)) return 'Ayer'
  const [y, m, d] = vence.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(y !== new Date(now).getFullYear() ? { year: 'numeric' } : {}),
  })
}
