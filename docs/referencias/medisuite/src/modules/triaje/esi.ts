// Emergency Severity Index (ESI) — algoritmo de triaje de 5 niveles.
//
// Fuente: Gilboy N, Tanabe P, Travers D, Rosenau AM. Emergency Severity Index (ESI): A Triage Tool for
// Emergency Department Care, Version 4. Implementation Handbook 2012 Edition. AHRQ Publication No. 12-0014.
// Rockville, MD: Agency for Healthcare Research and Quality; 2011 (dominio público). La versión 5 (ENA, 2020/2023)
// conserva los cuatro puntos de decisión A–D y la tabla de signos vitales de "zona de peligro".
//
// Puntos de decisión:
//   A. ¿Requiere intervención inmediata para salvar la vida? → ESI 1
//   B. ¿Situación de alto riesgo, confusión/letargo/desorientación de inicio reciente o dolor/angustia intensos? → ESI 2
//   C. ¿Cuántos recursos distintos necesitará? ninguno → ESI 5; uno → ESI 4; dos o más → D
//   D. ¿Signos vitales en zona de peligro? → considerar ESI 2; si no → ESI 3

export type NivelESI = 1 | 2 | 3 | 4 | 5

export interface Vitales {
  fc?: number // lpm
  fr?: number // rpm
  spo2?: number // %
  temp?: number // °C
  pas?: number
  pad?: number
  glucosa?: number
}

export interface EntradaESI {
  /** Edad en meses (para la tabla de signos vitales y las consideraciones de fiebre pediátrica). */
  edadMeses: number
  /** A: requiere intervención inmediata para salvar la vida (o paciente intubado, apneico, sin pulso, con dificultad respiratoria grave, SpO₂ < 90 %, cambio agudo del estado mental o que no responde). */
  salvavidas: boolean
  /** B: situación de alto riesgo. */
  altoRiesgo: boolean
  /** B: confusión, letargo o desorientación de inicio reciente. */
  confusion: boolean
  /** B: dolor o angustia intensos (clínicamente o dolor ≥ 7/10) — a criterio de la enfermera. */
  dolorIntenso: boolean
  /** C: número de recursos DISTINTOS que se prevé usar (ver RECURSOS). */
  recursos: number
  vitales: Vitales
  /** D: la enfermera decide si los signos de zona de peligro elevan a ESI 2 ("considerar"). Por omisión, sí. */
  aceptarSubirPorVitales?: boolean
  /** Fiebre pediátrica 3–36 meses: esquema de vacunación incompleto o sin foco evidente. */
  vacunasIncompletasOSinFoco?: boolean
}

export interface ResultadoESI {
  nivel: NivelESI
  /** Punto de decisión que determinó el nivel. */
  punto: 'A' | 'B' | 'C' | 'D'
  razones: string[]
  /** Signos vitales fuera de la zona segura (para mostrar aunque no se haya subido el nivel). */
  zonaPeligro: string[]
  /** Advertencias de fiebre pediátrica según el manual. */
  fiebre?: { nivelMinimo?: NivelESI; considerar?: NivelESI; texto: string }
}

/** Umbrales de signos vitales de "zona de peligro" (manual ESI v4, figura del algoritmo, punto D). */
export const ZONA_PELIGRO: { rango: string; desdeMeses: number; hastaMeses: number; fc: number; fr: number }[] = [
  { rango: '< 3 meses', desdeMeses: 0, hastaMeses: 3, fc: 180, fr: 50 },
  { rango: '3 meses – 3 años', desdeMeses: 3, hastaMeses: 36, fc: 160, fr: 40 },
  { rango: '3 – 8 años', desdeMeses: 36, hastaMeses: 96, fc: 140, fr: 30 },
  { rango: '> 8 años', desdeMeses: 96, hastaMeses: Infinity, fc: 100, fr: 20 },
]
export const SPO2_PELIGRO = 92 // SpO₂ < 92 %

export function umbralEdad(edadMeses: number) {
  return ZONA_PELIGRO.find((z) => edadMeses >= z.desdeMeses && edadMeses < z.hastaMeses) ?? ZONA_PELIGRO[ZONA_PELIGRO.length - 1]
}

/** Signos vitales en zona de peligro según la edad (estrictamente mayor que el umbral de FC/FR; SpO₂ menor a 92 %). */
export function zonaPeligro(v: Vitales, edadMeses: number): string[] {
  const u = umbralEdad(edadMeses)
  const out: string[] = []
  if (v.fc != null && v.fc > u.fc) out.push(`FC ${v.fc} lpm > ${u.fc} (${u.rango})`)
  if (v.fr != null && v.fr > u.fr) out.push(`FR ${v.fr} rpm > ${u.fr} (${u.rango})`)
  if (v.spo2 != null && v.spo2 < SPO2_PELIGRO) out.push(`SpO₂ ${v.spo2} % < ${SPO2_PELIGRO} %`)
  return out
}

/**
 * Consideraciones de fiebre pediátrica (manual ESI v4, figura del algoritmo):
 * - 1 a 28 días: asignar al menos ESI 2 si temperatura > 38.0 °C.
 * - 1 a 3 meses: considerar ESI 2 si temperatura > 38.0 °C.
 * - 3 meses a 3 años: considerar ESI 3 si temperatura > 39.0 °C, o esquema de vacunación incompleto, o sin foco evidente de fiebre.
 */
export function fiebrePediatrica(edadMeses: number, temp: number | undefined, vacunasIncompletasOSinFoco = false): ResultadoESI['fiebre'] {
  if (edadMeses >= 36) return undefined
  const dias = edadMeses * 30.4375
  if (temp != null && temp > 38 && dias <= 28) return { nivelMinimo: 2, texto: 'Neonato (1–28 días) con temperatura > 38.0 °C: asignar al menos ESI 2.' }
  if (temp != null && temp > 38 && edadMeses < 3) return { considerar: 2, texto: 'Lactante de 1–3 meses con temperatura > 38.0 °C: considerar ESI 2.' }
  if (edadMeses >= 3 && ((temp != null && temp > 39) || (vacunasIncompletasOSinFoco && temp != null && temp > 38)))
    return { considerar: 3, texto: 'Niño de 3 meses a 3 años con fiebre > 39.0 °C, vacunas incompletas o sin foco evidente: considerar ESI 3.' }
  return undefined
}

export function clasificarESI(e: EntradaESI): ResultadoESI {
  const zp = zonaPeligro(e.vitales, e.edadMeses)
  const fiebre = fiebrePediatrica(e.edadMeses, e.vitales.temp, e.vacunasIncompletasOSinFoco)
  const base = { zonaPeligro: zp, fiebre }
  if (e.salvavidas) return { ...base, nivel: 1, punto: 'A', razones: ['Requiere intervención inmediata para salvar la vida'] }
  const b: string[] = []
  if (e.altoRiesgo) b.push('Situación de alto riesgo')
  if (e.confusion) b.push('Confusión, letargo o desorientación de inicio reciente')
  if (e.dolorIntenso) b.push('Dolor o angustia intensos')
  if (b.length) return { ...base, nivel: 2, punto: 'B', razones: b }
  // Neonato febril: el manual indica ESI 2 como mínimo (equivale a situación de alto riesgo).
  if (fiebre?.nivelMinimo === 2) return { ...base, nivel: 2, punto: 'B', razones: [fiebre.texto] }
  const r = Math.max(0, Math.floor(e.recursos))
  let res: ResultadoESI
  if (r === 0) res = { ...base, nivel: 5, punto: 'C', razones: ['No requiere recursos'] }
  else if (r === 1) res = { ...base, nivel: 4, punto: 'C', razones: ['Requiere un recurso'] }
  else if (zp.length && e.aceptarSubirPorVitales !== false) res = { ...base, nivel: 2, punto: 'D', razones: [`Requiere ${r} recursos y tiene signos vitales en zona de peligro`, ...zp] }
  else res = { ...base, nivel: 3, punto: 'D', razones: [`Requiere ${r} recursos`] }
  // "Considerar" ESI 2/3 por fiebre: se sugiere (la decisión es de la enfermera) — se aplica si mejora la prioridad.
  if (fiebre?.considerar && fiebre.considerar < res.nivel && e.aceptarSubirPorVitales !== false) {
    res = { ...res, nivel: fiebre.considerar, razones: [...res.razones, fiebre.texto] }
  }
  return res
}

// ---------- Catálogos del manual ----------

/** Intervenciones inmediatas para salvar la vida (manual ESI v4, tabla 2-1). */
export const SALVAVIDAS = {
  si: [
    'Vía aérea/ventilación: ventilación con bolsa-válvula-mascarilla, intubación, vía aérea quirúrgica, CPAP o BiPAP de urgencia',
    'Terapia eléctrica: desfibrilación, cardioversión urgente, marcapaso externo',
    'Procedimientos: descompresión torácica con aguja, pericardiocentesis, toracotomía abierta, acceso intraóseo',
    'Hemodinamia: reanimación con líquidos IV significativa, transfusión, control de hemorragia mayor',
    'Medicamentos: naloxona, dextrosa al 50 %, dopamina, atropina, adenosina',
  ],
  no: [
    'Estudios diagnósticos (ECG, laboratorios, TAC/USG)',
    'Oxígeno por puntas nasales o mascarilla con reservorio',
    'Monitor cardiaco, acceso IV o solución IV de mantenimiento',
    'Nebulizaciones, ácido acetilsalicílico, nitroglicerina IV, antibióticos, heparina, analgésicos',
  ],
  condiciones: 'Paciente intubado, apneico, sin pulso, con dificultad respiratoria grave, SpO₂ < 90 %, cambio agudo del estado mental o que no responde (no verbal y no obedece órdenes de forma aguda, o requiere estímulo doloroso: P o U en AVPU).',
}

/** Ejemplos de situaciones de alto riesgo (manual ESI v4, cap. 4). */
export const ALTO_RIESGO_EJEMPLOS = [
  'Dolor torácico sugestivo de síndrome coronario agudo sin criterios de ESI 1',
  'Signos de evento vascular cerebral',
  'Sospecha de embarazo ectópico con estabilidad hemodinámica',
  'Paciente inmunocomprometido con fiebre (p. ej., en quimioterapia)',
  'Ideación suicida u homicida',
  'Sobredosis o intoxicación potencialmente grave',
  'Mecanismo de lesión de alta energía',
]

export interface Recurso {
  id: string
  nombre: string
  /** Cuántos recursos cuenta (procedimiento complejo = 2). */
  cuenta: number
}

/** Recursos que SÍ cuentan (manual ESI v4, tabla 5-1). Varios estudios del mismo tipo cuentan como uno solo. */
export const RECURSOS: Recurso[] = [
  { id: 'lab', nombre: 'Laboratorios (sangre, orina)', cuenta: 1 },
  { id: 'ecg-rx', nombre: 'ECG, radiografías', cuenta: 1 },
  { id: 'imagen', nombre: 'TAC, RM, ultrasonido, angiografía', cuenta: 1 },
  { id: 'liquidos', nombre: 'Líquidos IV (hidratación)', cuenta: 1 },
  { id: 'meds', nombre: 'Medicamentos IV, IM o nebulizados', cuenta: 1 },
  { id: 'interconsulta', nombre: 'Interconsulta a especialidad', cuenta: 1 },
  { id: 'proc-simple', nombre: 'Procedimiento simple (sutura, sonda vesical)', cuenta: 1 },
  { id: 'proc-complejo', nombre: 'Procedimiento complejo (sedación consciente)', cuenta: 2 },
]

/** NO son recursos (manual ESI v4, tabla 5-1). */
export const NO_RECURSOS = [
  'Historia clínica y exploración física (incluida la pélvica)',
  'Pruebas en el punto de atención (p. ej., glucemia capilar)',
  'Colocación de catéter heparinizado/salino',
  'Medicamentos por vía oral',
  'Vacuna antitetánica',
  'Resurtido de recetas',
  'Llamada telefónica al médico tratante',
  'Curación simple (apósitos, revisión)',
  'Muletas, férulas, cabestrillos',
]

export function contarRecursos(ids: string[]): number {
  return [...new Set(ids)].reduce((s, id) => s + (RECURSOS.find((r) => r.id === id)?.cuenta ?? 0), 0)
}

// ---------- Presentación ----------
/**
 * El ESI no define colores ni tiempos oficiales. Estos son valores por omisión de uso común (azul = 5, verde = 4,
 * amarillo = 3, naranja = 2, rojo = 1) y tiempos meta configurables por la institución (verificar con su política).
 */
export const NIVELES: Record<NivelESI, { nombre: string; color: string; clase: string; minutos: number; desc: string }> = {
  1: { nombre: 'Reanimación', color: 'Rojo', clase: 'bg-red-600 text-white dark:bg-red-500 dark:text-black', minutos: 0, desc: 'Intervención inmediata para salvar la vida' },
  2: { nombre: 'Emergencia', color: 'Naranja', clase: 'bg-orange-500 text-black dark:bg-orange-400', minutos: 10, desc: 'Alto riesgo; no debe esperar' },
  3: { nombre: 'Urgencia', color: 'Amarillo', clase: 'bg-yellow-300 text-black dark:bg-yellow-300', minutos: 30, desc: 'Estable, requiere dos o más recursos' },
  4: { nombre: 'Menos urgente', color: 'Verde', clase: 'bg-green-600 text-white dark:bg-green-500 dark:text-black', minutos: 60, desc: 'Estable, un recurso' },
  5: { nombre: 'No urgente', color: 'Azul', clase: 'bg-blue-600 text-white dark:bg-blue-400 dark:text-black', minutos: 120, desc: 'Estable, sin recursos' },
}

export interface EnCola {
  id: string
  nivel: NivelESI
  llegada: string // ISO
}

/** Orden del tablero: primero el nivel ESI (1 → 5) y luego la hora de llegada (más antiguo primero). */
export function ordenarCola<T extends EnCola>(cola: T[]): T[] {
  return [...cola].sort((a, b) => a.nivel - b.nivel || a.llegada.localeCompare(b.llegada))
}

/** Minutos de espera y si se rebasó el tiempo meta. */
export function espera(llegada: string, nivel: NivelESI, ahora: number, metas: Record<NivelESI, number> = metasPorOmision()) {
  const min = Math.max(0, Math.floor((ahora - Date.parse(llegada)) / 60000))
  const meta = metas[nivel]
  return { min, meta, vencido: min > meta, restante: meta - min }
}

export function metasPorOmision(): Record<NivelESI, number> {
  return { 1: NIVELES[1].minutos, 2: NIVELES[2].minutos, 3: NIVELES[3].minutos, 4: NIVELES[4].minutos, 5: NIVELES[5].minutos }
}
