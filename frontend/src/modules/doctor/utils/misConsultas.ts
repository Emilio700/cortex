/**
 * Reglas de Mis Consultas (plan 32, punto 4), sin React, para probarlas solas.
 *
 * Mis Consultas es el historial y la búsqueda de consultas (decisión de las
 * observaciones del plan 32): la Agenda programa y el Inicio lleva lo de hoy.
 * Por eso el periodo por omisión es «Últimos 30 días y próximas».
 *
 * Los días son del consultorio (Mazatlán), en AAAA-MM-DD, y viajan al servidor
 * como `fecha_desde`/`fecha_hasta`: con el instante UTC del navegador, cerca de
 * la medianoche «hoy» traía citas de ayer.
 */
import { hoyLocalISO } from '../../../shared/utils/date'
import type { Appointment } from '../../secretaria/types'

export type ClavePeriodo = 'reciente' | 'hoy' | 'manana' | 'semana' | 'proximos30' | 'todo' | 'rango'

export const PERIODO_POR_OMISION: ClavePeriodo = 'reciente'
export const TAMANOS_DE_PAGINA = [25, 50, 100] as const

/** Un día del calendario corrido `dias`, sin pasar por la zona del navegador. */
export const diaMas = (iso: string, dias: number): string => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const lunesDe = (iso: string): string => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() // 0 = domingo
  return diaMas(iso, dow === 0 ? -6 : 1 - dow)
}

export interface Periodo {
  clave: ClavePeriodo
  etiqueta: string
  desde: string
  hasta: string
}

/** Los atajos en píldoras, calculados con el hoy del consultorio. */
export const atajosDePeriodo = (hoy: string = hoyLocalISO()): Periodo[] => [
  { clave: 'reciente', etiqueta: 'Últimos 30 días y próximas', desde: diaMas(hoy, -30), hasta: '' },
  { clave: 'hoy', etiqueta: 'Hoy', desde: hoy, hasta: hoy },
  { clave: 'manana', etiqueta: 'Mañana', desde: diaMas(hoy, 1), hasta: diaMas(hoy, 1) },
  { clave: 'semana', etiqueta: 'Esta semana', desde: lunesDe(hoy), hasta: diaMas(lunesDe(hoy), 6) },
  { clave: 'proximos30', etiqueta: 'Próximos 30 días', desde: hoy, hasta: diaMas(hoy, 30) },
  { clave: 'todo', etiqueta: 'Todo mi historial', desde: '', hasta: '' },
]

export type Orden = 'fecha' | 'desc' | 'asc'

/** Todo lo que define la lista. Vive en la URL: al volver de una consulta se regresa al mismo lugar. */
export interface FiltrosConsultas {
  periodo: ClavePeriodo
  desde: string
  hasta: string
  q: string
  estado: string
  orden: Orden
  tipo: string
  pagina: number
  porPagina: number
  vista: 'lista' | 'calendario'
}

export const filtrosDesdeURL = (params: URLSearchParams, hoy: string = hoyLocalISO()): FiltrosConsultas => {
  const atajos = atajosDePeriodo(hoy)
  const pedido = params.get('periodo') as ClavePeriodo | null
  const esFecha = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
  let periodo: ClavePeriodo = PERIODO_POR_OMISION
  let desde = atajos[0].desde
  let hasta = atajos[0].hasta
  if (pedido === 'rango') {
    periodo = 'rango'
    desde = esFecha(params.get('desde'))
    hasta = esFecha(params.get('hasta'))
  } else {
    const atajo = atajos.find((a) => a.clave === pedido)
    if (atajo) ({ clave: periodo, desde, hasta } = atajo)
  }
  const porPagina = Number(params.get('por'))
  const pagina = Number(params.get('pagina'))
  const orden = params.get('orden')
  return {
    periodo,
    desde,
    hasta,
    q: params.get('q') ?? '',
    estado: params.get('estado') ?? '',
    orden: orden === 'asc' || orden === 'desc' ? orden : 'fecha',
    tipo: params.get('tipo') ?? '',
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
    porPagina: (TAMANOS_DE_PAGINA as readonly number[]).includes(porPagina) ? porPagina : TAMANOS_DE_PAGINA[0],
    vista: params.get('vista') === 'calendario' ? 'calendario' : 'lista',
  }
}

/** Solo lo que se aparta de lo de omisión: la URL queda corta y legible. */
export const filtrosAURL = (f: FiltrosConsultas): URLSearchParams => {
  const p = new URLSearchParams()
  if (f.periodo !== PERIODO_POR_OMISION) p.set('periodo', f.periodo)
  if (f.periodo === 'rango') {
    if (f.desde) p.set('desde', f.desde)
    if (f.hasta) p.set('hasta', f.hasta)
  }
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.estado) p.set('estado', f.estado)
  if (f.orden !== 'fecha') p.set('orden', f.orden)
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.pagina > 1) p.set('pagina', String(f.pagina))
  if (f.porPagina !== TAMANOS_DE_PAGINA[0]) p.set('por', String(f.porPagina))
  if (f.vista !== 'lista') p.set('vista', f.vista)
  return p
}

export type Accion = { etiqueta: string; solida: boolean; icono: 'iniciar' | 'ver' | 'detalles' }

/**
 * La acción principal del renglón según el estado (plan 32, punto 4).
 *
 * «Iniciar» solo para lo que se atiende hoy: abrir una cita de otro día no la
 * pasa a «en consulta» (plan 28), así que llamarlo iniciar sería prometer
 * algo que no ocurre. Esa se ve con «Ver detalles».
 */
export const accionPrincipal = (cita: Pick<Appointment, 'status' | 'scheduled_at'>, hoy: string = hoyLocalISO()): Accion => {
  if (cita.status === 'atendida') return { etiqueta: 'Ver consulta', solida: false, icono: 'ver' }
  if (cita.status === 'en_consulta') return { etiqueta: 'Continuar consulta', solida: true, icono: 'iniciar' }
  const deHoy = cita.scheduled_at.slice(0, 10) === hoy
  if (deHoy && ['agendada', 'confirmada', 'en_sala'].includes(cita.status)) {
    return { etiqueta: 'Iniciar consulta', solida: true, icono: 'iniciar' }
  }
  return { etiqueta: 'Ver detalles', solida: false, icono: 'detalles' }
}

export const iniciales = (nombre?: string, apellidos?: string): string =>
  `${(nombre ?? '').trim()[0] ?? ''}${(apellidos ?? '').trim()[0] ?? ''}`.toUpperCase() || '·'

/** Seis tonos con texto AA; el mismo para la mismo paciente en cualquier pantalla. */
export const TONOS_AVATAR = ['azul', 'morado', 'verde', 'ambar', 'rosa', 'cian'] as const
export const tonoDeAvatar = (patientId: number): (typeof TONOS_AVATAR)[number] =>
  TONOS_AVATAR[Math.abs(patientId) % TONOS_AVATAR.length]

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

/** El bloque de fecha (DOM / 27 / SEP) de una cita guardada en hora del consultorio. */
export const bloqueDeFecha = (scheduledAt: string) => {
  const [a, m, d] = scheduledAt.slice(0, 10).split('-').map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()
  return { dia: DIAS[dow], numero: String(d), mes: MESES[m - 1] }
}

/** «09:00 a.m.» de la hora local guardada, sin pasar por la zona del navegador. */
export const horaDeCita = (scheduledAt: string): string => {
  const [h, min] = scheduledAt.slice(11, 16).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const sufijo = h < 12 ? 'a.m.' : 'p.m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${String(min).padStart(2, '0')} ${sufijo}`
}
