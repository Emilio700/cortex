/**
 * Un atlas detallado de prueba, sólo para las pruebas: la misma forma que
 * escribe `scripts/atlas/preparar_atlas.py` (mm, LPS, un nodo por clave del
 * manifiesto), pero con cajas en lugar de huesos. Lo usan la prueba de la capa
 * y la de la escena (atlas en Realista), para que las dos lean el mismo GLB que
 * leería la pantalla. Ningún módulo de la aplicación lo importa.
 */
import * as THREE from 'three'

import type { EntradaDelAtlas, ManifiestoDelAtlas } from '../../dominio/atlasDetallado'

/** Una caja (12 triángulos) en mm, centrada en `c` con medio lado `h`. */
export const caja = (c: [number, number, number], h: [number, number, number]) => {
  const g = new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2).toNonIndexed()
  g.translate(...c)
  return Array.from(g.getAttribute('position').array as Float32Array)
}

/** Un GLB mínimo: un nodo (y una malla) por clave, posiciones float32 sin índices. */
export function glb(mallas: { nombre: string; posiciones: number[] }[]): ArrayBuffer {
  const partes: Uint8Array[] = []
  let largo = 0
  const vistas: object[] = []
  const accesores: object[] = []
  const meshes: object[] = []
  const nodos: object[] = []
  for (const m of mallas) {
    const pos = new Float32Array(m.posiciones)
    const bytes = new Uint8Array(pos.buffer.slice(0))
    vistas.push({ buffer: 0, byteOffset: largo, byteLength: bytes.length, target: 34962 })
    partes.push(bytes)
    largo += bytes.length
    const min = [0, 1, 2].map((e) => Math.min(...m.posiciones.filter((_, i) => i % 3 === e)))
    const max = [0, 1, 2].map((e) => Math.max(...m.posiciones.filter((_, i) => i % 3 === e)))
    accesores.push({ bufferView: vistas.length - 1, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max })
    meshes.push({ name: m.nombre, primitives: [{ attributes: { POSITION: accesores.length - 1 } }] })
    nodos.push({ name: m.nombre, mesh: meshes.length - 1 })
  }
  const json = {
    asset: { version: '2.0', extras: { cortex: { unidades: 'mm', sistema: 'LPS' } } },
    scene: 0,
    scenes: [{ nodes: nodos.map((_, i) => i) }],
    nodes: nodos,
    meshes,
    accessors: accesores,
    bufferViews: vistas,
    buffers: [{ byteLength: largo }],
  }
  let texto = new TextEncoder().encode(JSON.stringify(json))
  texto = new Uint8Array([...texto, ...new Array((4 - (texto.length % 4)) % 4).fill(0x20)])
  const bin = new Uint8Array(largo + ((4 - (largo % 4)) % 4))
  let o = 0
  for (const p of partes) {
    bin.set(p, o)
    o += p.length
  }
  const total = 12 + 8 + texto.length + 8 + bin.length
  const salida = new Uint8Array(total)
  const vista = new DataView(salida.buffer)
  vista.setUint32(0, 0x46546c67, true)
  vista.setUint32(4, 2, true)
  vista.setUint32(8, total, true)
  vista.setUint32(12, texto.length, true)
  vista.setUint32(16, 0x4e4f534a, true)
  salida.set(texto, 20)
  vista.setUint32(20 + texto.length, bin.length, true)
  vista.setUint32(24 + texto.length, 0x004e4942, true)
  salida.set(bin, 28 + texto.length)
  return salida.buffer
}

export const entrada = (e: Partial<EntradaDelAtlas> & Pick<EntradaDelAtlas, 'clave'>): EntradaDelAtlas => ({
  estructura: e.clave,
  parteDe: null,
  capa: 'encefalo',
  tejido: 'corteza',
  region: 'cabeza',
  fma: [],
  ...e,
})

export const manifiesto = (estructuras: EntradaDelAtlas[]): ManifiestoDelAtlas => ({
  version: 1,
  fuente: 'BodyParts3D',
  versionFuente: '4.0',
  unidades: 'mm',
  sistema: 'LPS',
  archivos: [
    { region: 'cabeza', ruta: 'cabeza.glb', bytes: 1 },
    { region: 'columna', ruta: 'columna.glb', bytes: 1 },
  ],
  estructuras,
})
