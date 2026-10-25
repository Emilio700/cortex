// Lógica pura de las órdenes de estudios (registros tipo 'orden').
import type { Diagnostico, Registro } from '../../lib/types'
import { diasTranscurridos } from './comun'
import type { Estudio } from './catalogo'

export type EstadoOrden = 'pendiente' | 'muestra' | 'resultado' | 'revisado' | 'cancelada'
export type Urgencia = 'ordinaria' | 'urgente'

export const FLUJO: EstadoOrden[] = ['pendiente', 'muestra', 'resultado', 'revisado']
export const ESTADO_LABEL: Record<EstadoOrden, string> = {
  pendiente: 'Pendiente',
  muestra: 'Muestra tomada / estudio realizado',
  resultado: 'Resultado recibido',
  revisado: 'Revisado por el médico',
  cancelada: 'Cancelada',
}
export const ESTADO_CORTO: Record<EstadoOrden, string> = {
  pendiente: 'Pendiente',
  muestra: 'Muestra tomada',
  resultado: 'Resultado recibido',
  revisado: 'Revisado',
  cancelada: 'Cancelada',
}

export interface ItemOrden {
  id: string
  nombre: string
  tipo: Estudio['tipo']
  loinc?: string
  preparacion?: string
  muestra?: string
}

export interface CambioEstado {
  estado: EstadoOrden
  fecha: string
  por?: string
  nota?: string
}

export interface DatosOrden {
  folio: string
  items: ItemOrden[]
  diagnosticos: Diagnostico[]
  diagnosticoTexto?: string
  urgencia: Urgencia
  laboratorio?: string
  indicaciones?: string
  medico?: string
  historial: CambioEstado[]
  resultadoDocId?: string // último resultado adjuntado (DocumentFile tipo 'laboratorio')
  resultadoDocIds?: string[]
  notaRevision?: string
  motivoCancelacion?: string
}

export function datosOrden(r: Registro): DatosOrden {
  const d = (r.datos ?? {}) as Partial<DatosOrden>
  return {
    folio: String(d.folio ?? ''),
    items: Array.isArray(d.items) ? d.items : [],
    diagnosticos: Array.isArray(d.diagnosticos) ? d.diagnosticos : [],
    diagnosticoTexto: d.diagnosticoTexto,
    urgencia: d.urgencia === 'urgente' ? 'urgente' : 'ordinaria',
    laboratorio: d.laboratorio,
    indicaciones: d.indicaciones,
    medico: d.medico,
    historial: Array.isArray(d.historial) ? d.historial : [],
    resultadoDocId: d.resultadoDocId,
    resultadoDocIds: Array.isArray(d.resultadoDocIds) ? d.resultadoDocIds : d.resultadoDocId ? [d.resultadoDocId] : [],
    notaRevision: d.notaRevision,
    motivoCancelacion: d.motivoCancelacion,
  }
}

/**
 * Fase de la orden. En el registro, `estado` queda en 'pendiente' mientras la orden está abierta (Inicio cuenta
 * las órdenes pendientes con ese valor) y la fase fina (muestra tomada / resultado recibido) va en `datos.fase`.
 * Al cerrar: estado 'revisado' o 'cancelada'.
 */
export function estadoOrden(r: Registro): EstadoOrden {
  const e = r.estado as EstadoOrden
  if (e === 'revisado' || e === 'cancelada') return e
  const f = (r.datos as { fase?: EstadoOrden } | undefined)?.fase
  if (f === 'muestra' || f === 'resultado') return f
  if (e === 'muestra' || e === 'resultado') return e // compatibilidad
  return 'pendiente'
}

/** Valor del campo `estado` del registro para una fase. */
export const estadoRegistro = (e: EstadoOrden): string => (e === 'revisado' || e === 'cancelada' ? e : 'pendiente')

/** Siguiente paso del flujo (null si ya está revisada o cancelada). */
export function siguienteEstado(e: EstadoOrden): EstadoOrden | null {
  const i = FLUJO.indexOf(e)
  return i >= 0 && i < FLUJO.length - 1 ? FLUJO[i + 1] : null
}

/** Fecha en que la orden entró a su estado actual (o la fecha de la orden). */
export function fechaEstado(r: Registro): string {
  const h = datosOrden(r).historial
  const e = estadoOrden(r)
  for (let i = h.length - 1; i >= 0; i--) if (h[i].estado === e) return h[i].fecha
  return r.fecha
}

/** Una orden está "abierta" mientras no tenga resultado revisado ni esté cancelada. */
export const abierta = (r: Registro) => !['revisado', 'cancelada'].includes(estadoOrden(r))

/** Días de espera desde la orden hasta ahora (solo órdenes que aún esperan resultado). */
export function diasSinResultado(r: Registro, now: number): number | null {
  const e = estadoOrden(r)
  if (e !== 'pendiente' && e !== 'muestra') return null
  return diasTranscurridos(r.fecha, now)
}

/**
 * Alerta de retraso: sin resultado tras `umbralDias` (urgentes: 1 día), o resultado recibido sin revisar
 * por el médico tras 2 días (hallazgos críticos no deben quedar sin leer).
 */
export function alertaOrden(r: Registro, now: number, umbralDias: number): string | null {
  const e = estadoOrden(r)
  const d = datosOrden(r)
  const espera = diasSinResultado(r, now)
  const umbral = d.urgencia === 'urgente' ? 1 : umbralDias
  if (espera !== null && espera >= umbral) return `Sin resultado desde hace ${espera} día${espera === 1 ? '' : 's'}`
  if (e === 'resultado') {
    const dr = diasTranscurridos(fechaEstado(r), now)
    if (dr >= 2) return `Resultado sin revisar desde hace ${dr} días`
  }
  return null
}

/** Instrucciones de preparación sin repetir, con los estudios a los que aplica cada una. */
export function preparacionCombinada(items: ItemOrden[]): { texto: string; estudios: string[] }[] {
  const m = new Map<string, string[]>()
  for (const it of items) {
    const t = it.preparacion?.trim()
    if (!t) continue
    m.set(t, [...(m.get(t) ?? []), it.nombre])
  }
  const out = [...m.entries()].map(([texto, estudios]) => ({ texto, estudios }))
  // "No requiere ayuno" sobra si otro estudio sí pide ayuno
  const pideAyuno = out.some((x) => /ayuno de \d/i.test(x.texto))
  return pideAyuno ? out.filter((x) => !/^no requiere ayuno/i.test(x.texto)) : out
}

/** Mayor número de horas de ayuno requerido (para el aviso principal). */
export function ayunoMaximo(items: ItemOrden[]): number {
  let h = 0
  for (const it of items) {
    const m = /ayuno de (\d+)(?: a (\d+))? horas/i.exec(it.preparacion ?? '')
    if (m) h = Math.max(h, parseInt(m[2] ?? m[1], 10))
  }
  return h
}

/** Título corto para la línea de tiempo. */
export function tituloOrden(folio: string, items: { nombre: string }[]): string {
  const nombres = items.map((i) => i.nombre.replace(/\s*\(.*\)\s*/g, ' ').trim())
  const txt = nombres.slice(0, 3).join(', ') + (nombres.length > 3 ? ` y ${nombres.length - 3} más` : '')
  return `Orden ${folio}: ${txt}`
}

/** Datos a incluir en el QR de la solicitud (texto plano, sin datos sensibles del paciente). */
export function textoQR(folio: string, fechaISO: string, cedula: string, n: number): string {
  return `MediSuite|ORDEN|${folio}|${fechaISO.slice(0, 10)}|CED:${cedula || '-'}|ESTUDIOS:${n}`
}
