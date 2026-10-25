// Cálculos obstétricos puros (sin React). Cada fórmula lleva su referencia.

const DIA = 864e5

/** 'YYYY-MM-DD' → milisegundos UTC a mediodía (evita saltos por zona horaria). */
export function diaUTC(f: string): number {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}
export function sumarDias(f: string, dias: number): string {
  return new Date(diaUTC(f) + dias * DIA).toISOString().slice(0, 10)
}
export function diasEntre(a: string, b: string): number {
  return Math.round((diaUTC(b) - diaUTC(a)) / DIA)
}
/** Fecha local de hoy como 'YYYY-MM-DD'. */
export function hoyISO(now = new Date()): string {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`
}

/** Edad gestacional en días → texto "24.3 SDG" (semanas.días). */
export function sdgTexto(dias: number): string {
  if (!Number.isFinite(dias)) return '—'
  const s = Math.floor(dias / 7)
  return `${s}.${dias - s * 7} SDG`
}

// ---------------------------------------------------------------------------
// Fecha probable de parto
// Regla de Naegele: FUM − 3 meses + 7 días + 1 año, que equivale a FUM + 280 días;
// ACOG Committee Opinion 700 (2017, reafirmada) define la FPP como FUM + 280 días.
export function fppNaegele(fum: string): string {
  return sumarDias(fum, 280)
}

/**
 * Umbral de discrepancia (días) entre la datación por USG y por FUM que justifica re-datar,
 * según la edad gestacional por FUM al momento del USG.
 * ACOG Committee Opinion No. 700, Methods for Estimating the Due Date (2017), tabla 1.
 */
export function umbralRedatacion(sdgFumDias: number): number {
  if (sdgFumDias < 9 * 7) return 5 // ≤ 8 6/7 sem (LCC)
  if (sdgFumDias < 14 * 7) return 7 // 9 0/7 – 13 6/7 sem (LCC)
  if (sdgFumDias < 16 * 7) return 7 // 14 0/7 – 15 6/7 sem (DBP, CC, CA, LF)
  if (sdgFumDias < 22 * 7) return 10 // 16 0/7 – 21 6/7
  if (sdgFumDias < 28 * 7) return 14 // 22 0/7 – 27 6/7
  return 21 // ≥ 28 0/7
}

export interface USGDatacion {
  fecha: string // fecha del ultrasonido
  sdgDias: number // edad gestacional estimada por el USG ese día (días)
}
export interface Datacion {
  fumEfectiva: string | null // FUM (real o "corregida" a partir del USG) usada para todos los cálculos
  fpp: string | null
  fppFum: string | null
  fppUsg: string | null
  metodo: 'FUM' | 'USG' | 'ninguno'
  discrepanciaDias?: number
  umbralDias?: number
  explicacion: string
}

/** Datación definitiva del embarazo con FUM y/o USG temprano (ACOG CO 700). */
export function datar(fum: string | null | undefined, usg?: USGDatacion | null): Datacion {
  const fumUsg = usg && usg.fecha && usg.sdgDias > 0 ? sumarDias(usg.fecha, -usg.sdgDias) : null
  const fppFum = fum ? fppNaegele(fum) : null
  const fppUsg = fumUsg ? fppNaegele(fumUsg) : null
  if (fum && fumUsg && usg) {
    const sdgFum = diasEntre(fum, usg.fecha)
    const disc = Math.abs(sdgFum - usg.sdgDias)
    const umbral = umbralRedatacion(sdgFum)
    if (disc > umbral)
      return { fumEfectiva: fumUsg, fpp: fppUsg, fppFum, fppUsg, metodo: 'USG', discrepanciaDias: disc, umbralDias: umbral, explicacion: `Discrepancia de ${disc} días (> ${umbral} días para ${sdgTexto(sdgFum)} por FUM): se re-data con el ultrasonido.` }
    return { fumEfectiva: fum, fpp: fppFum, fppFum, fppUsg, metodo: 'FUM', discrepanciaDias: disc, umbralDias: umbral, explicacion: `Discrepancia de ${disc} días (≤ ${umbral} días): se conserva la FUM.` }
  }
  if (fum) return { fumEfectiva: fum, fpp: fppFum, fppFum, fppUsg, metodo: 'FUM', explicacion: 'Datación por FUM (sin ultrasonido temprano registrado).' }
  if (fumUsg) return { fumEfectiva: fumUsg, fpp: fppUsg, fppFum, fppUsg, metodo: 'USG', explicacion: 'FUM desconocida: datación por ultrasonido.' }
  return { fumEfectiva: null, fpp: null, fppFum, fppUsg, metodo: 'ninguno', explicacion: 'Sin FUM ni ultrasonido: no se puede datar.' }
}

/** Edad gestacional (días) en una fecha, a partir de la FUM efectiva. */
export function sdgEn(fumEfectiva: string, fecha: string): number {
  return diasEntre(fumEfectiva, fecha)
}

// ---------------------------------------------------------------------------
// Robinson HP, Fleming JE. A critical evaluation of sonar "crown-rump length" measurements.
// Br J Obstet Gynaecol 1975;82:702–10.  EG (días) = 8.052 × √LCC(mm) + 23.73
export function lccAEdad(lccMm: number): number {
  return 8.052 * Math.sqrt(lccMm) + 23.73
}
/** Rango en que la LCC se usa para datar (hasta 84 mm ≈ 14 0/7 sem, ACOG CO 700). */
export const LCC_RANGO: [number, number] = [3, 84]

// ---------------------------------------------------------------------------
// Peso fetal estimado. Hadlock FP, Harrist RB, Sharman RS, Deter RL, Park SK. Estimation of fetal
// weight with the use of head, body, and femur measurements — a prospective study.
// Am J Obstet Gynecol 1985;151:333–7.  (fórmula con CC, CA y LF, medidas en cm)
//   log10(PFE g) = 1.326 − 0.00326·CA·LF + 0.0107·CC + 0.0438·CA + 0.158·LF
export function pfeHadlock(ccCm: number, caCm: number, lfCm: number): number {
  return 10 ** (1.326 - 0.00326 * caCm * lfCm + 0.0107 * ccCm + 0.0438 * caCm + 0.158 * lfCm)
}

// Hadlock FP, Harrist RB, Martinez-Poyer J. In utero analysis of fetal growth: a sonographic weight
// standard. Radiology 1991;181:129–33. Regresión publicada: ln(peso g) = 0.578 + 0.332·EG − 0.00354·EG²
// (EG en semanas, válida 10–40 sem), DE ≈ 12.7 % del peso predicho. Se calcula con la ECUACIÓN y no con la
// tabla impresa del artículo, que no coincide con ella (Roberts et al., AJOG 2025).
export const HADLOCK91_DE = 0.127
export function pesoMedianoHadlock91(egSem: number): number {
  return Math.exp(0.578 + 0.332 * egSem - 0.00354 * egSem * egSem)
}
/** Función de distribución normal estándar (Abramowitz-Stegun 26.2.17, error < 7.5e-8). */
export function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2)
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}
export function percentilHadlock91(pesoG: number, egSem: number): { mediana: number; z: number; percentil: number } {
  const mediana = pesoMedianoHadlock91(egSem)
  const z = (pesoG / mediana - 1) / HADLOCK91_DE
  return { mediana, z, percentil: phi(z) * 100 }
}
/** Peso para un percentil dado (z de la normal). p10 → z = −1.2816, p90 → +1.2816. */
export function pesoEnZ(egSem: number, z: number): number {
  return pesoMedianoHadlock91(egSem) * (1 + z * HADLOCK91_DE)
}

// ---------------------------------------------------------------------------
// Ganancia de peso gestacional. IOM (Institute of Medicine) 2009, Weight Gain During Pregnancy:
// Reexamining the Guidelines. Tabla S-1 (embarazo único). Las tasas de 2.º y 3.er trimestre suponen
// una ganancia de 0.5–2 kg en el primer trimestre.
export type CatIMC = 'bajo' | 'normal' | 'sobrepeso' | 'obesidad'
export const IOM: Record<CatIMC, { label: string; imc: string; total: [number, number]; tasa: number; tasaRango: [number, number] }> = {
  bajo: { label: 'Bajo peso', imc: '< 18.5', total: [12.5, 18], tasa: 0.51, tasaRango: [0.44, 0.58] },
  normal: { label: 'Peso normal', imc: '18.5–24.9', total: [11.5, 16], tasa: 0.42, tasaRango: [0.35, 0.5] },
  sobrepeso: { label: 'Sobrepeso', imc: '25.0–29.9', total: [7, 11.5], tasa: 0.28, tasaRango: [0.23, 0.33] },
  obesidad: { label: 'Obesidad', imc: '≥ 30.0', total: [5, 9], tasa: 0.22, tasaRango: [0.17, 0.27] },
}
export const IOM_T1: [number, number] = [0.5, 2]
export function imc(pesoKg: number, tallaCm: number): number {
  return pesoKg / (tallaCm / 100) ** 2
}
export function categoriaIMC(v: number): CatIMC {
  return v < 18.5 ? 'bajo' : v < 25 ? 'normal' : v < 30 ? 'sobrepeso' : 'obesidad'
}
/**
 * Banda de ganancia recomendada (kg) a una edad gestacional: lineal hasta 0.5–2 kg a las 13 sem y,
 * después, las tasas semanales mín./máx. del IOM. Es una aproximación construida con las tasas IOM 2009.
 */
export function bandaIOM(cat: CatIMC, sem: number): [number, number] {
  const [a, b] = IOM[cat].tasaRango
  if (sem <= 13) return [(IOM_T1[0] * Math.max(sem, 0)) / 13, (IOM_T1[1] * Math.max(sem, 0)) / 13]
  return [IOM_T1[0] + a * (sem - 13), IOM_T1[1] + b * (sem - 13)]
}

// ---------------------------------------------------------------------------
// Altura uterina. Regla de McDonald: entre las 20 y 36 SDG la altura del fondo uterino (cm, sínfisis-fondo)
// ≈ SDG ± 2 cm. Aproximación clínica, no curva poblacional.
export const AU_RANGO_SDG: [number, number] = [20, 36]
export function evaluarAU(sdgSem: number, auCm: number): 'normal' | 'baja' | 'alta' | 'fuera-de-rango' {
  if (sdgSem < AU_RANGO_SDG[0] || sdgSem > AU_RANGO_SDG[1] + 6 / 7) return 'fuera-de-rango'
  const s = Math.floor(sdgSem)
  if (auCm < s - 2) return 'baja'
  if (auCm > s + 2) return 'alta'
  return 'normal'
}

// ---------------------------------------------------------------------------
// Alertas de la consulta prenatal.
// NOM-007-SSA2-2016 (signos y síntomas de alarma) y GPC de enfermedades hipertensivas del embarazo:
// TA ≥ 140/90 mmHg = hipertensión; ≥ 160/110 = rango severo. FCF normal 110–160 lpm (FIGO 2015).
export interface ConsultaPrenatal {
  fecha: string
  peso?: number
  pas?: number
  pad?: number
  au?: number
  fcf?: number
  movimientos?: 'presentes' | 'disminuidos' | 'ausentes' | ''
  edema?: 'no' | 'leve' | 'moderado' | 'generalizado' | ''
  proteinuria?: 'negativa' | 'trazas' | '1+' | '2+' | '3+' | '4+' | ''
  presentacion?: 'cefalica' | 'pelvica' | 'transversa' | 'no-valorable' | ''
  sintomas?: string[] // cefalea, fosfenos, acúfenos, epigastralgia, sangrado, salida de líquido, contracciones
  notas?: string
}
export interface Alerta {
  nivel: 'danger' | 'warn'
  texto: string
}
export const SINTOMAS_ALARMA = [
  'Cefalea intensa',
  'Visión borrosa / fosfenos',
  'Acúfenos',
  'Dolor en epigastrio o hipocondrio derecho',
  'Sangrado vaginal',
  'Salida de líquido (posible RPM)',
  'Contracciones antes de las 37 SDG',
  'Fiebre',
  'Convulsiones',
] as const

export function alertasConsulta(c: ConsultaPrenatal, sdgDias: number | null): Alerta[] {
  const a: Alerta[] = []
  const sem = sdgDias === null ? null : sdgDias / 7
  if (c.pas !== undefined && c.pad !== undefined && (c.pas >= 160 || c.pad >= 110))
    a.push({ nivel: 'danger', texto: `TA ${c.pas}/${c.pad} mmHg en rango severo (≥ 160/110): valoración urgente.` })
  else if ((c.pas ?? 0) >= 140 || (c.pad ?? 0) >= 90)
    a.push({ nivel: 'danger', texto: `TA ${c.pas ?? '—'}/${c.pad ?? '—'} mmHg ≥ 140/90: hipertensión en el embarazo${sem !== null && sem >= 20 ? '; signo de alarma de preeclampsia' : ''}. Confirmar y referir.` })
  const prot = c.proteinuria && c.proteinuria !== 'negativa' && c.proteinuria !== 'trazas'
  if (prot) a.push({ nivel: (c.pas ?? 0) >= 140 || (c.pad ?? 0) >= 90 ? 'danger' : 'warn', texto: `Proteinuria ${c.proteinuria} en tira reactiva${(c.pas ?? 0) >= 140 || (c.pad ?? 0) >= 90 ? ' con hipertensión: sospecha de preeclampsia' : ': cuantificar (relación proteína/creatinina u orina de 24 h)'}.` })
  if (c.au !== undefined && sem !== null) {
    const e = evaluarAU(sem, c.au)
    if (e === 'baja') a.push({ nivel: 'warn', texto: `Altura uterina ${c.au} cm menor a SDG − 2 cm: descartar restricción del crecimiento u oligohidramnios (USG).` })
    if (e === 'alta') a.push({ nivel: 'warn', texto: `Altura uterina ${c.au} cm mayor a SDG + 2 cm: descartar error de datación, macrosomía, polihidramnios o gemelar (USG).` })
  }
  if (c.fcf !== undefined && (c.fcf < 110 || c.fcf > 160)) a.push({ nivel: 'danger', texto: `FCF ${c.fcf} lpm fuera de 110–160 lpm.` })
  if (c.movimientos === 'disminuidos' || c.movimientos === 'ausentes') a.push({ nivel: 'danger', texto: `Movimientos fetales ${c.movimientos}: signo de alarma (NOM-007).` })
  if (c.edema === 'generalizado' || (c.edema && c.edema !== 'no' && ((c.pas ?? 0) >= 140 || (c.pad ?? 0) >= 90))) a.push({ nivel: 'warn', texto: `Edema ${c.edema}: vigilar preeclampsia.` })
  if (c.presentacion && c.presentacion !== 'cefalica' && c.presentacion !== 'no-valorable' && sem !== null && sem >= 36) a.push({ nivel: 'warn', texto: `Presentación ${c.presentacion} a las ${Math.floor(sem)} SDG: planear vía de nacimiento.` })
  for (const s of c.sintomas ?? []) a.push({ nivel: 'danger', texto: `Síntoma de alarma: ${s}.` })
  return a
}

// ---------------------------------------------------------------------------
// Calendario de consultas, estudios y vacunas.
// NOM-007-SSA2-2016, 5.2.1.2: al menos 5 consultas, idealmente con este calendario (semanas).
export const CONSULTAS_NOM007: { desde: number; hasta: number; texto: string }[] = [
  { desde: 6, hasta: 8, texto: '1.ª consulta (6–8 SDG)' },
  { desde: 10, hasta: 13.86, texto: '2.ª consulta (10–13.6 SDG)' },
  { desde: 16, hasta: 18, texto: '3.ª consulta (16–18 SDG)' },
  { desde: 22, hasta: 22.86, texto: '4.ª consulta (22 SDG)' },
  { desde: 28, hasta: 28.86, texto: '5.ª consulta (28 SDG)' },
  { desde: 32, hasta: 32.86, texto: '6.ª consulta (32 SDG)' },
  { desde: 36, hasta: 36.86, texto: '7.ª consulta (36 SDG)' },
  { desde: 38, hasta: 41, texto: '8.ª consulta (38–41 SDG)' },
]

export interface Pendiente {
  desde: number // semana
  hasta: number
  tipo: 'estudio' | 'vacuna' | 'suplemento'
  texto: string
  ref: string
  verificar?: boolean
  soloRhNeg?: boolean
  vacunaId?: string // id de vacuna en el módulo de Vacunación (para marcarla como aplicada)
}
export const CALENDARIO: Pendiente[] = [
  { desde: 0, hasta: 12, tipo: 'suplemento', texto: 'Ácido fólico 0.4 mg/día (idealmente desde 3 meses antes de la concepción) hasta la semana 12', ref: 'NOM-007-SSA2-2016' },
  { desde: 0, hasta: 13, tipo: 'estudio', texto: 'Primera consulta: biometría hemática, grupo sanguíneo y Rh, glucosa en ayuno, examen general de orina', ref: 'NOM-007-SSA2-2016' },
  { desde: 0, hasta: 13, tipo: 'estudio', texto: 'Tamizaje de VIH y sífilis (prueba rápida o VDRL) en la primera consulta', ref: 'NOM-007-SSA2-2016' },
  { desde: 0, hasta: 13, tipo: 'estudio', texto: 'Urocultivo para bacteriuria asintomática', ref: 'GPC Control prenatal con atención centrada en la paciente', verificar: true },
  { desde: 11, hasta: 13.86, tipo: 'estudio', texto: 'Ultrasonido 11–13.6 SDG (datación con LCC, translucencia nucal)', ref: 'GPC Control prenatal', verificar: true },
  { desde: 18, hasta: 22, tipo: 'estudio', texto: 'Ultrasonido estructural 18–22 SDG', ref: 'GPC Control prenatal', verificar: true },
  { desde: 24, hasta: 28, tipo: 'estudio', texto: 'Tamizaje de diabetes gestacional: CTGO 75 g (o tamiz 50 g, según unidad)', ref: 'GPC Diagnóstico y tratamiento de la diabetes en el embarazo', verificar: true },
  { desde: 28, hasta: 28.86, tipo: 'estudio', texto: 'Rh negativo no sensibilizada: Coombs indirecto e inmunoglobulina anti-D 300 µg a las 28 SDG', ref: 'GPC Prevención de la isoinmunización materno-fetal', verificar: true, soloRhNeg: true },
  { desde: 28, hasta: 34, tipo: 'estudio', texto: 'Tercer trimestre: repetir biometría hemática, EGO y tamizaje de VIH/sífilis', ref: 'NOM-007-SSA2-2016', verificar: true },
  { desde: 20, hasta: 36, tipo: 'vacuna', vacunaId: 'tdpa', texto: 'Tdpa: 1 dosis en cada embarazo a partir de la semana 20', ref: 'Esquema Nacional de Vacunación (CeNSIA)', verificar: true },
  { desde: 0, hasta: 41, tipo: 'vacuna', vacunaId: 'flu', texto: 'Influenza estacional: 1 dosis en cualquier trimestre durante la temporada invernal', ref: 'Esquema Nacional de Vacunación (CeNSIA)' },
  { desde: 0, hasta: 41, tipo: 'vacuna', vacunaId: 'covid', texto: 'COVID-19: según la campaña vigente', ref: 'Secretaría de Salud', verificar: true },
]
