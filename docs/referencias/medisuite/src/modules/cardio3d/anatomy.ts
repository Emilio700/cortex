// Anatomía procedural: corazón (SDF) + árbol coronario sobre los surcos + segmentos SYNTAX.
//
// Marco de referencia "paciente" (cm): +x = izquierda del paciente, +y = cefálico (cabeza),
// +z = anterior. Es dextrógiro (L × S = A). El eje largo del corazón apunta hacia
// izquierda-abajo-adelante. Para modelar usamos un marco local del corazón (lat, w, ant):
//   w   = hacia la base (opuesto al ápex)
//   ant = cara esternocostal (anterior ⟂ eje largo)
//   lat = w × ant  → borde obtuso / pared lateral del VI
// Alrededor del eje largo usamos θ (0° = lateral, 90° = anterior, 180° ≈ borde agudo,
// ~245° = cara diafragmática / crux) y φ (latitud: +90° base, −90° ápex).
import * as THREE from 'three'

type V3 = THREE.Vector3
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const DEG = Math.PI / 180

export const APEX = V(0.58, -0.45, 0.62).normalize()
const W = APEX.clone().negate()
const ANT = V(0, 0, 1).addScaledVector(APEX, -APEX.z).normalize()
const LAT = W.clone().cross(ANT).normalize()
const ORIGIN = W.clone().multiplyScalar(4) // centro de la base; centro del corazón ≈ origen

export const toWorld = (l: number, w: number, a: number, out = new THREE.Vector3()) =>
  out.copy(ORIGIN).addScaledVector(LAT, l).addScaledVector(W, w).addScaledVector(ANT, a)
const toLocal = (p: V3): [number, number, number] => {
  const q = p.clone().sub(ORIGIN)
  return [q.dot(LAT), q.dot(W), q.dot(ANT)]
}
const dirLocal = (thDeg: number, phDeg: number): [number, number, number] => {
  const t = thDeg * DEG, p = phDeg * DEG
  return [Math.cos(t) * Math.cos(p), Math.sin(p), Math.sin(t) * Math.cos(p)]
}

// ---------- SDF del corazón ----------
type P3 = [number, number, number]
function sdEll(l: number, w: number, a: number, c: P3, r: P3) {
  const x = (l - c[0]) / r[0], y = (w - c[1]) / r[1], z = (a - c[2]) / r[2]
  const k0 = Math.sqrt(x * x + y * y + z * z), k1 = Math.sqrt((x / r[0]) ** 2 + (y / r[1]) ** 2 + (z / r[2]) ** 2)
  return k1 < 1e-6 ? -1 : (k0 * (k0 - 1)) / k1
}
function sdCap(l: number, w: number, a: number, p: P3, q: P3, r: number) {
  const bx = q[0] - p[0], by = q[1] - p[1], bz = q[2] - p[2]
  const px = l - p[0], py = w - p[1], pz = a - p[2]
  const h = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)))
  const dx = px - bx * h, dy = py - by * h, dz = pz - bz * h
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r
}
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

// Cámaras en coordenadas polares locales: θ alrededor del eje largo, r radial, w altura
const PL = (th: number, r: number, w: number): P3 => [Math.cos(th * DEG) * r, w, Math.sin(th * DEG) * r]
export const W_AV = -0.2 // altura del surco auriculoventricular
const LV_C = PL(-40, 0.9, -4.3), RV_C = PL(156, 1.9, -4.0)
const RVOT0 = PL(110, 2.2, -2.5), PV = PL(60, 2.3, 0.9)
const LA_C = PL(-85, 1.6, 1.3), RA_C = PL(168, 2.5, 0.9), RAA_C = PL(118, 2.7, 1.2), LAA_C = PL(12, 2.9, 0.7)
function parts(l: number, w: number, a: number) {
  // VI en forma de bala: el radio se reduce hacia el ápex
  const taper = 0.8 + 0.2 * Math.min(1, Math.max(0, (w + 8.5) / 6))
  const lv = sdEll(l / taper, w, a / taper, [LV_C[0] / taper, LV_C[1], LV_C[2] / taper], [2.9, 4.6, 2.9]) * taper
  const rvb = sdEll(l, w, a, RV_C, [2.5, 3.9, 2.5])
  const rvot = sdCap(l, w, a, RVOT0, PV, 1.4)
  const rv = smin(rvb, rvot, 1.4)
  const la = sdEll(l, w, a, LA_C, [2.6, 1.6, 2.2])
  const ra = sdEll(l, w, a, RA_C, [1.9, 2.0, 2.0])
  const raa = sdEll(l, w, a, RAA_C, [1.0, 0.7, 0.9])
  const laa = sdEll(l, w, a, LAA_C, [0.8, 0.55, 0.9])
  const at = smin(smin(smin(la, ra, 1.0), raa, 0.6), laa, 0.5)
  return { lv, rv, at, vent: smin(lv, rv, 1.6) }
}

export function sdf(l: number, w: number, a: number) {
  const p = parts(l, w, a)
  let d = smin(p.vent, p.at, 0.7)
  // acentuar surcos (interventricular y auriculoventricular)
  d += 0.16 * Math.exp(-(((p.lv - p.rv) / 0.4) ** 2)) * (w < W_AV + 0.5 ? 1 : 0) + 0.24 * Math.exp(-(((w - W_AV) / 0.45) ** 2))
  // ligera deformación orgánica
  d += 0.06 * Math.sin(2.7 * l + 1) * Math.sin(2.1 * w) * Math.sin(2.9 * a + 0.5)
  return d
}

const C: P3 = [0, -3.2, 0] // centro para las proyecciones radiales
function rayHit(d: P3): P3 {
  // desde fuera hacia adentro: primer cruce = superficie externa
  // sphere tracing hacia adentro (el SDF es aproximadamente una distancia)
  let t = 11, prev = t
  while (t > 0) {
    const v = sdf(C[0] + d[0] * t, C[1] + d[1] * t, C[2] + d[2] * t)
    if (v < 0) break
    prev = t
    t -= Math.max(0.04, v * 0.7)
  }
  let lo = t, hi = prev
  for (let i = 0; i < 10; i++) {
    const m = (lo + hi) / 2
    if (sdf(C[0] + d[0] * m, C[1] + d[1] * m, C[2] + d[2] * m) < 0) lo = m
    else hi = m
  }
  const tt = (lo + hi) / 2
  return [C[0] + d[0] * tt, C[1] + d[1] * tt, C[2] + d[2] * tt]
}
function gradN(p: P3): P3 {
  const e = 0.03
  const nx = sdf(p[0] + e, p[1], p[2]) - sdf(p[0] - e, p[1], p[2])
  const ny = sdf(p[0], p[1] + e, p[2]) - sdf(p[0], p[1] - e, p[2])
  const nz = sdf(p[0], p[1], p[2] + e) - sdf(p[0], p[1], p[2] - e)
  const n = Math.hypot(nx, ny, nz) || 1
  return [nx / n, ny / n, nz / n]
}
/** Punto (mundo) sobre la superficie en la dirección local d, desplazado `off` cm hacia afuera. */
function surfLocal(d: P3, off: number): V3 {
  const p = rayHit(d), n = gradN(p)
  return toWorld(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off)
}
/** Proyección al punto más cercano de la superficie (iteraciones de Newton sobre el SDF). */
const projectWorld = (pw: V3, off: number) => {
  const p = toLocal(pw)
  for (let i = 0; i < 6; i++) {
    const d = sdf(...p) - off, g = gradN(p)
    p[0] -= d * g[0]; p[1] -= d * g[1]; p[2] -= d * g[2]
  }
  return toWorld(...p)
}

// búsqueda de surcos (pliegues de la unión suave)
function creaseTheta(ph: number, th0: number, span = 35) {
  let best = th0, bv = Infinity
  for (let th = th0 - span; th <= th0 + span; th += 1) {
    const p = rayHit(dirLocal(th, ph)), q = parts(...p)
    const v = Math.abs(q.lv - q.rv) + Math.abs(th - th0) * 0.002
    if (v < bv) { bv = v; best = th }
  }
  return best
}
function creasePhi(th: number) {
  // surco AV: punto de la superficie cuya altura local w es la más cercana a W_AV
  let best = 40, bv = Infinity
  for (let ph = 10; ph <= 80; ph += 0.5) {
    const v = Math.abs(rayHit(dirLocal(th, ph))[1] - W_AV)
    if (v < bv) { bv = v; best = ph }
  }
  return best
}

// ---------- Geometría del corazón (surface nets sobre el SDF, cache) ----------
let heartCache: THREE.BufferGeometry | null = null
export function heartGeometry() {
  if (heartCache) return heartCache
  const h = 0.2, o: P3 = [-6.6, -10.6, -6.6], n: P3 = [67, 78, 67]
  const id = (i: number, j: number, k: number) => i + n[0] * (j + n[1] * k)
  const F = new Float32Array(n[0] * n[1] * n[2])
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) F[id(i, j, k)] = sdf(o[0] + i * h, o[1] + j * h, o[2] + k * h)
  const cell = new Int32Array(n[0] * n[1] * n[2]).fill(-1)
  const pos: number[] = []
  const edges: [number, number][] = []
  for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) edges.push([a, a | bit])
  const cv = new Float32Array(8)
  for (let k = 0; k < n[2] - 1; k++)
    for (let j = 0; j < n[1] - 1; j++)
      for (let i = 0; i < n[0] - 1; i++) {
        let neg = 0
        for (let c = 0; c < 8; c++) {
          cv[c] = F[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]
          if (cv[c] < 0) neg++
        }
        if (neg === 0 || neg === 8) continue
        let sx = 0, sy = 0, sz = 0, m = 0
        for (const [a, b] of edges) {
          if (cv[a] < 0 === cv[b] < 0) continue
          const t = cv[a] / (cv[a] - cv[b])
          sx += (a & 1) + (((b & 1) - (a & 1)) * t)
          sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t)
          sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t)
          m++
        }
        cell[id(i, j, k)] = pos.length / 3
        pos.push(o[0] + (i + sx / m) * h, o[1] + (j + sy / m) * h, o[2] + (k + sz / m) * h)
      }
  const idx: number[] = []
  const quad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    idx.push(a, b, c, a, c, d)
  }
  for (let k = 1; k < n[2] - 1; k++)
    for (let j = 1; j < n[1] - 1; j++)
      for (let i = 1; i < n[0] - 1; i++) {
        const s0 = F[id(i, j, k)] < 0
        if (s0 !== F[id(i + 1, j, k)] < 0) quad(cell[id(i, j - 1, k - 1)], cell[id(i, j, k - 1)], cell[id(i, j, k)], cell[id(i, j - 1, k)])
        if (s0 !== F[id(i, j + 1, k)] < 0) quad(cell[id(i - 1, j, k - 1)], cell[id(i, j, k - 1)], cell[id(i, j, k)], cell[id(i - 1, j, k)])
        if (s0 !== F[id(i, j, k + 1)] < 0) quad(cell[id(i - 1, j - 1, k)], cell[id(i, j - 1, k)], cell[id(i, j, k)], cell[id(i - 1, j, k)])
      }
  // refinar vértices sobre la superficie (Newton) y orientar triángulos hacia afuera
  for (let v = 0; v < pos.length; v += 3)
    for (let it = 0; it < 2; it++) {
      const p: P3 = [pos[v], pos[v + 1], pos[v + 2]], d = sdf(...p), g = gradN(p)
      pos[v] -= d * g[0]; pos[v + 1] -= d * g[1]; pos[v + 2] -= d * g[2]
    }
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3]
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]]
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const g = gradN([(pos[a] + pos[b] + pos[c]) / 3, (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3])
    if (nn[0] * g[0] + nn[1] * g[1] + nn[2] * g[2] < 0) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]]
  }
  const col = new Float32Array(pos.length), wp = new Float32Array(pos.length)
  const muscle = new THREE.Color('#a8463c'), atrium = new THREE.Color('#8a3a46'), fat = new THREE.Color('#e8c47e')
  const c = new THREE.Color(), out = new THREE.Vector3()
  for (let v = 0; v < pos.length; v += 3) {
    const [l, w, a] = [pos[v], pos[v + 1], pos[v + 2]], q = parts(l, w, a)
    const fIV = Math.exp(-(((q.lv - q.rv) / 0.4) ** 2)) * (w < W_AV ? 1 : 0), fAV = Math.exp(-(((w - W_AV) / 0.45) ** 2))
    const nz = 0.035 * Math.sin(2.3 * l + 4 * w) + 0.02 * Math.sin(5.1 * a - 1.7 * w)
    c.copy(muscle).lerp(atrium, Math.min(1, Math.max(0, (q.vent - q.at) * 1.5 + 0.5)))
    c.lerp(fat, Math.min(0.8, Math.max(fIV, fAV) * 0.85))
    col.set([c.r + nz, c.g + nz * 0.5, c.b + nz * 0.4], v)
    toWorld(l, w, a, out)
    wp.set([out.x, out.y, out.z], v)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(wp, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  heartCache = g
  return g
}

// Grandes vasos: raíz en el marco local, trayecto en coordenadas mundo
const AO_ROOT = toWorld(...PL(112, 0.9, 0.5))
const PV_W = toWorld(...PV)
const off = (o: V3, pts: number[][]) => pts.map(([x, y, z]) => o.clone().add(V(x, y, z)))
export const AORTA = off(AO_ROOT, [[0, -0.8, 0], [-0.5, 2.6, 0.5], [-0.8, 5, 0.4], [0.2, 7.2, -1.1], [1.9, 7.3, -3.3], [2.5, 5, -5.3], [2.3, -1, -5.8], [2.1, -12, -5.6], [2.0, -30, -5.5]])
const PA = off(PV_W, [[0, -0.8, 0.1], [0.4, 1.8, -0.3], [1.1, 3.3, -1.7], [3.0, 3.8, -3.1], [4.6, 3.3, -3.7]])
const RPA = off(PV_W, [[1.0, 3.3, -1.6], [-0.9, 3.5, -3.6], [-4.6, 3.2, -3.9]])
let gvCache: { aorta: THREE.BufferGeometry; pa: THREE.BufferGeometry } | null = null
export function greatVessels() {
  if (gvCache) return gvCache
  const tube = (pts: V3[], r: number, segs: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 24, false)
  const pa = mergeGeoms([tube(PA, 1.15, 60), tube(RPA, 0.85, 50)])
  gvCache = { aorta: tube(AORTA, 1.3, 140), pa }
  return gvCache
}
function mergeGeoms(gs: THREE.BufferGeometry[]) {
  // fusión simple de geometrías indexadas con los mismos atributos
  const pos: number[] = [], nor: number[] = [], idx: number[] = []
  for (const g of gs) {
    const off = pos.length / 3
    pos.push(...(g.getAttribute('position').array as Float32Array))
    nor.push(...(g.getAttribute('normal').array as Float32Array))
    g.getIndex()!.array.forEach((i) => idx.push(i + off))
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setIndex(idx)
  return out
}

// ---------- Árbol coronario ----------
export type Sys = 'L' | 'R'
export type Artery = 'TCI' | 'DA' | 'Cx' | 'CD'
export type Dominance = 'R' | 'L'
export interface SegInfo { id: string; num: string; name: string; artery: Artery; sys: Sys }

export const SEGMENTS: SegInfo[] = [
  { id: '1', num: '1', name: 'CD proximal', artery: 'CD', sys: 'R' },
  { id: '2', num: '2', name: 'CD media', artery: 'CD', sys: 'R' },
  { id: '3', num: '3', name: 'CD distal', artery: 'CD', sys: 'R' },
  { id: '4', num: '4', name: 'Descendente posterior (DP) de la CD', artery: 'CD', sys: 'R' },
  { id: '16', num: '16', name: 'Posterolateral de la CD (PL)', artery: 'CD', sys: 'R' },
  { id: '16a', num: '16a', name: 'Rama posterolateral a (CD)', artery: 'CD', sys: 'R' },
  { id: 'MA', num: '—', name: 'Marginal aguda (sin número SYNTAX)', artery: 'CD', sys: 'R' },
  { id: '5', num: '5', name: 'Tronco coronario izquierdo (TCI)', artery: 'TCI', sys: 'L' },
  { id: '6', num: '6', name: 'DA proximal', artery: 'DA', sys: 'L' },
  { id: '7', num: '7', name: 'DA media', artery: 'DA', sys: 'L' },
  { id: '8', num: '8', name: 'DA apical (distal)', artery: 'DA', sys: 'L' },
  { id: '9', num: '9', name: 'Primera diagonal (D1)', artery: 'DA', sys: 'L' },
  { id: '10', num: '10', name: 'Segunda diagonal (D2)', artery: 'DA', sys: 'L' },
  { id: 'S1', num: '—', name: 'Primera septal (sin número SYNTAX)', artery: 'DA', sys: 'L' },
  { id: '11', num: '11', name: 'Circunfleja (Cx) proximal', artery: 'Cx', sys: 'L' },
  { id: '12', num: '12', name: 'Ramo intermedio / anterolateral', artery: 'Cx', sys: 'L' },
  { id: '12a', num: '12a', name: 'Obtusa marginal 1 (OM1)', artery: 'Cx', sys: 'L' },
  { id: '12b', num: '12b', name: 'Obtusa marginal 2 (OM2)', artery: 'Cx', sys: 'L' },
  { id: '13', num: '13', name: 'Cx distal', artery: 'Cx', sys: 'L' },
  { id: '14', num: '14', name: 'Posterolateral izquierda (de Cx)', artery: 'Cx', sys: 'L' },
  { id: '15', num: '15', name: 'Descendente posterior de la Cx (dominancia izq.)', artery: 'Cx', sys: 'L' },
]
export const SEG = Object.fromEntries(SEGMENTS.map((s) => [s.id, s])) as Record<string, SegInfo>

/** Factores de peso SYNTAX por segmento (dominancia derecha / izquierda). */
export const SYNTAX_W: Record<Dominance, Record<string, number>> = {
  R: { '1': 1, '2': 1, '3': 1, '4': 1, '16': 0.5, '16a': 0.5, '5': 5, '6': 3.5, '7': 2.5, '8': 1, '9': 1, '10': 0.5, '11': 1.5, '12': 1, '12a': 1, '12b': 1, '13': 0.5, '14': 0.5, '15': 0 },
  L: { '1': 0, '2': 0, '3': 0, '4': 0, '16': 0, '16a': 0, '5': 6, '6': 3.5, '7': 2.5, '8': 1, '9': 1, '10': 0.5, '11': 2.5, '12': 1, '12a': 1, '12b': 1, '13': 1.5, '14': 1, '15': 1 },
}

type CP = { w: V3 } | { th: number; ph: number; snap?: 'ivA' | 'ivP' | 'av' }
interface VDef { id: string; sys: Sys; parent?: string; at?: number; r0: number; r1: number; cps: CP[] }
export interface Vessel { id: string; sys: Sys; parent?: string; atS: number; pts: V3[]; cum: number[]; cpS: number[]; r0: number; r1: number; len: number }
const K = 14 // muestras por tramo entre puntos de control

function resolveCP(cp: CP, r: number): { p: V3; fixed: boolean } {
  if ('w' in cp) return { p: cp.w.clone(), fixed: true }
  let { th, ph } = cp
  if (cp.snap === 'ivA') th = creaseTheta(ph, th)
  if (cp.snap === 'ivP') th = creaseTheta(ph, th)
  if (cp.snap === 'av') ph = creasePhi(th)
  return { p: surfLocal(dirLocal(th, ph), r * 1.6 * 0.95), fixed: false }
}

function buildVessel(def: VDef, vs: Record<string, Vessel & { fixed: number[] }>) {
  const ctrl: { p: V3; fixed: boolean }[] = []
  let atS = 0
  if (def.parent) {
    const par = vs[def.parent]
    const i = Math.min(par.pts.length - 1, Math.round((def.at ?? 0) * K))
    atS = par.cum[i]
    ctrl.push({ p: par.pts[i].clone(), fixed: par.fixed[i] > 0.5 })
  }
  def.cps.forEach((cp) => ctrl.push(resolveCP(cp, def.r0)))
  const curve = new THREE.CatmullRomCurve3(ctrl.map((c) => c.p), false, 'centripetal')
  const n = (ctrl.length - 1) * K
  const pts: V3[] = [], fixed: number[] = []
  for (let i = 0; i <= n; i++) {
    const seg = Math.min(ctrl.length - 2, Math.floor(i / K)), f = i / K - seg
    const fa = ctrl[seg].fixed ? 1 : 0, fb = ctrl[seg + 1].fixed ? 1 : 0
    const fx = fa + (fb - fa) * (f * f * (3 - 2 * f))
    const p = curve.getPoint(i / n)
    const r = def.r0 + ((def.r1 - def.r0) * i) / n
    if (fx < 1 && !(i === 0 && def.parent)) p.lerp(projectWorld(p, r * 1.6 * 0.95), 1 - fx)
    pts.push(p)
    fixed.push(fx)
  }
  // suavizado laplaciano ligero (mantiene extremos)
  for (let it = 0; it < 3; it++)
    for (let i = 1; i < pts.length - 1; i++) pts[i] = pts[i].clone().multiplyScalar(0.5).addScaledVector(pts[i - 1].clone().add(pts[i + 1]), 0.25)
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  const cpS = ctrl.map((_, i) => cum[i * K])
  vs[def.id] = { id: def.id, sys: def.sys, parent: def.parent, atS, pts, cum, cpS, r0: def.r0, r1: def.r1, len: cum[cum.length - 1], fixed }
}

// Ostia en la raíz aórtica (senos coronarios), orientados hacia el surco correspondiente
const SINUS = AO_ROOT.clone().add(V(-0.2, 0.9, 0.2))
const ostium = (target: V3) => {
  const d = target.clone().sub(SINUS)
  d.y = Math.min(d.y, 0)
  return SINUS.clone().addScaledVector(d.normalize(), 1.25)
}
const LM_OS = ostium(toWorld(...PL(25, 2.6, 0.2)))
const RCA_OS = ostium(toWorld(...PL(128, 3.0, -0.3)))
export const OSTIA: Record<Sys, V3> = { L: LM_OS, R: RCA_OS }
const LW = (th: number, r: number, w: number) => ({ w: toWorld(...PL(th, r, w)) })
const avPoint = (th: number, r: number) => surfLocal(dirLocal(th, creasePhi(th)), r * 1.6 * 0.95)

function vesselDefs(dom: Dominance, ramus: boolean): VDef[] {
  const rightDom = dom === 'R'
  const av = (...ths: number[]) => ths.map((th) => ({ th, ph: 40, snap: 'av' as const }))
  const ivP = (...phs: number[]) => phs.map((ph) => ({ th: 207, ph, snap: 'ivP' as const }))
  const d: VDef[] = [
    // Tronco: corre a la izquierda por detrás del tronco pulmonar hasta la bifurcación
    { id: 'LM', sys: 'L', r0: 0.24, r1: 0.22, cps: [{ w: LM_OS }, { w: avPoint(45, 0.24) }] },
    { id: 'LAD', sys: 'L', parent: 'LM', at: 1, r0: 0.19, r1: 0.06, cps: [
      { th: 62, ph: 34, snap: 'ivA' }, { th: 64, ph: 18, snap: 'ivA' }, { th: 66, ph: 0, snap: 'ivA' }, { th: 66, ph: -25, snap: 'ivA' },
      { th: 66, ph: -50, snap: 'ivA' }, { th: 66, ph: -72 }, { th: 140, ph: -87 }, { th: 200, ph: -75 } ] },
    { id: 'D1', sys: 'L', parent: 'LAD', at: 1.5, r0: 0.13, r1: 0.05, cps: [{ th: 50, ph: 12 }, { th: 36, ph: -8 }, { th: 24, ph: -32 }] },
    { id: 'D2', sys: 'L', parent: 'LAD', at: 3.2, r0: 0.11, r1: 0.045, cps: [{ th: 54, ph: -25 }, { th: 42, ph: -42 }, { th: 32, ph: -58 }] },
    { id: 'S1', sys: 'L', parent: 'LAD', at: 1.1, r0: 0.08, r1: 0.04, cps: [LW(85, 1.4, -1.6), LW(112, 0.7, -3.4)] },
    { id: 'CX', sys: 'L', parent: 'LM', at: 1, r0: 0.18, r1: rightDom ? 0.09 : 0.13, cps: rightDom ? av(35, 10, -15, -40, -65, -85) : av(35, 10, -15, -40, -70, -100, -128, -152) },
    { id: 'OM1', sys: 'L', parent: 'CX', at: 1.8, r0: 0.13, r1: 0.05, cps: [{ th: 8, ph: 25 }, { th: 3, ph: 0 }, { th: -3, ph: -28 }, { th: -6, ph: -50 }] },
    { id: 'OM2', sys: 'L', parent: 'CX', at: 3.8, r0: 0.11, r1: 0.045, cps: [{ th: -40, ph: 25 }, { th: -45, ph: 0 }, { th: -48, ph: -30 }] },
    // CD: del seno derecho al surco AV derecho, borde agudo y crux
    { id: 'RCA', sys: 'R', r0: 0.21, r1: rightDom ? 0.13 : 0.09, cps: [{ w: RCA_OS }, ...(rightDom ? av(128, 148, 170, 188, 200, 208, 222, 238) : av(128, 148, 170, 185))] },
    { id: 'MA', sys: 'R', parent: 'RCA', at: 3, r0: 0.1, r1: 0.04, cps: [{ th: 172, ph: 15 }, { th: 176, ph: -15 }, { th: 180, ph: -45 }] },
  ]
  if (ramus) d.push({ id: 'RI', sys: 'L', parent: 'LM', at: 1, r0: 0.12, r1: 0.05, cps: [{ th: 32, ph: 28 }, { th: 25, ph: 5 }, { th: 18, ph: -25 }] })
  if (rightDom) {
    d.push(
      { id: 'PDA', sys: 'R', parent: 'RCA', at: 6, r0: 0.12, r1: 0.04, cps: ivP(22, 0, -28, -55) },
      { id: 'PL', sys: 'R', parent: 'RCA', at: 7.4, r0: 0.1, r1: 0.04, cps: [{ th: 228, ph: 22 }, { th: 234, ph: 0 }, { th: 240, ph: -28 }] },
    )
  } else {
    d.push(
      { id: 'PDA', sys: 'L', parent: 'CX', at: 8, r0: 0.11, r1: 0.04, cps: ivP(22, 0, -28, -55) },
      { id: 'LPL', sys: 'L', parent: 'CX', at: 6.4, r0: 0.11, r1: 0.04, cps: [{ th: -112, ph: 22 }, { th: -118, ph: 0 }, { th: -124, ph: -28 }] },
    )
  }
  return d
}

interface SegRange { id: string; v: string; s0: number; s1: number }
function segRanges(vs: Record<string, Vessel>, dom: Dominance, ramus: boolean): SegRange[] {
  const r = (id: string, v: string, s0: number, s1: number) => ({ id, v, s0, s1 })
  const end = (v: string) => vs[v].len
  const sAt = (v: string, i: number) => vs[v].cum[Math.min(vs[v].cum.length - 1, Math.round(i * K))]
  const acute = sAt('RCA', 3)
  const out: SegRange[] = [
    r('5', 'LM', 0, end('LM')),
    r('6', 'LAD', 0, sAt('LAD', 1.5)), r('7', 'LAD', sAt('LAD', 1.5), sAt('LAD', 3.2)), r('8', 'LAD', sAt('LAD', 3.2), end('LAD')),
    r('9', 'D1', 0, end('D1')), r('10', 'D2', 0, end('D2')), r('S1', 'S1', 0, end('S1')),
    r('11', 'CX', 0, sAt('CX', 1.8)), r('13', 'CX', sAt('CX', 1.8), end('CX')), r('12a', 'OM1', 0, end('OM1')), r('12b', 'OM2', 0, end('OM2')),
    r('1', 'RCA', 0, acute / 2), r('2', 'RCA', acute / 2, acute), r('MA', 'MA', 0, end('MA')),
  ]
  if (ramus) out.push(r('12', 'RI', 0, end('RI')))
  if (dom === 'R') out.push(r('3', 'RCA', acute, sAt('RCA', 6)), r('4', 'PDA', 0, end('PDA')), r('16', 'RCA', sAt('RCA', 6), end('RCA')), r('16a', 'PL', 0, end('PL')))
  else out.push(r('3', 'RCA', acute, end('RCA')), r('14', 'LPL', 0, end('LPL')), r('15', 'PDA', 0, end('PDA')))
  return out
}

const treeCache = new Map<string, { vs: Record<string, Vessel>; segs: SegRange[] }>()
function tree(dom: Dominance, ramus: boolean) {
  const key = dom + ramus
  let t = treeCache.get(key)
  if (!t) {
    const vs: Record<string, Vessel & { fixed: number[] }> = {}
    vesselDefs(dom, ramus).forEach((d) => buildVessel(d, vs))
    t = { vs, segs: segRanges(vs, dom, ramus) }
    treeCache.set(key, t)
  }
  return t
}

// ---------- Estenosis y geometría de tubos ----------
export interface Stenosis { id: string; seg: string; pct: number; len: number /* mm */; pos: number /* 0–1 dentro del segmento */ }
export interface SegMesh { id: string; sys: Sys; geom: THREE.BufferGeometry; mid: V3; worst: number }
export interface Model { segs: SegMesh[]; catheter: Record<Sys, V3[]>; available: string[]; dispose(): void }

export const R_SCALE = 1.6 // calibre exagerado para visibilidad
const radiusAt = (v: Vessel, s: number) => (v.r0 + ((v.r1 - v.r0) * s) / v.len) * R_SCALE
function pointAt(v: Vessel, s: number, out = new THREE.Vector3()) {
  let i = 1
  while (i < v.cum.length - 1 && v.cum[i] < s) i++
  const a = v.cum[i - 1], b = v.cum[i], f = b > a ? Math.min(1, Math.max(0, (s - a) / (b - a))) : 0
  return out.copy(v.pts[i - 1]).lerp(v.pts[i], f)
}

export function buildModel(opts: { dominance: Dominance; ramus: boolean; stenoses: Stenosis[] }): Model {
  const { vs, segs } = tree(opts.dominance, opts.ramus)
  const segById = Object.fromEntries(segs.map((s) => [s.id, s]))
  // estenosis en coordenadas de vaso (centro y semilongitud en cm)
  const st = opts.stenoses.filter((s) => segById[s.seg]).map((s) => {
    const r = segById[s.seg]
    return { v: r.v, c: r.s0 + (r.s1 - r.s0) * s.pos, h: Math.max(0.15, s.len / 20), pct: Math.min(100, Math.max(0, s.pct)) }
  })
  // retraso de llenado (cm "virtuales") aguas abajo de lesiones críticas; 1e4 = no se llena
  const delayAt = (vid: string, s: number): number => {
    const v = vs[vid]
    let d = v.parent ? delayAt(v.parent, v.atS) : 0
    for (const x of st) if (x.v === vid && x.c < s) d += x.pct >= 100 ? 1e4 : x.pct >= 90 ? (6 * (x.pct - 85)) / 15 : 0
    return d
  }
  const baseDist = (vid: string): number => (vs[vid].parent ? baseDist(vs[vid].parent!) + vs[vid].atS : 0)
  const red = new THREE.Color('#c8101c'), yel = new THREE.Color('#ffd23f'), col = new THREE.Color()

  const out: SegMesh[] = segs.map((sr) => {
    const v = vs[sr.v]
    const RS = 12, step = 0.07
    const n = Math.max(2, Math.ceil((sr.s1 - sr.s0) / step))
    const P: V3[] = [], R: number[] = [], S: number[] = [], Nv: number[] = []
    let worst = 0
    for (let i = 0; i <= n; i++) {
      const s = sr.s0 + ((sr.s1 - sr.s0) * i) / n
      P.push(pointAt(v, s))
      let f = 1, sev = 0
      for (const x of st) {
        if (x.v !== sr.v) continue
        const u = Math.abs(s - x.c) / x.h
        if (u < 1) {
          const b = 0.5 + 0.5 * Math.cos(Math.PI * u)
          f = Math.min(f, 1 - (x.pct / 100) * b)
          sev = Math.max(sev, b * x.pct / 100)
          if (sr.s0 <= x.c && x.c <= sr.s1) worst = Math.max(worst, x.pct)
        }
      }
      R.push(Math.max(0.012, radiusAt(v, s) * f))
      S.push(s)
      Nv.push(sev)
    }
    // marcos de transporte paralelo
    const T = P.map((_, i) => P[Math.min(n, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize())
    const nrm = new THREE.Vector3(0, 1, 0)
    if (Math.abs(nrm.dot(T[0])) > 0.9) nrm.set(1, 0, 0)
    nrm.sub(T[0].clone().multiplyScalar(nrm.dot(T[0]))).normalize()
    const pos = new Float32Array((n + 1) * (RS + 1) * 3), nor = new Float32Array(pos.length), colA = new Float32Array(pos.length)
    const dist = new Float32Array((n + 1) * (RS + 1)), rad = new Float32Array(dist.length)
    const bd = baseDist(sr.v)
    for (let i = 0; i <= n; i++) {
      if (i > 0) {
        nrm.sub(T[i].clone().multiplyScalar(nrm.dot(T[i]))).normalize()
      }
      const bin = T[i].clone().cross(nrm)
      const dd = bd + S[i] + delayAt(sr.v, S[i])
      col.copy(red).lerp(yel, Math.min(1, Nv[i] * 1.4))
      for (let j = 0; j <= RS; j++) {
        const a = (j / RS) * Math.PI * 2
        const nx = nrm.x * Math.cos(a) + bin.x * Math.sin(a), ny = nrm.y * Math.cos(a) + bin.y * Math.sin(a), nz = nrm.z * Math.cos(a) + bin.z * Math.sin(a)
        const k = i * (RS + 1) + j
        pos.set([P[i].x + nx * R[i], P[i].y + ny * R[i], P[i].z + nz * R[i]], k * 3)
        nor.set([nx, ny, nz], k * 3)
        colA.set([col.r, col.g, col.b], k * 3)
        dist[k] = dd
        rad[k] = R[i]
      }
    }
    const idx: number[] = []
    for (let i = 0; i < n; i++)
      for (let j = 0; j < RS; j++) {
        const a = i * (RS + 1) + j, b = a + RS + 1
        idx.push(a, a + 1, b, b, a + 1, b + 1)
      }
    // tapas en ambos extremos (malla cerrada: necesaria para el cálculo de espesor en fluoroscopía)
    const nv = (n + 1) * (RS + 1)
    const ext = (arr: Float32Array, extra: number[]) => { const o = new Float32Array(arr.length + extra.length); o.set(arr); o.set(extra, arr.length); return o }
    const P0 = P[0], Pn = P[n], T0 = T[0], Tn = T[n]
    const c0 = colA.slice(0, 3), cn = colA.slice(n * (RS + 1) * 3, n * (RS + 1) * 3 + 3)
    for (let j = 0; j < RS; j++) {
      idx.push(nv, j + 1, j)
      idx.push(nv + 1, n * (RS + 1) + j, n * (RS + 1) + j + 1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(ext(pos, [P0.x, P0.y, P0.z, Pn.x, Pn.y, Pn.z]), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(ext(nor, [-T0.x, -T0.y, -T0.z, Tn.x, Tn.y, Tn.z]), 3))
    g.setAttribute('color', new THREE.BufferAttribute(ext(colA, [...c0, ...cn]), 3))
    g.setAttribute('aDist', new THREE.BufferAttribute(ext(dist, [dist[0], dist[nv - 1]]), 1))
    g.setAttribute('aRad', new THREE.BufferAttribute(ext(rad, [0, 0]), 1))
    g.setIndex(idx)
    g.computeBoundingSphere()
    return { id: sr.id, sys: v.sys, geom: g, mid: pointAt(v, (sr.s0 + sr.s1) / 2), worst }
  })
  // catéter: del ostium a la raíz aórtica y por la aorta descendente
  const aoCurve = new THREE.CatmullRomCurve3(AORTA)
  const aoPts = Array.from({ length: 16 }, (_, i) => aoCurve.getPoint(0.2 + (0.8 * i) / 15))
  const cath = (os: V3) => [os.clone(), os.clone().lerp(SINUS, 0.5).add(V(0, 0.6, 0)), ...aoPts]
  return {
    segs: out,
    catheter: { L: cath(LM_OS), R: cath(RCA_OS) },
    available: segs.map((s) => s.id),
    dispose: () => out.forEach((s) => s.geom.dispose()),
  }
}

/** Vector de vista del arco en C (dirección desde el corazón hacia el intensificador). */
export function carmDir(lao: number, cra: number, out = new THREE.Vector3()) {
  // LAO(+)/RAO(−) = rotación alrededor del eje largo del paciente (y); CRA(+)/CAU(−) = inclinación
  // hacia la cabeza. d = (sinθ·cosφ, sinφ, cosθ·cosφ) en el marco (izq, cefálico, anterior).
  // AP (0,0) mira desde anterior: la izquierda del paciente queda a la derecha de la imagen.
  const t = lao * DEG, p = cra * DEG
  return out.set(Math.sin(t) * Math.cos(p), Math.sin(p), Math.cos(t) * Math.cos(p))
}
