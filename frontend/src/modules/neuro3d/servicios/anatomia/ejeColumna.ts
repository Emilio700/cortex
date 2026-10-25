/**
 * El eje de la columna y su despiece, como funciones puras.
 *
 * El eje se dibuja con su perfil sagital: la inclinación del conducto respecto
 * de la vertical en cada nivel, integrada de arriba abajo desde el agujero
 * magno. Antes eran puntos sueltos puestos a ojo y la curva lumbosacra salió
 * exagerada (el sacro bajaba como una cola); con el perfil, las lordosis, la
 * cifosis y la pendiente sacra son números que una prueba puede medir.
 *
 * Convención (la de `vistas.ts`): +y arriba, +z hacia delante. Una inclinación
 * positiva quiere decir que, al bajar, el conducto avanza hacia delante.
 *
 * Valores de referencia de un adulto de pie (aproximados, varían entre
 * personas): lordosis cervical C2–C7 de 20° a 40°, cifosis torácica T4–T12 de
 * 20° a 50°, lordosis lumbar L1–S1 de 40° a 60° y pendiente sacra de 30° a 40°.
 */
import * as THREE from 'three'

/** Lo que el eje necesita saber de cada nivel: cuánto mide a lo largo del conducto. */
export interface AlturaDeNivel {
  /** Altura del cuerpo (o del anillo, o del sacro entero), en cm. */
  cuerpo: number
  /** Altura del disco de abajo, en cm (cero en el sacro). */
  disco: number
}

/** Dónde arranca el conducto: el agujero magno, fijo bajo el encéfalo. */
export const ORIGEN_DEL_EJE = new THREE.Vector3(0, -8.2, -1.6)
/** C1 arranca este tramo (cm) por debajo del agujero magno. */
export const ARRANQUE_DE_C1 = 1.3
/** Largo del cóccix (cm), del vértice del sacro a su punta. */
export const LARGO_DEL_COXIS = 3

/**
 * Inclinación del eje (grados) por coordenada vertebral. Entre dos puntos se
 * interpola en línea recta: la curvatura queda por tramos y el eje, sin
 * quiebres.
 *
 *  - Lordosis cervical: de +14° bajo el agujero magno a −16° en C7-T1.
 *  - Cifosis torácica: de −19° en T3 a +16° en T12-L1.
 *  - Lordosis lumbar: de +16° en L1 a −36° en el platillo de S1 (52°).
 *  - Sacro: sale hacia atrás con 36° de pendiente y se endereza hacia el vértice
 *    (la cifosis sacra); el cóccix se curva hacia delante.
 */
export const PERFIL_SAGITAL: readonly (readonly [v: number, grados: number])[] = [
  [-0.6, 14],
  [1.5, 12],
  [4.0, 0],
  [7.0, -16],
  [9.5, -19],
  [13.5, -3],
  [17.5, 14],
  [19.0, 16],
  [20.5, 12],
  [21.5, 2],
  [22.5, -12],
  [23.5, -26],
  [24.0, -36],
  [24.3, -36],
  [24.6, -27],
  [25.0, -6],
  [26.0, 18],
]

/** Inclinación del eje en una coordenada vertebral, en grados. */
export const inclinacionEn = (v: number): number => {
  const p = PERFIL_SAGITAL
  if (v <= p[0][0]) return p[0][1]
  for (let k = 0; k < p.length - 1; k++) {
    const [v0, g0] = p[k]
    const [v1, g1] = p[k + 1]
    if (v <= v1) return g0 + ((g1 - g0) * (v - v0)) / (v1 - v0)
  }
  return p[p.length - 1][1]
}

/** Dónde empieza cada nivel, en cm de conducto desde el agujero magno. */
export const iniciosDeNiveles = (niveles: AlturaDeNivel[]): number[] => {
  const inicio: number[] = []
  let s = ARRANQUE_DE_C1
  for (const n of niveles) {
    inicio.push(s)
    s += n.cuerpo + n.disco
  }
  return inicio
}

/**
 * Convierte la coordenada vertebral en cm de conducto. Más allá del sacro
 * (v > número de niveles) se recorre el cóccix.
 */
export const crearLongitud = (niveles: AlturaDeNivel[]) => {
  const inicio = iniciosDeNiveles(niveles)
  const ultimo = niveles.length - 1
  const fin = inicio[ultimo] + niveles[ultimo].cuerpo + niveles[ultimo].disco
  const largo = fin + LARGO_DEL_COXIS
  const sDeV = (v: number): number => {
    if (v < 0) return Math.max(0, inicio[0] + v * (niveles[0].cuerpo + niveles[0].disco))
    if (v >= niveles.length) return Math.min(largo, fin + (v - niveles.length) * LARGO_DEL_COXIS)
    const i = Math.floor(v)
    return inicio[i] + (v - i) * (niveles[i].cuerpo + niveles[i].disco)
  }
  /** La inversa, para leer el perfil (que va por coordenada vertebral) a lo largo del eje. */
  const vDeS = (s: number): number => {
    if (s < inicio[0]) return (s - inicio[0]) / (niveles[0].cuerpo + niveles[0].disco)
    if (s >= fin) return niveles.length + (s - fin) / LARGO_DEL_COXIS
    let i = 0
    while (i < ultimo && s >= inicio[i + 1]) i++
    return i + (s - inicio[i]) / (niveles[i].cuerpo + niveles[i].disco)
  }
  return { inicio, largo, sDeV, vDeS }
}

/**
 * Puntos del eje del conducto cada `paso` cm, integrando la inclinación desde
 * el agujero magno (regla del punto medio). Salen tan juntos que una curva que
 * pase por ellos mide lo mismo que el eje.
 */
export const trazarEje = (niveles: AlturaDeNivel[], paso = 0.5): THREE.Vector3[] => {
  const { largo, vDeS } = crearLongitud(niveles)
  const puntos = [ORIGEN_DEL_EJE.clone()]
  const n = Math.ceil(largo / paso)
  const ds = largo / n
  let y = ORIGEN_DEL_EJE.y
  let z = ORIGEN_DEL_EJE.z
  for (let k = 0; k < n; k++) {
    const a = THREE.MathUtils.degToRad(inclinacionEn(vDeS((k + 0.5) * ds)))
    y -= ds * Math.cos(a)
    z += ds * Math.sin(a)
    puntos.push(new THREE.Vector3(0, y, z))
  }
  return puntos
}

// ── Despiece ───────────────────────────────────────────────────────────────

/**
 * Cuánto de cada junta (disco) se ha abierto al bajar hasta `v`: el entero
 * cuenta las juntas ya pasadas y la fracción, lo recorrido dentro del disco.
 * Los cuerpos no se estiran; sólo los discos.
 */
export const crearJuntas = (niveles: AlturaDeNivel[]) => {
  const fraccionDeCuerpo = (i: number) => niveles[i].cuerpo / (niveles[i].cuerpo + niveles[i].disco)
  return (v: number): number => {
    if (v <= 0) return 0
    const i = Math.min(Math.floor(v), niveles.length - 1)
    if (i >= niveles.length - 1) return niveles.length - 1
    const f = v - i
    const fc = fraccionDeCuerpo(i)
    return i + (f <= fc ? 0 : (f - fc) / (1 - fc))
  }
}

/**
 * Desplazamiento de la columna despiezada (al 100 %) en una coordenada.
 *
 * Cada junta se abre `separacion` cm a lo largo de la tangente del eje en su
 * disco, y lo de abajo se lleva la suma de las juntas de arriba. Así cada
 * vértebra se aparta de la de arriba siguiendo la curva y el conducto sigue
 * alineado con la médula. Antes todo bajaba en vertical: donde la columna se
 * inclina (la lordosis lumbar, el sacro), las vértebras quedaban corridas a un
 * lado del conducto.
 *
 * `tangentes[j]` es la tangente (hacia abajo, unitaria) en el disco de la
 * junta j; el resultado no tiene componente lateral si ellas no la tienen.
 */
export const crearDesplazamiento = (
  juntas: (v: number) => number,
  tangentes: THREE.Vector3[],
  separacion: number,
) => {
  // Suma acumulada: acumulado[j] es el desplazamiento con las juntas 0…j-1 abiertas.
  const acumulado: THREE.Vector3[] = [new THREE.Vector3()]
  for (const t of tangentes) acumulado.push(acumulado[acumulado.length - 1].clone().addScaledVector(t, separacion))
  return (v: number): THREE.Vector3 => {
    const j = Math.max(0, Math.min(juntas(v), tangentes.length))
    const entero = Math.floor(j)
    const resultado = acumulado[entero].clone()
    if (entero < tangentes.length) resultado.addScaledVector(tangentes[entero], separacion * (j - entero))
    return resultado
  }
}
