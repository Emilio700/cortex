// Lógica de la consulta de nutrición: antropometría, requerimiento energético y plan por equivalentes (SMAE).

// ---------- Antropometría ----------
export const imc = (pesoKg: number, tallaCm: number) => (pesoKg > 0 && tallaCm > 0 ? pesoKg / (tallaCm / 100) ** 2 : NaN)

/** Clasificación del IMC en adultos (OMS, 2000. Obesity: preventing and managing the global epidemic. TRS 894). */
export function clasificaIMC(v: number): { texto: string; tono: 'ok' | 'warn' | 'danger' } {
  if (!Number.isFinite(v)) return { texto: '—', tono: 'ok' }
  if (v < 18.5) return { texto: 'Bajo peso', tono: 'warn' }
  if (v < 25) return { texto: 'Normal', tono: 'ok' }
  if (v < 30) return { texto: 'Sobrepeso', tono: 'warn' }
  if (v < 35) return { texto: 'Obesidad grado I', tono: 'danger' }
  if (v < 40) return { texto: 'Obesidad grado II', tono: 'danger' }
  return { texto: 'Obesidad grado III', tono: 'danger' }
}

/** Índice cintura-cadera. Riesgo metabólico sustancialmente aumentado: ≥ 0.90 hombres, ≥ 0.85 mujeres (OMS, Waist circumference and waist–hip ratio, 2008). */
export const icc = (cintura: number, cadera: number) => (cintura > 0 && cadera > 0 ? cintura / cadera : NaN)
export const riesgoICC = (v: number, sexo: 'F' | 'M' | 'O') => Number.isFinite(v) && v >= (sexo === 'F' ? 0.85 : 0.9)

/** Índice cintura-talla; ≥ 0.5 indica riesgo cardiometabólico (Ashwell M, Gunn P, Gibson S. Obes Rev 2012;13:275-86). */
export const ict = (cintura: number, tallaCm: number) => (cintura > 0 && tallaCm > 0 ? cintura / tallaCm : NaN)
export const riesgoICT = (v: number) => Number.isFinite(v) && v >= 0.5

/** Circunferencia de cintura aumentada: ≥ 90 cm hombres, ≥ 80 cm mujeres (IDF 2006, puntos para Centro y Sudamérica). */
export const riesgoCintura = (cintura: number, sexo: 'F' | 'M' | 'O') => cintura > 0 && cintura >= (sexo === 'F' ? 80 : 90)

// ---------- Energía ----------
/** Mifflin MD, St Jeor ST, et al. Am J Clin Nutr 1990;51:241-7. Gasto energético en reposo (kcal/d). */
export function mifflin(sexo: 'F' | 'M' | 'O', pesoKg: number, tallaCm: number, edadAnios: number): number {
  return 10 * pesoKg + 6.25 * tallaCm - 5 * edadAnios + (sexo === 'F' ? -161 : 5)
}

/** Harris JA, Benedict FG. A biometric study of basal metabolism in man. Carnegie Institution, 1919 (ecuación original). */
export function harrisBenedict(sexo: 'F' | 'M' | 'O', pesoKg: number, tallaCm: number, edadAnios: number): number {
  return sexo === 'F' ? 655.0955 + 9.5634 * pesoKg + 1.8496 * tallaCm - 4.6756 * edadAnios : 66.473 + 13.7516 * pesoKg + 5.0033 * tallaCm - 6.755 * edadAnios
}

/** Factores de actividad de uso clínico común sobre el gasto en reposo (verificar según la guía que siga). */
export const FACTORES_ACTIVIDAD = [
  { id: 'sedentario', label: 'Sedentario (poco o nada de ejercicio)', f: 1.2 },
  { id: 'ligera', label: 'Actividad ligera (1–3 días/semana)', f: 1.375 },
  { id: 'moderada', label: 'Actividad moderada (3–5 días/semana)', f: 1.55 },
  { id: 'intensa', label: 'Actividad intensa (6–7 días/semana)', f: 1.725 },
  { id: 'muy-intensa', label: 'Muy intensa (trabajo físico o doble entrenamiento)', f: 1.9 },
] as const

export interface Macros {
  hc: number // %
  prot: number
  lip: number
}
export interface Gramos {
  kcal: number
  hc: number
  prot: number
  lip: number
}

/** Gramos de cada macronutriente: HC y proteína 4 kcal/g, lípidos 9 kcal/g (factores de Atwater). */
export function gramosMeta(kcal: number, m: Macros): Gramos {
  return { kcal, hc: (kcal * m.hc) / 100 / 4, prot: (kcal * m.prot) / 100 / 4, lip: (kcal * m.lip) / 100 / 9 }
}

// ---------- SMAE ----------
/**
 * Aporte promedio por equivalente del Sistema Mexicano de Alimentos Equivalentes (SMAE), 4.ª ed.
 * Pérez Lizaur AB, Palacios González B, Castro Becerra AL, Flores Galicia I. México: Fomento de Nutrición y Salud; 2014.
 * Solo se usan los valores nutrimentales por grupo (no las listas de alimentos, protegidas por derechos de autor).
 */
export interface GrupoSMAE {
  id: string
  grupo: string
  sub?: string
  kcal: number
  hc: number
  prot: number
  lip: number
  verificar?: boolean
}
export const SMAE: GrupoSMAE[] = [
  { id: 'verduras', grupo: 'Verduras', kcal: 25, hc: 4, prot: 2, lip: 0 },
  { id: 'frutas', grupo: 'Frutas', kcal: 60, hc: 15, prot: 0, lip: 0 },
  { id: 'cereales-sg', grupo: 'Cereales y tubérculos', sub: 'sin grasa', kcal: 70, hc: 15, prot: 2, lip: 0 },
  { id: 'cereales-cg', grupo: 'Cereales y tubérculos', sub: 'con grasa', kcal: 115, hc: 15, prot: 2, lip: 5 },
  { id: 'leguminosas', grupo: 'Leguminosas', kcal: 120, hc: 20, prot: 8, lip: 1 },
  { id: 'aoa-mb', grupo: 'Alimentos de origen animal', sub: 'muy bajo aporte de grasa', kcal: 40, hc: 0, prot: 7, lip: 1 },
  { id: 'aoa-b', grupo: 'Alimentos de origen animal', sub: 'bajo aporte de grasa', kcal: 55, hc: 0, prot: 7, lip: 3 },
  { id: 'aoa-m', grupo: 'Alimentos de origen animal', sub: 'moderado aporte de grasa', kcal: 75, hc: 0, prot: 7, lip: 5 },
  { id: 'aoa-a', grupo: 'Alimentos de origen animal', sub: 'alto aporte de grasa', kcal: 100, hc: 0, prot: 7, lip: 8 },
  { id: 'leche-d', grupo: 'Leche', sub: 'descremada', kcal: 95, hc: 12, prot: 9, lip: 2 },
  { id: 'leche-s', grupo: 'Leche', sub: 'semidescremada', kcal: 110, hc: 12, prot: 9, lip: 4 },
  { id: 'leche-e', grupo: 'Leche', sub: 'entera', kcal: 150, hc: 12, prot: 9, lip: 8 },
  { id: 'leche-a', grupo: 'Leche', sub: 'con azúcar', kcal: 200, hc: 30, prot: 8, lip: 5, verificar: true },
  { id: 'grasas-sp', grupo: 'Aceites y grasas', sub: 'sin proteína', kcal: 45, hc: 0, prot: 0, lip: 5 },
  { id: 'grasas-cp', grupo: 'Aceites y grasas', sub: 'con proteína', kcal: 70, hc: 3, prot: 3, lip: 5 },
  { id: 'azucares-sg', grupo: 'Azúcares', sub: 'sin grasa', kcal: 40, hc: 10, prot: 0, lip: 0 },
  { id: 'azucares-cg', grupo: 'Azúcares', sub: 'con grasa', kcal: 85, hc: 10, prot: 0, lip: 5 },
]
export const grupo = (id: string) => SMAE.find((g) => g.id === id)
export const nombreGrupo = (g: GrupoSMAE) => (g.sub ? `${g.grupo} ${g.sub}` : g.grupo)

export type Equivalentes = Record<string, number>

export function totalesPlan(eq: Equivalentes): Gramos {
  const t = { kcal: 0, hc: 0, prot: 0, lip: 0 }
  for (const [id, n] of Object.entries(eq)) {
    const g = grupo(id)
    if (!g || !n) continue
    t.kcal += g.kcal * n
    t.hc += g.hc * n
    t.prot += g.prot * n
    t.lip += g.lip * n
  }
  return t
}

/** % de adecuación = obtenido ÷ meta × 100. */
export const adecuacion = (obtenido: number, meta: number) => (meta > 0 ? (obtenido / meta) * 100 : NaN)
/** Criterio usual de adecuación de la dieta calculada: 95–105 % (verificar con su criterio docente/institucional). */
export const tonoAdecuacion = (pct: number): 'ok' | 'warn' | 'danger' => (!Number.isFinite(pct) ? 'warn' : pct >= 95 && pct <= 105 ? 'ok' : pct >= 90 && pct <= 110 ? 'warn' : 'danger')

export const r05 = (x: number) => Math.max(0, Math.round(x * 2) / 2)
const piso05 = (x: number) => Math.max(0, Math.floor(x * 2 + 1e-9) / 2)

export interface OpcionesSolver {
  verduras: number
  frutas: number
  leche: number
  lecheTipo: string
  leguminosas: number
  azucares: number
  azucarTipo: string
  cerealTipo: string
  aoaTipo: string
  grasaTipo: string
}

/** Equivalentes fijos sugeridos según la energía (punto de partida editable, no normativo). */
export function opcionesPorOmision(kcal: number): OpcionesSolver {
  return {
    verduras: kcal < 1400 ? 3 : 4,
    frutas: kcal < 1600 ? 2 : kcal < 2200 ? 3 : 4,
    leche: kcal < 1800 ? 1 : 2,
    lecheTipo: 'leche-d',
    leguminosas: kcal < 2200 ? 1 : 2,
    azucares: 0,
    azucarTipo: 'azucares-sg',
    cerealTipo: 'cereales-sg',
    aoaTipo: 'aoa-b',
    grasaTipo: 'grasas-sp',
  }
}

/**
 * Heurística clásica de cálculo por equivalentes: se fijan verduras, frutas, leche, leguminosas y azúcares; los
 * cereales completan los hidratos de carbono, los alimentos de origen animal completan la proteína y los aceites
 * completan los lípidos. Redondeo a medio equivalente.
 */
export function resolverEquivalentes(meta: Gramos, o: OpcionesSolver): Equivalentes {
  const eq: Equivalentes = { verduras: o.verduras, frutas: o.frutas, [o.lecheTipo]: o.leche, leguminosas: o.leguminosas, [o.azucarTipo]: o.azucares }
  const parcial = () => totalesPlan(eq)
  const cer = grupo(o.cerealTipo)!
  eq[o.cerealTipo] = (eq[o.cerealTipo] ?? 0) + r05((meta.hc - parcial().hc) / cer.hc)
  const aoa = grupo(o.aoaTipo)!
  eq[o.aoaTipo] = (eq[o.aoaTipo] ?? 0) + r05((meta.prot - parcial().prot) / aoa.prot)
  const gr = grupo(o.grasaTipo)!
  eq[o.grasaTipo] = (eq[o.grasaTipo] ?? 0) + r05((meta.lip - parcial().lip) / gr.lip)
  for (const k of Object.keys(eq)) if (!eq[k]) delete eq[k]
  return eq
}

// ---------- Distribución por tiempos de comida ----------
export const COMIDAS = [
  { id: 'desayuno', label: 'Desayuno', pct: 25 },
  { id: 'colacion1', label: 'Colación', pct: 10 },
  { id: 'comida', label: 'Comida', pct: 35 },
  { id: 'colacion2', label: 'Colación', pct: 10 },
  { id: 'cena', label: 'Cena', pct: 20 },
] as const
export type ComidaId = (typeof COMIDAS)[number]['id']
export type Distribucion = Record<string, Record<ComidaId, number>>

/**
 * Reparte los equivalentes de cada grupo según el % de energía de cada tiempo (múltiplos de 0.5). Cada tiempo
 * recibe el redondeo hacia abajo y el tiempo principal (el de mayor %) recibe el resto, así la suma siempre cuadra.
 */
export function distribuir(eq: Equivalentes, pcts: Record<ComidaId, number>): Distribucion {
  const ids = COMIDAS.map((c) => c.id)
  const principal = ids.reduce((a, b) => (pcts[b] > pcts[a] ? b : a))
  const total = ids.reduce((s, id) => s + (pcts[id] || 0), 0) || 100
  const out: Distribucion = {}
  for (const [g, n] of Object.entries(eq)) {
    if (!n) continue
    const fila = Object.fromEntries(ids.map((id) => [id, 0])) as Record<ComidaId, number>
    let usado = 0
    for (const id of ids) {
      if (id === principal) continue
      fila[id] = piso05((n * (pcts[id] || 0)) / total)
      usado += fila[id]
    }
    fila[principal] = Math.max(0, n - usado)
    out[g] = fila
  }
  return out
}

export const sumaFila = (f: Record<string, number>) => Object.values(f).reduce((s, x) => s + (x || 0), 0)
