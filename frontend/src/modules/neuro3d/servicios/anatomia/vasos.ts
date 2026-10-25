/**
 * Polígono de Willis y sus arterias, en la base del encéfalo.
 *
 * Trayectos esquemáticos con los calibres relativos de un adulto: las
 * carótidas internas y la basilar, las más gruesas; las comunicantes, las más
 * finas. Cada tubo lleva `uv.x` a lo largo de su trayecto, que es lo que usa
 * la capa de «flujo» para mover el brillo en el sentido de la sangre.
 */
import * as THREE from 'three'
import type { PiezaAnatomica } from './tipos'
import type { Detalle } from './encefalo'
import { tuboVariable } from './geometria'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export const construirVasos = (detalle: Detalle = 'estandar'): PiezaAnatomica[] => {
  // En Realista los tubos son más redondos y siguen mejor las curvas.
  const fino = detalle === 'realista'
  const arteria = (estructura: string, puntos: THREE.Vector3[], r0: number, r1 = r0, ancla?: THREE.Vector3): PiezaAnatomica => ({
    estructura,
    capa: 'vasos',
    color: '--cx-anat-arteria',
    acabado: 'vaso',
    geometria: tuboVariable({
      puntos,
      radio: (t) => r0 + (r1 - r0) * t,
      segmentos: Math.max(24, puntos.length * (fino ? 24 : 14)),
      radiales: fino ? 24 : 14,
    }),
    ancla: ancla ?? puntos[Math.floor(puntos.length / 2)].clone(),
  })
  const piezas: PiezaAnatomica[] = []
  for (const [s, sufijo] of [[1, 'izq'], [-1, 'der']] as const) {
    const terminal = v3(s * 1.35, -1.42, 1.3)
    const unionPosterior = v3(s * 1.1, -1.68, -0.3)
    piezas.push(
      arteria(
        `carotida-interna-${sufijo}`,
        [v3(s * 2.1, -13, 1.4), v3(s * 1.95, -8, 1.8), v3(s * 1.65, -4.2, 2.2), v3(s * 1.55, -2.7, 2.65), v3(s * 1.45, -2.0, 1.9), terminal],
        0.24,
        0.21,
        v3(s * 2.0, -6, 2.0),
      ),
    )
    piezas.push(
      arteria(
        `cerebral-anterior-${sufijo}`,
        [terminal, v3(s * 0.75, -1.3, 2.05), v3(s * 0.25, -1.15, 2.6), v3(s * 0.1, -0.3, 3.9), v3(s * 0.08, 1.8, 5.5), v3(s * 0.08, 3.5, 4.1), v3(s * 0.08, 4.2, 1.1), v3(s * 0.08, 3.8, -2.0)],
        0.12,
        0.06,
        v3(s * 0.4, -0.4, 3.9),
      ),
    )
    piezas.push(
      arteria(
        `cerebral-media-${sufijo}`,
        [terminal, v3(s * 2.4, -1.3, 1.55), v3(s * 3.6, -1.0, 1.15), v3(s * 4.7, -0.5, 0.9), v3(s * 5.9, 0.35, 0.4), v3(s * 6.55, 1.7, -0.6), v3(s * 6.55, 3.2, -1.7)],
        0.19,
        0.09,
        v3(s * 3.6, -1.0, 1.15),
      ),
    )
    // Rama inferior de la cerebral media, hacia el temporal y el parietal.
    piezas.push({
      ...arteria(`cerebral-media-${sufijo}`, [v3(s * 4.7, -0.5, 0.9), v3(s * 5.9, -0.15, -0.2), v3(s * 6.55, 0.3, -2.1), v3(s * 6.3, 0.9, -4.0)], 0.12, 0.07),
    })
    piezas.push(arteria(`comunicante-posterior-${sufijo}`, [terminal, v3(s * 1.3, -1.55, 0.45), unionPosterior], 0.075, 0.075, v3(s * 1.35, -1.55, 0.45)))
    piezas.push(
      arteria(
        `cerebral-posterior-${sufijo}`,
        [v3(0, -2.0, 0.55), v3(s * 0.6, -1.88, 0.3), unionPosterior, v3(s * 1.9, -1.45, -1.4), v3(s * 2.5, -1.15, -3.2), v3(s * 2.4, -0.85, -5.2), v3(s * 2.0, -0.35, -7.0)],
        0.15,
        0.09,
        v3(s * 2.5, -1.15, -3.2),
      ),
    )
    piezas.push(
      arteria(
        `vertebral-${sufijo}`,
        [v3(s * 2.35, -17, -1.3), v3(s * 2.35, -12, -1.5), v3(s * 2.65, -9.8, -2.3), v3(s * 1.5, -8.5, -1.05), v3(s * 0.6, -7.2, -0.2), v3(s * 0.06, -6.25, 0.05)],
        0.17,
        0.16,
        v3(s * 2.4, -12, -1.5),
      ),
    )
  }
  piezas.push(arteria('comunicante-anterior', [v3(0.27, -1.15, 2.6), v3(0, -1.12, 2.66), v3(-0.27, -1.15, 2.6)], 0.075, 0.075, v3(0, -1.1, 2.7)))
  piezas.push(arteria('basilar', [v3(0, -6.25, 0.05), v3(0, -5.0, 0.95), v3(0, -3.6, 1.3), v3(0, -2.6, 1.0), v3(0, -2.0, 0.55)], 0.22, 0.2, v3(0, -4.0, 1.35)))
  return piezas
}
