/**
 * Texturas del modo Realista, generadas en código: nada se descarga.
 *
 * Cada una es un mosaico periódico (se repite sin costura) de 256 × 256 con la
 * normal del relieve en RGB y un factor de rugosidad en A. Se generan una vez
 * por escena y las comparten todos los materiales del mismo tejido.
 *
 *  · «poro»: hueso cortical. Ondulación suave, poros pequeños y hundidos
 *    (más rugosos y un poco más oscuros) y grano fino.
 *  · «tejido»: tejido blando (encéfalo, médula, nervios, discos). Arrugas
 *    finas y celdas apenas marcadas: rompe el brillo perfecto del plástico.
 *
 * Deterministas: la misma semilla da la misma textura en cada carga.
 */
import * as THREE from 'three'
import type { Relieve } from './tejidos'

export const TAMANO_DE_TEXTURA = 256

const azar = (semilla: number) => {
  let s = semilla >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const suave = (t: number) => t * t * (3 - 2 * t)
const recortar = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))

/** Ruido de valor periódico: `n` celdas por lado, `u, v` en [0, 1). */
const crearValor = (n: number, rnd: () => number) => {
  const g = new Float32Array(n * n)
  for (let i = 0; i < g.length; i++) g[i] = rnd()
  return (u: number, v: number) => {
    const x = u * n
    const y = v * n
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = suave(x - x0)
    const fy = suave(y - y0)
    const i0 = ((x0 % n) + n) % n
    const j0 = ((y0 % n) + n) % n
    const i1 = (i0 + 1) % n
    const j1 = (j0 + 1) % n
    const a = g[j0 * n + i0] + (g[j0 * n + i1] - g[j0 * n + i0]) * fx
    const b = g[j1 * n + i0] + (g[j1 * n + i1] - g[j1 * n + i0]) * fx
    return a + (b - a) * fy
  }
}

/** Suma de octavas periódicas (cada octava duplica las celdas: sigue sin costura). */
const crearFbm = (n: number, octavas: number, rnd: () => number) => {
  const capas = Array.from({ length: octavas }, (_, k) => crearValor(n << k, rnd))
  return (u: number, v: number) => {
    let total = 0
    let peso = 0.5
    let suma = 0
    for (const capa of capas) {
      total += capa(u, v) * peso
      suma += peso
      peso *= 0.5
    }
    return total / suma
  }
}

/**
 * Celdas de Worley periódicas: distancia (en celdas) al punto más cercano y el
 * valor aleatorio de esa celda (para que no todos los poros sean iguales).
 */
const crearCeldas = (n: number, rnd: () => number) => {
  const px = new Float32Array(n * n)
  const py = new Float32Array(n * n)
  const val = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) {
    px[i] = rnd()
    py[i] = rnd()
    val[i] = rnd()
  }
  return (u: number, v: number): [distancia: number, valor: number] => {
    const x = u * n
    const y = v * n
    const cx = Math.floor(x)
    const cy = Math.floor(y)
    let mejor = 9
    let valor = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = (((cx + dx) % n) + n) % n
        const j = (((cy + dy) % n) + n) % n
        const k = j * n + i
        const ddx = cx + dx + px[k] - x
        const ddy = cy + dy + py[k] - y
        const d = Math.sqrt(ddx * ddx + ddy * ddy)
        if (d < mejor) {
          mejor = d
          valor = val[k]
        }
      }
    }
    return [mejor, valor]
  }
}

export interface MapaDeRelieve {
  /** RGBA: normal en RGB (0–255 ↔ −1…1) y rugosidad relativa en A (128 = sin cambio). */
  datos: Uint8Array
  tamano: number
}

/** Altura (0–1) y rugosidad (0–1) de cada pixel. */
const alturas = (relieve: Exclude<Relieve, 'liso'>, tamano: number) => {
  const h = new Float32Array(tamano * tamano)
  const r = new Float32Array(tamano * tamano)
  if (relieve === 'poro') {
    const rnd = azar(23)
    const ondas = crearFbm(6, 4, rnd)
    const grano = crearValor(64, rnd)
    const poros = crearCeldas(26, rnd)
    const porosFinos = crearCeldas(52, rnd)
    for (let j = 0; j < tamano; j++) {
      for (let i = 0; i < tamano; i++) {
        const u = i / tamano
        const v = j / tamano
        const [d, valor] = poros(u, v)
        const [d2, valor2] = porosFinos(u, v)
        // Sólo algunas celdas tienen poro, de tamaño variable.
        const radio = 0.12 + 0.16 * valor
        const poro = valor > 0.35 ? 1 - recortar(d / radio) : 0
        const fino = valor2 > 0.55 ? (1 - recortar(d2 / 0.18)) * 0.5 : 0
        const k = j * tamano + i
        const hundido = Math.max(suave(poro), fino)
        h[k] = 0.55 * ondas(u, v) + 0.1 * grano(u, v) - 0.55 * hundido
        r[k] = recortar(0.45 + 0.5 * hundido + 0.15 * (grano(u, v) - 0.5))
      }
    }
  } else {
    const rnd = azar(41)
    const arrugas = crearFbm(10, 3, rnd)
    const celdas = crearCeldas(18, rnd)
    for (let j = 0; j < tamano; j++) {
      for (let i = 0; i < tamano; i++) {
        const u = i / tamano
        const v = j / tamano
        const [d] = celdas(u, v)
        const k = j * tamano + i
        const a = arrugas(u, v)
        h[k] = 0.7 * a + 0.3 * suave(recortar(d / 0.7))
        r[k] = recortar(0.5 + 0.6 * (a - 0.5))
      }
    }
  }
  return { h, r }
}

export const generarRelieve = (relieve: Exclude<Relieve, 'liso'>, tamano = TAMANO_DE_TEXTURA): MapaDeRelieve => {
  const { h, r } = alturas(relieve, tamano)
  const datos = new Uint8Array(tamano * tamano * 4)
  // La pendiente se mide en pixeles; este factor la lleva a una normal visible.
  const fuerza = relieve === 'poro' ? 9 : 5
  const en = (i: number, j: number) => h[(((j % tamano) + tamano) % tamano) * tamano + (((i % tamano) + tamano) % tamano)]
  for (let j = 0; j < tamano; j++) {
    for (let i = 0; i < tamano; i++) {
      const dx = (en(i + 1, j) - en(i - 1, j)) * 0.5 * fuerza
      const dy = (en(i, j + 1) - en(i, j - 1)) * 0.5 * fuerza
      const largo = Math.sqrt(dx * dx + dy * dy + 1)
      const k = (j * tamano + i) * 4
      datos[k] = Math.round(((-dx / largo) * 0.5 + 0.5) * 255)
      datos[k + 1] = Math.round(((-dy / largo) * 0.5 + 0.5) * 255)
      datos[k + 2] = Math.round(((1 / largo) * 0.5 + 0.5) * 255)
      datos[k + 3] = Math.round(r[j * tamano + i] * 255)
    }
  }
  return { datos, tamano }
}

/** La textura lista para la tarjeta: datos lineales (no color), repetible y con mipmaps. */
export const crearTexturaDeRelieve = (relieve: Exclude<Relieve, 'liso'>, anisotropia = 1): THREE.DataTexture => {
  const { datos, tamano } = generarRelieve(relieve)
  const t = new THREE.DataTexture(datos, tamano, tamano, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = anisotropia
  t.colorSpace = THREE.NoColorSpace
  t.needsUpdate = true
  return t
}
