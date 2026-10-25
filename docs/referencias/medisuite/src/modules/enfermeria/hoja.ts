// Modelo de la hoja de enfermería (un Registro tipo 'enfermeria' por paciente y día de enfermería).
import { useMemo } from 'react'
import { add, getDB, update } from '../../lib/store'
import { useRegistros } from '../../lib/registros'
import { fmtFecha } from '../../lib/utils'
import type { Prescription, Registro } from '../../lib/types'
import { diaISO, intervaloHoras, programarDosis, type Movimiento, type Turno } from './calc'

export interface OrdenManual {
  id: string
  medicamento: string
  dosis: string
  via: string
  frecuencia: string
  indicaciones?: string
  suspendida?: boolean
}
export interface Aplicacion {
  estado: 'aplicado' | 'omitido' | 'rechazado'
  programada?: string // ISO; ausente en dosis PRN
  hora: string // ISO real
  enfermera: string
  correctos: string[]
  nota?: string
}
export interface NotaEnf {
  id: string
  hora: string
  turno: Turno
  formato: 'soapie' | 'libre'
  texto?: string
  soapie?: Record<'s' | 'o' | 'a' | 'p' | 'i' | 'e', string>
  autor: string
}
export interface SBAR {
  s: string
  b: string
  a: string
  r: string
  por: string
  fecha: string
}
export interface DatosHoja {
  dia: string // YYYY-MM-DD del inicio del día de enfermería
  peso?: number
  factorPI?: number
  movimientos: Movimiento[]
  ordenes: OrdenManual[]
  horarios: Record<string, string> // clave de orden → "HH:MM" de la primera dosis
  mar: Record<string, Aplicacion> // `${clave}@${ISO programada}` o `${clave}@prn-${ts}`
  notas: NotaEnf[]
  entregas: Partial<Record<Turno, SBAR>>
}

export const vacia = (dia: string): DatosHoja => ({ dia, movimientos: [], ordenes: [], horarios: {}, mar: {}, notas: [], entregas: {} })

export { diaISO }

const esHoja = (r: Registro, pid: string | null, dia: string) => r.tipo === 'enfermeria' && r.patientId === pid && (r.datos as { dia?: string }).dia === dia

export function useHoja(pid: string | null, dia0: number) {
  const dia = diaISO(dia0)
  const regs = useRegistros('enfermeria', pid)
  const hoja = regs.find((r) => esHoja(r, pid, dia)) ?? null
  const datos = useMemo(() => ({ ...vacia(dia), ...((hoja?.datos ?? {}) as Partial<DatosHoja>) }), [hoja, dia])
  /** Aplica un cambio sobre la versión más reciente de la hoja (la crea si no existe). */
  function guardar(fn: (d: DatosHoja) => DatosHoja) {
    if (!pid) return
    const actual = getDB().registros.find((r) => esHoja(r, pid, dia))
    const base = { ...vacia(dia), ...((actual?.datos ?? {}) as Partial<DatosHoja>) }
    const next = fn(base) as unknown as Record<string, unknown>
    if (actual) update('registros', actual.id, { datos: next })
    else add('registros', { patientId: pid, fecha: new Date(dia0).toISOString(), tipo: 'enfermeria', estado: 'abierta', titulo: `Hoja de enfermería ${fmtFecha(new Date(dia0).toISOString())}`, datos: next })
  }
  return { hoja, datos, guardar }
}

// ---------- Órdenes de medicamentos ----------
export interface Orden {
  clave: string
  origen: 'receta' | 'manual'
  medicamento: string
  dosis: string
  via: string
  frecuencia: string
  indicaciones?: string
  folio?: string
  intervalo: number | 'prn' | 'unica' | null
}

/** Días de duración escritos en la receta ("7 días", "2 semanas", "3 meses"); null si no se reconoce. */
export function duracionDias(s: string): number | null {
  const f = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const m = f.match(/(\d+)\s*(dia|semana|mes)/)
  if (!m) return /(indefinid|permanente|continu|cronico)/.test(f) ? Infinity : null
  const n = Number(m[1])
  return m[2] === 'dia' ? n : m[2] === 'semana' ? n * 7 : n * 30
}

/** Recetas vigentes el día indicado (no canceladas y dentro de su duración; sin duración legible: 30 días). */
export function ordenesDeRecetas(rxs: Prescription[], dia0: number): Orden[] {
  const out: Orden[] = []
  for (const rx of rxs) {
    if (rx.cancelada) continue
    const ini = Date.parse(rx.fecha)
    rx.items.forEach((it, i) => {
      const dias = duracionDias(it.duracion) ?? 30
      if (ini > dia0 + 864e5 || ini + dias * 864e5 < dia0) return
      out.push({
        clave: `rx:${rx.id}:${i}`, origen: 'receta', medicamento: [it.medicamento, it.presentacion].filter(Boolean).join(' · '), dosis: it.dosis, via: it.via,
        frecuencia: it.frecuencia, indicaciones: it.indicaciones, folio: rx.folio, intervalo: intervaloHoras(it.frecuencia),
      })
    })
  }
  return out
}

export const ordenDeManual = (o: OrdenManual): Orden => ({ clave: `m:${o.id}`, origen: 'manual', medicamento: o.medicamento, dosis: o.dosis, via: o.via, frecuencia: o.frecuencia, indicaciones: o.indicaciones, intervalo: intervaloHoras(o.frecuencia) })

export interface Dosis {
  orden: Orden
  programada: number
  clave: string
  aplicacion?: Aplicacion
}

export function dosisDelDia(ordenes: Orden[], datos: DatosHoja, dia0: number): Dosis[] {
  const out: Dosis[] = []
  for (const o of ordenes) {
    if (o.intervalo === 'prn' || o.intervalo === null) continue
    for (const t of programarDosis(o.intervalo === 'unica' ? 24 : o.intervalo, datos.horarios[o.clave] ?? '08:00', dia0)) {
      const clave = `${o.clave}@${new Date(t).toISOString()}`
      out.push({ orden: o, programada: t, clave, aplicacion: datos.mar[clave] })
    }
  }
  return out.sort((a, b) => a.programada - b.programada)
}
