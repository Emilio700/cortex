/**
 * Materiales por tejido del modo Realista, con three.js de verdad (los
 * materiales y las texturas no necesitan GPU). Lo que se dibuja se revisa a
 * mano en el navegador.
 */
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { crearBibliotecaDeTejidos } from './biblioteca'
import { TEJIDOS, TOKENS_DE_TEJIDOS, tejidoDePieza, type Tejido } from './tejidos'
import { TAMANO_DE_TEXTURA, generarRelieve } from './texturas'

const HOJA = '../../ui/atlas.css'
const estilos = readFileSync(fileURLToPath(new URL(HOJA, import.meta.url)), 'utf-8')

const leerToken = (_nombre: string, respaldo: string) => new THREE.Color(respaldo)

describe('tejido de cada pieza', () => {
  it('se deduce del acabado y la capa', () => {
    expect(tejidoDePieza({ estructura: 'vertebra-L5', capa: 'columna', acabado: 'hueso' })).toBe('hueso')
    expect(tejidoDePieza({ estructura: 'disco-L4-L5', capa: 'columna', acabado: 'disco' })).toBe('disco')
    expect(tejidoDePieza({ estructura: 'lobulo-frontal-izq', capa: 'encefalo', acabado: 'organo' })).toBe('corteza')
    expect(tejidoDePieza({ estructura: 'cerebelo', capa: 'encefalo', acabado: 'organo' })).toBe('corteza')
    expect(tejidoDePieza({ estructura: 'protuberancia', capa: 'encefalo', acabado: 'organo' })).toBe('sustancia-blanca')
    expect(tejidoDePieza({ estructura: 'carotida-interna-izq', capa: 'vasos', acabado: 'vaso' })).toBe('arteria')
    expect(tejidoDePieza({ estructura: 'seno-sagital-superior', capa: 'venas', acabado: 'vaso' })).toBe('vena')
    expect(tejidoDePieza({ estructura: 'raiz-L5-der', capa: 'raices', acabado: 'nervio' })).toBe('nervio')
    expect(tejidoDePieza({ estructura: 'segmento-L5', capa: 'medula', acabado: 'nervio' })).toBe('medula')
    expect(tejidoDePieza({ estructura: 'piel', capa: 'piel', acabado: 'envoltura' })).toBe('piel')
    expect(tejidoDePieza({ estructura: 'craneo', capa: 'craneo', acabado: 'envoltura' })).toBe('craneo')
    expect(tejidoDePieza({ capa: 'ventriculos', acabado: 'liquido' })).toBe('liquido')
  })

  it('las mallas del paciente (TC) toman el tejido por lo que son', () => {
    // Lo que entrega `capaPaciente` para cada id del segmentador.
    expect(tejidoDePieza({ estructura: 'vertebra-L3', capa: 'columna', acabado: 'hueso' })).toBe('hueso')
    expect(tejidoDePieza({ estructura: 'sacro', capa: 'columna', acabado: 'hueso' })).toBe('hueso')
    expect(tejidoDePieza({ estructura: 'medula-espinal', capa: 'medula', acabado: 'nervio' })).toBe('medula')
    expect(tejidoDePieza({ capa: 'medula', acabado: 'liquido' })).toBe('liquido')
  })

  it('una capa futura puede precisar el tejido', () => {
    expect(tejidoDePieza({ estructura: 'x', capa: 'encefalo', acabado: 'organo', tejido: 'sustancia-blanca' })).toBe('sustancia-blanca')
  })

  it('los parámetros siguen lo pedido: hueso marfil y rugoso, arterias y venas con barniz', () => {
    expect(TEJIDOS.hueso.rugosidad).toBeCloseTo(0.5)
    expect(TEJIDOS.hueso.relieve).toBe('poro')
    expect(TEJIDOS.corteza.clearcoat).toBeGreaterThan(0)
    expect(TEJIDOS.arteria.clearcoat).toBeGreaterThan(0.5)
    expect(TEJIDOS.nervio.sheen).toBeGreaterThan(0.3)
    expect(TEJIDOS.disco.opacidad).toBeLessThan(1)
    // Rojo en las arterias, azul oscuro en las venas.
    const arteria = new THREE.Color(TEJIDOS.arteria.respaldo)
    const vena = new THREE.Color(TEJIDOS.vena.respaldo)
    expect(arteria.r).toBeGreaterThan(arteria.b * 2)
    expect(vena.b).toBeGreaterThan(vena.r)
  })

  it('cada color del modo Realista es un token de la hoja del módulo', () => {
    expect(TOKENS_DE_TEJIDOS.length).toBeGreaterThan(5)
    for (const token of TOKENS_DE_TEJIDOS) {
      expect(token).toMatch(/^--cx-anat-real-[a-z-]+$/)
      expect(estilos, token).toContain(`${token}:`)
    }
  })
})

describe('texturas generadas', () => {
  it('son deterministas y periódicas (sin costura al repetirse)', () => {
    const a = generarRelieve('poro', 64)
    const b = generarRelieve('poro', 64)
    expect(a.datos).toEqual(b.datos)
    expect(a.datos).toHaveLength(64 * 64 * 4)
    // Normales hacia afuera (z positivo) y con relieve (no todas planas).
    let planas = 0
    for (let k = 0; k < a.datos.length; k += 4) {
      expect(a.datos[k + 2]).toBeGreaterThan(127)
      if (a.datos[k] === 128 && a.datos[k + 1] === 128) planas++
    }
    expect(planas).toBeLessThan(64 * 64 * 0.5)
    expect(TAMANO_DE_TEXTURA).toBe(256)
  })
})

describe('biblioteca de materiales', () => {
  it('da un MeshPhysicalMaterial por tejido, con su rugosidad, barniz y relieve', () => {
    const b = crearBibliotecaDeTejidos({ leerToken })
    const hueso = b.material('hueso')
    expect(hueso).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(hueso.userData.tejido).toBe('hueso')
    expect(hueso.roughness).toBeCloseTo(0.5)
    expect(hueso.userData.relieve.cxRelieve.value).toBeInstanceOf(THREE.DataTexture)
    expect(hueso.customProgramCacheKey()).toBe('cx-relieve-poro')

    const corteza = b.material('corteza', { colorPorVertice: true })
    expect(corteza.clearcoat).toBeGreaterThan(0)
    expect(corteza.vertexColors).toBe(true)
    expect(corteza.side).toBe(THREE.DoubleSide)

    const arteria = b.material('arteria')
    expect(arteria.clearcoat).toBeGreaterThan(0.5)
    expect(arteria.userData.relieve).toBeUndefined()

    const nervio = b.material('nervio')
    expect(nervio.sheen).toBeGreaterThan(0.3)

    const disco = b.material('disco')
    expect(disco.opacity).toBeLessThan(1)
    expect(disco.transparent).toBe(true)

    // Piel y cráneo: translúcidos con borde y sin escribir profundidad.
    const piel = b.material('piel')
    expect(piel.depthWrite).toBe(false)
    expect(piel.customProgramCacheKey()).toMatch(/^cx-fresnel/)
    b.liberar()
  })

  it('las texturas se comparten entre materiales del mismo relieve y se liberan una vez', () => {
    const b = crearBibliotecaDeTejidos({ leerToken })
    const t1 = b.material('hueso').userData.relieve.cxRelieve.value as THREE.DataTexture
    const t2 = b.material('hueso').userData.relieve.cxRelieve.value as THREE.DataTexture
    const t3 = b.material('corteza').userData.relieve.cxRelieve.value as THREE.DataTexture
    expect(t1).toBe(t2)
    expect(t3).not.toBe(t1)
    let liberadas = 0
    t1.addEventListener('dispose', () => liberadas++)
    t3.addEventListener('dispose', () => liberadas++)
    b.liberar()
    expect(liberadas).toBe(2)
  })

  it('vías y lesiones conservan el color de la pieza; lo demás usa el del tejido', () => {
    const b = crearBibliotecaDeTejidos({ leerToken })
    const naranja = new THREE.Color('#ff8a5c')
    expect(b.material('via', { colorDePieza: naranja }).color.getHex()).toBe(naranja.getHex())
    const hueso = b.materialDePieza({ estructura: 'vertebra-L5', capa: 'columna', acabado: 'hueso' }, naranja)
    expect(hueso.color.getHex()).toBe(new THREE.Color(TEJIDOS.hueso.respaldo).getHex())
    b.liberar()
  })

  it('materialDePieza elige por tejido y respeta el color por vértice de la geometría', () => {
    const b = crearBibliotecaDeTejidos({ leerToken })
    const g = new THREE.BufferGeometry()
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1], 3))
    const casos: [Parameters<typeof b.materialDePieza>[0], Tejido][] = [
      [{ estructura: 'lobulo-frontal-izq', capa: 'encefalo', acabado: 'organo', geometria: g }, 'corteza'],
      [{ estructura: 'seno-recto', capa: 'venas', acabado: 'vaso' }, 'vena'],
      [{ estructura: 'basilar', capa: 'vasos', acabado: 'vaso' }, 'arteria'],
    ]
    for (const [pieza, tejido] of casos) {
      const m = b.materialDePieza(pieza)
      expect(m.userData.tejido, pieza.estructura).toBe(tejido)
    }
    expect(b.materialDePieza(casos[0][0]).vertexColors).toBe(true)
    b.liberar()
  })
})
