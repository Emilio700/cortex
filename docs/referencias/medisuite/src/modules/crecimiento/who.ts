// Cálculo de puntaje z OMS: Estándares 2006 (0–5 a, paquete who-growth-standards) +
// Referencia 2007 (5–19 a, tablas LMS en who2007.ts). Incluye el ajuste de colas restringidas
// de la OMS para indicadores basados en peso (|z| > 3).
import { getTable, lookupLms, lmsToZScore, zScoreToValue, zScoreToPercentile, percentileToZScore } from 'who-growth-standards'
import { WHO2007, type Row } from './who2007'

export type Ind = 'wfa' | 'lhfa' | 'bfa' | 'hcfa' | 'wfl' | 'wfh'
export type Sexo = 'M' | 'F'
export const DPM = 30.4375 // días por mes
const MAX06 = 1856 // días cubiertos por los estándares 2006
const PESO: Ind[] = ['wfa', 'bfa', 'wfl', 'wfh']
const t07: Partial<Record<Ind, 'wfa' | 'hfa' | 'bfa'>> = { wfa: 'wfa', lhfa: 'hfa', bfa: 'bfa' }

/** Edad máxima (meses) con referencia para cada indicador por edad. */
export const MAX_MESES: Record<string, number> = { wfa: 120, lhfa: 228, bfa: 228, hcfa: 60 }

function interp(rows: Row[], mes: number) {
  mes = Math.round(mes * 1e6) / 1e6
  const i = Math.floor(mes) - rows[0][0]
  if (i < 0 || i >= rows.length) return null
  const a = rows[i], b = rows[Math.min(i + 1, rows.length - 1)], f = mes - a[0]
  if (f > 0 && b === a) return null
  return { l: a[1] + (b[1] - a[1]) * f, m: a[2] + (b[2] - a[2]) * f, s: a[3] + (b[3] - a[3]) * f }
}

/** Parámetros LMS. x = edad en días (indicadores por edad) o longitud/talla en cm (wfl/wfh). */
export function lms(ind: Ind, sexo: Sexo, x: number): { l: number; m: number; s: number } | null {
  if (!(x >= 0)) return null
  const sex = sexo === 'M' ? 'male' : 'female'
  try {
    if (ind === 'wfl' || ind === 'wfh' || x <= MAX06) return lookupLms(getTable(ind, sex), x)
  } catch {
    return null
  }
  const k = t07[ind]
  return k ? interp(WHO2007[k][sexo], x / DPM) : null
}

export function valorEnZ(ind: Ind, sexo: Sexo, x: number, z: number) {
  const p = lms(ind, sexo, x)
  return p ? zScoreToValue(z, p.l, p.m, p.s) : null
}

/** Puntaje z con ajuste de colas restringidas (OMS 2006, cap. 7) para indicadores de peso. */
export function zscore(ind: Ind, sexo: Sexo, x: number, y: number): number | null {
  const p = lms(ind, sexo, x)
  if (!p || !(y > 0)) return null
  const z = lmsToZScore(y, p.l, p.m, p.s)
  if (!PESO.includes(ind) || Math.abs(z) <= 3) return z
  const v = (k: number) => zScoreToValue(k, p.l, p.m, p.s)
  if (z > 3) return 3 + (y - v(3)) / (v(3) - v(2))
  return -3 + (y - v(-3)) / (v(-2) - v(-3))
}

export const percentil = (z: number) => zScoreToPercentile(z)
export const zDePercentil = (p: number) => percentileToZScore(p)

export type Tone = 'ok' | 'warn' | 'danger'
/** Interpretación según puntos de corte OMS. edadMeses decide entre estándares (<60) y referencia 2007. */
export function interpretar(ind: Ind, z: number, edadMeses: number): [string, Tone] {
  const mayor = edadMeses >= 61
  switch (ind) {
    case 'wfa':
      return z < -3 ? ['Bajo peso severo', 'danger'] : z < -2 ? ['Bajo peso', 'warn'] : z > 2 ? ['Peso alto para la edad: evaluar con IMC', 'warn'] : z > 1 ? ['Normal (evaluar IMC o peso/talla)', 'ok'] : ['Normal', 'ok']
    case 'lhfa':
      return z < -3 ? ['Talla baja severa', 'danger'] : z < -2 ? ['Talla baja', 'warn'] : z > 3 ? ['Talla muy alta: descartar causa endocrina', 'warn'] : ['Normal', 'ok']
    case 'hcfa':
      return z < -3 ? ['Microcefalia severa', 'danger'] : z < -2 ? ['Microcefalia', 'warn'] : z > 3 ? ['Macrocefalia severa', 'danger'] : z > 2 ? ['Macrocefalia', 'warn'] : ['Normal', 'ok']
    default: // bfa, wfl, wfh
      if (mayor && ind === 'bfa') return z < -3 ? ['Delgadez severa', 'danger'] : z < -2 ? ['Delgadez', 'warn'] : z > 2 ? ['Obesidad', 'danger'] : z > 1 ? ['Sobrepeso', 'warn'] : ['Normal', 'ok']
      return z < -3 ? ['Emaciación severa (desnutrición aguda grave)', 'danger'] : z < -2 ? ['Emaciación (desnutrición aguda)', 'warn'] : z > 3 ? ['Obesidad', 'danger'] : z > 2 ? ['Sobrepeso', 'warn'] : z > 1 ? ['Riesgo de sobrepeso', 'warn'] : ['Normal', 'ok']
  }
}
