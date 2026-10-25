/**
 * La capa «Atlas detallado»: mallas reales de BodyParts3D 4.0 (DBCLS, CC BY
 * 4.0) que entran a la escena como una `CapaAnatomica` más, igual que la del
 * paciente (TC).
 *
 * **Sistema de coordenadas.** BodyParts3D trabaja en milímetros con +x a la
 * izquierda del cuerpo, +y hacia atrás y +z hacia arriba (LPS), con el origen a
 * la altura de los pies (el vértice del cráneo queda en z ≈ 1 636 mm). Es el
 * mismo sistema que el GLB del segmentador, así que se pasa a la escena con la
 * misma matriz, `LPS_A_ESCENA` (x = L/10, y = S/10, z = −P/10: centímetros,
 * +y arriba, +z adelante, sin espejo).
 *
 * **Alineación con el modelo simplificado**, porque raíces, médula y vías
 * siguen siendo esquemáticas y tienen que salir de donde deben:
 *
 *  1. Cabeza (cráneo, encéfalo, ventrículos, vasos, pares craneales): una
 *     escala uniforme y una traslación que llevan la caja de los lóbulos del
 *     atlas a la caja de los lóbulos simplificados. La escala es la media
 *     geométrica de las tres razones de tamaño, limitada a 0.8–1.25: la forma no
 *     se deforma y el atlas cabe en la piel esquemática.
 *  2. Columna: cada vértebra se mueve **rígida, con su tamaño real**, a donde
 *     está la vértebra simplificada del mismo nivel, y se gira lo justo para que
 *     su eje local (de la vértebra de arriba a la de abajo) coincida. Cada disco
 *     toma el promedio de las dos vértebras que separa. Así la raíz L5 sigue
 *     saliendo junto a la vértebra L5 y la hernia se dibuja sobre su disco.
 *
 * Cada malla lleva como nombre su clave del manifiesto; el manifiesto dice su id
 * del catálogo, la estructura que la contiene, la capa y el tejido.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { NIVELES_VERTEBRALES } from '../../dominio/columna'
import { ubicarEnCatalogo, type EntradaDelAtlas, type ManifiestoDelAtlas, type TejidoDelAtlas } from '../../dominio/atlasDetallado'
import { LPS_A_ESCENA } from './capaPaciente'
import type { Acabado, CapaAnatomica, ContextoDeCapa, PiezaAnatomica } from './tipos'

export const ID_CAPA_ATLAS = 'atlas-bodyparts3d'

export class AtlasInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'AtlasInvalido'
  }
}

/**
 * Acabado de cada tejido: decide cómo se ve el atlas en Estándar (y su
 * opacidad y orden de pintado). En Realista manda el `tejido` de la pieza: la
 * escena le pide a la biblioteca el material físico de ese tejido. Los nombres
 * del manifiesto son los de `Tejido` (`materiales/tejidos.ts`), así que no hace
 * falta traducirlos; si el script agregara uno que no existe, `tsc` lo diría
 * aquí y en `piezasDelAtlas`.
 */
export const ACABADO_DE_TEJIDO: Record<TejidoDelAtlas, Acabado> = {
  hueso: 'hueso',
  // Los huesos del cráneo, translúcidos como la bóveda simplificada: se ve el encéfalo.
  craneo: 'envoltura',
  corteza: 'organo',
  'sustancia-blanca': 'organo',
  nervio: 'nervio',
  arteria: 'vaso',
  vena: 'vaso',
  disco: 'disco',
  liquido: 'liquido',
}

// ── Alineación (pura) ──────────────────────────────────────────────────────

export interface AlineacionDeCabeza {
  escala: number
  desde: THREE.Vector3
  hasta: THREE.Vector3
}

export const LIMITES_DE_ESCALA = [0.8, 1.25] as const

/** Lleva la caja `atlas` a la caja `destino`: escala uniforme (limitada) y centros. */
export function alineacionDeCabeza(atlas: THREE.Box3, destino: THREE.Box3 | null): AlineacionDeCabeza {
  const desde = atlas.getCenter(new THREE.Vector3())
  if (!destino || destino.isEmpty() || atlas.isEmpty()) return { escala: 1, desde, hasta: desde.clone() }
  const ta = atlas.getSize(new THREE.Vector3())
  const td = destino.getSize(new THREE.Vector3())
  const razones = [td.x / ta.x, td.y / ta.y, td.z / ta.z].filter((r) => Number.isFinite(r) && r > 0)
  const media = razones.length ? Math.exp(razones.reduce((s, r) => s + Math.log(r), 0) / razones.length) : 1
  const escala = Math.min(LIMITES_DE_ESCALA[1], Math.max(LIMITES_DE_ESCALA[0], media))
  return { escala, desde, hasta: destino.getCenter(new THREE.Vector3()) }
}

export const matrizDeCabeza = (a: AlineacionDeCabeza): THREE.Matrix4 =>
  new THREE.Matrix4()
    .makeTranslation(a.hasta.x, a.hasta.y, a.hasta.z)
    .multiply(new THREE.Matrix4().makeScale(a.escala, a.escala, a.escala))
    .multiply(new THREE.Matrix4().makeTranslation(-a.desde.x, -a.desde.y, -a.desde.z))

/** Un movimiento rígido: gira `rotacion` alrededor de `desde` y lo lleva a `hasta`. */
export interface AjusteRigido {
  rotacion: THREE.Quaternion
  desde: THREE.Vector3
  hasta: THREE.Vector3
}

export const matrizDeAjuste = (a: AjusteRigido): THREE.Matrix4 =>
  new THREE.Matrix4()
    .makeTranslation(a.hasta.x, a.hasta.y, a.hasta.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(a.rotacion))
    .multiply(new THREE.Matrix4().makeTranslation(-a.desde.x, -a.desde.y, -a.desde.z))

export const aplicarAjuste = (a: AjusteRigido, p: THREE.Vector3): THREE.Vector3 =>
  p.clone().sub(a.desde).applyQuaternion(a.rotacion).add(a.hasta)

/** Las vértebras de arriba abajo, con el id que usa el catálogo. */
export const ORDEN_DE_VERTEBRAS: string[] = NIVELES_VERTEBRALES.map((n) => (n.id === 'S' ? 'sacro' : `vertebra-${n.id}`))

const eje = (centros: THREE.Vector3[], k: number): THREE.Vector3 => {
  const a = centros[Math.max(0, k - 1)]
  const b = centros[Math.min(centros.length - 1, k + 1)]
  return b.clone().sub(a).normalize()
}

/**
 * Cada vértebra del atlas a su lugar en el modelo simplificado. Las que no
 * tienen par se trasladan con el desplazamiento promedio (sin girar).
 */
export function ajustesDeColumna(
  centrosAtlas: ReadonlyMap<string, THREE.Vector3>,
  centrosDestino: ReadonlyMap<string, THREE.Vector3>,
  orden: readonly string[] = ORDEN_DE_VERTEBRAS,
): Map<string, AjusteRigido> {
  const comunes = orden.filter((id) => centrosAtlas.has(id) && centrosDestino.has(id))
  const salida = new Map<string, AjusteRigido>()
  const ca = comunes.map((id) => centrosAtlas.get(id)!)
  const cd = comunes.map((id) => centrosDestino.get(id)!)
  comunes.forEach((id, k) => {
    const rotacion = comunes.length > 1 ? new THREE.Quaternion().setFromUnitVectors(eje(ca, k), eje(cd, k)) : new THREE.Quaternion()
    salida.set(id, { rotacion, desde: ca[k].clone(), hasta: cd[k].clone() })
  })
  const promedio = new THREE.Vector3()
  comunes.forEach((_, k) => promedio.add(cd[k].clone().sub(ca[k])))
  if (comunes.length) promedio.multiplyScalar(1 / comunes.length)
  for (const [id, c] of centrosAtlas) {
    if (!salida.has(id)) salida.set(id, { rotacion: new THREE.Quaternion(), desde: c.clone(), hasta: c.clone().add(promedio) })
  }
  return salida
}

/** Las dos vértebras que separa un disco del catálogo (`disco-L5-S1` → L5 y sacro). */
export const vertebrasDeDisco = (id: string): [string, string] | null => {
  const m = /^disco-([A-Z]\d+)-([A-Z]\d+)$/.exec(id)
  if (!m) return null
  return [`vertebra-${m[1]}`, m[2] === 'S1' ? 'sacro' : `vertebra-${m[2]}`]
}

/** El disco se mueve con el promedio de sus dos vértebras. */
export function ajusteDeDisco(centro: THREE.Vector3, arriba: AjusteRigido | undefined, abajo: AjusteRigido | undefined): AjusteRigido | null {
  if (!arriba && !abajo) return null
  if (!arriba || !abajo) {
    const a = (arriba ?? abajo)!
    return { rotacion: a.rotacion.clone(), desde: centro.clone(), hasta: aplicarAjuste(a, centro) }
  }
  const hasta = aplicarAjuste(arriba, centro).add(aplicarAjuste(abajo, centro)).multiplyScalar(0.5)
  return { rotacion: arriba.rotacion.clone().slerp(abajo.rotacion, 0.5), desde: centro.clone(), hasta }
}

// ── Lectura del GLB ─────────────────────────────────────────────────────────

const centroDe = (g: THREE.BufferGeometry) => {
  if (!g.boundingBox) g.computeBoundingBox()
  return g.boundingBox!.getCenter(new THREE.Vector3())
}

const leerGlb = (datos: ArrayBuffer): Promise<THREE.Object3D> =>
  new Promise((resolver, rechazar) => {
    const danado = () => rechazar(new AtlasInvalido('Un archivo del atlas detallado está dañado.'))
    // Un archivo que ni siquiera es GLB hace que el cargador lance en lugar de avisar.
    try {
      new GLTFLoader().parse(datos, '', (gltf) => resolver(gltf.scene), danado)
    } catch {
      danado()
    }
  })

interface Cruda {
  entrada: EntradaDelAtlas
  geometria: THREE.BufferGeometry
}

/** Mallas del GLB por clave, ya en centímetros y en el sistema de la escena. */
async function mallasDe(datos: ArrayBuffer, porClave: Map<string, EntradaDelAtlas>): Promise<Cruda[]> {
  const escena = await leerGlb(datos)
  escena.updateMatrixWorld(true)
  const salida: Cruda[] = []
  escena.traverse((o) => {
    const malla = o as THREE.Mesh
    if (!malla.isMesh) return
    const entrada = porClave.get(malla.name) ?? porClave.get(malla.parent?.name ?? '')
    if (!entrada) return
    const geometria = (malla.geometry as THREE.BufferGeometry).clone()
    geometria.applyMatrix4(malla.matrixWorld)
    geometria.applyMatrix4(LPS_A_ESCENA)
    salida.push({ entrada, geometria })
  })
  return salida
}

const cajaDe = (geometrias: THREE.BufferGeometry[]) => {
  const caja = new THREE.Box3()
  for (const g of geometrias) {
    if (!g.boundingBox) g.computeBoundingBox()
    caja.union(g.boundingBox!)
  }
  return caja
}

const esLobulo = (id: string | null | undefined) => Boolean(id && id.startsWith('lobulo-'))

/**
 * Las piezas del atlas, ya alineadas con el modelo simplificado del contexto.
 * `datos` va en el mismo orden que `manifiesto.archivos`.
 */
export async function piezasDelAtlas(manifiesto: ManifiestoDelAtlas, datos: ArrayBuffer[], contexto: ContextoDeCapa): Promise<PiezaAnatomica[]> {
  if (manifiesto.unidades !== 'mm' || manifiesto.sistema !== 'LPS') {
    throw new AtlasInvalido('El atlas no declara milímetros y coordenadas LPS; no se muestra para no deformarlo.')
  }
  const porClave = new Map(manifiesto.estructuras.map((e) => [e.clave, e]))
  const crudas = (await Promise.all(datos.map((d) => mallasDe(d, porClave)))).flat()
  if (crudas.length === 0) throw new AtlasInvalido('El atlas detallado no trae ninguna estructura.')
  const procedurales = contexto.procedurales ?? new Map<string, readonly PiezaAnatomica[]>()

  // 1) Cabeza: la caja de los lóbulos del atlas a la de los lóbulos simplificados.
  const cabeza = crudas.filter((c) => c.entrada.region === 'cabeza')
  const lobulosAtlas = cabeza.filter((c) => esLobulo(c.entrada.estructura) || esLobulo(c.entrada.parteDe)).map((c) => c.geometria)
  const lobulosDestino = [...procedurales].filter(([id]) => esLobulo(id)).flatMap(([, ps]) => ps.map((p) => p.geometria))
  const alineacion = alineacionDeCabeza(cajaDe(lobulosAtlas), lobulosDestino.length ? cajaDe(lobulosDestino) : null)
  const matriz = matrizDeCabeza(alineacion)
  for (const c of cabeza) {
    c.geometria.applyMatrix4(matriz)
    c.geometria.computeBoundingBox()
  }

  // 2) Columna: vértebra por vértebra, rígidas y con su tamaño real.
  const columna = crudas.filter((c) => c.entrada.region === 'columna')
  const centrosAtlas = new Map<string, THREE.Vector3>()
  for (const c of columna) if (!vertebrasDeDisco(c.entrada.estructura)) centrosAtlas.set(c.entrada.estructura, centroDe(c.geometria))
  const centrosDestino = new Map<string, THREE.Vector3>()
  for (const id of centrosAtlas.keys()) {
    const p = procedurales.get(id)?.[0]
    if (p) centrosDestino.set(id, centroDe(p.geometria))
  }
  const ajustes = ajustesDeColumna(centrosAtlas, centrosDestino)
  for (const c of columna) {
    const vecinas = vertebrasDeDisco(c.entrada.estructura)
    const ajuste = vecinas
      ? ajusteDeDisco(centroDe(c.geometria), ajustes.get(vecinas[0]), ajustes.get(vecinas[1]))
      : ajustes.get(c.entrada.estructura)
    if (ajuste) c.geometria.applyMatrix4(matrizDeAjuste(ajuste))
  }

  // 3) Piezas, con el id del catálogo y el rótulo y el despiece de su par simplificado.
  const piezas: PiezaAnatomica[] = []
  for (const { entrada, geometria } of crudas) {
    const lugar = ubicarEnCatalogo(entrada)
    if (!lugar) {
      geometria.dispose()
      continue
    }
    if (!geometria.getAttribute('normal')) geometria.computeVertexNormals()
    geometria.computeBoundingBox()
    geometria.computeBoundingSphere()
    geometria.userData.claveDelAtlas = entrada.clave
    const par = entrada.region === 'columna' && lugar.estructura ? procedurales.get(lugar.estructura)?.[0] : undefined
    piezas.push({
      estructura: lugar.estructura,
      parteDe: lugar.parteDe,
      capa: lugar.capa,
      geometria,
      color: lugar.color,
      acabado: ACABADO_DE_TEJIDO[entrada.tejido],
      // En Realista, el material físico de su tejido: hueso, corteza, arteria…
      // Sin él, el cuerpo calloso («sustancia-blanca») saldría como corteza.
      tejido: entrada.tejido,
      ancla: par?.ancla?.clone(),
      desplazamientoDespiece: par?.desplazamientoDespiece?.clone(),
      anclaDespiece: par?.anclaDespiece?.clone(),
    })
  }
  return piezas
}

/** La `CapaAnatomica` del atlas detallado. */
export function crearCapaAtlas(manifiesto: ManifiestoDelAtlas, datos: ArrayBuffer[]): CapaAnatomica {
  return {
    id: ID_CAPA_ATLAS,
    nombre: 'Atlas detallado (BodyParts3D)',
    origen: 'referencia',
    construir: (contexto) => piezasDelAtlas(manifiesto, datos, contexto),
  }
}
