/**
 * Sistema ventricular: los dos laterales en forma de C (asta frontal, cuerpo,
 * atrio, asta occipital y asta temporal), el tercero, el acueducto y el cuarto.
 */
import * as THREE from 'three'
import type { PiezaAnatomica } from './tipos'
import { barra, elipsoide, fusionar, pasoSuave, tuboVariable, campana } from './geometria'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

const LCR = { capa: 'ventriculos' as const, color: '--cx-anat-lcr', acabado: 'liquido' as const }

export const construirVentriculos = (): PiezaAnatomica[] => {
  const piezas: PiezaAnatomica[] = []
  for (const [s, sufijo] of [[1, 'izq'], [-1, 'der']] as const) {
    // De la punta del asta frontal, por el cuerpo y el atrio, hasta la punta del asta temporal.
    const principal = tuboVariable({
      puntos: [
        v3(s * 0.85, 1.55, 3.1),
        v3(s * 1.1, 2.15, 1.5),
        v3(s * 1.2, 2.3, -0.6),
        v3(s * 1.55, 2.05, -2.3),
        v3(s * 2.05, 1.25, -3.0),
        v3(s * 2.65, 0.15, -2.3),
        v3(s * 2.95, -0.6, -0.8),
        v3(s * 3.0, -0.85, 0.5),
      ],
      radio: (t) => {
        // Cuerpo ancho y plano; el asta temporal, delgada y con la punta cerrada.
        const cuerpo = 0.42 + 0.12 * campana(t - 0.4, 0.15)
        return cuerpo * (1 - 0.45 * pasoSuave(0.55, 1, t)) * (1 - 0.6 * pasoSuave(0.93, 1, t))
      },
      escalaLateral: (t) => 1.55 - 0.7 * pasoSuave(0.45, 0.7, t),
      segmentos: 90,
      radiales: 22,
    })
    const occipital = tuboVariable({
      puntos: [v3(s * 1.95, 1.4, -2.8), v3(s * 1.8, 1.2, -4.0), v3(s * 1.5, 1.1, -4.9)],
      radio: (t) => 0.36 * (1 - 0.8 * t),
      segmentos: 24,
      radiales: 16,
    })
    // Agujero de Monro: comunica cada lateral con el tercero.
    const monro = barra(v3(s * 1.0, 1.75, 1.15), v3(s * 0.1, 1.2, 0.8), 0.13, 0.11, 10)
    piezas.push({
      ...LCR,
      estructura: `ventriculo-lateral-${sufijo}`,
      geometria: fusionar([principal, occipital, monro]),
      ancla: v3(s * 1.4, 2.6, -0.6),
    })
  }
  piezas.push({
    ...LCR,
    estructura: 'tercer-ventriculo',
    geometria: elipsoide(v3(0, 0.55, 0.15), 0.16, 0.95, 1.35, 20, 16),
    ancla: v3(0.4, 0.6, 0.4),
  })
  piezas.push({
    ...LCR,
    estructura: 'acueducto',
    geometria: tuboVariable({
      puntos: [v3(0, -0.2, -0.75), v3(0, -1.3, -1.2), v3(0, -2.45, -1.5), v3(0, -3.0, -1.75)],
      radio: () => 0.09,
      segmentos: 30,
      radiales: 10,
    }),
    ancla: v3(0.3, -1.4, -1.2),
  })
  // El cuarto, en forma de tienda entre la protuberancia y el cerebelo.
  const cuarto = elipsoide(v3(0, -3.75, -2.25), 0.95, 1.05, 0.38, 24, 16)
  const pos = cuarto.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 3.75
    const z = pos.getZ(i)
    // El techo se levanta hacia atrás (el vértice de la tienda, el fastigio).
    pos.setZ(i, z - 0.35 * Math.max(0, 1 - Math.abs(y)) * (z < -2.25 ? 1 : 0))
  }
  cuarto.computeVertexNormals()
  piezas.push({ ...LCR, estructura: 'cuarto-ventriculo', geometria: fusionar([cuarto]), ancla: v3(0.9, -3.8, -2.4) })
  return piezas
}
