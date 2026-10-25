import { APEX, type Artery, type Dominance, type Sys } from './anatomy'

// Vistas clínicas de la cámara 3D (dirección desde el corazón hacia la cámara, marco paciente)
const a = APEX
export const CAM_VIEWS: { id: string; name: string; dir: [number, number, number]; up?: [number, number, number] }[] = [
  { id: 'ant', name: 'Anterior', dir: [0, 0, 1] },
  { id: 'post', name: 'Posterior', dir: [0, 0, -1] },
  { id: 'latI', name: 'Lateral izq.', dir: [1, 0, 0] },
  { id: 'latD', name: 'Lateral der.', dir: [-1, 0, 0] },
  { id: 'inf', name: 'Inferior (diafragmática)', dir: [0, -1, 0.05], up: [0, 0, 1] },
  { id: 'apex', name: 'Apical', dir: [a.x, a.y, a.z], up: [0, 1, 0] },
  { id: 'base', name: 'Base (surcos AV)', dir: [-a.x, -a.y, -a.z], up: [0, 0, 1] },
  { id: 'sup', name: 'Superior', dir: [0, 1, 0.05], up: [0, 0, -1] },
]

export interface CarmPreset { id: string; name: string; lao: number; cra: number; sys: Sys; best: string[]; note: string }
export const CARM_PRESETS: CarmPreset[] = [
  { id: 'ap', name: 'AP', lao: 0, cra: 0, sys: 'L', best: ['5', '6', '11'], note: 'TCI completo y orígenes de DA/Cx; vista general' },
  { id: 'rao30', name: 'RAO 30°', lao: -30, cra: 0, sys: 'L', best: ['11', '12a', '12b', '13', '7'], note: 'Cx y obtusas marginales; DA media' },
  { id: 'lao45', name: 'LAO 45°', lao: 45, cra: 0, sys: 'L', best: ['5', '6', '11'], note: 'DA y Cx proximales separadas' },
  { id: 'rao30cau25', name: 'RAO 30° CAU 25°', lao: -30, cra: -25, sys: 'L', best: ['5', '11', '12a', '13', '6'], note: 'TCI distal, Cx proximal y OM ("Cx view")' },
  { id: 'spider', name: 'LAO 45° CAU 30°', lao: 45, cra: -30, sys: 'L', best: ['5', '6', '11'], note: '"Araña": TCI y bifurcación DA/Cx' },
  { id: 'rao30cra30', name: 'RAO 30° CRA 30°', lao: -30, cra: 30, sys: 'L', best: ['7', '8', 'S1', '6'], note: 'DA media-distal y septales' },
  { id: 'lao30cra30', name: 'LAO 30° CRA 30°', lao: 30, cra: 30, sys: 'L', best: ['6', '7', '9', '10'], note: 'DA media y separación de diagonales' },
  { id: 'apcra30', name: 'AP CRA 30°', lao: 0, cra: 30, sys: 'L', best: ['6', '7', '9', '10'], note: 'DA proximal-media y diagonales' },
  { id: 'apcau30', name: 'AP CAU 30°', lao: 0, cra: -30, sys: 'L', best: ['5', '6', '11', '12a'], note: 'TCI, DA proximal y Cx proximal' },
  { id: 'lat90', name: 'LAT 90°', lao: 90, cra: 0, sys: 'L', best: ['7', '8', '11', '13'], note: 'DA media-distal; separa DA de Cx' },
  { id: 'rca-lao30', name: 'LAO 30° (CD)', lao: 30, cra: 0, sys: 'R', best: ['1', '2', '3'], note: 'CD proximal y media (forma de "C")' },
  { id: 'rca-rao30', name: 'RAO 30° (CD)', lao: -30, cra: 0, sys: 'R', best: ['2', '3', '4'], note: 'CD media y DP (forma de "L")' },
  { id: 'rca-lao30cra20', name: 'LAO 30° CRA 20° (crux)', lao: 30, cra: 20, sys: 'R', best: ['3', '4', '16', '16a'], note: 'Crux: origen de DP y PL' },
]

// ---------- Territorios (modelo AHA de 17 segmentos) ----------
export const BULL: string[] = [
  'Basal anterior', 'Basal anteroseptal', 'Basal inferoseptal', 'Basal inferior', 'Basal inferolateral', 'Basal anterolateral',
  'Medio anterior', 'Medio anteroseptal', 'Medio inferoseptal', 'Medio inferior', 'Medio inferolateral', 'Medio anterolateral',
  'Apical anterior', 'Apical septal', 'Apical inferior', 'Apical lateral', 'Ápex',
]
export type Terr = 'DA' | 'Cx' | 'CD'
/** Asignación estándar AHA (Cerqueira 2002). Con dominancia izquierda la pared inferior pasa a la Cx. */
export function territory(seg: number, dom: Dominance): Terr {
  if ([1, 2, 7, 8, 13, 14, 17].includes(seg)) return 'DA'
  if ([5, 6, 11, 12, 16].includes(seg)) return 'Cx'
  return dom === 'L' ? 'Cx' : 'CD'
}
export const TERR_COLOR: Record<Terr, string> = { DA: '#e11d48', Cx: '#2563eb', CD: '#16a34a' }

export const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const
export type Lead = (typeof LEADS)[number]
export const LEAD_INFO: { leads: Lead[]; pared: string; arteria: (d: Dominance) => string; terr: (Terr | 'TCI')[] }[] = [
  { leads: ['V1', 'V2'], pared: 'Septal', arteria: () => 'DA (ramas septales)', terr: ['DA'] },
  { leads: ['V3', 'V4'], pared: 'Anterior', arteria: () => 'DA', terr: ['DA'] },
  { leads: ['I', 'aVL'], pared: 'Lateral alta', arteria: () => 'D1 (DA) / OM (Cx)', terr: ['Cx', 'DA'] },
  { leads: ['V5', 'V6'], pared: 'Lateral baja', arteria: () => 'Cx / DA distal', terr: ['Cx'] },
  { leads: ['II', 'III', 'aVF'], pared: 'Inferior', arteria: (d) => (d === 'R' ? 'CD (≈80 %) — Cx si dominancia izq.' : 'Cx (dominancia izquierda)'), terr: ['CD'] },
  { leads: ['aVR'], pared: 'Cavidad / base', arteria: () => 'TCI o multivaso (ST↑ con depresión difusa)', terr: ['TCI'] },
]
export function leadsForArtery(t: Artery, dom: Dominance): Lead[] {
  if (t === 'DA') return ['V1', 'V2', 'V3', 'V4', 'I', 'aVL']
  if (t === 'Cx') return dom === 'L' ? ['I', 'aVL', 'V5', 'V6', 'II', 'III', 'aVF'] : ['I', 'aVL', 'V5', 'V6']
  if (t === 'CD') return dom === 'R' ? ['II', 'III', 'aVF'] : []
  return ['aVR']
}

// ---------- Escenarios de infarto (patrones típicos, simplificados) ----------
export interface Infarct { id: string; name: string; artery: Artery; seg: string; up: Partial<Record<Lead, number>>; down: Partial<Record<Lead, number>>; bull: number[]; nota: string; dom?: Dominance }
export const INFARCTS: Infarct[] = [
  { id: 'da-prox', name: 'DA proximal (antes de D1/S1)', artery: 'DA', seg: '6', up: { V1: 0.15, V2: 0.4, V3: 0.45, V4: 0.35, V5: 0.2, V6: 0.1, I: 0.1, aVL: 0.15 }, down: { II: 0.1, III: 0.15, aVF: 0.12 }, bull: [1, 2, 6, 7, 8, 12, 13, 14, 16, 17], nota: 'IAM anterior extenso: ST↑ V1–V6, I y aVL con imagen especular inferior.' },
  { id: 'da-media', name: 'DA media (después de D1)', artery: 'DA', seg: '7', up: { V2: 0.3, V3: 0.4, V4: 0.35, V5: 0.15 }, down: {}, bull: [7, 8, 13, 14, 17], nota: 'IAM anterior/anteroapical: ST↑ V2–V5 sin afectar I/aVL.' },
  { id: 'd1', name: 'Primera diagonal', artery: 'DA', seg: '9', up: { I: 0.15, aVL: 0.2, V2: 0.15 }, down: { III: 0.15, aVF: 0.1, II: 0.05 }, bull: [1, 6, 12], nota: 'Lateral alta: ST↑ I, aVL y V2 (patrón de "bandera sudafricana").' },
  { id: 'cx', name: 'Circunfleja / OM', artery: 'Cx', seg: '11', up: { I: 0.1, aVL: 0.12, V5: 0.12, V6: 0.15 }, down: { V1: 0.15, V2: 0.2, V3: 0.12 }, bull: [5, 6, 11, 12, 16], nota: 'Lateral (a menudo eléctricamente silente); depresión V1–V3 por afectación posterior.' },
  { id: 'cd-prox', name: 'CD proximal (con VD)', artery: 'CD', seg: '1', up: { II: 0.2, III: 0.35, aVF: 0.28, V1: 0.1 }, down: { I: 0.12, aVL: 0.2 }, bull: [3, 4, 9, 10, 15], nota: 'Inferior + VD: ST↑ III > II, ST↑ V1 (y V4R); especular en I/aVL.' },
  { id: 'cd-dist', name: 'CD distal / DP', artery: 'CD', seg: '3', up: { II: 0.2, III: 0.25, aVF: 0.22 }, down: { aVL: 0.15, I: 0.05 }, bull: [4, 10, 15], nota: 'Inferior: ST↑ II, III, aVF; especular en aVL.' },
  { id: 'post', name: 'Posterolateral (PL)', artery: 'CD', seg: '16', up: { V6: 0.05 }, down: { V1: 0.15, V2: 0.25, V3: 0.2 }, bull: [4, 5, 10, 11], nota: 'Posterior: depresión ST V1–V3 (equivalente a ST↑ en V7–V9, no mostradas).' },
  { id: 'cx-dom', name: 'Cx dominante (dominancia izq.)', artery: 'Cx', seg: '13', dom: 'L', up: { II: 0.18, III: 0.15, aVF: 0.17, V5: 0.15, V6: 0.18, I: 0.05 }, down: { V1: 0.15, V2: 0.2, aVL: 0.08 }, bull: [3, 4, 5, 9, 10, 11, 12, 15, 16], nota: 'Inferolateral con dominancia izquierda: II ≥ III, V5–V6 y especular V1–V2.' },
  { id: 'tci', name: 'Tronco (TCI) – suboclusión', artery: 'TCI', seg: '5', up: { aVR: 0.2, V1: 0.08 }, down: { I: 0.12, II: 0.15, aVF: 0.1, V3: 0.1, V4: 0.2, V5: 0.25, V6: 0.2 }, bull: [1, 2, 5, 6, 7, 8, 11, 12, 13, 14, 16, 17], nota: 'Isquemia circunferencial: ST↑ aVR (± V1) con depresión difusa ≥ 7 derivaciones.' },
]

// Morfología normal aproximada por derivación (mV): P, Q, R, S, T
export const LEAD_TPL: Record<Lead, [number, number, number, number, number]> = {
  I: [0.1, -0.04, 0.7, -0.1, 0.25], II: [0.15, -0.05, 1.0, -0.15, 0.3], III: [0.06, -0.02, 0.45, -0.2, 0.1],
  aVR: [-0.1, 0, 0.12, -0.75, -0.22], aVL: [0.05, -0.03, 0.4, -0.2, 0.1], aVF: [0.1, -0.03, 0.7, -0.12, 0.2],
  V1: [0.08, 0, 0.22, -1.0, 0.08], V2: [0.08, 0, 0.4, -1.4, 0.4], V3: [0.08, 0, 0.8, -0.9, 0.45],
  V4: [0.08, -0.04, 1.3, -0.5, 0.45], V5: [0.08, -0.06, 1.4, -0.2, 0.35], V6: [0.08, -0.06, 1.1, -0.1, 0.3],
}
export type Phase = 'hiper' | 'aguda' | 'evol'
/** Voltaje (mV) en t segundos dentro de un ciclo RR. st = desnivel (mV, + elevación / − depresión). */
export function ecgAt(t: number, lead: Lead, st: number, phase: Phase, rr: number) {
  const [P, Q0, R0, S, T0] = LEAD_TPL[lead]
  const g = (mu: number, sg: number, a: number) => a * Math.exp(-(((t - mu) / sg) ** 2))
  const qt = 0.42 * Math.sqrt(rr / 0.8)
  let Q = Q0, R = R0, T = T0, s = st
  if (st > 0 && phase === 'hiper') { T = T0 + st * 2.2; s = st * 0.4 }
  if (st > 0 && phase === 'evol') { Q = -Math.max(0.25, R0 * 0.35); R = R0 * 0.45; T = -Math.abs(T0) - 0.15; s = st * 0.35 }
  const sm = (e0: number, e1: number, x: number) => Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  const plateau = sm(0.235, 0.26, t) * (1 - sm(qt - 0.06, qt + 0.06, t))
  return g(0.09, 0.022, P) + g(0.178, phase === 'evol' && st > 0 ? 0.018 : 0.008, Q) + g(0.2, 0.011, R) + g(0.222, 0.01, S) + g(qt - 0.05, 0.05 * Math.sqrt(rr / 0.8), T) + s * plateau
}
