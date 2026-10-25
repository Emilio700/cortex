/**
 * Herramientas de geometría procedural para el atlas.
 *
 * Toda la anatomía se genera en código (nada de mallas descargadas con
 * licencias dudosas): tubos de radio variable para la médula, las raíces, los
 * vasos y los ventrículos; barras para las apófisis; ruido para las
 * circunvoluciones. Todas las geometrías salen indexadas y con `position`,
 * `normal` y `uv`, para poder fusionarlas sin sorpresas.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// ── Ruido simplex 3D (Gustavson, dominio público) ──────────────────────────

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]

/** Ruido determinista: la misma semilla da el mismo encéfalo en cada carga. */
export const crearRuido3 = (semilla = 7) => {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  let s = semilla >>> 0
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const F3 = 1 / 3
  const G3 = 1 / 6

  return (xin: number, yin: number, zin: number): number => {
    const sk = (xin + yin + zin) * F3
    const i = Math.floor(xin + sk)
    const j = Math.floor(yin + sk)
    const k = Math.floor(zin + sk)
    const t = (i + j + k) * G3
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)
    const z0 = zin - (k - t)
    let i1, j1, k1, i2, j2, k2
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0]
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1]
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1]
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1]
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1]
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0]
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3
    const ii = i & 255, jj = j & 255, kk = k & 255
    const esquina = (x: number, y: number, z: number, g: number) => {
      const t0 = 0.6 - x * x - y * y - z * z
      if (t0 < 0) return 0
      const gr = GRAD3[g % 12]
      const t2 = t0 * t0
      return t2 * t2 * (gr[0] * x + gr[1] * y + gr[2] * z)
    }
    const n0 = esquina(x0, y0, z0, perm[ii + perm[jj + perm[kk]]])
    const n1 = esquina(x1, y1, z1, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]])
    const n2 = esquina(x2, y2, z2, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]])
    const n3 = esquina(x3, y3, z3, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]])
    return 32 * (n0 + n1 + n2 + n3)
  }
}

export type Ruido3 = ReturnType<typeof crearRuido3>

// ── Utilidades numéricas ───────────────────────────────────────────────────

export const limitar = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const pasoSuave = (a: number, b: number, v: number) => {
  const t = limitar((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** Campana gaussiana: 1 en el centro, ~0 a tres anchos. */
export const campana = (d: number, ancho: number) => Math.exp(-(d * d) / (2 * ancho * ancho))
/** Máximo suave, para aplanar sin aristas (p. ej. la cara interna del hemisferio). */
export const maximoSuave = (a: number, b: number, k: number) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k))

/** Distancia de un punto (2D) a un segmento. */
export const distanciaASegmento = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const vx = bx - ax, vy = by - ay
  const t = limitar(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy))
  const dx = px - (ax + vx * t), dy = py - (ay + vy * t)
  return Math.sqrt(dx * dx + dy * dy)
}

// ── Tubo de radio variable ─────────────────────────────────────────────────

export interface OpcionesDeTubo {
  /** Puntos del eje (se interpolan con Catmull-Rom). */
  puntos: THREE.Vector3[]
  /** Radio a lo largo del tubo, t ∈ [0, 1]. */
  radio: (t: number) => number
  segmentos?: number
  radiales?: number
  /** Ensancha la sección en el eje lateral del marco (médula, tronco). */
  escalaLateral?: (t: number) => number
  /** Desplaza el centro hacia delante (+z del mundo), p. ej. la protuberancia. */
  desplazamiento?: (t: number) => THREE.Vector3 | null
  tapas?: boolean
  tension?: number
}

/**
 * Marcos que no giran a lo largo de la curva (transporte paralelo): con los de
 * Frenet, una curva casi recta voltea el marco y el tubo se tuerce.
 */
const marcosSinGiro = (tangentes: THREE.Vector3[]) => {
  const normales: THREE.Vector3[] = []
  const binormales: THREE.Vector3[] = []
  const t0 = tangentes[0]
  // La normal inicial se ancla al eje lateral del mundo (x) cuando se puede:
  // así «escalaLateral» ensancha la médula de izquierda a derecha.
  const ref = Math.abs(t0.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  let n = ref.clone().sub(t0.clone().multiplyScalar(ref.dot(t0))).normalize()
  for (let i = 0; i < tangentes.length; i++) {
    const t = tangentes[i]
    n = n.clone().sub(t.clone().multiplyScalar(n.dot(t))).normalize()
    normales.push(n)
    binormales.push(new THREE.Vector3().crossVectors(t, n).normalize())
  }
  return { normales, binormales }
}

export const tuboVariable = (op: OpcionesDeTubo): THREE.BufferGeometry => {
  const curva = new THREE.CatmullRomCurve3(op.puntos, false, 'catmullrom', op.tension ?? 0.5)
  const segmentos = op.segmentos ?? 48
  const radiales = op.radiales ?? 16
  const centros: THREE.Vector3[] = []
  const tangentes: THREE.Vector3[] = []
  for (let i = 0; i <= segmentos; i++) {
    const t = i / segmentos
    const c = curva.getPointAt(t)
    const d = op.desplazamiento?.(t)
    if (d) c.add(d)
    centros.push(c)
    tangentes.push(curva.getTangentAt(t).normalize())
  }
  const { normales, binormales } = marcosSinGiro(tangentes)

  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const v = new THREE.Vector3()
  const nn = new THREE.Vector3()
  for (let i = 0; i <= segmentos; i++) {
    const t = i / segmentos
    const r = Math.max(0.0005, op.radio(t))
    const ex = op.escalaLateral?.(t) ?? 1
    for (let j = 0; j <= radiales; j++) {
      const a = (j / radiales) * Math.PI * 2
      const ca = Math.cos(a), sa = Math.sin(a)
      v.copy(centros[i]).addScaledVector(normales[i], ca * r * ex).addScaledVector(binormales[i], sa * r)
      nn.copy(normales[i]).multiplyScalar(ca / ex).addScaledVector(binormales[i], sa).normalize()
      pos.push(v.x, v.y, v.z)
      nor.push(nn.x, nn.y, nn.z)
      uv.push(t, j / radiales)
    }
  }
  for (let i = 0; i < segmentos; i++) {
    for (let j = 0; j < radiales; j++) {
      const a = i * (radiales + 1) + j
      const b = a + radiales + 1
      // Orden antihorario visto desde fuera: la cara mira hacia afuera.
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  if (op.tapas !== false) {
    for (const extremo of [0, segmentos]) {
      const centro = pos.length / 3
      const c = centros[extremo]
      const signo = extremo === 0 ? -1 : 1
      const tn = tangentes[extremo].clone().multiplyScalar(signo)
      pos.push(c.x, c.y, c.z)
      nor.push(tn.x, tn.y, tn.z)
      uv.push(extremo / segmentos, 0.5)
      const base = extremo * (radiales + 1)
      for (let j = 0; j < radiales; j++) {
        if (extremo === 0) idx.push(centro, base + j + 1, base + j)
        else idx.push(centro, base + j, base + j + 1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

// ── Piezas simples ─────────────────────────────────────────────────────────

const ARRIBA = new THREE.Vector3(0, 1, 0)

/** Cilindro (o cono truncado) de `a` a `b`. */
export const barra = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, radiales = 10): THREE.BufferGeometry => {
  const dir = new THREE.Vector3().subVectors(b, a)
  const largo = Math.max(0.001, dir.length())
  const g = new THREE.CylinderGeometry(r1, r0, largo, radiales, 1, false)
  const q = new THREE.Quaternion().setFromUnitVectors(ARRIBA, dir.normalize())
  g.applyQuaternion(q)
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return g
}

/** Elipsoide centrado en `c`. */
export const elipsoide = (c: THREE.Vector3, rx: number, ry: number, rz: number, ancho = 20, alto = 14) => {
  const g = new THREE.SphereGeometry(1, ancho, alto)
  g.scale(rx, ry, rz)
  g.translate(c.x, c.y, c.z)
  return g
}

/** Fusiona piezas en una sola geometría (todas indexadas y con los mismos atributos). */
export const fusionar = (piezas: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const listas = piezas.map((g) => {
    const indexada = g.index ? g : g.toNonIndexed()
    for (const nombre of Object.keys(indexada.attributes)) {
      if (!['position', 'normal', 'uv'].includes(nombre)) indexada.deleteAttribute(nombre)
    }
    return indexada
  })
  const unida = mergeGeometries(listas, false)
  for (const g of piezas) g.dispose()
  if (!unida) throw new Error('No se pudieron unir las piezas del modelo.')
  return unida
}

/**
 * Lleva una geometría a otro marco: `origen` y los ejes `x`, `y`, `z` del
 * marco local (ortonormales). Así una vértebra se modela derecha y se coloca
 * sobre la curva de la columna.
 */
export const aMarco = (
  g: THREE.BufferGeometry,
  origen: THREE.Vector3,
  ejeX: THREE.Vector3,
  ejeY: THREE.Vector3,
  ejeZ: THREE.Vector3,
): THREE.BufferGeometry => {
  const m = new THREE.Matrix4().makeBasis(ejeX, ejeY, ejeZ).setPosition(origen)
  g.applyMatrix4(m)
  return g
}
