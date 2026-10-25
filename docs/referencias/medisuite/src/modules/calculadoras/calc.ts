// Fórmulas clínicas puras (sin React) para poder probarlas con `npx tsx calc.test.ts`.
export type Sexo = 'F' | 'M'
const DAY = 86400000

export const imc = (pesoKg: number, tallaCm: number) => pesoKg / (tallaCm / 100) ** 2
export function imcCategoria(v: number): [string, Tone] {
  if (v < 16) return ['Delgadez severa', 'danger']
  if (v < 17) return ['Delgadez moderada', 'warn']
  if (v < 18.5) return ['Delgadez leve (bajo peso)', 'warn']
  if (v < 25) return ['Normal', 'ok']
  if (v < 30) return ['Sobrepeso (preobesidad)', 'warn']
  if (v < 35) return ['Obesidad grado I', 'danger']
  if (v < 40) return ['Obesidad grado II', 'danger']
  return ['Obesidad grado III', 'danger']
}
export type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

export const scMosteller = (pesoKg: number, tallaCm: number) => Math.sqrt((pesoKg * tallaCm) / 3600)
/** Peso ideal de Devine (kg). */
export const pesoIdealDevine = (tallaCm: number, sexo: Sexo) => (sexo === 'M' ? 50 : 45.5) + 2.3 * (tallaCm / 2.54 - 60)
export const pam = (pas: number, pad: number) => pad + (pas - pad) / 3

/** CKD-EPI 2021 sin raza (mL/min/1.73 m²). Scr en mg/dL. */
export function ckdEpi2021(scr: number, edad: number, sexo: Sexo) {
  const k = sexo === 'F' ? 0.7 : 0.9
  const a = sexo === 'F' ? -0.241 : -0.302
  return 142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** edad * (sexo === 'F' ? 1.012 : 1)
}
export function kdigoG(tfg: number): [string, Tone] {
  if (tfg >= 90) return ['G1 · normal o alta', 'ok']
  if (tfg >= 60) return ['G2 · levemente disminuida', 'ok']
  if (tfg >= 45) return ['G3a · leve a moderadamente disminuida', 'warn']
  if (tfg >= 30) return ['G3b · moderada a gravemente disminuida', 'warn']
  if (tfg >= 15) return ['G4 · gravemente disminuida', 'danger']
  return ['G5 · falla renal', 'danger']
}
/** Cockcroft-Gault (mL/min). */
export const cockcroftGault = (edad: number, pesoKg: number, scr: number, sexo: Sexo) => (((140 - edad) * pesoKg) / (72 * scr)) * (sexo === 'F' ? 0.85 : 1)

/** QTc (ms): QT en ms, FC en lpm. */
export const qtcBazett = (qt: number, fc: number) => qt / Math.sqrt(60 / fc)
export const qtcFridericia = (qt: number, fc: number) => qt / Math.cbrt(60 / fc)

export const CHA2DS2_RIESGO = [0, 1.3, 2.2, 3.2, 4.0, 6.7, 9.8, 9.6, 6.7, 15.2] // % EVC/año (Lip 2010)
export const CURB65_MORT = [0.6, 2.7, 6.8, 14.0, 27.8, 27.8]

/** Fecha probable de parto por FUM (Naegele: FUM + 280 días). Fechas YYYY-MM-DD. */
export function fppNaegele(fum: string) {
  return addDays(fum, 280)
}
export function addDays(fecha: string, d: number) {
  const t = Date.parse(fecha + 'T00:00:00Z') + d * DAY
  return new Date(t).toISOString().slice(0, 10)
}
export function diffDays(a: string, b: string) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY)
}
export const fmtEG = (dias: number) => `${Math.floor(dias / 7)} sem ${dias % 7} d`
/** Umbral ACOG/AIUM/SMFM (2017) para redatar por USG según EG del USG (días): diferencia en días. */
export function umbralRedatar(egDias: number) {
  if (egDias <= 8 * 7 + 6) return 5
  if (egDias <= 13 * 7 + 6) return 7
  if (egDias <= 15 * 7 + 6) return 7
  if (egDias <= 21 * 7 + 6) return 10
  if (egDias <= 27 * 7 + 6) return 14
  return 21
}

export const homaIR = (glucosaMgDl: number, insulina: number) => (glucosaMgDl * insulina) / 405
export const eAG = (a1c: number) => 28.7 * a1c - 46.7
export const fib4 = (edad: number, ast: number, alt: number, plaquetas: number) => (edad * ast) / (plaquetas * Math.sqrt(alt))

/** Child-Pugh: devuelve puntos. ascitis/encefalopatia: 1 ausente, 2 leve, 3 moderada-grave. */
export function childPugh(bili: number, alb: number, inr: number, ascitis: number, encef: number) {
  const pb = bili < 2 ? 1 : bili <= 3 ? 2 : 3
  const pa = alb > 3.5 ? 1 : alb >= 2.8 ? 2 : 3
  const pi = inr < 1.7 ? 1 : inr <= 2.3 ? 2 : 3
  return pb + pa + pi + ascitis + encef
}
export const childClase = (p: number) => (p <= 6 ? 'A' : p <= 9 ? 'B' : 'C')

/** MELD original (UNOS, pre-2016) y MELD-Na (UNOS 2016). */
export function meld(cr: number, bili: number, inr: number, dialisis: boolean, na?: number) {
  const c = dialisis ? 4 : Math.min(Math.max(cr, 1), 4)
  const b = Math.max(bili, 1)
  const i = Math.max(inr, 1)
  const raw = 0.957 * Math.log(c) + 0.378 * Math.log(b) + 1.12 * Math.log(i) + 0.643
  let m = Math.round(raw * 10) // UNOS: redondear a décimas y ×10
  m = Math.min(m, 40)
  let mNa: number | undefined
  if (na !== undefined && !isNaN(na)) {
    const n = Math.min(Math.max(na, 125), 137)
    mNa = m > 11 ? Math.round(m + 1.32 * (137 - n) - 0.033 * m * (137 - n)) : m
    mNa = Math.min(mNa, 40)
  }
  return { meld: m, meldNa: mNa }
}
export function meldMortalidad(m: number) {
  return m <= 9 ? 1.9 : m <= 19 ? 6.0 : m <= 29 ? 19.6 : m <= 39 ? 52.6 : 71.3
}

/** Gasto energético basal (kcal/día). */
export const harrisBenedict = (p: number, t: number, e: number, s: Sexo) =>
  s === 'M' ? 66.473 + 13.7516 * p + 5.0033 * t - 6.755 * e : 655.0955 + 9.5634 * p + 1.8496 * t - 4.6756 * e
export const mifflin = (p: number, t: number, e: number, s: Sexo) => 10 * p + 6.25 * t - 5 * e + (s === 'M' ? 5 : -161)

/** Dosis pediátrica por peso. modo 'dosis' = mg/kg/dosis; 'dia' = mg/kg/día dividido en tomas. */
export function dosisPediatrica(o: { peso: number; mgkg: number; modo: 'dosis' | 'dia'; cadaH: number; mg: number; ml: number; maxDosis?: number; maxDia?: number }) {
  const tomas = 24 / o.cadaH
  let dosis = o.modo === 'dosis' ? o.peso * o.mgkg : (o.peso * o.mgkg) / tomas
  const calculada = dosis
  const avisos: string[] = []
  if (o.maxDosis && dosis > o.maxDosis) {
    dosis = o.maxDosis
    avisos.push(`La dosis calculada (${calculada.toFixed(1)} mg) excede el máximo por dosis; se limitó a ${o.maxDosis} mg.`)
  }
  if (o.maxDia && dosis * tomas > o.maxDia) {
    dosis = o.maxDia / tomas
    avisos.push(`La dosis diaria excede el máximo de ${o.maxDia} mg/día; se ajustó a ${dosis.toFixed(1)} mg por dosis.`)
  }
  const conc = o.mg / o.ml
  return { dosisMg: dosis, ml: dosis / conc, tomas, mgDia: dosis * tomas, mgkgDia: (dosis * tomas) / o.peso, avisos, limitada: avisos.length > 0 }
}

export const calcioCorregido = (ca: number, alb: number) => ca + 0.8 * (4 - alb)
export const anionGap = (na: number, cl: number, hco3: number) => na - (cl + hco3)
export const agCorregido = (ag: number, alb: number) => ag + 2.5 * (4 - alb)
/** Déficit de agua libre (L). factor ACT: 0.6 hombre/niño, 0.5 mujer u hombre >65, 0.45 mujer >65. */
export const deficitAgua = (peso: number, na: number, factor: number) => peso * factor * (na / 140 - 1)
