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
import type { AjusteDelEje } from '../../dominio/ajusteRadiografico'

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
 *
 * Con un `eje` ajustado (radiografía del paciente) se integra también la
 * inclinación coronal. Sin él, el cálculo es exactamente el de siempre. La
 * listesis no entra aquí: si se integrara, el escalón del disco torcería la
 * tangente y con ella las vértebras vecinas; se suma después, a las posiciones
 * (`EjeAjustado.desplazamiento`).
 */
export const trazarEje = (
  niveles: AlturaDeNivel[],
  paso = 0.5,
  eje?: Pick<EjeAjustado, 'sagital' | 'coronal'>,
): THREE.Vector3[] => {
  const { largo, vDeS } = crearLongitud(niveles)
  const puntos = [ORIGEN_DEL_EJE.clone()]
  const n = Math.ceil(largo / paso)
  const ds = largo / n
  let x = ORIGEN_DEL_EJE.x
  let y = ORIGEN_DEL_EJE.y
  let z = ORIGEN_DEL_EJE.z
  for (let k = 0; k < n; k++) {
    const v = vDeS((k + 0.5) * ds)
    if (!eje) {
      const a = THREE.MathUtils.degToRad(inclinacionEn(v))
      y -= ds * Math.cos(a)
      z += ds * Math.sin(a)
    } else {
      // Las dos radiografías miden la inclinación proyectada: la lateral, la de
      // (z, y); la AP, la de (x, y). La dirección que cumple las dos es (tan b, −1, tan a).
      const a = THREE.MathUtils.degToRad(eje.sagital(v))
      const b = THREE.MathUtils.degToRad(eje.coronal(v))
      const ta = Math.tan(a)
      const tb = Math.tan(b)
      const f = ds / Math.sqrt(1 + ta * ta + tb * tb)
      x += f * tb
      y -= f
      z += f * ta
    }
    puntos.push(new THREE.Vector3(x, y, z))
  }
  return puntos
}

// ── Ajuste a las medidas del paciente (radiografía) ────────────────────────

/** Un perfil de inclinación, en grados, por coordenada vertebral. */
export type Perfil = (v: number) => number

/** El eje ya resuelto: perfiles sagital y coronal, y desplazamiento por listesis. */
export interface EjeAjustado {
  sagital: Perfil
  coronal: Perfil
  /**
   * Cuánto se corre el conducto hacia delante (cm, en el marco del eje) en una
   * coordenada: cero arriba de la listesis y, cruzando su disco, lo de abajo se
   * va hacia atrás. Las vértebras se trasladan enteras, sin girar.
   */
  desplazamiento: (v: number) => number
}

/** Cuántas vértebras tarda en desvanecerse la corrección más allá de lo medido. */
export const TRANSICION_DEL_AJUSTE = 1.5

/**
 * El perfil `base` corregido para pasar por los `puntos` medidos.
 *
 * Entre dos puntos la corrección (medido − base) se interpola en línea recta,
 * así que la forma esquemática se conserva entre ellos; fuera de lo medido se
 * desvanece en `TRANSICION_DEL_AJUSTE` vértebras. Donde no se marcó nada manda
 * el modelo: no se inventa una curva que la radiografía no mostró.
 */
export const crearPerfilAjustado = (base: Perfil, puntos: { v: number; grados: number }[]): Perfil => {
  if (puntos.length === 0) return base
  // Un mismo punto marcado dos veces (p. ej. sin disco entre medias) se promedia.
  const porV = new Map<number, number[]>()
  for (const p of puntos) porV.set(p.v, [...(porV.get(p.v) ?? []), p.grados])
  const nudos = [...porV.entries()]
    .map(([v, g]) => ({ v, d: g.reduce((t, x) => t + x, 0) / g.length - base(v) }))
    .sort((a, b) => a.v - b.v)
  const primero = nudos[0]
  const ultimo = nudos[nudos.length - 1]
  const correccion = (v: number): number => {
    if (v <= primero.v) return primero.d * Math.max(0, 1 - (primero.v - v) / TRANSICION_DEL_AJUSTE)
    if (v >= ultimo.v) return ultimo.d * Math.max(0, 1 - (v - ultimo.v) / TRANSICION_DEL_AJUSTE)
    let k = 0
    while (v > nudos[k + 1].v) k++
    const a = nudos[k]
    const b = nudos[k + 1]
    return a.d + ((b.d - a.d) * (v - a.v)) / (b.v - a.v)
  }
  return (v) => base(v) + correccion(v)
}

const suave = (t: number) => {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

/** Nivel con su fondo (largo del platillo, cm), para pasar la listesis de fracción a cm. */
export type NivelConFondo = AlturaDeNivel & { fondo?: number }

/** Las alturas de los discos medidos, a la proporción del paciente. Los demás quedan igual. */
export const ajustarAlturas = <T extends AlturaDeNivel>(niveles: T[], ajuste: AjusteDelEje): T[] =>
  niveles.map((n, i) => {
    const d = ajuste.discos.find((x) => x.nivel === i)
    if (!d || n.disco <= 0 || n.cuerpo <= 0) return n
    // Se acota: un punto mal puesto no debe volver un disco una losa ni hacerlo desaparecer.
    const disco = Math.min(3, Math.max(0.1, d.indice)) * n.cuerpo
    return { ...n, disco }
  })

/** Resuelve un `AjusteDelEje` (por platillo y nivel) a perfiles por coordenada vertebral. */
export const resolverAjuste = (niveles: NivelConFondo[], ajuste: AjusteDelEje): EjeAjustado => {
  const fc = (i: number) => niveles[i].cuerpo / (niveles[i].cuerpo + niveles[i].disco)
  const vDe = (p: { nivel: number; platillo: 'superior' | 'inferior' }) => (p.platillo === 'superior' ? p.nivel : p.nivel + fc(p.nivel))
  const valido = (p: { nivel: number }) => p.nivel >= 0 && p.nivel < niveles.length
  const sagital = crearPerfilAjustado(
    inclinacionEn,
    ajuste.sagital.filter(valido).map((p) => ({ v: vDe(p), grados: p.grados })),
  )
  const coronal = crearPerfilAjustado(
    () => 0,
    ajuste.coronal.filter(valido).map((p) => ({ v: vDe(p), grados: p.grados })),
  )
  const saltos = ajuste.listesis
    .filter((l) => l.nivel >= 0 && l.nivel < niveles.length - 1)
    .map((l) => {
      const abajo = niveles[l.nivel + 1]
      // El platillo del sacro no es su «fondo» entero: se usa el de L5.
      const fondo = (l.nivel + 1 === niveles.length - 1 ? niveles[l.nivel].fondo : abajo.fondo) ?? 3
      const inicio = l.nivel + fc(l.nivel)
      // Al bajar se cruza el disco: lo de abajo queda atrás de lo de arriba.
      return { inicio, largo: 1 - fc(l.nivel), cm: -l.fraccion * fondo }
    })
  const desplazamiento = (v: number) => saltos.reduce((t, s) => t + s.cm * suave((v - s.inicio) / s.largo), 0)
  return { sagital, coronal, desplazamiento }
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
