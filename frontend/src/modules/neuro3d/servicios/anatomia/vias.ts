/**
 * Vías principales (esquemáticas): corticoespinal y columnas dorsales–lemnisco
 * medial, del encéfalo a la médula. Son un dibujo para explicar el cruce de
 * las vías, no una tractografía: se pintan por encima de todo y el catálogo
 * las nombra «esquemáticas».
 *
 * El lado de cada vía es el del hemisferio: la corticoespinal izquierda nace en
 * la corteza motora izquierda, se cruza en el bulbo y baja por la mitad derecha
 * de la médula; las columnas dorsales que llegan a la corteza izquierda suben
 * por la mitad derecha de la médula y se cruzan en el bulbo.
 */
import * as THREE from 'three'
import type { ModeloColumna } from './columna3d'
import type { PiezaAnatomica } from './tipos'
import { tuboVariable } from './geometria'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Puntos dentro de la médula, de la coordenada `desde` a `hasta`, a un lado y atrás o adelante. */
const porLaMedula = (modelo: ModeloColumna, desde: number, hasta: number, lateral: number, adelante: number, pasos = 14) =>
  Array.from({ length: pasos + 1 }, (_, k) => {
    const v = desde + ((hasta - desde) * k) / pasos
    const r = modelo.radioMedular(v)
    return modelo.punto(v, lateral * r, adelante * r)
  })

export const construirVias = (modelo: ModeloColumna): PiezaAnatomica[] => {
  const piezas: PiezaAnatomica[] = []
  for (const [s, sufijo] of [[1, 'izq'], [-1, 'der']] as const) {
    // Corticoespinal: corteza motora → cápsula interna → pedúnculo → pirámide →
    // decusación → cordón lateral del otro lado.
    const motora = [
      v3(s * 2.5, 5.0, -0.2),
      v3(s * 1.95, 3.0, 0.05),
      v3(s * 1.3, 1.0, 0.05),
      v3(s * 0.75, -1.2, -0.25),
      v3(s * 0.55, -3.6, -0.2),
      v3(s * 0.35, -6.0, -0.6),
      v3(0, -7.6, -1.25),
      ...porLaMedula(modelo, -0.2, 19.6, -s * 0.62, -0.25),
    ]
    piezas.push({
      estructura: `via-corticoespinal-${sufijo}`,
      capa: 'tractos',
      color: '--cx-anat-via-motora',
      acabado: 'via',
      geometria: tuboVariable({ puntos: motora, radio: (t) => 0.11 * (1 - 0.5 * t), segmentos: 260, radiales: 8 }),
      ancla: v3(s * 1.95, 3.0, 0.05),
    })
    // Columnas dorsales: suben por detrás en la médula del otro lado, se cruzan
    // en el bulbo y siguen como lemnisco medial hasta el tálamo y la corteza sensitiva.
    const sensitiva = [
      ...porLaMedula(modelo, 19.6, -0.2, -s * 0.3, -0.62),
      v3(-s * 0.25, -7.7, -2.0),
      v3(0, -7.0, -1.4),
      v3(s * 0.4, -5.5, -1.0),
      v3(s * 0.6, -3.5, -1.1),
      v3(s * 0.9, -1.5, -0.95),
      v3(s * 1.2, 0.6, -0.7),
      v3(s * 2.0, 3.0, -1.4),
      v3(s * 2.65, 4.8, -1.9),
    ]
    piezas.push({
      estructura: `via-columnas-dorsales-${sufijo}`,
      capa: 'tractos',
      color: '--cx-anat-via-sensitiva',
      acabado: 'via',
      geometria: tuboVariable({ puntos: sensitiva, radio: (t) => 0.06 + 0.04 * t, segmentos: 260, radiales: 8 }),
      ancla: v3(s * 2.0, 3.0, -1.4),
    })
  }
  return piezas
}
