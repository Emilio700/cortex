/**
 * La capa del atlas detallado con un GLB simulado (`atlasDePrueba.ts`): la
 * misma forma que escribe `scripts/atlas/preparar_atlas.py` (mm, LPS, un nodo
 * por clave del manifiesto), pero con cajas en lugar de huesos.
 *
 * Lo que no puede fallar: que lo izquierdo quede a la izquierda y lo de arriba
 * arriba, que cada malla tome su id del catálogo (y la estructura que la
 * contiene), y que la cabeza y cada vértebra caigan donde están las del modelo
 * simplificado, para que las raíces esquemáticas sigan saliendo donde deben.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { ManifiestoDelAtlas } from '../../dominio/atlasDetallado'
import { caja, entrada, glb, manifiesto } from './atlasDePrueba'
import {
  ACABADO_DE_TEJIDO,
  ajustesDeColumna,
  aplicarAjuste,
  AtlasInvalido,
  alineacionDeCabeza,
  crearCapaAtlas,
  ID_CAPA_ATLAS,
  LIMITES_DE_ESCALA,
  piezasDelAtlas,
  vertebrasDeDisco,
} from './capaAtlas'
import type { PiezaAnatomica } from './tipos'

/** Una pieza simplificada de prueba: una caja en cm de escena. */
const procedural = (estructura: string, centro: [number, number, number], h: [number, number, number], extra: Partial<PiezaAnatomica> = {}): PiezaAnatomica => {
  const geometria = new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2)
  geometria.translate(...centro)
  return { estructura, capa: 'columna', geometria, color: '--cx-anat-hueso', acabado: 'hueso', ...extra }
}

const centro = (p: PiezaAnatomica) => {
  p.geometria.computeBoundingBox()
  return p.geometria.boundingBox!.getCenter(new THREE.Vector3())
}
const tamano = (p: PiezaAnatomica) => {
  p.geometria.computeBoundingBox()
  return p.geometria.boundingBox!.getSize(new THREE.Vector3())
}

describe('capa del atlas detallado', () => {
  // Cabeza en BodyParts3D: los lóbulos alrededor de (0, -80, 1550) mm; el giro
  // izquierdo con x > 0 (LPS: +x es la izquierda).
  const estructuras = [
    entrada({ clave: 'giro-precentral-izq', parteDe: 'lobulo-frontal-izq' }),
    entrada({ clave: 'lobulo-occipital-der' }),
    entrada({ clave: 'hueso-frontal', capa: 'craneo', tejido: 'craneo', parteDe: 'craneo' }),
    entrada({ clave: 'pieza-sin-catalogo', estructura: 'no-existe', capa: 'vasos', tejido: 'arteria' }),
    entrada({ clave: 'vertebra-L4', capa: 'columna', tejido: 'hueso', region: 'columna' }),
    entrada({ clave: 'vertebra-L5', capa: 'columna', tejido: 'hueso', region: 'columna' }),
    entrada({ clave: 'sacro', capa: 'columna', tejido: 'hueso', region: 'columna' }),
    entrada({ clave: 'disco-L4-L5', capa: 'columna', tejido: 'disco', region: 'columna' }),
  ]
  const cabeza = glb([
    { nombre: 'giro-precentral-izq', posiciones: caja([40, -100, 1600], [20, 10, 20]) },
    { nombre: 'lobulo-occipital-der', posiciones: caja([-40, -10, 1520], [20, 10, 20]) },
    { nombre: 'hueso-frontal', posiciones: caja([0, -140, 1580], [60, 10, 40]) },
    { nombre: 'pieza-sin-catalogo', posiciones: caja([0, -90, 1500], [2, 2, 2]) },
    // Una malla que el manifiesto no conoce: no entra.
    { nombre: 'intrusa', posiciones: caja([0, 0, 0], [1, 1, 1]) },
  ])
  // Columna recta en BodyParts3D: L4 a 980 mm, L5 a 930, disco entre ellas, sacro a 860.
  const columna = glb([
    { nombre: 'vertebra-L4', posiciones: caja([0, -50, 980], [25, 20, 15]) },
    { nombre: 'vertebra-L5', posiciones: caja([0, -50, 930], [25, 20, 15]) },
    { nombre: 'disco-L4-L5', posiciones: caja([0, -60, 955], [20, 15, 5]) },
    { nombre: 'sacro', posiciones: caja([0, -40, 860], [50, 30, 50]) },
  ])
  // El modelo simplificado: lóbulos en una caja de 16 × 8 × 12 cm (x, y, z)
  // centrada en (0, 2, 0); columna en otro lugar (cm de escena).
  const desplazamiento = new THREE.Vector3(0, 0, -1.2)
  const procedurales = new Map<string, PiezaAnatomica[]>([
    ['lobulo-frontal-izq', [procedural('lobulo-frontal-izq', [4, 2, 3], [4, 4, 3], { capa: 'encefalo' })]],
    ['lobulo-occipital-der', [procedural('lobulo-occipital-der', [-4, 2, -3], [4, 4, 3], { capa: 'encefalo' })]],
    ['vertebra-L4', [procedural('vertebra-L4', [0, -66, -1], [3, 1.5, 3])]],
    [
      'vertebra-L5',
      [procedural('vertebra-L5', [0, -71, -2], [3, 1.5, 3], { ancla: new THREE.Vector3(4, -71, 0), desplazamientoDespiece: desplazamiento })],
    ],
    ['disco-L4-L5', [procedural('disco-L4-L5', [0, -68.5, 0], [2, 0.5, 2])]],
    ['sacro', [procedural('sacro', [0, -79, -4], [5, 7, 4])]],
  ])

  const construir = () => piezasDelAtlas(manifiesto(estructuras), [cabeza, columna], { procedurales })

  it('es una CapaAnatomica de referencia', () => {
    const capa = crearCapaAtlas(manifiesto(estructuras), [cabeza, columna])
    expect(capa.id).toBe(ID_CAPA_ATLAS)
    expect(capa.origen).toBe('referencia')
  })

  it('cada malla toma su id del catálogo y la estructura que la contiene; lo desconocido no se elige', async () => {
    const piezas = await construir()
    const giro = piezas.find((p) => p.geometria.userData.claveDelAtlas === 'giro-precentral-izq')!
    expect(giro.estructura).toBe('giro-precentral-izq')
    expect(giro.parteDe).toBe('lobulo-frontal-izq')
    expect(giro.color).toBe('--cx-anat-frontal')
    expect(giro.acabado).toBe('organo')
    const hueso = piezas.find((p) => p.estructura === 'hueso-frontal')!
    expect(hueso.parteDe).toBe('craneo')
    // El cráneo se ve translúcido, como la bóveda simplificada.
    expect(hueso.acabado).toBe(ACABADO_DE_TEJIDO.craneo)
    expect(hueso.acabado).toBe('envoltura')
    const decorativa = piezas.find((p) => p.geometria.userData.claveDelAtlas === 'pieza-sin-catalogo')!
    expect(decorativa.estructura).toBeUndefined()
    expect(piezas.some((p) => p.geometria.userData.claveDelAtlas === 'intrusa')).toBe(false)
    expect(piezas).toHaveLength(8)
  })

  it('cada pieza lleva el tejido del manifiesto, para el material del modo Realista', async () => {
    const piezas = await construir()
    const tejidoDe = (clave: string) => piezas.find((p) => p.geometria.userData.claveDelAtlas === clave)?.tejido
    for (const e of estructuras) {
      if (e.clave === 'pieza-sin-catalogo') continue
      expect(tejidoDe(e.clave), e.clave).toBe(e.tejido)
    }
    // El cráneo sigue translúcido en Estándar y en Realista es «craneo», no «piel».
    expect(tejidoDe('hueso-frontal')).toBe('craneo')
  })

  it('izquierda, arriba y adelante quedan donde deben (LPS → escena, sin espejo)', async () => {
    const piezas = await construir()
    const giro = centro(piezas.find((p) => p.estructura === 'giro-precentral-izq')!)
    const occipital = centro(piezas.find((p) => p.estructura === 'lobulo-occipital-der')!)
    const frontal = centro(piezas.find((p) => p.estructura === 'hueso-frontal')!)
    expect(giro.x).toBeGreaterThan(0) // izquierda del paciente = +x de la escena
    expect(occipital.x).toBeLessThan(0)
    expect(giro.y).toBeGreaterThan(occipital.y) // más alto en BodyParts3D = más alto en la escena
    expect(frontal.z).toBeGreaterThan(occipital.z) // adelante (−P) = +z
  })

  it('la cabeza cae en la caja de los lóbulos simplificados, con escala uniforme', async () => {
    const piezas = await construir()
    const lobulos = new THREE.Box3()
    for (const p of piezas.filter((x) => x.estructura === 'giro-precentral-izq' || x.estructura === 'lobulo-occipital-der')) {
      p.geometria.computeBoundingBox()
      lobulos.union(p.geometria.boundingBox!)
    }
    const c = lobulos.getCenter(new THREE.Vector3())
    expect(c.x).toBeCloseTo(0, 5)
    expect(c.y).toBeCloseTo(2, 5)
    expect(c.z).toBeCloseTo(0, 5)
    // Atlas: 12 × 12 × 11 cm; destino 16 × 8 × 12: la media geométrica, igual en los tres ejes.
    const s = Math.cbrt((16 / 12) * (8 / 12) * (12 / 11))
    expect(tamano(piezas.find((p) => p.estructura === 'giro-precentral-izq')!).x).toBeCloseTo(4 * s, 4)
    expect(tamano(piezas.find((p) => p.estructura === 'giro-precentral-izq')!).y).toBeCloseTo(4 * s, 4)
  })

  it('cada vértebra va rígida y con su tamaño real a donde está la simplificada; el disco, entre sus dos', async () => {
    const piezas = await construir()
    const l5 = piezas.find((p) => p.estructura === 'vertebra-L5')!
    const c = centro(l5)
    expect(c.x).toBeCloseTo(0, 4)
    expect(c.y).toBeCloseTo(-71, 4)
    expect(c.z).toBeCloseTo(-2, 4)
    // 50 mm de ancho → 5 cm: tamaño real, sin la escala de la cabeza.
    expect(tamano(l5).x).toBeCloseTo(5, 4)
    // El rótulo y el despiece son los de su par simplificado.
    expect(l5.ancla!.toArray()).toEqual([4, -71, 0])
    expect(l5.desplazamientoDespiece!.toArray()).toEqual(desplazamiento.toArray())
    const disco = centro(piezas.find((p) => p.estructura === 'disco-L4-L5')!)
    const l4 = centro(piezas.find((p) => p.estructura === 'vertebra-L4')!)
    expect(disco.y).toBeLessThan(l4.y)
    expect(disco.y).toBeGreaterThan(c.y)
  })

  it('sin milímetros y LPS no se dibuja', async () => {
    const m = { ...manifiesto(estructuras), unidades: 'm' } as unknown as ManifiestoDelAtlas
    await expect(piezasDelAtlas(m, [cabeza, columna], {})).rejects.toBeInstanceOf(AtlasInvalido)
  })

  it('un archivo dañado rechaza con un mensaje para la persona', async () => {
    await expect(piezasDelAtlas(manifiesto(estructuras), [new Uint8Array([1, 2, 3, 4]).buffer], {})).rejects.toThrow(/dañado/)
  })
})

describe('alineación', () => {
  it('la escala de la cabeza se limita: una caja absurda no deforma el atlas', () => {
    const atlas = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 10, 10))
    const enorme = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 100))
    expect(alineacionDeCabeza(atlas, enorme).escala).toBe(LIMITES_DE_ESCALA[1])
    expect(alineacionDeCabeza(atlas, null).escala).toBe(1)
  })

  it('cada vértebra gira lo justo para que su eje coincida con el de la simplificada', () => {
    // Atlas: columna vertical. Destino: inclinada 30° hacia delante.
    const ids = ['a', 'b', 'c']
    const atlas = new Map(ids.map((id, i) => [id, new THREE.Vector3(0, -i * 3, 0)]))
    const giro = THREE.MathUtils.degToRad(30)
    const destino = new Map(ids.map((id, i) => [id, new THREE.Vector3(0, -i * 3 * Math.cos(giro), i * 3 * Math.sin(giro))]))
    const ajustes = ajustesDeColumna(atlas, destino, ids)
    const b = ajustes.get('b')!
    // Un punto 1 cm debajo del centro de «b» queda 1 cm más allá sobre el eje inclinado.
    const p = aplicarAjuste(b, new THREE.Vector3(0, -4, 0))
    const esperado = destino.get('b')!.clone().add(new THREE.Vector3(0, -Math.cos(giro), Math.sin(giro)))
    expect(p.distanceTo(esperado)).toBeLessThan(1e-6)
  })

  it('una vértebra sin par se traslada con el desplazamiento promedio', () => {
    const atlas = new Map([
      ['a', new THREE.Vector3(0, 0, 0)],
      ['huerfana', new THREE.Vector3(0, -5, 0)],
    ])
    const ajustes = ajustesDeColumna(atlas, new Map([['a', new THREE.Vector3(1, 2, 3)]]), ['a', 'huerfana'])
    expect(aplicarAjuste(ajustes.get('huerfana')!, new THREE.Vector3(0, -5, 0)).toArray()).toEqual([1, -3, 3])
  })

  it('de un disco salen sus dos vértebras', () => {
    expect(vertebrasDeDisco('disco-L5-S1')).toEqual(['vertebra-L5', 'sacro'])
    expect(vertebrasDeDisco('disco-C7-T1')).toEqual(['vertebra-C7', 'vertebra-T1'])
    expect(vertebrasDeDisco('vertebra-L5')).toBeNull()
  })
})
