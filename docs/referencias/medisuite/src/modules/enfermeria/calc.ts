// Cálculos de la hoja de enfermería: infusiones, goteo, balance hídrico, turnos y horario de medicamentos.
// Fórmulas estándar de farmacología/enfermería (p. ej. Gray Morris D. Calculate with Confidence, 7.ª ed.,
// Elsevier 2018; caps. de cálculo de goteo IV y titulación por peso).

// ---------- Infusiones ----------
export type UnidadDosis = 'mcg/kg/min' | 'mcg/min' | 'mg/kg/h' | 'mg/h' | 'mg/min' | 'U/kg/h' | 'U/h'
export type UnidadCantidad = 'mg' | 'mcg' | 'U'

export const UNIDADES_DOSIS: UnidadDosis[] = ['mcg/kg/min', 'mcg/min', 'mg/kg/h', 'mg/h', 'mg/min', 'U/kg/h', 'U/h']

/** Concentración de la mezcla expresada en la unidad base de la dosis por mL (mcg/mL, mg/mL o U/mL). */
export function concentracion(cantidad: number, unidad: UnidadCantidad, volumenMl: number, unidadDosis: UnidadDosis): number {
  if (!(volumenMl > 0)) return NaN
  const base = unidadDosis.split('/')[0] // mcg | mg | U
  let c = cantidad
  if (unidad === 'U' || base === 'U') {
    if (unidad !== 'U' || base !== 'U') return NaN // no se mezclan unidades con masa
  } else if (unidad === 'mg' && base === 'mcg') c = cantidad * 1000
  else if (unidad === 'mcg' && base === 'mg') c = cantidad / 1000
  return c / volumenMl
}

/** Factor que convierte la dosis a "unidad base por hora" (multiplica por peso y minutos según corresponda). */
function porHora(dosis: number, unidadDosis: UnidadDosis, pesoKg: number): number {
  const kg = unidadDosis.includes('/kg/') ? pesoKg : 1
  const min = unidadDosis.endsWith('/min') ? 60 : 1
  return dosis * kg * min
}

/**
 * Velocidad de infusión (mL/h) = dosis × [peso] × [60 si es por minuto] ÷ concentración (misma unidad por mL).
 * Ej.: dopamina 5 mcg/kg/min, 70 kg, 400 mg en 250 mL (1600 mcg/mL) → 5 × 70 × 60 ÷ 1600 = 13.1 mL/h.
 */
export function velocidadMlH(dosis: number, unidadDosis: UnidadDosis, concPorMl: number, pesoKg = 0): number {
  if (unidadDosis.includes('/kg/') && !(pesoKg > 0)) return NaN
  if (!(concPorMl > 0)) return NaN
  return porHora(dosis, unidadDosis, pesoKg) / concPorMl
}

/** Inverso: dosis que recibe el paciente a una velocidad dada. */
export function dosisDesdeVelocidad(mlH: number, unidadDosis: UnidadDosis, concPorMl: number, pesoKg = 0): number {
  if (unidadDosis.includes('/kg/') && !(pesoKg > 0)) return NaN
  return (mlH * concPorMl) / porHora(1, unidadDosis, pesoKg)
}

/** Velocidad para pasar un volumen en cierto tiempo. */
export const mlHDesdeVolumen = (volumenMl: number, horas: number) => (horas > 0 ? volumenMl / horas : NaN)

/**
 * Gotas por minuto = volumen (mL) × factor de goteo (gotas/mL) ÷ tiempo (min) = mL/h × factor ÷ 60.
 * Macrogotero 20 gotas/mL (gotas/min = mL/h ÷ 3); microgotero 60 microgotas/mL (microgotas/min = mL/h).
 */
export const gotasPorMinuto = (mlH: number, factor: number) => (mlH * factor) / 60

/** Tiempo de infusión en horas = volumen ÷ velocidad. */
export const tiempoInfusionH = (volumenMl: number, mlH: number) => (mlH > 0 ? volumenMl / mlH : NaN)

export function fmtDuracion(horas: number): string {
  if (!Number.isFinite(horas)) return '—'
  const totalMin = Math.round(horas * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`
}

// ---------- Balance hídrico ----------
export type ViaIngreso = 'oral' | 'iv' | 'sonda' | 'otro-ingreso'
export type ViaEgreso = 'diuresis' | 'evacuaciones' | 'vomito' | 'drenajes' | 'sonda-egreso' | 'otro-egreso'
export const VIAS_INGRESO: Record<ViaIngreso, string> = { oral: 'Vía oral', iv: 'Intravenosos', sonda: 'Sonda (enteral)', 'otro-ingreso': 'Otros' }
export const VIAS_EGRESO: Record<ViaEgreso, string> = { diuresis: 'Diuresis', evacuaciones: 'Evacuaciones', vomito: 'Vómito', drenajes: 'Drenajes', 'sonda-egreso': 'Sonda (gasto)', 'otro-egreso': 'Otros' }

export interface Movimiento {
  id: string
  hora: string // ISO
  tipo: 'ingreso' | 'egreso'
  via: ViaIngreso | ViaEgreso
  ml: number
  nota?: string
}

/**
 * Pérdidas insensibles estimadas en adultos: 0.5 mL/kg/h (convención usual en hojas de enfermería; verificar con el
 * protocolo de su institución). Se puede ajustar el factor (p. ej., fiebre, ventilación mecánica).
 */
export const PI_FACTOR_ADULTO = 0.5
export const perdidasInsensibles = (pesoKg: number, horas: number, factor = PI_FACTOR_ADULTO) => (pesoKg > 0 && horas > 0 ? pesoKg * factor * horas : 0)

export interface Totales {
  ingresos: number
  egresos: number // medidos + insensibles
  medidos: number
  insensibles: number
  balance: number
  porVia: Record<string, number>
}

export function totales(movs: Movimiento[], pesoKg: number, horas: number, factorPI = PI_FACTOR_ADULTO): Totales {
  const porVia: Record<string, number> = {}
  let ingresos = 0
  let medidos = 0
  for (const m of movs) {
    porVia[m.via] = (porVia[m.via] ?? 0) + m.ml
    if (m.tipo === 'ingreso') ingresos += m.ml
    else medidos += m.ml
  }
  const insensibles = Math.round(perdidasInsensibles(pesoKg, horas, factorPI))
  const egresos = medidos + insensibles
  return { ingresos, egresos, medidos, insensibles, balance: ingresos - egresos, porVia }
}

/** Gasto urinario (mL/kg/h). KDIGO 2012: < 0.5 mL/kg/h durante 6–12 h es criterio de lesión renal aguda estadio 1. */
export const gastoUrinario = (diuresisMl: number, pesoKg: number, horas: number) => (pesoKg > 0 && horas > 0 ? diuresisMl / pesoKg / horas : NaN)

// ---------- Turnos ----------
export type Turno = 'matutino' | 'vespertino' | 'nocturno'
export const TURNOS: Turno[] = ['matutino', 'vespertino', 'nocturno']
export const TURNO_LABEL: Record<Turno, string> = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno' }
/** Hora de inicio de cada turno (0–23). El nocturno termina al inicio del matutino del día siguiente. */
export type ConfigTurnos = Record<Turno, number>
export const TURNOS_POR_OMISION: ConfigTurnos = { matutino: 7, vespertino: 15, nocturno: 21 }

/** Inicio del "día de enfermería" (inicio del turno matutino) que contiene la fecha dada. */
export function inicioDia(t: number, cfg: ConfigTurnos = TURNOS_POR_OMISION): number {
  const d = new Date(t)
  d.setHours(cfg.matutino, 0, 0, 0)
  if (d.getTime() > t) d.setDate(d.getDate() - 1)
  return d.getTime()
}

export function rangoTurno(dia0: number, turno: Turno, cfg: ConfigTurnos = TURNOS_POR_OMISION): [number, number] {
  const h = (x: number) => ((x - cfg.matutino + 24) % 24) * 3600000
  const ini = dia0 + h(cfg[turno])
  const fin = turno === 'matutino' ? dia0 + h(cfg.vespertino) : turno === 'vespertino' ? dia0 + h(cfg.nocturno) : dia0 + 24 * 3600000
  return [ini, fin]
}

export function turnoDe(t: number, cfg: ConfigTurnos = TURNOS_POR_OMISION): Turno {
  const d0 = inicioDia(t, cfg)
  return TURNOS.find((tu) => {
    const [a, b] = rangoTurno(d0, tu, cfg)
    return t >= a && t < b
  })!
}

// ---------- Horario de medicamentos (MAR) ----------
/**
 * Intervalo en horas a partir de la frecuencia escrita en la receta.
 * Devuelve 'prn' (por razón necesaria), 'unica' (dosis única) o null si no se reconoce.
 */
export function intervaloHoras(frecuencia: string): number | 'prn' | 'unica' | null {
  const f = frecuencia.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/\b(prn|razon necesaria|por razon|en caso de|si hay|si presenta|a demanda)\b/.test(f)) return 'prn'
  if (/(dosis unica|una sola dosis|\bstat\b|ahora)/.test(f)) return 'unica'
  const m = f.match(/(?:cada|c\/|c)\s*(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hora|horas)\b/) ?? f.match(/\bq\s*(\d+)\s*h\b/)
  if (m) return Number(m[1].replace(',', '.'))
  const veces = f.match(/(una|un|dos|tres|cuatro|seis|\d+)\s*(?:vez|veces)\s*(?:al|por)\s*dia/)
  if (veces) {
    const n = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, seis: 6 }[veces[1] as 'una'] ?? Number(veces[1])
    return n > 0 ? 24 / n : null
  }
  if (/(diari|cada dia|al dia|cada 24)/.test(f)) return 24
  if (/(en la noche|al acostarse|nocturn)/.test(f)) return 24
  return null
}

/**
 * Horas programadas de un medicamento dentro del día de enfermería [dia0, dia0 + 24 h).
 * `primera` = "HH:MM" de la primera dosis del horario (p. ej., 08:00 → c/8 h: 08, 16, 00).
 */
export function programarDosis(intervaloH: number, primera: string, dia0: number): number[] {
  if (!(intervaloH > 0)) return []
  const [hh, mm] = primera.split(':').map(Number)
  const ancla = new Date(dia0)
  ancla.setHours(hh || 0, mm || 0, 0, 0)
  let t = ancla.getTime()
  const paso = intervaloH * 3600000
  const fin = dia0 + 24 * 3600000
  while (t - paso >= dia0) t -= paso
  while (t < dia0) t += paso
  const out: number[] = []
  for (; t < fin; t += paso) out.push(t)
  return out
}

/** Los 5 correctos de la administración de medicamentos. */
export const CINCO_CORRECTOS = ['Paciente correcto', 'Medicamento correcto', 'Dosis correcta', 'Vía correcta', 'Hora correcta'] as const

/** Día local YYYY-MM-DD de un instante (clave de la hoja de enfermería). */
export function diaISO(t: number) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
