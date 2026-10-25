/**
 * La capa del paciente con mallas simuladas: un GLB armado aquí mismo, con la
 * misma forma que entrega el segmentador (mm, LPS, un nodo por estructura).
 *
 * Lo que no puede fallar: que una coordenada del paciente caiga del lado y a la
 * altura correctos en la escena (un modelo volteado no se nota a simple vista),
 * que cada malla quede con su id del catálogo y que un archivo sin unidades no
 * se dibuje.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { crearCapaPaciente, desplazamientoHaciaAtlas, ID_CAPA_PACIENTE, ModeloInvalido, piezasDesdeGlb } from './capaPaciente'

interface MallaDePrueba {
  nombre: string
  posiciones: number[]
  indices: number[]
}

/** Un GLB mínimo: un nodo por malla, posiciones float32 e índices uint32. */
export function glbDePrueba(mallas: MallaDePrueba[], extras: Record<string, unknown> = { unidades: 'mm', sistema: 'LPS' }): ArrayBuffer {
  const partes: Uint8Array[] = []
  let largo = 0
  const vistas: object[] = []
  const accesores: object[] = []
  const meshes: object[] = []
  const nodos: object[] = []
  const agregar = (datos: Float32Array | Uint32Array, objetivo: number) => {
    const bytes = new Uint8Array(datos.buffer.slice(0))
    vistas.push({ buffer: 0, byteOffset: largo, byteLength: bytes.length, target: objetivo })
    partes.push(bytes)
    largo += bytes.length
    return vistas.length - 1
  }
  for (const m of mallas) {
    const pos = new Float32Array(m.posiciones)
    const min = [0, 1, 2].map((e) => Math.min(...m.posiciones.filter((_, i) => i % 3 === e)))
    const max = [0, 1, 2].map((e) => Math.max(...m.posiciones.filter((_, i) => i % 3 === e)))
    accesores.push({ bufferView: agregar(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max })
    const p = accesores.length - 1
    accesores.push({ bufferView: agregar(new Uint32Array(m.indices), 34963), componentType: 5125, count: m.indices.length, type: 'SCALAR' })
    meshes.push({ name: m.nombre, primitives: [{ attributes: { POSITION: p }, indices: accesores.length - 1 }] })
    nodos.push({ name: m.nombre, mesh: meshes.length - 1 })
  }
  const json = {
    asset: { version: '2.0', extras: { cortex: extras } },
    scene: 0,
    scenes: [{ nodes: nodos.map((_, i) => i) }],
    nodes: nodos,
    meshes,
    accessors: accesores,
    bufferViews: vistas,
    buffers: [{ byteLength: largo }],
  }
  let texto = new TextEncoder().encode(JSON.stringify(json))
  const rellenoJson = (4 - (texto.length % 4)) % 4
  texto = new Uint8Array([...texto, ...new Array(rellenoJson).fill(0x20)])
  const bin = new Uint8Array(largo + ((4 - (largo % 4)) % 4))
  let o = 0
  for (const parte of partes) {
    bin.set(parte, o)
    o += parte.length
  }
  const total = 12 + 8 + texto.length + 8 + bin.length
  const salida = new ArrayBuffer(total)
  const v = new DataView(salida)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, total, true)
  v.setUint32(12, texto.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(salida, 20, texto.length).set(texto)
  v.setUint32(20 + texto.length, bin.length, true)
  v.setUint32(24 + texto.length, 0x004e4942, true)
  new Uint8Array(salida, 28 + texto.length, bin.length).set(bin)
  return salida
}

/** Un tetraedro alrededor de un punto LPS (mm). */
const tetra = (nombre: string, [x, y, z]: [number, number, number], r = 10): MallaDePrueba => ({
  nombre,
  posiciones: [x + r, y, z, x - r, y + r, z, x - r, y - r, z, x, y, z + r],
  indices: [0, 1, 2, 0, 3, 1, 1, 3, 2, 2, 3, 0],
})

const centro = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox!.getCenter(new THREE.Vector3())
}

describe('capa del paciente', () => {
  it('pasa de milímetros LPS a centímetros de la escena sin voltear al paciente', async () => {
    // L5 a 30 mm a la izquierda, 20 mm hacia atrás y 100 mm hacia arriba.
    const { piezas } = await piezasDesdeGlb(glbDePrueba([tetra('vertebra-L5', [30, 20, 100])]))
    const c = centro(piezas[0].geometria)
    // Escena: +x izquierda, +y arriba, +z adelante; en cm.
    expect(c.x).toBeCloseTo(3, 1)
    expect(c.y).toBeCloseTo(10.5, 1) // la caja va de 100 a 110 mm
    expect(c.z).toBeCloseTo(-2, 1)
  })

  it('registra cada malla con su id del catálogo, su capa y su color', async () => {
    const { piezas } = await piezasDesdeGlb(
      glbDePrueba([tetra('vertebra-L5', [0, 0, 0]), tetra('sacro', [0, 0, -60]), tetra('medula-espinal', [0, 0, 200]), tetra('conducto-vertebral', [0, 0, 100])]),
    )
    const por = Object.fromEntries(piezas.map((p) => [p.geometria.userData.idDelSegmentador, p]))
    expect(por['vertebra-L5']).toMatchObject({ estructura: 'vertebra-L5', capa: 'columna', acabado: 'hueso', color: '--cx-anat-hueso' })
    expect(por['sacro']).toMatchObject({ estructura: 'sacro', capa: 'columna' })
    expect(por['medula-espinal']).toMatchObject({ estructura: 'medula-espinal', capa: 'medula', acabado: 'nervio' })
    // El conducto no está en el catálogo: se ve, pero no se elige.
    expect(por['conducto-vertebral'].estructura).toBeUndefined()
    expect(por['conducto-vertebral'].acabado).toBe('liquido')
  })

  it('un archivo sin milímetros ni LPS declarados no se dibuja', async () => {
    await expect(piezasDesdeGlb(glbDePrueba([tetra('vertebra-L5', [0, 0, 0])], {}))).rejects.toBeInstanceOf(ModeloInvalido)
    await expect(piezasDesdeGlb(glbDePrueba([tetra('vertebra-L5', [0, 0, 0])], { unidades: 'm', sistema: 'LPS' }))).rejects.toThrow(/milímetros/)
  })

  it('un archivo roto se rechaza con un motivo', async () => {
    await expect(piezasDesdeGlb(new TextEncoder().encode('no soy un glb').buffer as ArrayBuffer)).rejects.toThrow()
  })

  it('dice si el modelo es sintético', async () => {
    const { meta } = await piezasDesdeGlb(
      glbDePrueba([tetra('vertebra-L5', [0, 0, 0])], { unidades: 'mm', sistema: 'LPS', sintetico: true, motor: 'sintetico' }),
    )
    expect(meta).toMatchObject({ sintetico: true, motor: 'sintetico' })
  })

  it('es una CapaAnatomica de origen «paciente»', async () => {
    const capa = crearCapaPaciente(glbDePrueba([tetra('vertebra-L5', [0, 0, 0])]))
    expect(capa).toMatchObject({ id: ID_CAPA_PACIENTE, origen: 'paciente' })
    expect(await capa.construir({})).toHaveLength(1)
  })
})

describe('alineación con el atlas', () => {
  it('lleva el centro de las vértebras en común al del atlas', () => {
    const paciente = new Map([
      ['vertebra-L4', new THREE.Vector3(1, 50, 2)],
      ['vertebra-L5', new THREE.Vector3(1, 46, 2)],
      ['conducto', new THREE.Vector3(0, 0, 0)],
    ])
    const atlas = new Map([
      ['vertebra-L4', new THREE.Vector3(0, -20, 1)],
      ['vertebra-L5', new THREE.Vector3(0, -24, 1)],
    ])
    expect(desplazamientoHaciaAtlas(paciente, atlas, new THREE.Vector3()).toArray()).toEqual([-1, -70, -1])
  })

  it('sin vértebras en común, centra la del paciente sobre el atlas', () => {
    const paciente = new Map([['medula-espinal', new THREE.Vector3(2, 2, 2)]])
    expect(desplazamientoHaciaAtlas(paciente, new Map(), new THREE.Vector3(0, -10, 0)).toArray()).toEqual([-2, -12, -2])
  })
})
