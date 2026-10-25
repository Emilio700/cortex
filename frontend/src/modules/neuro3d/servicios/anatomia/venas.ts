/**
 * Sistema venoso del encéfalo: senos de la duramadre, vena cerebral magna,
 * yugulares internas y venas puenteantes.
 *
 * Trayectos típicos de un adulto, apoyados en las formas del atlas (la
 * superficie de los hemisferios, el cerebelo y el cráneo) para que cada seno
 * quede en su sitio respecto de ellos. (verificar) Son aproximados: el tamaño y
 * la simetría de los senos varían mucho entre personas (el transverso derecho
 * suele ser el dominante) y aquí son simétricos.
 *
 * Cada tubo lleva `uv.x` en el sentido de la sangre (de la corteza a los senos,
 * de adelante hacia atrás, de la confluencia hacia los lados y abajo): la capa
 * de «flujo» lo usa igual que en las arterias.
 *
 * Coordenadas en cm: +x izquierda del paciente, +y arriba, +z adelante.
 */
import * as THREE from 'three'
import type { PiezaAnatomica } from './tipos'
import { formaDelHemisferio, type Detalle } from './encefalo'
import { crearRuido3, elipsoide, fusionar, tuboVariable } from './geometria'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Medidas del hemisferio (las mismas de `encefalo.ts`), para seguir su borde superior. */
const CY = 1.3
const CZ = -0.4
const RY = 4.1
const RZ = 8.1

/** Confluencia de los senos, a la altura de la protuberancia occipital interna. */
export const CONFLUENCIA = v3(0, -2.25, -8.55)

/**
 * Seno sagital superior: por la línea media, sobre el borde superior de los
 * hemisferios, desde la apófisis crista galli hasta la confluencia.
 */
export const puntosDelSenoSagitalSuperior = (): THREE.Vector3[] => {
  const puntos: THREE.Vector3[] = []
  for (const dz of [0.84, 0.7, 0.5, 0.25, 0, -0.25, -0.5, -0.7, -0.88]) {
    const altura = Math.sqrt(1 - dz * dz)
    puntos.push(v3(0, CY + RY * altura * 0.82 + 0.35, CZ + RZ * dz))
  }
  // Rodea el polo occipital por detrás y baja a la confluencia.
  puntos.push(v3(0, 1.4, -8.85), v3(0, -0.5, -9.0), CONFLUENCIA.clone())
  return puntos
}

/** Altura del seno sagital superior a una profundidad z (para que las puenteantes lleguen a él). */
const senoSagitalEn = (z: number) => {
  const dz = Math.max(-0.95, Math.min(0.95, (z - CZ) / RZ))
  return v3(0, CY + RY * Math.sqrt(1 - dz * dz) * 0.82 + 0.35, z)
}

/** Transverso: de la confluencia hacia el lado, por la pared del cráneo a la altura de la tienda. */
const puntosDelTransverso = (s: 1 | -1) =>
  [0, 18, 36, 52, 66].map((grados, k) => {
    const a = THREE.MathUtils.degToRad(grados)
    return v3(s * 6.15 * Math.sin(a), -2.25 - 0.16 * k, -0.5 - 8.05 * Math.cos(a))
  })

/** Sigmoideo: baja en S por detrás del peñasco hasta el agujero yugular. */
const puntosDelSigmoideo = (s: 1 | -1, inicio: THREE.Vector3) => [
  inicio.clone(),
  v3(s * 5.85, -3.7, -3.2),
  v3(s * 5.45, -4.9, -2.95),
  v3(s * 4.6, -5.95, -2.45),
  v3(s * 3.65, -6.7, -1.75),
  v3(s * 3.1, -7.25, -1.2),
]

/** Yugular interna: del agujero yugular hacia abajo, por fuera de la carótida interna. */
const puntosDeLaYugular = (s: 1 | -1, inicio: THREE.Vector3) => [
  inicio.clone(),
  v3(s * 3.05, -8.6, -0.35),
  v3(s * 3.1, -10.5, 0.6),
  v3(s * 3.25, -13.5, 1.05),
  v3(s * 3.4, -17.5, 1.25),
]

/** Un punto sobre la superficie del hemisferio (lado +x), un poco por fuera de las circunvoluciones. */
const sobreLaCorteza = (dir: THREE.Vector3, fuera = 0.08) => {
  const p = formaDelHemisferio(dir.x, dir.y, dir.z)
  return p.add(p.clone().sub(v3(3.35, CY, CZ)).normalize().multiplyScalar(fuera))
}

const sinuosidad = crearRuido3(29)

/**
 * Venas cerebrales superiores (puenteantes): suben oblicuas y sinuosas por la
 * convexidad, siguiendo la superficie, y cruzan al seno sagital superior
 * entrando hacia delante, contra la corriente del seno. `desde` y `hasta` son
 * la profundidad (dz de la esfera unidad) donde empiezan y donde llegan arriba;
 * `bajo` es cuán abajo empiezan (0 = mitad del hemisferio).
 */
const puntosDePuenteante = (s: 1 | -1, desde: number, hasta: number, bajo: number, semilla: number) => {
  const puntos: THREE.Vector3[] = []
  const pasos = 12
  const a0 = 0.15 + 0.3 * (1 - bajo)
  const a1 = 2.1
  for (let k = 0; k <= pasos; k++) {
    const t = k / pasos
    // Serpentea un poco a lo largo del trayecto, sin salirse de la superficie.
    const dz = desde + (hasta - desde) * t + 0.045 * sinuosidad(semilla, t * 3.2, 0) * Math.sin(Math.PI * t)
    const a = a0 + (a1 - a0) * t
    const r = Math.sqrt(Math.max(0, 1 - dz * dz))
    const p = sobreLaCorteza(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), dz))
    puntos.push(v3(s * p.x, p.y, p.z))
  }
  const ultimo = puntos[puntos.length - 1]
  puntos.push(senoSagitalEn(ultimo.z + 0.4))
  return puntos
}

/**
 * Las puenteantes de cada lado: (desde, hasta, bajo). Las frontales suben casi
 * derechas; las de atrás se inclinan hacia delante. La del centro nace en la
 * cisura lateral (anastomótica superior, de Trolard). (verificar) Número y
 * trayecto típicos; en cada persona son distintos.
 */
const PUENTEANTES: [number, number, number][] = [
  [0.66, 0.7, 0.25],
  [0.44, 0.5, 0.45],
  [0.12, 0.26, 1],
  [-0.1, 0.02, 0.4],
  [-0.34, -0.2, 0.55],
  [-0.58, -0.44, 0.35],
]

/** Vena anastomótica inferior (de Labbé): de la cisura lateral al transverso. (verificar) Trayecto típico. */
const puntosDeLabbe = (s: 1 | -1, final: THREE.Vector3) => {
  const puntos: THREE.Vector3[] = []
  for (const [dx, dy, dz] of [
    [0.9, -0.05, 0.12],
    [0.9, -0.2, -0.05],
    [0.86, -0.32, -0.2],
    [0.78, -0.48, -0.36],
  ] as const) {
    const p = sobreLaCorteza(new THREE.Vector3(dx, dy, dz).normalize())
    puntos.push(v3(s * p.x, p.y, p.z))
  }
  puntos.push(final.clone())
  return puntos
}

export const construirVenas = (detalle: Detalle = 'estandar'): PiezaAnatomica[] => {
  const fino = detalle === 'realista'
  const radiales = fino ? 22 : 12
  const vena = (estructura: string, puntos: THREE.Vector3[], r0: number, r1 = r0, ancla?: THREE.Vector3, tapas = true): PiezaAnatomica => ({
    estructura,
    capa: 'venas',
    color: '--cx-anat-vena',
    acabado: 'vaso',
    geometria: tuboVariable({
      puntos,
      radio: (t) => r0 + (r1 - r0) * t,
      segmentos: Math.max(24, puntos.length * (fino ? 18 : 10)),
      radiales,
      tapas,
    }),
    ancla: ancla ?? puntos[Math.floor(puntos.length / 2)].clone(),
  })

  const piezas: PiezaAnatomica[] = []
  // El seno sagital superior se ensancha hacia atrás: recoge cada vez más venas.
  const sagital = puntosDelSenoSagitalSuperior()
  piezas.push(vena('seno-sagital-superior', sagital, 0.14, 0.42, sagital[4].clone().add(v3(0.4, 0.3, 0))))

  // Profundas: seno sagital inferior → (con la vena magna) seno recto → confluencia.
  const union = v3(0, 0.45, -3.75)
  piezas.push(vena('seno-sagital-inferior', [v3(0, 2.25, 3.2), v3(0, 2.75, 1.0), v3(0, 2.6, -1.2), v3(0, 1.65, -2.9), union], 0.07, 0.12))
  piezas.push(vena('vena-cerebral-magna', [v3(0, 0.15, -2.25), v3(0, 0.2, -3.0), v3(0, 0.38, -3.5), union], 0.13, 0.18, v3(0.3, 0.3, -3.0)))
  piezas.push(vena('seno-recto', [union, v3(0, -0.35, -5.0), v3(0, -1.25, -6.8), CONFLUENCIA.clone().add(v3(0, 0.05, 0.25))], 0.2, 0.27))

  piezas.push({
    estructura: 'confluencia-de-los-senos',
    capa: 'venas',
    color: '--cx-anat-vena',
    acabado: 'vaso',
    geometria: elipsoide(CONFLUENCIA, 0.48, 0.42, 0.34, fino ? 28 : 18, fino ? 20 : 12),
    ancla: CONFLUENCIA.clone().add(v3(0.6, 0.2, -0.3)),
  })

  for (const [s, sufijo] of [
    [1, 'izq'],
    [-1, 'der'],
  ] as const) {
    const transverso = puntosDelTransverso(s)
    piezas.push(vena(`seno-transverso-${sufijo}`, transverso, 0.4, 0.36, transverso[2].clone()))
    const sigmoideo = puntosDelSigmoideo(s, transverso[transverso.length - 1])
    piezas.push(vena(`seno-sigmoideo-${sufijo}`, sigmoideo, 0.36, 0.38, sigmoideo[2].clone()))
    const yugular = puntosDeLaYugular(s, sigmoideo[sigmoideo.length - 1])
    // El bulbo de la yugular, más ancho, y luego la vena del cuello.
    piezas.push(vena(`yugular-interna-${sufijo}`, yugular, 0.5, 0.6, yugular[2].clone()))

    // Las puenteantes de un lado, en una sola malla (se tocan juntas).
    const tubos = PUENTEANTES.map(([desde, hasta, bajo], k) =>
      tuboVariable({
        puntos: puntosDePuenteante(s, desde, hasta, bajo, k * 7.3 + (s > 0 ? 0 : 50)),
        radio: (t) => 0.05 + 0.06 * t,
        segmentos: fino ? 90 : 48,
        radiales: fino ? 12 : 8,
      }),
    )
    tubos.push(tuboVariable({ puntos: puntosDeLabbe(s, transverso[3]), radio: (t) => 0.06 + 0.06 * t, segmentos: fino ? 60 : 32, radiales: fino ? 12 : 8 }))
    // `fusionar` conserva `uv.x` de cada tubo: el flujo sigue yendo hacia el seno.
    const geometria = fusionar(tubos)
    piezas.push({
      estructura: `venas-puenteantes-${sufijo}`,
      capa: 'venas',
      color: '--cx-anat-vena',
      acabado: 'vaso',
      geometria,
      ancla: puntosDePuenteante(s, 0.12, 0.26, 1, 0)[4],
    })
  }
  return piezas
}
