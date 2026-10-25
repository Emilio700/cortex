/**
 * Encéfalo procedural: hemisferios con circunvoluciones y cisuras, divididos en
 * lóbulos que se tocan por separado; ínsula, cerebelo con sus folias y tronco.
 *
 * Cada hemisferio nace de una esfera que se deforma: se aplana la cara
 * interna, se baja el lóbulo temporal, se tallan la cisura lateral (Silvio),
 * el surco central (Rolando) y el parietooccipital, y el ruido «en cresta»
 * levanta las circunvoluciones. Los lóbulos se reparten por la posición de
 * cada triángulo respecto de esas cisuras, así que el límite de un lóbulo cae
 * justo en el fondo de su surco, como en el encéfalo real.
 *
 * Coordenadas en cm: +x izquierda del paciente, +y arriba, +z adelante.
 */
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PiezaAnatomica } from './tipos'
import { campana, crearRuido3, distanciaASegmento, maximoSuave, pasoSuave, tuboVariable } from './geometria'

/** «realista» afina las circunvoluciones y sube la resolución de las mallas. */
export type Detalle = 'estandar' | 'realista'

type LadoHemisferio = { signo: 1 | -1; sufijo: 'izq' | 'der' }
const LADOS: LadoHemisferio[] = [
  { signo: 1, sufijo: 'izq' },
  { signo: -1, sufijo: 'der' },
]

// Forma base de un hemisferio (en su lado +x).
const CX = 3.35
const CY = 1.3
const CZ = -0.4
const RX = 3.55
const RY = 4.1
const RZ = 8.1

/** Cisura lateral: de la punta del temporal hacia atrás y arriba (z, y). */
const SILVIO: [number, number, number, number] = [3.0, -0.2, -2.6, 1.5]
/** Surco central: de arriba, cerca de la línea media, hacia abajo y adelante. */
const ROLANDO: [number, number, number, number] = [-0.6, 5.4, 1.3, 1.0]

/** Altura de la cisura lateral a una profundidad z (límite superior del temporal). */
const alturaDeSilvio = (z: number) => {
  const [z0, y0, z1, y1] = SILVIO
  if (z >= z0) return y0
  if (z <= z1) return y1
  return y0 + ((z - z0) / (z1 - z0)) * (y1 - y0)
}
/** Profundidad z del surco central a una altura y (límite posterior del frontal). */
const zDeRolando = (y: number) => {
  const [z0, y0, z1, y1] = ROLANDO
  if (y >= y0) return z0
  if (y <= y1) return z1
  return z0 + ((y - y0) / (y1 - y0)) * (z1 - z0)
}
/** Límite anterior del occipital (surco parietooccipital y escotadura preoccipital). */
const zDelOccipital = (y: number) => -5.0 - 0.18 * (4.5 - y)

type Lobulo = 'frontal' | 'parietal' | 'temporal' | 'occipital'

const lobuloEn = (y: number, z: number): Lobulo => {
  if (z < zDelOccipital(y)) return 'occipital'
  if (y < alturaDeSilvio(z) && z < 3.35) return 'temporal'
  if (z > zDeRolando(y)) return 'frontal'
  return 'parietal'
}

const ruido = crearRuido3(11)

/**
 * Circunvoluciones: circunvoluciones anchas y surcos estrechos y hondos. Los
 * surcos caen donde el ruido cruza por cero; la potencia alta los afina.
 * Devuelve el relieve (cm, positivo hacia afuera) y cuán dentro de un surco
 * está el punto (0–1), para oscurecerlo.
 *
 * En Realista se suman surcos terciarios (más finos y menos hondos) que parten
 * cada circunvolución, como en la corteza real.
 */
const circunvoluciones = (x: number, y: number, z: number, detalle: Detalle): [number, number] => {
  // Un poco de deformación del dominio vuelve los surcos sinuosos.
  const wx = x + 1.1 * ruido(x * 0.19 + 3, y * 0.19, z * 0.19)
  const wy = y + 1.1 * ruido(x * 0.19, y * 0.19 + 7, z * 0.19)
  const wz = z + 1.1 * ruido(x * 0.19, y * 0.19, z * 0.19 + 13)
  const n = ruido(wx * 0.55, wy * 0.55, wz * 0.55)
  if (detalle === 'estandar') {
    const surco = Math.pow(1 - Math.abs(n), 7)
    const fino = ruido(x * 1.6 + 21, y * 1.6, z * 1.6) * 0.03
    return [0.1 - 0.42 * surco + fino, surco]
  }
  const surco = Math.pow(1 - Math.abs(n), 9)
  const n2 = ruido(wx * 1.25 + 40, wy * 1.25, wz * 1.25)
  // Los terciarios no cruzan el fondo de un surco mayor: se apagan cerca de él.
  const terciario = Math.pow(1 - Math.abs(n2), 12) * (1 - pasoSuave(0.15, 0.6, surco)) * pasoSuave(0.1, 0.5, Math.abs(n) + 0.2)
  const fino = ruido(x * 2.4 + 21, y * 2.4, z * 2.4) * 0.018
  return [0.12 - 0.46 * surco - 0.17 * terciario + fino, Math.max(surco, 0.6 * terciario)]
}

interface Hemisferio {
  geometria: THREE.BufferGeometry
  /** Lóbulo de cada vértice (por su posición base, antes de tallar). */
  lobulo: Lobulo[]
}

/**
 * Sombra de cavidad: el fondo de surcos y cisuras se oscurece (color por
 * vértice). Es lo que hace que el relieve se lea aun con luz de frente.
 */
const sombraDeCavidad = (hondo: number) => 1 - 0.55 * Math.min(1, hondo)

/**
 * En Realista la sombra del surco no es gris: el fondo de los surcos tira a
 * rojo pardo (la piamadre y sus vasos), como en una pieza fresca.
 */
const sombraTenida = (hondo: number): [number, number, number] => {
  const h = Math.min(1, hondo)
  return [1 - 0.55 * h, 1 - 0.74 * h, 1 - 0.7 * h]
}

/**
 * Forma base de un hemisferio sin surcos (silueta, lóbulo temporal y cara
 * interna plana), en su lado +x. `dx, dy, dz` es un punto de la esfera unidad.
 * La usan las venas puenteantes y el seno sagital para apoyarse en la
 * superficie.
 */
export const formaDelHemisferio = (dx: number, dy: number, dz: number): THREE.Vector3 => {
  let x = CX + RX * dx * (1 - 0.14 * pasoSuave(0.35, 1, -dz))
  let y = CY + RY * dy * (dy < 0 ? 0.6 : 1) * (1 - 0.1 * pasoSuave(0.5, 1, dz))
  const z = CZ + RZ * dz
  const lateral = pasoSuave(0.05, 0.65, dx)
  const franja = campana(z + 0.4, 2.5)
  const abajo = pasoSuave(0.25, -0.55, dy)
  const temporal = lateral * franja * abajo
  y -= 1.95 * temporal
  x += 0.4 * temporal
  x = maximoSuave(x, 0.13, 0.06)
  return new THREE.Vector3(x, y, z)
}

const construirHemisferio = (signo: 1 | -1, detalle: Detalle): Hemisferio => {
  let base: THREE.BufferGeometry = detalle === 'realista' ? new THREE.SphereGeometry(1, 300, 200) : new THREE.SphereGeometry(1, 200, 132)
  base.deleteAttribute('normal')
  base.deleteAttribute('uv')
  base = mergeVertices(base)
  const pos = base.getAttribute('position') as THREE.BufferAttribute
  const lobulo: Lobulo[] = []
  const colores = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const haciaDentro = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i)
    const dy = pos.getY(i)
    const dz = pos.getZ(i)

    // 1–3. Silueta, lóbulo temporal y cara interna plana, contra la hoz.
    const { x, y, z } = formaDelHemisferio(dx, dy, dz)

    const yb = y
    const zb = z
    lobulo.push(lobuloEn(yb, zb))

    // 4. Cisuras y surcos mayores.
    const cara = pasoSuave(0.25, 0.75, dx)
    const interna = pasoSuave(-0.45, -0.8, dx)
    const arriba = pasoSuave(-0.25, 0.2, dy)
    let hundir = 0
    hundir += 0.62 * campana(distanciaASegmento(zb, yb, ...SILVIO), 0.22) * cara
    hundir += 0.34 * campana(distanciaASegmento(zb, yb, ...ROLANDO), 0.16) * arriba * (1 - interna)
    hundir += 0.36 * campana(zb - zDelOccipital(yb) - 0.15, 0.17) * interna * pasoSuave(0.6, 1.8, yb)
    hundir += 0.12 * campana(zb - zDelOccipital(yb), 0.15) * cara

    // 5. Circunvoluciones, más suaves en la cara interna.
    const [r0, surco] = circunvoluciones(x, y, z, detalle)
    const relieve = r0 * (1 - 0.45 * interna)
    const hondo = surco * (1 - 0.4 * interna) + hundir * 1.6
    if (detalle === 'realista') colores.set(sombraTenida(hondo), i * 3)
    else {
      const c = sombraDeCavidad(hondo)
      colores.set([c, c, c], i * 3)
    }

    haciaDentro.set(-dx / RX, -dy / RY, -dz / RZ).normalize()
    v.set(x, y, z).addScaledVector(haciaDentro, hundir - relieve)
    pos.setXYZ(i, signo * v.x, v.y, v.z)
  }
  if (signo < 0) {
    // Al reflejar, el orden de los vértices de cada triángulo se invierte.
    const idx = base.getIndex()!
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1)
      idx.setX(i + 1, idx.getX(i + 2))
      idx.setX(i + 2, a)
    }
  }
  base.setAttribute('color', new THREE.BufferAttribute(colores, 3))
  base.computeVertexNormals()
  return { geometria: base, lobulo }
}

/** Separa una geometría indexada en piezas, según la etiqueta de cada triángulo. */
const separarPorEtiqueta = <T extends string>(g: THREE.BufferGeometry, etiquetaDeTriangulo: (a: number, b: number, c: number) => T) => {
  const idx = g.getIndex()!
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const nor = g.getAttribute('normal') as THREE.BufferAttribute
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined
  const grupos = new Map<T, number[]>()
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2)
    const e = etiquetaDeTriangulo(a, b, c)
    if (!grupos.has(e)) grupos.set(e, [])
    grupos.get(e)!.push(a, b, c)
  }
  const salida = new Map<T, THREE.BufferGeometry>()
  for (const [e, tri] of grupos) {
    const mapa = new Map<number, number>()
    const p: number[] = []
    const n: number[] = []
    const k: number[] = []
    const ind: number[] = []
    for (const viejo of tri) {
      let nuevo = mapa.get(viejo)
      if (nuevo === undefined) {
        nuevo = p.length / 3
        mapa.set(viejo, nuevo)
        p.push(pos.getX(viejo), pos.getY(viejo), pos.getZ(viejo))
        n.push(nor.getX(viejo), nor.getY(viejo), nor.getZ(viejo))
        if (col) k.push(col.getX(viejo), col.getY(viejo), col.getZ(viejo))
      }
      ind.push(nuevo)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3))
    if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(k, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((p.length / 3) * 2), 2))
    geo.setIndex(ind)
    salida.set(e, geo)
  }
  return salida
}

const COLOR_DE_LOBULO: Record<Lobulo, string> = {
  frontal: '--cx-anat-frontal',
  parietal: '--cx-anat-parietal',
  temporal: '--cx-anat-temporal',
  occipital: '--cx-anat-occipital',
}

/** Ínsula: un islote con pliegues, en el fondo de la cisura lateral. */
const construirInsula = (signo: 1 | -1) => {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 48, 32)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  // Se inclina con la cisura, que sube hacia atrás.
  const angulo = Math.atan2(SILVIO[3] - SILVIO[1], SILVIO[0] - SILVIO[2])
  const cos = Math.cos(angulo)
  const sen = Math.sin(angulo)
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i)
    // Circunvoluciones cortas y largas: pliegues casi verticales.
    const pliegue = 0.06 * Math.sin(dz * 9) * pasoSuave(0, 0.8, dx)
    let x = 0.55 * dx + pliegue
    const y0 = 1.05 * dy
    const z0 = 1.9 * dz
    const y = y0 * cos - z0 * sen
    const z = y0 * sen + z0 * cos
    x += 5.55
    pos.setXYZ(i, signo * x, y + 0.75, z + 0.55)
  }
  if (signo < 0) {
    const idx = g.getIndex()!
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1)
      idx.setX(i + 1, idx.getX(i + 2))
      idx.setX(i + 2, a)
    }
  }
  g.computeVertexNormals()
  const uv = new Float32Array(pos.count * 2)
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** Cerebelo: dos hemisferios y el vermis, con folias horizontales. */
const construirCerebelo = (detalle: Detalle) => {
  let g: THREE.BufferGeometry = detalle === 'realista' ? new THREE.SphereGeometry(1, 220, 150) : new THREE.SphereGeometry(1, 140, 96)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const c = new THREE.Vector3(0, -4.35, -5.35)
  const colores = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i)
    let x = 4.9 * dx
    let y = 2.45 * dy * (dy > 0 ? 0.78 : 1)
    let z = 3.1 * dz
    // Tienda del cerebelo: la cara superior baja hacia los lados y atrás.
    y -= 0.5 * Math.abs(dx) * pasoSuave(0, 1, dy)
    // Vermis: surco por detrás y escotadura por delante, donde se apoya el tronco.
    const medio = campana(x, 0.65)
    const atras = pasoSuave(0.05, -0.7, dz)
    const delante = pasoSuave(0.2, 0.75, dz)
    z += 0.55 * medio * atras
    z -= 1.25 * campana(x, 1.1) * delante
    // Folias: surcos finos y paralelos, alrededor del eje transversal.
    const a = Math.atan2(dy, dz)
    // En Realista, folias más apretadas y algo irregulares.
    const folias = detalle === 'realista' ? 46 : 30
    const onda = Math.sin(a * folias + 0.6 * Math.sin(dx * 3) + (detalle === 'realista' ? 0.5 * ruido(dx * 2, dy * 2, dz * 2) : 0))
    const folia = (detalle === 'realista' ? 0.06 : 0.075) * onda + 0.035 * ruido(x * 0.8, y * 0.8, z * 0.8)
    const hondo = 0.4 * Math.pow(Math.max(0, -onda), 2) + 0.35 * medio * atras
    if (detalle === 'realista') colores.set(sombraTenida(hondo * 1.6), i * 3)
    else colores.set([1 - hondo, 1 - hondo, 1 - hondo], i * 3)
    const r = Math.hypot(dx, dy, dz) || 1
    x += (dx / r) * folia
    y += (dy / r) * folia
    z += (dz / r) * folia
    // Fisura horizontal, la más profunda.
    const fisura = 0.28 * campana(a - Math.PI * 0.94, 0.05) * pasoSuave(0.1, 0.5, Math.abs(dx))
    y += fisura
    pos.setXYZ(i, c.x + x, c.y + y, c.z + z)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colores, 3))
  g.computeVertexNormals()
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2))
  return g
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Tronco del encéfalo en tres piezas que se tocan por separado. */
const construirTronco = (): PiezaAnatomica[] => [
  {
    estructura: 'mesencefalo',
    capa: 'encefalo',
    color: '--cx-anat-tronco',
    acabado: 'organo',
    geometria: tuboVariable({
      puntos: [v3(0, -0.4, -0.55), v3(0, -1.5, -0.7), v3(0, -2.75, -0.85)],
      radio: (t) => 1.15 - 0.12 * t,
      escalaLateral: () => 1.35,
      segmentos: 24,
      radiales: 28,
    }),
    ancla: v3(1.4, -1.6, -0.6),
  },
  {
    estructura: 'protuberancia',
    capa: 'encefalo',
    color: '--cx-anat-tronco',
    acabado: 'organo',
    geometria: tuboVariable({
      puntos: [v3(0, -2.55, -0.85), v3(0, -3.7, -0.9), v3(0, -4.85, -1.0)],
      radio: (t) => 1.02 + 0.5 * Math.sin(Math.PI * t),
      desplazamiento: (t) => v3(0, 0, 0.5 * Math.sin(Math.PI * t)),
      escalaLateral: () => 1.22,
      segmentos: 28,
      radiales: 32,
    }),
    ancla: v3(1.8, -3.7, 0.2),
  },
  {
    estructura: 'bulbo',
    capa: 'encefalo',
    color: '--cx-anat-tronco',
    acabado: 'organo',
    geometria: tuboVariable({
      puntos: [v3(0, -4.65, -1.0), v3(0, -6.3, -1.25), v3(0, -8.4, -1.6)],
      radio: (t) => 0.98 - 0.4 * t,
      escalaLateral: (t) => 1.25 - 0.1 * t,
      segmentos: 28,
      radiales: 28,
    }),
    ancla: v3(1.2, -6.3, -1.0),
  },
]

export const construirEncefalo = (detalle: Detalle = 'estandar'): PiezaAnatomica[] => {
  const piezas: PiezaAnatomica[] = []
  for (const { signo, sufijo } of LADOS) {
    const { geometria, lobulo } = construirHemisferio(signo, detalle)
    const lobulos = separarPorEtiqueta(geometria, (a, b, c) => {
      // El lóbulo que comparten dos de tres vértices; si no, el del primero.
      if (lobulo[b] === lobulo[c]) return lobulo[b]
      return lobulo[a]
    })
    geometria.dispose()
    for (const [nombre, geo] of lobulos) {
      geo.computeBoundingBox()
      const caja = geo.boundingBox!
      const ancla = new THREE.Vector3()
      caja.getCenter(ancla)
      // El rótulo, por fuera de la cara lateral.
      ancla.x = signo > 0 ? caja.max.x : caja.min.x
      piezas.push({
        estructura: `lobulo-${nombre}-${sufijo}`,
        capa: 'encefalo',
        color: COLOR_DE_LOBULO[nombre],
        acabado: 'organo',
        geometria: geo,
        ancla,
      })
    }
    piezas.push({
      estructura: `insula-${sufijo}`,
      capa: 'encefalo',
      color: '--cx-anat-insula',
      acabado: 'organo',
      geometria: construirInsula(signo),
      ancla: v3(signo * 6.2, 0.9, 0.6),
    })
  }
  piezas.push({
    estructura: 'cerebelo',
    capa: 'encefalo',
    color: '--cx-anat-cerebelo',
    acabado: 'organo',
    geometria: construirCerebelo(detalle),
    ancla: v3(4.6, -4.6, -5.6),
  })
  piezas.push(...construirTronco())
  return piezas
}

/** Para las pruebas: a qué lóbulo pertenece un punto de la superficie. */
export { lobuloEn }
