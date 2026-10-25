/**
 * Columna procedural: vértebras C1–sacro, discos, médula por segmentos y
 * raíces por nivel, colocadas sobre una curva con sus lordosis y su cifosis.
 *
 * Todo se ubica con la coordenada vertebral del dominio (`columna.ts`): el
 * entero es la vértebra y la fracción, cuánto se baja dentro de ella y de su
 * disco. Así la raíz L5 sale exactamente por el agujero L5-S1 que dice la
 * ficha, y su segmento medular queda donde dice la tabla de segmentos.
 *
 * El eje y su despiece viven en `ejeColumna.ts`, puros y con pruebas. La
 * columna despiezada abre cada disco (una «junta») a lo largo de la curva. Las vértebras y los discos se mueven enteros; la médula y las raíces,
 * que cruzan varias juntas, traen su forma separada como morph target, para
 * que se estiren con la columna y se puedan seguir tocando.
 */
import * as THREE from 'three'
import {
  FIN_DEL_CONO,
  NIVELES_VERTEBRALES,
  RAICES,
  SEGMENTOS_MEDULARES,
  coordenadaDeAgujero,
  segmentoDeRaiz,
  type RegionColumna,
} from '../../dominio/columna'
import { idDeRaiz } from '../../dominio/catalogo'
import type { PiezaAnatomica } from './tipos'
import type { Detalle } from './encefalo'
import { aMarco, campana, elipsoide, fusionar, limitar, pasoSuave, tuboVariable } from './geometria'
import { ajustarAlturas, crearDesplazamiento, crearJuntas, crearLongitud, resolverAjuste, trazarEje } from './ejeColumna'
import { ajusteVacio, type AjusteDelEje } from '../../dominio/ajusteRadiografico'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

interface MedidasDeNivel {
  id: string
  region: RegionColumna
  /** Altura del cuerpo (o del anillo) y del disco o la junta de abajo, en cm. */
  cuerpo: number
  disco: number
  ancho: number
  fondo: number
  /** Radio del conducto. */
  conducto: number
}

/** Medidas aproximadas de un adulto, interpoladas por región (cm). */
const medidas = (): MedidasDeNivel[] =>
  NIVELES_VERTEBRALES.map((n) => {
    const i = n.indice
    if (n.id === 'C1') return { id: n.id, region: n.region, cuerpo: 1.0, disco: 0.35, ancho: 0, fondo: 0, conducto: 1.0 }
    if (n.region === 'cervical') {
      const k = (i - 1) / 5
      return { id: n.id, region: n.region, cuerpo: 1.6 - 0.2 * Math.min(1, (i - 1)) + 0.15 * k, disco: 0.45 + 0.1 * k, ancho: 1.7 + 0.45 * k, fondo: 1.45 + 0.2 * k, conducto: 0.74 }
    }
    if (n.region === 'toracica') {
      const k = (i - 7) / 11
      return { id: n.id, region: n.region, cuerpo: 1.75 + 0.78 * k, disco: 0.5 + 0.22 * k, ancho: 2.55 + 1.25 * k, fondo: 1.95 + 0.95 * k, conducto: 0.62 }
    }
    if (n.region === 'lumbar') {
      const k = (i - 19) / 4
      return { id: n.id, region: n.region, cuerpo: 2.6 + 0.25 * Math.sin(k * Math.PI), disco: 0.95 + 0.12 * Math.sin(k * Math.PI), ancho: 4.2 + 0.8 * k, fondo: 3.0 + 0.4 * k, conducto: 0.82 }
    }
    // El sacro: unos 11 cm del platillo de S1 al vértice, como en un adulto
    // (cuatro cuerpos lumbares). No tiene disco abajo; el cóccix va aparte.
    return { id: n.id, region: n.region, cuerpo: 11, disco: 0, ancho: 9, fondo: 3.6, conducto: 0.7 }
  })

/** Separación de cada junta en la columna despiezada (cm). */
export const SEPARACION_DESPIECE = 0.9

export interface MarcoColumna {
  centro: THREE.Vector3
  /** Hacia abajo, a lo largo del conducto. */
  tangente: THREE.Vector3
  /** Hacia delante (hacia los cuerpos vertebrales). */
  adelante: THREE.Vector3
  /** Hacia arriba de la vértebra (−tangente). */
  arriba: THREE.Vector3
  lateral: THREE.Vector3
}

export interface ModeloColumna {
  medidas: MedidasDeNivel[]
  /** Marco del conducto en una coordenada vertebral. */
  marco(v: number): MarcoColumna
  /** Punto en el conducto con desplazamiento lateral (x) y hacia delante. */
  punto(v: number, lateral?: number, adelante?: number): THREE.Vector3
  /** Desplazamiento de la columna despiezada (al 100 %) en esa coordenada. */
  desplazamiento(v: number): THREE.Vector3
  /** Fracción de la vértebra que ocupa el cuerpo (el resto es el disco). */
  fraccionDeCuerpo(i: number): number
  /** Radio de la médula en una coordenada vertebral. */
  radioMedular(v: number): number
}

/**
 * La columna del modelo. Con un `ajuste` (las medidas de una radiografía del
 * paciente) el eje se dobla a sus curvas, se desvía de lado en la escoliosis, se
 * corre en la listesis y los discos medidos toman su altura; las vértebras
 * conservan la forma del modelo. Sin ajuste, es la columna esquemática de siempre.
 */
export const crearModeloColumna = (ajuste?: AjusteDelEje | null): ModeloColumna => {
  const conAjuste = ajuste && !ajusteVacio(ajuste) ? ajuste : null
  const m = conAjuste ? ajustarAlturas(medidas(), conAjuste) : medidas()
  const eje = conAjuste ? resolverAjuste(m, conAjuste) : undefined
  const curva = new THREE.CatmullRomCurve3(trazarEje(m, 0.5, eje), false, 'catmullrom', 0.5)
  const largo = curva.getLength()
  const { sDeV } = crearLongitud(m)

  const marco = (v: number): MarcoColumna => {
    const u = limitar(sDeV(v) / largo)
    const centro = curva.getPointAt(u)
    const tangente = curva.getTangentAt(u).normalize()
    if (!eje) {
      const adelante = v3(0, tangente.z, -tangente.y).normalize()
      return { centro, tangente, adelante, arriba: tangente.clone().negate(), lateral: v3(1, 0, 0) }
    }
    // Adelante: la dirección del paciente hacia delante, perpendicular al eje.
    // Sin desviación coronal coincide con la fórmula de arriba; con ella, la
    // vértebra se inclina de lado sin girar sobre su eje (eso la AP no lo mide).
    const adelante = v3(0, 0, 1).addScaledVector(tangente, -tangente.z).normalize()
    const arriba = tangente.clone().negate()
    const lateral = new THREE.Vector3().crossVectors(arriba, adelante).normalize()
    // La listesis traslada; no gira la vértebra ni tuerce la tangente.
    centro.addScaledVector(adelante, eje.desplazamiento(v))
    return { centro, tangente, adelante, arriba, lateral }
  }

  const punto = (v: number, lateral = 0, adelante = 0) => {
    const k = marco(v)
    return k.centro.clone().addScaledVector(k.lateral, lateral).addScaledVector(k.adelante, adelante)
  }

  const fraccionDeCuerpo = (i: number) => m[i].cuerpo / (m[i].cuerpo + m[i].disco)

  // Cada junta se abre sobre la tangente de su disco (a la mitad del disco).
  const tangentesDeJuntas = m.slice(0, -1).map((_, j) => {
    const fc = fraccionDeCuerpo(j)
    return marco(j + fc + (1 - fc) / 2).tangente
  })
  const desplazamientoEn = crearDesplazamiento(crearJuntas(m), tangentesDeJuntas, SEPARACION_DESPIECE)
  const desplazamiento = (v: number) => desplazamientoEn(v)

  const radioMedular = (v: number) => {
    const base = 0.43
    const cervical = 0.2 * campana(v - 4.6, 1.3)
    const lumbar = 0.13 * campana(v - 17.6, 0.9)
    const cono = 1 - pasoSuave(18.9, FIN_DEL_CONO, v)
    return Math.max(0.04, (base + cervical + lumbar) * (0.12 + 0.88 * cono))
  }

  return { medidas: m, marco, punto, desplazamiento, fraccionDeCuerpo, radioMedular }
}

// ── Piezas de una vértebra (en su marco local: y arriba, z adelante) ───────

/**
 * Resolución de las cápsulas: en Realista son más redondas. Se fija al empezar
 * a construir la columna (las piezas se generan de una en una, sin hilos).
 */
let capsulaFina = false

/** Cápsula de `a` a `b`, aplanada: `grosor` a lo largo de `eje` y `alto` en la tercera dirección. */
const capsula = (a: THREE.Vector3, b: THREE.Vector3, r: number, eje: THREE.Vector3, grosor = 1, alto = 1) => {
  const dir = new THREE.Vector3().subVectors(b, a)
  const l = Math.max(0.01, dir.length())
  dir.normalize()
  const g = capsulaFina ? new THREE.CapsuleGeometry(r, l, 6, 18) : new THREE.CapsuleGeometry(r, l, 4, 10)
  g.scale(grosor, 1, alto)
  const ex = eje.clone().sub(dir.clone().multiplyScalar(eje.dot(dir)))
  if (ex.lengthSq() < 1e-6) ex.set(dir.y, -dir.x, 0)
  ex.normalize()
  const ez = new THREE.Vector3().crossVectors(ex, dir).normalize()
  const mat = new THREE.Matrix4().makeBasis(ex, dir, ez)
  mat.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  g.applyMatrix4(mat)
  return g
}

/**
 * Cuerpo vertebral (o disco): cilindro de cintura estrecha, aplanado por detrás.
 * Con `concavo`, la pared posterior se hunde en la línea media (la cara del
 * conducto), como en la vértebra real.
 */
const cuerpo = (ancho: number, fondo: number, alto: number, cintura = 0.9, borde = 0.12, concavo = false) => {
  const h = alto / 2
  const perfil = [
    new THREE.Vector2(0, -h),
    new THREE.Vector2(0.86, -h),
    new THREE.Vector2(0.98, -h + borde),
    new THREE.Vector2(cintura, 0),
    new THREE.Vector2(0.98, h - borde),
    new THREE.Vector2(0.86, h),
    new THREE.Vector2(0, h),
  ]
  const g = new THREE.LatheGeometry(perfil, capsulaFina ? 64 : 36)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * (ancho / 2)
    let z = pos.getZ(i) * (fondo / 2)
    if (z < 0) z *= 0.72 * (concavo ? 1 - 0.28 * campana(pos.getX(i), 0.38) : 1)
    pos.setX(i, x)
    pos.setZ(i, z)
  }
  g.computeVertexNormals()
  return g
}

const X = v3(1, 0, 0)
const Y = v3(0, 1, 0)

/**
 * Carilla articular: un disco aplanado en `centro`, con su cara mirando hacia
 * `normal`. Es lo que se ve de la articulación interapofisaria.
 */
const carilla = (centro: THREE.Vector3, normal: THREE.Vector3, ancho: number, alto: number) => {
  const g = new THREE.SphereGeometry(1, capsulaFina ? 20 : 12, capsulaFina ? 12 : 8)
  g.scale(ancho, alto, 0.09)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize()))
  g.translate(centro.x, centro.y, centro.z)
  return g
}

/**
 * Apófisis transversa de una cervical con su agujero transverso (por donde
 * sube la arteria vertebral): un anillo entre el cuerpo y el pedículo, que
 * termina en el tubérculo. (verificar) Medidas aproximadas, sin la anatomía
 * fina de los tubérculos anterior y posterior.
 */
const transversaCervical = (s: number, rc: number) => {
  const anillo = new THREE.TorusGeometry(0.3, 0.12, 10, 22)
  anillo.rotateX(Math.PI / 2)
  anillo.scale(1.2, 1, 1)
  anillo.translate(s * (rc + 0.82), -0.02, 0.48)
  const tuberculo = capsula(v3(s * (rc + 1.12), -0.04, 0.5), v3(s * (rc + 1.5), -0.1, 0.55), 0.15, Y, 1, 0.75)
  return [anillo, tuberculo]
}

/** Una vértebra típica (C3–L5) en su marco local, con el conducto en el origen. */
const vertebraTipica = (n: MedidasDeNivel, indice: number, detalle: Detalle = 'estandar'): THREE.BufferGeometry => {
  const rc = n.conducto
  const h = n.cuerpo
  const zc = rc + 0.12 + (n.fondo / 2) * 0.72
  const fino = detalle === 'realista'
  const piezas: THREE.BufferGeometry[] = []
  const c = cuerpo(n.ancho, n.fondo, h, 0.9, 0.12, fino)
  c.translate(0, 0, zc)
  piezas.push(c)

  const lumbar = n.region === 'lumbar'
  const toracica = n.region === 'toracica'
  const cervical = n.region === 'cervical'
  const escala = lumbar ? 1.25 : toracica ? 1 : 0.8
  const rPed = 0.26 * escala
  for (const s of [-1, 1]) {
    // Pedículo: del cuerpo hacia atrás.
    piezas.push(capsula(v3(s * rc * 0.78, 0.05, rc + 0.3), v3(s * (rc + 0.18), 0.05, -rc * 0.25), rPed, Y, 1, 1.25))
    if (!fino) {
      // Macizo articular: carillas de arriba y de abajo.
      piezas.push(capsula(v3(s * (rc + 0.3), h * 0.5 + 0.3, -rc * 0.25), v3(s * (rc + 0.3), -h * 0.5 - 0.25, -rc * 0.5), 0.3 * escala, X, 1, 1))
      // Lámina: cierra el arco por detrás.
      piezas.push(capsula(v3(s * (rc + 0.22), 0, -rc * 0.35), v3(0, -0.1 * escala, -(rc + 0.35)), 0.24 * escala, new THREE.Vector3(s * 0.4, 0, 1), 0.65, 1.9))
    } else {
      // Istmo (pars) entre las dos apófisis articulares.
      piezas.push(capsula(v3(s * (rc + 0.28), h * 0.12, -rc * 0.3), v3(s * (rc + 0.22), -h * 0.22, -rc * 0.5), 0.22 * escala, X, 0.9, 1))
      // Apófisis articular superior y su carilla. La carilla mira hacia atrás y
      // adentro en la lumbar, hacia atrás en la torácica y hacia arriba y atrás
      // en la cervical (verificar: orientación típica, varía por nivel).
      const sup = v3(s * (rc + (lumbar ? 0.42 : 0.32)), h * 0.5 + 0.32 * escala, -rc * (lumbar ? 0.2 : 0.3))
      piezas.push(capsula(v3(s * (rc + 0.3), h * 0.1, -rc * 0.28), sup, 0.2 * escala, X, 1, 1))
      const normalSup = (lumbar ? v3(-s * 0.75, 0.1, -0.65) : toracica ? v3(0, 0.35, -1) : v3(0, 0.75, -0.65)).normalize()
      piezas.push(carilla(sup.clone().addScaledVector(normalSup, 0.12 * escala), normalSup, 0.3 * escala, 0.36 * escala))
      // Apófisis articular inferior y su carilla: mira al revés, hacia la superior de abajo.
      const inf = v3(s * (rc + (lumbar ? 0.18 : 0.3)), -h * 0.5 - 0.3 * escala, -rc * (lumbar ? 0.72 : 0.55))
      piezas.push(capsula(v3(s * (rc + 0.22), -h * 0.15, -rc * 0.5), inf, 0.19 * escala, X, 1, 1))
      piezas.push(carilla(inf.clone().addScaledVector(normalSup, -0.12 * escala), normalSup.clone().negate(), 0.28 * escala, 0.34 * escala))
      // Lámina: una placa más delgada y alta que cierra el arco por detrás.
      piezas.push(capsula(v3(s * (rc + 0.2), 0.05, -rc * 0.4), v3(0, -0.12 * escala, -(rc + 0.32)), 0.2 * escala, new THREE.Vector3(s * 0.4, 0, 1), 0.5, 2.4))
    }
    // Apófisis transversa.
    if (fino && cervical) {
      piezas.push(...transversaCervical(s, rc))
      continue
    }
    const transversa = lumbar
      ? [v3(s * (rc + 0.3), 0, -0.1), v3(s * (rc + 2.5), 0.05, 0.15), 0.2]
      : toracica
        ? [v3(s * (rc + 0.3), 0.15, -0.35), v3(s * (rc + 1.8), 0.4, -1.05), 0.27]
        : [v3(s * (rc + 0.3), 0, 0.15), v3(s * (rc + 1.2), -0.05, 0.35), 0.2]
    piezas.push(capsula(transversa[0] as THREE.Vector3, transversa[1] as THREE.Vector3, transversa[2] as number, Y, 0.75, 1))
    if (fino && toracica && indice < 17) {
      // Carilla costal de la transversa, en su punta (T11 y T12 no la tienen).
      const punta = transversa[1] as THREE.Vector3
      piezas.push(carilla(punta.clone().add(v3(0, 0, 0.22)), v3(s * 0.3, 0, 1), 0.2, 0.2))
    }
  }
  // Apófisis espinosa: corta y bífida en el cuello (C7 larga), larga e inclinada
  // en el tórax, horizontal y en hacha en la columna lumbar.
  const raiz = v3(0, -0.1 * escala, -(rc + 0.35))
  if (cervical) {
    const prominente = n.id === 'C7'
    const largo = prominente ? 1.9 : 1.05
    const punta = raiz.clone().add(v3(0, -largo * 0.42, -largo))
    if (prominente) {
      piezas.push(capsula(raiz, punta, 0.24, X, 0.75, 1.2))
      if (fino) piezas.push(elipsoide(punta, 0.28, 0.24, 0.22, 16, 12))
    } else for (const s of [-1, 1]) piezas.push(capsula(raiz, punta.clone().add(v3(s * 0.28, 0, 0)), 0.17, X, 1, 1))
  } else if (toracica) {
    const angulo = THREE.MathUtils.degToRad(indice < 10 ? 42 : indice < 16 ? 58 : 35)
    const largo = 2.5
    const punta = raiz.clone().add(v3(0, -Math.sin(angulo) * largo, -Math.cos(angulo) * largo))
    piezas.push(capsula(raiz, punta, 0.22, X, 0.8, 1.3))
    // El tubérculo de la punta, el que se palpa bajo la piel.
    if (fino) piezas.push(elipsoide(punta, 0.24, 0.3, 0.22, 16, 12))
  } else {
    piezas.push(capsula(raiz, raiz.clone().add(v3(0, -0.25, -2.3)), 0.32, X, 0.55, 2.3))
    // En hacha: la punta se ensancha hacia arriba y hacia abajo.
    if (fino) piezas.push(capsula(raiz.clone().add(v3(0, 0.35, -2.15)), raiz.clone().add(v3(0, -0.85, -2.3)), 0.24, X, 0.6, 1))
  }
  return fusionar(piezas)
}

/** Atlas (C1): un anillo con masas laterales, sin cuerpo. */
const atlas = (): THREE.BufferGeometry => {
  const piezas: THREE.BufferGeometry[] = []
  const anillo = capsulaFina ? new THREE.TorusGeometry(1.85, 0.27, 18, 96) : new THREE.TorusGeometry(1.85, 0.27, 12, 48)
  anillo.rotateX(Math.PI / 2)
  anillo.scale(1, 1, 0.88)
  anillo.translate(0, 0, 0.6)
  piezas.push(anillo)
  for (const s of [-1, 1]) {
    piezas.push(elipsoide(v3(s * 1.55, 0, 0.85), 0.55, 0.5, 0.75, 18, 12))
    piezas.push(capsula(v3(s * 1.9, 0, 0.6), v3(s * 3.0, -0.05, 0.4), 0.24, Y, 1, 0.8))
  }
  piezas.push(elipsoide(v3(0, 0, 2.25), 0.35, 0.4, 0.3, 14, 10))
  piezas.push(elipsoide(v3(0, 0, -1.05), 0.3, 0.35, 0.3, 14, 10))
  return fusionar(piezas)
}

/** Axis (C2): vértebra típica con el diente (odontoides) hacia arriba. */
const axis = (n: MedidasDeNivel, detalle: Detalle): THREE.BufferGeometry => {
  const base = vertebraTipica(n, 1, detalle)
  const zc = n.conducto + 0.12 + (n.fondo / 2) * 0.72
  const diente = capsula(v3(0, n.cuerpo * 0.4, zc), v3(0, n.cuerpo * 0.5 + 1.25, zc - 0.05), 0.42, X, 1, 1)
  return fusionar([base, diente])
}

/**
 * Medidas del sacro a lo largo de su eje (t = 0 en el platillo de S1, 1 en el
 * vértice), en cm: medio ancho (las alas, ~10 cm de lado a lado), medio grosor
 * y cuánto queda su centro por delante del conducto. Arriba es tan grueso como
 * el cuerpo de L5 y envuelve el conducto sacro; abajo se adelgaza.
 */
export const PERFIL_DEL_SACRO = {
  ancho: (t: number) => 4.9 * (1 - 0.74 * Math.pow(t, 0.85)),
  grueso: (t: number) => 2.2 * (1 - 0.6 * t),
  adelante: (t: number) => 1.0 - 0.7 * t,
}

/** Sacro: cuña curva, ancha arriba (alas) y angosta abajo, con el conducto dentro. */
const sacro = (modelo: ModeloColumna, indice: number) => {
  const { ancho, grueso, adelante } = PERFIL_DEL_SACRO
  const puntos: THREE.Vector3[] = []
  const pasos = 8
  for (let k = 0; k <= pasos; k++) puntos.push(modelo.punto(indice + k / pasos, 0, adelante(k / pasos)))
  const cuerpoSacro = tuboVariable({
    puntos,
    radio: grueso,
    escalaLateral: (t) => ancho(t) / grueso(t),
    segmentos: capsulaFina ? 64 : 40,
    radiales: capsulaFina ? 64 : 36,
  })
  const coxis = tuboVariable({
    // El cóccix: corto (unos 3 cm), del vértice del sacro hacia abajo y adelante.
    puntos: [modelo.punto(indice + 0.97, 0, 0.32), modelo.punto(indice + 1.5, 0, 0.35), modelo.punto(indice + 2, 0, 0.4)],
    radio: (t) => 0.5 * (1 - 0.6 * t),
    escalaLateral: () => 1.3,
    segmentos: 12,
    radiales: 16,
  })
  return fusionar([cuerpoSacro, coxis])
}

const colocar = (g: THREE.BufferGeometry, k: MarcoColumna) => aMarco(g, k.centro, k.lateral, k.arriba, k.adelante)

// ── Construcción ───────────────────────────────────────────────────────────

export const construirColumna = (modelo: ModeloColumna, detalle: Detalle = 'estandar'): PiezaAnatomica[] => {
  const piezas: PiezaAnatomica[] = []
  const m = modelo.medidas
  capsulaFina = detalle === 'realista'

  m.forEach((n, i) => {
    const fc = modelo.fraccionDeCuerpo(i)
    const desplazamiento = modelo.desplazamiento(i + fc * 0.5)
    if (n.id === 'S') {
      const geo = sacro(modelo, i)
      // En el borde lateral, abajo de las alas: lejos de donde termina la raíz L5,
      // para que los dos rótulos no se encimen en la vista lateral.
      const { ancho, adelante } = PERFIL_DEL_SACRO
      const ancla = modelo.punto(i + 0.78, ancho(0.78) + 0.4, adelante(0.78))
      piezas.push({
        estructura: 'sacro',
        capa: 'columna',
        color: '--cx-anat-hueso',
        acabado: 'hueso',
        geometria: geo,
        ancla,
        desplazamientoDespiece: desplazamiento,
        anclaDespiece: ancla.clone().add(desplazamiento),
      })
      return
    }
    const k = modelo.marco(i + fc * 0.5)
    const geo = colocar(n.id === 'C1' ? atlas() : n.id === 'C2' ? axis(n, detalle) : vertebraTipica(n, i, detalle), k)
    const ancla = modelo.punto(i + fc * 0.5, (n.ancho || 3.4) / 2 + 0.9, n.conducto + 0.6)
    piezas.push({
      estructura: `vertebra-${n.id}`,
      capa: 'columna',
      color: '--cx-anat-hueso',
      acabado: 'hueso',
      geometria: geo,
      ancla,
      desplazamientoDespiece: desplazamiento,
      anclaDespiece: ancla.clone().add(desplazamiento),
    })

    // Disco de abajo (no hay entre el occipital y C1, ni entre C1 y C2).
    if (i === 0) return
    const siguiente = m[i + 1]
    const nombre = `${n.id}-${siguiente.id === 'S' ? 'S1' : siguiente.id}`
    const vDisco = i + fc + (1 - fc) / 2
    const kd = modelo.marco(vDisco)
    const anchoDisco = siguiente.id === 'S' ? n.ancho : (n.ancho + siguiente.ancho) / 2
    const fondoDisco = siguiente.id === 'S' ? n.fondo : (n.fondo + siguiente.fondo) / 2
    const disco = cuerpo(anchoDisco * 0.98, fondoDisco * 0.98, n.disco * 1.02, 1.04, 0.08)
    disco.translate(0, 0, n.conducto + 0.12 + (fondoDisco / 2) * 0.72)
    const dd = modelo.desplazamiento(vDisco)
    const anclaDisco = modelo.punto(vDisco, anchoDisco / 2 + 0.6, n.conducto + 0.9)
    piezas.push({
      estructura: `disco-${nombre}`,
      capa: 'columna',
      color: '--cx-anat-disco',
      acabado: 'disco',
      geometria: colocar(disco, kd),
      ancla: anclaDisco,
      desplazamientoDespiece: dd,
      anclaDespiece: anclaDisco.clone().add(dd),
    })
  })
  capsulaFina = false
  return piezas
}

/** Construye un tubo y, como morph target, su forma con la columna separada. */
const tuboConDespiece = (
  modelo: ModeloColumna,
  muestras: { v: number; lateral: number; adelante: number }[],
  radio: (t: number) => number,
  extra: { escalaLateral?: (t: number) => number; segmentos?: number; radiales?: number; tapas?: boolean } = {},
) => {
  const normal = muestras.map((p) => modelo.punto(p.v, p.lateral, p.adelante))
  const separado = muestras.map((p, i) => normal[i].clone().add(modelo.desplazamiento(p.v)))
  const op = { radio, segmentos: extra.segmentos ?? 40, radiales: extra.radiales ?? 10, escalaLateral: extra.escalaLateral, tapas: extra.tapas }
  const g = tuboVariable({ ...op, puntos: normal })
  const gs = tuboVariable({ ...op, puntos: separado })
  g.morphAttributes.position = [gs.getAttribute('position')]
  g.morphAttributes.normal = [gs.getAttribute('normal')]
  g.morphTargetsRelative = false
  // La geometría separada sólo prestó sus atributos.
  gs.dispose()
  return { g, normal, separado }
}

export const construirMedula = (modelo: ModeloColumna): PiezaAnatomica[] => {
  const piezas: PiezaAnatomica[] = []
  SEGMENTOS_MEDULARES.forEach((seg, i) => {
    const desde = i === 0 ? -0.45 : seg.desde
    const hasta = seg.hasta
    const muestras = Array.from({ length: 5 }, (_, k) => {
      const v = desde + ((hasta - desde) * k) / 4
      return { v, lateral: 0, adelante: 0 }
    })
    const radioEn = (t: number) => modelo.radioMedular(desde + (hasta - desde) * t)
    const ultimo = i === SEGMENTOS_MEDULARES.length - 1
    const { g } = tuboConDespiece(modelo, muestras, ultimo ? (t) => radioEn(t) * (1 - 0.85 * t) : radioEn, {
      escalaLateral: (t) => {
        const v = desde + (hasta - desde) * t
        return 1.12 + 0.28 * campana(v - 4.6, 1.6)
      },
      segmentos: 10,
      radiales: 24,
      tapas: i === 0 || ultimo,
    })
    const medio = (desde + hasta) / 2
    const ancla = modelo.punto(medio, modelo.radioMedular(medio) + 0.25, -0.2)
    piezas.push({
      estructura: `segmento-${seg.raiz}`,
      capa: 'medula',
      color: '--cx-anat-medula',
      acabado: 'nervio',
      geometria: g,
      despiezaPorForma: true,
      ancla,
      anclaDespiece: ancla.clone().add(modelo.desplazamiento(medio)),
    })
  })
  // Filum terminal: el hilo que sigue al cono hasta el cóccix (decorativo).
  const filum = Array.from({ length: 12 }, (_, k) => ({ v: FIN_DEL_CONO + ((24.95 - FIN_DEL_CONO) * k) / 11, lateral: 0, adelante: -0.05 }))
  const { g } = tuboConDespiece(modelo, filum, () => 0.035, { segmentos: 60, radiales: 6 })
  piezas.push({ capa: 'medula', color: '--cx-anat-medula', acabado: 'nervio', geometria: g, despiezaPorForma: true })
  return piezas
}

/** Radio de cada raíz: más gruesas las del plexo braquial y las lumbosacras. */
const grosorDeRaiz = (id: string): number => {
  const n = Number(id.slice(1)) || 0
  if (id.startsWith('C')) return n >= 5 ? 0.15 : 0.1
  if (id.startsWith('T')) return 0.085
  if (id.startsWith('L')) return 0.12 + 0.01 * n
  if (id.startsWith('S')) return Math.max(0.05, 0.16 - 0.025 * n)
  return 0.045
}

export const construirRaices = (modelo: ModeloColumna): PiezaAnatomica[] => {
  const piezas: PiezaAnatomica[] = []
  const cola = RAICES.filter((r) => (coordenadaDeAgujero(r.id) ?? 0) > FIN_DEL_CONO)
  for (const raiz of RAICES) {
    const seg = segmentoDeRaiz(raiz.id)!
    const vf = coordenadaDeAgujero(raiz.id)!
    const vo = Math.max(-0.3, (seg.desde + seg.hasta) / 2)
    const r = grosorDeRaiz(raiz.id)
    const enCola = cola.indexOf(raiz)
    for (const s of [1, -1] as const) {
      const lado = s > 0 ? 'izquierdo' : 'derecho'
      const rm = (v: number) => modelo.radioMedular(v)
      const muestras: { v: number; lateral: number; adelante: number }[] = [
        { v: vo, lateral: s * rm(vo) * 0.8, adelante: -0.02 },
      ]
      const rcF = modelo.medidas[Math.min(Math.floor(Math.max(0, vf)), modelo.medidas.length - 1)].conducto
      const sacra = raiz.region === 'sacra' || raiz.region === 'coccigea'
      // Dentro del conducto: baja paralela a la médula (y en la cola de caballo,
      // en abanico alrededor del filum) hasta llegar a su agujero.
      if (vf - vo > 0.55) {
        const separacion = enCola >= 0 ? 0.16 + 0.055 * (cola.length - enCola) : rm(vo) * 0.95
        const atras = enCola >= 0 ? -0.18 + 0.05 * ((enCola * 7) % 5) : -0.05
        const pasos = Math.max(1, Math.round((vf - vo) / 0.9))
        for (let k = 1; k <= pasos; k++) {
          const v = vo + ((vf - 0.35 - vo) * k) / pasos
          const enCono = v < FIN_DEL_CONO ? Math.max(rm(v) + 0.06, separacion * 0.6) : separacion
          muestras.push({ v, lateral: s * Math.min(enCono, rcF * 0.85), adelante: atras })
        }
      }
      if (sacra && raiz.id !== 'S5' && raiz.id !== 'Co') {
        // Sale por delante, por los agujeros sacros.
        muestras.push({ v: vf, lateral: s * 0.75, adelante: 1.4 })
        muestras.push({ v: vf + 0.02, lateral: s * 1.35, adelante: 3.2 })
        muestras.push({ v: vf + 0.06, lateral: s * 2.1, adelante: 4.6 })
      } else if (sacra) {
        muestras.push({ v: vf, lateral: s * 0.35, adelante: 0.1 })
        muestras.push({ v: vf + 0.3, lateral: s * 0.8, adelante: 0.6 })
      } else {
        const cervical = raiz.region === 'cervical'
        const lumbar = raiz.region === 'lumbar'
        // L5 sale por el agujero L5-S1 y baja por delante del ala del sacro (el
        // tronco lumbosacro): si siguiera como las otras lumbares, cruzaría el hueso.
        const sobreElAla = raiz.id === 'L5'
        muestras.push({ v: vf, lateral: s * (rcF + 0.4), adelante: 0.12 })
        muestras.push({ v: vf + (lumbar ? 0.18 : 0.08), lateral: s * (rcF + 1.6), adelante: cervical ? 0.55 : sobreElAla ? 1.1 : 0.3 })
        muestras.push({ v: vf + (lumbar ? 0.45 : 0.22), lateral: s * (rcF + (lumbar ? 3.4 : 3.0)), adelante: cervical ? 1.2 : sobreElAla ? 3.2 : lumbar ? 1.3 : 0.6 })
      }
      const { g, separado, normal } = tuboConDespiece(modelo, muestras, (t) => r * (0.65 + 0.35 * pasoSuave(0, 0.25, t)) * (1 - 0.25 * pasoSuave(0.8, 1, t)), {
        segmentos: Math.max(24, muestras.length * 10),
        radiales: 10,
      })
      piezas.push({
        estructura: idDeRaiz(raiz.id, lado),
        capa: 'raices',
        color: '--cx-anat-raiz',
        acabado: 'nervio',
        geometria: g,
        despiezaPorForma: true,
        ancla: normal[normal.length - 1].clone(),
        anclaDespiece: separado[separado.length - 1].clone(),
      })
    }
  }
  return piezas
}

/**
 * Hernia de disco: un abultamiento posterior del disco, en la posición que
 * dice la marca. Se cuelga del disco para moverse con él al despiezar.
 */
export const geometriaDeHernia = (
  modelo: ModeloColumna,
  disco: string,
  posicion: 'central' | 'paracentral' | 'foraminal',
  lado: 'izquierdo' | 'derecho' | 'ambos',
): THREE.BufferGeometry | null => {
  const arriba = disco.split('-')[0]
  const i = modelo.medidas.findIndex((n) => n.id === arriba)
  if (i < 0) return null
  const n = modelo.medidas[i]
  const fc = modelo.fraccionDeCuerpo(i)
  const v = i + fc + (1 - fc) / 2
  const k = modelo.marco(v)
  const rc = n.conducto
  const escala = n.region === 'lumbar' ? 1 : n.region === 'toracica' ? 0.75 : 0.62
  const lados = posicion === 'central' ? [0] : lado === 'ambos' ? [1, -1] : [lado === 'izquierdo' ? 1 : -1]
  const piezas = lados.map((s) => {
    const x = posicion === 'central' ? 0 : posicion === 'paracentral' ? s * rc * 0.55 : s * (rc + 0.3)
    const z = posicion === 'foraminal' ? rc * 0.25 : rc * 0.05
    const g = elipsoide(v3(x, 0, z + 0.12), (posicion === 'central' ? 0.75 : 0.5) * escala, n.disco * 0.55, 0.42 * escala, 24, 16)
    return aMarco(g, k.centro, k.lateral, k.arriba, k.adelante)
  })
  return fusionar(piezas)
}

