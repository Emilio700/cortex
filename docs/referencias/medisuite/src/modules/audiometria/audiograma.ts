// Lógica pura del audiograma: promedio tonal, clasificación OMS 2021, asimetría y brecha aéreo-ósea.
//
// Referencias:
// - OMS. World Report on Hearing (2021), Tabla 1 (grados de pérdida auditiva por PTA 0.5/1/2/4 kHz en el mejor oído).
// - ASHA. Guidelines for Audiometric Symbols (1990): O rojo derecho, X azul izquierdo, < > vía ósea, △ □ [ ] con enmascaramiento.
// - NICE NG98 (2018) Hearing loss in adults: asimetría ≥15 dB entre oídos en 2 frecuencias adyacentes (0.5, 1, 2, 4, 8 kHz)
//   como criterio para estudio de imagen.

export const FRECUENCIAS = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000] as const
export type Frecuencia = (typeof FRECUENCIAS)[number]
export const PTA_FRECS: Frecuencia[] = [500, 1000, 2000, 4000]
export const DB_MIN = -10
export const DB_MAX = 120

export type Oido = 'der' | 'izq'
export type Via = 'aerea' | 'osea'
export interface Umbral {
  db: number | null // dB HL; null = no evaluado
  enmascarado?: boolean
  sinRespuesta?: boolean // sin respuesta al máximo del equipo
}
/** umbrales[oido][via][frecuencia] */
export type Umbrales = Record<Oido, Record<Via, Partial<Record<Frecuencia, Umbral>>>>

export function vacio(): Umbrales {
  return { der: { aerea: {}, osea: {} }, izq: { aerea: {}, osea: {} } }
}

export function etiquetaFrec(f: number) {
  return f >= 1000 ? `${f / 1000}k` : String(f)
}

/** Promedio tonal puro (PTA) de vía aérea a 0.5, 1, 2 y 4 kHz. null si falta alguna frecuencia. */
export function pta(u: Partial<Record<Frecuencia, Umbral>>, frecs: Frecuencia[] = PTA_FRECS): number | null {
  const vals = frecs.map((f) => u[f]?.db)
  if (vals.some((v) => v === null || v === undefined || !Number.isFinite(v))) return null
  return Math.round(((vals as number[]).reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export interface GradoOMS {
  id: 'normal' | 'leve' | 'moderada' | 'moderadamente-severa' | 'severa' | 'profunda' | 'completa'
  nombre: string
  rango: string
  tono: 'ok' | 'warn' | 'danger'
}
export const GRADOS_OMS: (GradoOMS & { min: number; max: number })[] = [
  { id: 'normal', nombre: 'Audición normal', rango: '< 20 dB', min: -Infinity, max: 20, tono: 'ok' },
  { id: 'leve', nombre: 'Pérdida leve', rango: '20 a < 35 dB', min: 20, max: 35, tono: 'warn' },
  { id: 'moderada', nombre: 'Pérdida moderada', rango: '35 a < 50 dB', min: 35, max: 50, tono: 'warn' },
  { id: 'moderadamente-severa', nombre: 'Pérdida moderadamente severa', rango: '50 a < 65 dB', min: 50, max: 65, tono: 'danger' },
  { id: 'severa', nombre: 'Pérdida severa', rango: '65 a < 80 dB', min: 65, max: 80, tono: 'danger' },
  { id: 'profunda', nombre: 'Pérdida profunda', rango: '80 a < 95 dB', min: 80, max: 95, tono: 'danger' },
  { id: 'completa', nombre: 'Pérdida completa / total', rango: '≥ 95 dB', min: 95, max: Infinity, tono: 'danger' },
]

/** Grado OMS 2021 a partir de un PTA (dB HL). */
export function gradoOMS(ptaDb: number): GradoOMS {
  const g = GRADOS_OMS.find((x) => ptaDb >= x.min && ptaDb < x.max) ?? GRADOS_OMS[GRADOS_OMS.length - 1]
  return { id: g.id, nombre: g.nombre, rango: g.rango, tono: g.tono }
}

/**
 * Clasificación global OMS 2021: el grado se asigna por el mejor oído; si el mejor oído es < 20 dB y el peor ≥ 35 dB,
 * se describe como pérdida unilateral.
 */
export function clasificacion(ptaDer: number | null, ptaIzq: number | null): { grado: GradoOMS | null; unilateral: boolean; mejor: number | null } {
  if (ptaDer === null && ptaIzq === null) return { grado: null, unilateral: false, mejor: null }
  if (ptaDer === null || ptaIzq === null) {
    const v = (ptaDer ?? ptaIzq) as number
    return { grado: gradoOMS(v), unilateral: false, mejor: null }
  }
  const mejor = Math.min(ptaDer, ptaIzq)
  const peor = Math.max(ptaDer, ptaIzq)
  return { grado: gradoOMS(mejor), unilateral: mejor < 20 && peor >= 35, mejor }
}

/** Frecuencias de NICE NG98 para asimetría (6 kHz y 3 kHz no se consideran). */
export const ASIM_FRECS: Frecuencia[] = [500, 1000, 2000, 4000, 8000]

/**
 * Asimetría: diferencia ≥ `umbral` dB entre oídos en ≥ 2 frecuencias ADYACENTES de ASIM_FRECS (NICE NG98).
 * Devuelve las frecuencias que cumplen y si se cumple el criterio.
 */
export function asimetria(u: Umbrales, umbral = 15, via: Via = 'aerea'): { asimetrica: boolean; frecuencias: Frecuencia[]; diferencias: Partial<Record<Frecuencia, number>> } {
  const diferencias: Partial<Record<Frecuencia, number>> = {}
  const cumple = ASIM_FRECS.map((f) => {
    const a = u.der[via][f]?.db
    const b = u.izq[via][f]?.db
    if (a == null || b == null) return false
    diferencias[f] = Math.abs(a - b)
    return Math.abs(a - b) >= umbral
  })
  const frecs = new Set<Frecuencia>()
  for (let i = 1; i < cumple.length; i++)
    if (cumple[i] && cumple[i - 1]) {
      frecs.add(ASIM_FRECS[i - 1])
      frecs.add(ASIM_FRECS[i])
    }
  return { asimetrica: frecs.size > 0, frecuencias: [...frecs], diferencias }
}

/**
 * Brecha aéreo-ósea por oído: frecuencias donde aérea − ósea ≥ `umbral` (por defecto 15 dB).
 * Se considera significativa si ocurre en ≥ 2 frecuencias (criterio convencional; verificar según protocolo local).
 */
export function brechaAereoOsea(u: Umbrales, oido: Oido, umbral = 15): { significativa: boolean; frecuencias: Frecuencia[]; brechas: Partial<Record<Frecuencia, number>> } {
  const brechas: Partial<Record<Frecuencia, number>> = {}
  const frecs: Frecuencia[] = []
  for (const f of FRECUENCIAS) {
    const a = u[oido].aerea[f]?.db
    const o = u[oido].osea[f]?.db
    if (a == null || o == null) continue
    brechas[f] = a - o
    if (a - o >= umbral) frecs.push(f)
  }
  return { significativa: frecs.length >= 2, frecuencias: frecs, brechas }
}

/** Valida un umbral: múltiplo de 5 entre −10 y 120 dB HL. */
export function umbralValido(db: number): boolean {
  return Number.isFinite(db) && db >= DB_MIN && db <= DB_MAX && db % 5 === 0
}

// ---------- Geometría del audiograma (compartida por SVG, canvas y PDF) ----------
/** Posición horizontal 0..1 en escala logarítmica de 125 Hz a 8 kHz (ASHA: 1 octava = misma distancia). */
export function xFrec(f: number): number {
  return Math.log2(f / 125) / Math.log2(8000 / 125)
}
/** Posición vertical 0..1: −10 dB arriba, 120 dB abajo. */
export function yDb(db: number): number {
  return (db - DB_MIN) / (DB_MAX - DB_MIN)
}

// ---------- Tamiz en navegador (Hughson-Westlake simplificado: baja 10 / sube 5) ----------
/**
 * Máquina de estados para buscar un umbral relativo:
 * - Si el paciente responde → bajar 10 dB. Si no responde → subir 5 dB.
 * - Umbral = el nivel más bajo con 2 respuestas en subidas (ascensos) a ese mismo nivel.
 * Los niveles son relativos (dB respecto al máximo del dispositivo, dBFS), NO dB HL.
 */
export interface EstadoHW {
  nivel: number // dBFS (≤ 0)
  ascendiendo: boolean // el último cambio fue subida (la presentación actual es parte de un ascenso)
  respuestasAscenso: Record<string, number> // nivel → respuestas en ascenso
  intentos: number
  umbral: number | null
  terminado: boolean
  historial: { nivel: number; oyo: boolean }[]
}
export const HW = { inicio: -40, min: -100, max: 0, bajar: 10, subir: 5, maxIntentos: 40 }

export function hwInicio(nivel = HW.inicio): EstadoHW {
  return { nivel, ascendiendo: false, respuestasAscenso: {}, intentos: 0, umbral: null, terminado: false, historial: [] }
}

export function hwResponder(s: EstadoHW, oyo: boolean): EstadoHW {
  if (s.terminado) return s
  const historial = [...s.historial, { nivel: s.nivel, oyo }]
  const intentos = s.intentos + 1
  const respuestasAscenso = { ...s.respuestasAscenso }
  if (oyo && s.ascendiendo) {
    const k = String(s.nivel)
    respuestasAscenso[k] = (respuestasAscenso[k] ?? 0) + 1
    if (respuestasAscenso[k] >= 2) return { ...s, historial, intentos, respuestasAscenso, umbral: s.nivel, terminado: true }
  }
  if (oyo) {
    if (s.nivel - HW.bajar < HW.min) {
      // oye aun al mínimo del rango: se reporta el mínimo
      return { ...s, historial, intentos, respuestasAscenso, umbral: HW.min, terminado: true, nivel: HW.min }
    }
    return { ...s, historial, intentos, respuestasAscenso, nivel: s.nivel - HW.bajar, ascendiendo: false }
  }
  if (s.nivel + HW.subir > HW.max || intentos >= HW.maxIntentos) {
    return { ...s, historial, intentos, respuestasAscenso, umbral: null, terminado: true }
  }
  return { ...s, historial, intentos, respuestasAscenso, nivel: s.nivel + HW.subir, ascendiendo: true }
}

/** dBFS → ganancia lineal de Web Audio. */
export function dbfsAGanancia(dbfs: number): number {
  return Math.pow(10, dbfs / 20)
}

/**
 * Comparación relativa del tamiz: diferencia entre oídos ≥ 15 dB en alguna frecuencia o diferencia ≥ 15 dB respecto
 * al nivel de referencia (persona con audición normal en el MISMO equipo y audífonos) → sugerir audiometría formal.
 */
export function evaluarTamiz(
  der: Partial<Record<number, number | null>>,
  izq: Partial<Record<number, number | null>>,
  ref?: Partial<Record<number, number | null>>,
  umbral = 15,
): { sugerirAudiometria: boolean; motivos: string[] } {
  const motivos: string[] = []
  const frecs = new Set([...Object.keys(der), ...Object.keys(izq)].map(Number))
  for (const f of [...frecs].sort((a, b) => a - b)) {
    const a = der[f]
    const b = izq[f]
    const nf = etiquetaFrec(f) + 'Hz'
    if (a === null) motivos.push(`Oído derecho sin respuesta a ${nf}`)
    if (b === null) motivos.push(`Oído izquierdo sin respuesta a ${nf}`)
    if (a != null && b != null && Math.abs(a - b) >= umbral) motivos.push(`Diferencia entre oídos de ${Math.abs(a - b)} dB a ${nf}`)
    const r = ref?.[f]
    if (r != null) {
      if (a != null && a - r >= umbral) motivos.push(`Oído derecho ${a - r} dB por encima de la referencia a ${nf}`)
      if (b != null && b - r >= umbral) motivos.push(`Oído izquierdo ${b - r} dB por encima de la referencia a ${nf}`)
    }
  }
  return { sugerirAudiometria: motivos.length > 0, motivos }
}

// ---------- Interpretación completa ----------
export interface Interpretacion {
  ptaDer: number | null
  ptaIzq: number | null
  gradoDer: GradoOMS | null
  gradoIzq: GradoOMS | null
  global: ReturnType<typeof clasificacion>
  asim: ReturnType<typeof asimetria>
  brechaDer: ReturnType<typeof brechaAereoOsea>
  brechaIzq: ReturnType<typeof brechaAereoOsea>
  referir: string[]
}

export function interpretar(u: Umbrales): Interpretacion {
  const ptaDer = pta(u.der.aerea)
  const ptaIzq = pta(u.izq.aerea)
  const asim = asimetria(u)
  const brechaDer = brechaAereoOsea(u, 'der')
  const brechaIzq = brechaAereoOsea(u, 'izq')
  const global = clasificacion(ptaDer, ptaIzq)
  const referir: string[] = []
  if (asim.asimetrica) referir.push(`Asimetría ≥ 15 dB en frecuencias adyacentes (${asim.frecuencias.map(etiquetaFrec).join(', ')} Hz): valorar estudio de oído interno/conducto auditivo (NICE NG98).`)
  if (brechaDer.significativa) referir.push(`Brecha aéreo-ósea ≥ 15 dB en oído derecho (${brechaDer.frecuencias.map(etiquetaFrec).join(', ')} Hz): componente conductivo.`)
  if (brechaIzq.significativa) referir.push(`Brecha aéreo-ósea ≥ 15 dB en oído izquierdo (${brechaIzq.frecuencias.map(etiquetaFrec).join(', ')} Hz): componente conductivo.`)
  if ((ptaDer ?? 0) >= 20 || (ptaIzq ?? 0) >= 20) referir.push('PTA ≥ 20 dB HL en al menos un oído: valoración audiológica / otorrinolaringológica.')
  return { ptaDer, ptaIzq, gradoDer: ptaDer === null ? null : gradoOMS(ptaDer), gradoIzq: ptaIzq === null ? null : gradoOMS(ptaIzq), global, asim, brechaDer, brechaIzq, referir }
}
