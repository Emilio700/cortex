/**
 * Envolturas: la piel (cabeza, cuello y tronco) y la bóveda craneal. Se pintan
 * translúcidas con borde luminoso (efecto Fresnel): se ve la silueta sin tapar
 * lo de adentro.
 */
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ModeloColumna } from './columna3d'
import type { PiezaAnatomica } from './tipos'
import { campana, pasoSuave, tuboVariable } from './geometria'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Cráneo: ovoide con la base escalonada (fosas anterior, media y posterior). */
const construirCraneo = () => {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 120, 84)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i)
    const x = 7.7 * dx * (1 - 0.08 * pasoSuave(0.3, 1, -dz))
    let y = 0.9 + 7.4 * dy
    const z = -0.5 + 9.35 * dz
    // Piso: alto adelante (techo de las órbitas), más bajo a los lados en medio
    // (fosa temporal) y hondo atrás (fosa del cerebelo).
    const piso =
      -2.0 -
      5.4 * pasoSuave(1.0, -3.8, z) -
      1.7 * pasoSuave(1.5, 4.0, Math.abs(x)) * campana(z + 0.2, 2.2) * (1 - pasoSuave(1.0, -3.8, z))
    if (y < piso) y = piso + (y - piso) * 0.06
    pos.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2))
  return g
}

/** Silueta del cuerpo de la coronilla a la pelvis: una sola superficie suave. */
const construirPiel = (modelo: ModeloColumna) => {
  const ySacro = modelo.punto(24.4).y
  const arriba = 9.4
  // Hasta debajo del cóccix: la pelvis envuelve al sacro entero.
  const abajo = ySacro - 13
  const puntos = Array.from({ length: 40 }, (_, k) => v3(0, arriba + ((abajo - arriba) * k) / 39, 0))
  const yEn = (t: number) => arriba + (abajo - arriba) * t
  // Medio fondo (z) y relación ancho/fondo, por altura.
  const perfil = (y: number): [fondo: number, ancho: number, z: number] => {
    if (y > -4) {
      const r = Math.sqrt(Math.max(0.0005, 1 - Math.pow((y - 0.6) / 8.9, 2)))
      return [9.9 * r, 8.4 * r, -0.4]
    }
    const tramos: [number, number, number, number][] = [
      // y, medio fondo, medio ancho, centro z
      [-4, 8.47, 7.19, -0.4],
      [-8, 6.6, 5.8, 0.6],
      [-11, 5.3, 5.4, 0.9],
      [-19, 5.6, 6.0, 1.3],
      [-24, 8.6, 15.5, 2.6],
      [-30, 10.4, 16.2, 3.4],
      [-42, 10.6, 14.8, 3.6],
      [-56, 9.6, 13.2, 3.0],
      [-66, 10.2, 15.2, 2.2],
      [-78, 10.6, 16.6, 1.0],
      [-200, 10.0, 15.6, 0.6],
    ]
    for (let k = 0; k < tramos.length - 1; k++) {
      const [y0, f0, a0, z0] = tramos[k]
      const [y1, f1, a1, z1] = tramos[k + 1]
      if (y <= y0 && y >= y1) {
        const t = pasoSuave(0, 1, (y0 - y) / (y0 - y1))
        return [f0 + (f1 - f0) * t, a0 + (a1 - a0) * t, z0 + (z1 - z0) * t]
      }
    }
    return [10, 15.6, 0.6]
  }
  return tuboVariable({
    puntos,
    radio: (t) => perfil(yEn(t))[0],
    escalaLateral: (t) => {
      const [f, a] = perfil(yEn(t))
      return a / f
    },
    desplazamiento: (t) => v3(0, 0, perfil(yEn(t))[2]),
    segmentos: 220,
    radiales: 72,
    tension: 0,
  })
}

export const construirEnvolturas = (modelo: ModeloColumna): PiezaAnatomica[] => [
  { estructura: 'piel', capa: 'piel', color: '--cx-anat-piel', acabado: 'envoltura', geometria: construirPiel(modelo) },
  { estructura: 'craneo', capa: 'craneo', color: '--cx-anat-hueso', acabado: 'envoltura', geometria: construirCraneo() },
]
