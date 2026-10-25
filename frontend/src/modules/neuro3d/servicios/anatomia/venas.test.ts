/**
 * El sistema venoso: que cada malla sea una estructura del catálogo, que el
 * flujo vaya en el sentido de la sangre y que los senos queden donde deben
 * respecto del encéfalo (atrás, arriba, a los lados).
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { CATALOGO } from '../../dominio/catalogo'
import { CONFLUENCIA, construirVenas } from './venas'

const centro = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox!.getCenter(new THREE.Vector3())
}

/** Posición media de los vértices con `uv.x` cerca de `t` (el principio o el final del trayecto). */
const extremo = (g: THREE.BufferGeometry, t: 0 | 1) => {
  const pos = g.getAttribute('position')
  const uv = g.getAttribute('uv')
  const suma = new THREE.Vector3()
  let n = 0
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(uv.getX(i) - t) < 0.02) {
      suma.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
      n++
    }
  }
  return suma.multiplyScalar(1 / n)
}

describe('sistema venoso', () => {
  const piezas = construirVenas()
  const por = (id: string) => piezas.find((p) => p.estructura === id)!

  it('cada malla es una estructura de la capa «venas» del catálogo, y están todas', () => {
    const delCatalogo = CATALOGO.filter((e) => e.capa === 'venas').map((e) => e.id).sort()
    expect(piezas.map((p) => p.estructura).sort()).toEqual(delCatalogo)
    for (const p of piezas) {
      expect(p.capa).toBe('venas')
      expect(p.acabado).toBe('vaso')
      expect(p.color).toBe('--cx-anat-vena')
    }
  })

  it('trae los senos, la confluencia, las yugulares y las puenteantes de los dos lados', () => {
    for (const id of [
      'seno-sagital-superior', 'seno-sagital-inferior', 'seno-recto', 'vena-cerebral-magna', 'confluencia-de-los-senos',
      'seno-transverso-izq', 'seno-transverso-der', 'seno-sigmoideo-izq', 'seno-sigmoideo-der',
      'yugular-interna-izq', 'yugular-interna-der', 'venas-puenteantes-izq', 'venas-puenteantes-der',
    ]) {
      expect(por(id), id).toBeDefined()
    }
  })

  it('el flujo va en el sentido de la sangre', () => {
    // Sagital superior: de adelante hacia atrás, y termina en la confluencia.
    const sss = por('seno-sagital-superior').geometria
    expect(extremo(sss, 0).z).toBeGreaterThan(extremo(sss, 1).z + 10)
    expect(extremo(sss, 1).distanceTo(CONFLUENCIA)).toBeLessThan(0.6)
    // Transverso: de la confluencia hacia el lado.
    const tr = por('seno-transverso-izq').geometria
    expect(Math.abs(extremo(tr, 1).x)).toBeGreaterThan(Math.abs(extremo(tr, 0).x) + 4)
    // Yugular: hacia abajo.
    const yu = por('yugular-interna-der').geometria
    expect(extremo(yu, 0).y).toBeGreaterThan(extremo(yu, 1).y + 8)
  })

  it('cada lado va de su lado (+x es la izquierda del paciente)', () => {
    for (const base of ['seno-transverso', 'seno-sigmoideo', 'yugular-interna', 'venas-puenteantes']) {
      expect(centro(por(`${base}-izq`).geometria).x, base).toBeGreaterThan(1)
      expect(centro(por(`${base}-der`).geometria).x, base).toBeLessThan(-1)
    }
    // Lo de la línea media, en la línea media.
    for (const id of ['seno-sagital-superior', 'seno-sagital-inferior', 'seno-recto', 'confluencia-de-los-senos']) {
      expect(Math.abs(centro(por(id).geometria).x), id).toBeLessThan(0.05)
    }
  })

  it('la confluencia queda atrás y abajo del encéfalo; el sagital superior, arriba', () => {
    expect(CONFLUENCIA.z).toBeLessThan(-8)
    expect(por('seno-sagital-superior').geometria.boundingBox!.max.y).toBeGreaterThan(4.5)
  })

  it('en Realista los tubos son más finos de malla', () => {
    const cuenta = (ps: ReturnType<typeof construirVenas>) => ps.reduce((n, p) => n + p.geometria.getAttribute('position').count, 0)
    expect(cuenta(construirVenas('realista'))).toBeGreaterThan(cuenta(piezas) * 1.5)
  })
})
