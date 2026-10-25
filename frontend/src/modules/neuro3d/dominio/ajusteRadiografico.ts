/**
 * Mediciones de la columna a partir de los puntos que el médico marca sobre
 * una radiografía AP y una lateral, y su conversión a los parámetros del eje de
 * Neuro 3D.
 *
 * Es una **aproximación**: la radiografía es una proyección y aquí sólo se miden
 * inclinaciones de platillos, desplazamientos y proporciones. La forma de cada
 * vértebra del modelo no cambia; lo que cambia es cómo se apilan.
 *
 * El servidor repite estas fórmulas en Python (`backend/app/services/columna_rx.py`)
 * y guarda lo que calcula él; `paridadRx.json` vigila que las dos digan lo mismo.
 * Si cambias una fórmula aquí, cambia `VERSION_CALCULO_RX`, regenera el archivo
 * (`generarParidadRx.ts`) y corrige el servidor.
 *
 * Convenciones:
 *  - Puntos en píxeles de la imagen: x a la derecha, y hacia abajo.
 *  - Lateral: «adelante» sale de las propias esquinas (anterior − posterior); no
 *    se supone hacia dónde mira el paciente en la placa.
 *  - Inclinación sagital de un platillo: grados con que su borde anterior queda
 *    más alto que el posterior. Es también la inclinación del eje en ese punto
 *    (al bajar, el conducto avanza si es positiva), la misma convención que
 *    `PERFIL_SAGITAL` de `ejeColumna.ts`.
 *  - Inclinación coronal de un platillo: grados con que su lado izquierdo **del
 *    paciente** queda más alto. Al bajar, el eje se va hacia ese lado (+x en la
 *    escena es la izquierda del paciente).
 */

export const VERSION_CALCULO_RX = '1'

export interface Punto {
  x: number
  y: number
}

/** Esquinas del cuerpo en la lateral: platillo superior/inferior, borde anterior/posterior. */
export type EsquinaLateral = 'sa' | 'sp' | 'ia' | 'ip'
/** Extremos de los platillos en la AP: superior/inferior, izquierda/derecha **de la imagen**. */
export type EsquinaAP = 'si' | 'sd' | 'ii' | 'id'

export interface MarcasRx {
  lateral: {
    vertebras: Record<string, Partial<Record<EsquinaLateral, Punto>>>
    /** Centros de las cabezas femorales: uno o dos (se usa su punto medio, el eje de las caderas). */
    caderas: Punto[]
  }
  ap: {
    vertebras: Record<string, Partial<Record<EsquinaAP, Punto>>>
  }
}

export type Calibracion =
  | { tipo: 'ninguna' }
  /** Espaciado del píxel del DICOM, en mm (columna = x, fila = y). */
  | { tipo: 'dicom'; mmPorPxX: number; mmPorPxY: number }
  /** Una distancia conocida que el médico marcó sobre la imagen. */
  | { tipo: 'referencia'; a: Punto; b: Punto; mm: number }

export interface CalibracionesRx {
  lateral: Calibracion
  ap: Calibracion
}

export interface OpcionesRx {
  /** De qué lado de la imagen AP queda la derecha del paciente (convención radiológica: izquierda). */
  derechaDelPaciente: 'izquierda' | 'derecha'
  /** Vértebras límite elegidas por el médico; sin ellas, las busca el sistema. */
  cobbCoronal?: { superior: string; inferior: string } | null
}

export const OPCIONES_POR_OMISION: OpcionesRx = { derechaDelPaciente: 'izquierda', cobbCoronal: null }

/** Vértebras que se pueden marcar, de arriba abajo. El sacro se marca como «S1» (su platillo). */
export const VERTEBRAS_RX: string[] = [
  ...[2, 3, 4, 5, 6, 7].map((n) => `C${n}`),
  ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `L${i + 1}`),
  'S1',
]

/** Índice de la vértebra en `NIVELES_VERTEBRALES` (C1 = 0 … sacro = 24). */
export const indiceDeVertebra = (id: string): number => {
  if (id === 'S1' || id === 'S') return 24
  const n = Number(id.slice(1))
  if (id.startsWith('C')) return n - 1
  if (id.startsWith('T')) return 6 + n
  if (id.startsWith('L')) return 18 + n
  return -1
}

const ordenRx = (id: string) => VERTEBRAS_RX.indexOf(id)

// ── Aritmética común (la misma en Python) ─────────────────────────────────

/** Redondeo a `decimales`, la mitad hacia arriba (como `services/columna_rx.py`). */
export const redondear = (x: number, decimales = 1): number => {
  const f = 10 ** decimales
  const r = Math.floor(Math.abs(x) * f + 0.5 + 1e-9) / f
  const s = x < 0 && r !== 0 ? -r : r
  return Object.is(s, -0) ? 0 : s
}

const grados = (rad: number) => (rad * 180) / Math.PI

/** mm por píxel en x e y; `null` si la imagen no trae escala. */
export const escalaDe = (c: Calibracion): { x: number; y: number } | null => {
  if (c.tipo === 'dicom') return c.mmPorPxX > 0 && c.mmPorPxY > 0 ? { x: c.mmPorPxX, y: c.mmPorPxY } : null
  if (c.tipo === 'referencia') {
    const px = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)
    return px > 0 && c.mm > 0 ? { x: c.mm / px, y: c.mm / px } : null
  }
  return null
}

/**
 * Factores para medir ángulos. Los ángulos no dependen de la escala, salvo que el
 * píxel no sea cuadrado (DICOM con espaciado distinto en x y en y): entonces se
 * miden sobre milímetros.
 */
const factoresDeForma = (c: Calibracion): { x: number; y: number } => {
  const e = escalaDe(c)
  return e ? { x: 1, y: e.y / e.x } : { x: 1, y: 1 }
}

const distancia = (a: Punto, b: Punto, f: { x: number; y: number }) => Math.hypot((b.x - a.x) * f.x, (b.y - a.y) * f.y)

// ── Lateral ───────────────────────────────────────────────────────────────

/** +1 si lo anterior está a la derecha de la imagen; −1 si a la izquierda. */
export const sentidoAnterior = (lateral: MarcasRx['lateral']): 1 | -1 => {
  let suma = 0
  for (const v of Object.values(lateral.vertebras)) {
    if (v.sa && v.sp) suma += v.sa.x - v.sp.x
    if (v.ia && v.ip) suma += v.ia.x - v.ip.x
  }
  return suma < 0 ? -1 : 1
}

/** Un vector de la imagen en coordenadas anatómicas de la lateral: (adelante, arriba). */
const aAnatomico = (d: Punto, s: 1 | -1, f: { x: number; y: number }) => ({ ad: d.x * f.x * s, ar: -d.y * f.y })

/** Inclinación sagital del platillo de `anterior` a `posterior` (borde anterior arriba = +). */
const inclinacionSagital = (anterior: Punto, posterior: Punto, s: 1 | -1, f: { x: number; y: number }) => {
  const v = aAnatomico({ x: anterior.x - posterior.x, y: anterior.y - posterior.y }, s, f)
  return grados(Math.atan2(v.ar, v.ad))
}

/** Inclinación coronal (lado izquierdo del paciente arriba = +) del platillo con esos dos extremos. */
const inclinacionCoronal = (p: Punto, q: Punto, derecha: OpcionesRx['derechaDelPaciente'], f: { x: number; y: number }) => {
  const [izq, der] = p.x <= q.x ? [p, q] : [q, p]
  // + = el lado derecho de la imagen queda más alto.
  const t = grados(Math.atan2(-(der.y - izq.y) * f.y, (der.x - izq.x) * f.x))
  // Con la derecha del paciente a la izquierda de la imagen, la derecha de la imagen es su izquierda.
  return derecha === 'izquierda' ? t : -t
}

export type Platillo = 'superior' | 'inferior'

export interface InclinacionMedida {
  vertebra: string
  platillo: Platillo
  grados: number
}

export interface AnguloCobb {
  grados: number
  superior: string
  inferior: string
}

export interface CobbCoronal extends AnguloCobb {
  /** Hacia qué lado del paciente es convexa la curva. */
  convexidad: 'derecha' | 'izquierda'
  /** Lo eligió el sistema (o el médico cambió las vértebras límite). */
  automatico: boolean
  /** Cobb ≥ 10°: escoliosis (definición de la SRS, verificar). */
  escoliosis: boolean
}

export interface Listesis {
  /** «L4-L5». */
  nivel: string
  superior: string
  inferior: string
  /** % del platillo de abajo; + = la de arriba va hacia delante (anterolistesis). */
  porcentaje: number
  /** Grado de Meyerding (1–5); `null` en la retrolistesis, que no se gradúa así. */
  grado: number | null
  /** Por encima del umbral de lo que se distingue al marcar a mano. */
  apreciable: boolean
  mm: number | null
}

export interface AlturaDiscal {
  nivel: string
  superior: string
  inferior: string
  /** Altura media del disco ÷ altura media del cuerpo de arriba. */
  indice: number
  mm: number | null
}

export interface ParametrosPelvicos {
  incidencia: number
  inclinacion: number
  pendienteSacra: number
}

export interface ResultadoRx {
  version: string
  lordosisLumbar: AnguloCobb | null
  cifosisToracica: AnguloCobb | null
  cobbCoronal: CobbCoronal | null
  listesis: Listesis[]
  discos: AlturaDiscal[]
  pelvis: ParametrosPelvicos | null
  inclinacionesSagitales: InclinacionMedida[]
  inclinacionesCoronales: InclinacionMedida[]
  /** Qué escala tuvo cada vista: con ella dependen los mm. */
  escala: { lateral: Calibracion['tipo']; ap: Calibracion['tipo'] }
  /** Lo que no se pudo calcular y por qué, en palabras. */
  faltan: string[]
}

/** Desde qué % se da por apreciable una listesis marcada a mano (verificar). */
export const UMBRAL_LISTESIS = 5
/** Cobb coronal desde el que se habla de escoliosis (SRS, verificar). */
export const UMBRAL_ESCOLIOSIS = 10

export const gradoDeMeyerding = (porcentaje: number): number | null => {
  if (porcentaje <= 0) return null
  if (porcentaje <= 25) return 1
  if (porcentaje <= 50) return 2
  if (porcentaje <= 75) return 3
  if (porcentaje <= 100) return 4
  return 5
}

const nivelDeDisco = (sup: string, inf: string) => `${sup}-${inf}`

/** Calcula todo lo que los puntos permiten. Lo que falta se dice en `faltan`. */
export const calcularRx = (marcas: MarcasRx, cal: CalibracionesRx, op: OpcionesRx = OPCIONES_POR_OMISION): ResultadoRx => {
  const faltan: string[] = []
  const lat = marcas.lateral
  const s = sentidoAnterior(lat)
  const fL = factoresDeForma(cal.lateral)
  const escL = escalaDe(cal.lateral)
  const vl = (id: string) => lat.vertebras[id] ?? {}

  // Inclinación de cada platillo marcado en la lateral, de arriba abajo.
  const inclinacionesSagitales: InclinacionMedida[] = []
  for (const id of VERTEBRAS_RX) {
    const v = vl(id)
    if (v.sa && v.sp) inclinacionesSagitales.push({ vertebra: id, platillo: 'superior', grados: inclinacionSagital(v.sa, v.sp, s, fL) })
    if (id !== 'S1' && v.ia && v.ip) inclinacionesSagitales.push({ vertebra: id, platillo: 'inferior', grados: inclinacionSagital(v.ia, v.ip, s, fL) })
  }
  const sagital = (id: string, p: Platillo) => inclinacionesSagitales.find((i) => i.vertebra === id && i.platillo === p)?.grados

  // Lordosis lumbar: platillo superior de L1 contra platillo de S1 (Cobb 1948).
  const tL1 = sagital('L1', 'superior')
  const tS1 = sagital('S1', 'superior')
  const lordosisLumbar = tL1 !== undefined && tS1 !== undefined ? { grados: redondear(tL1 - tS1), superior: 'L1', inferior: 'S1' } : null
  if (!lordosisLumbar) faltan.push('Lordosis lumbar: marca el platillo superior de L1 y el de S1 en la lateral.')

  // Cifosis torácica: platillo superior de T4 contra el inferior de T12.
  const tT4 = sagital('T4', 'superior')
  const tT12 = sagital('T12', 'inferior')
  const cifosisToracica = tT4 !== undefined && tT12 !== undefined ? { grados: redondear(tT12 - tT4), superior: 'T4', inferior: 'T12' } : null
  if (!cifosisToracica) faltan.push('Cifosis torácica: marca el platillo superior de T4 y el inferior de T12 en la lateral.')

  // Listesis y altura de disco, por pares de vértebras vecinas.
  const listesis: Listesis[] = []
  const discos: AlturaDiscal[] = []
  for (let k = 0; k < VERTEBRAS_RX.length - 1; k++) {
    const idA = VERTEBRAS_RX[k]
    const idB = VERTEBRAS_RX[k + 1]
    const a = vl(idA)
    const b = vl(idB)
    if (!(b.sa && b.sp)) continue
    const ancho = distancia(b.sp, b.sa, fL)
    if (a.ip && ancho > 0) {
      // Taillard: cuánto avanza la esquina posteroinferior de arriba sobre el platillo de abajo.
      const ux = ((b.sa.x - b.sp.x) * fL.x) / ancho
      const uy = ((b.sa.y - b.sp.y) * fL.y) / ancho
      const avance = (a.ip.x - b.sp.x) * fL.x * ux + (a.ip.y - b.sp.y) * fL.y * uy
      const porcentaje = (avance / ancho) * 100
      listesis.push({
        nivel: nivelDeDisco(idA, idB),
        superior: idA,
        inferior: idB,
        porcentaje: redondear(porcentaje),
        grado: gradoDeMeyerding(redondear(porcentaje)),
        apreciable: Math.abs(redondear(porcentaje)) >= UMBRAL_LISTESIS,
        mm: escL ? redondear((avance / fL.x) * escL.x) : null,
      })
    }
    if (a.sa && a.sp && a.ia && a.ip) {
      const anterior = distancia(a.ia, b.sa, fL)
      const posterior = distancia(a.ip, b.sp, fL)
      const cuerpo = (distancia(a.sa, a.ia, fL) + distancia(a.sp, a.ip, fL)) / 2
      if (cuerpo > 0) {
        const disco = (anterior + posterior) / 2
        discos.push({
          nivel: nivelDeDisco(idA, idB),
          superior: idA,
          inferior: idB,
          indice: redondear(disco / cuerpo, 2),
          mm: escL ? redondear((disco / fL.x) * escL.x) : null,
        })
      }
    }
  }

  // Parámetros pélvicos (Legaye, Duval-Beaupère 1998).
  let pelvis: ParametrosPelvicos | null = null
  const s1 = vl('S1')
  if (s1.sa && s1.sp && lat.caderas.length > 0) {
    const h = {
      x: lat.caderas.reduce((t, p) => t + p.x, 0) / lat.caderas.length,
      y: lat.caderas.reduce((t, p) => t + p.y, 0) / lat.caderas.length,
    }
    const m = { x: (s1.sa.x + s1.sp.x) / 2, y: (s1.sa.y + s1.sp.y) / 2 }
    const e = aAnatomico({ x: s1.sa.x - s1.sp.x, y: s1.sa.y - s1.sp.y }, s, fL)
    const mh = aAnatomico({ x: h.x - m.x, y: h.y - m.y }, s, fL)
    const pendienteSacra = -grados(Math.atan2(e.ar, e.ad))
    // PT: la línea de las caderas al centro de S1 contra la vertical; + si las caderas quedan delante.
    const inclinacion = grados(Math.atan2(mh.ad, -mh.ar))
    // PI: esa línea contra la perpendicular al platillo, hacia dentro del sacro.
    const n = { ad: e.ar, ar: -e.ad }
    const incidencia = Math.abs(grados(Math.atan2(n.ad * mh.ar - n.ar * mh.ad, n.ad * mh.ad + n.ar * mh.ar)))
    pelvis = { incidencia: redondear(incidencia), inclinacion: redondear(inclinacion), pendienteSacra: redondear(pendienteSacra) }
  } else {
    faltan.push('Parámetros pélvicos: marca el platillo de S1 y al menos una cabeza femoral en la lateral.')
  }

  // AP: inclinación coronal de cada platillo y Cobb.
  const fA = factoresDeForma(cal.ap)
  const inclinacionesCoronales: InclinacionMedida[] = []
  for (const id of VERTEBRAS_RX) {
    const v = marcas.ap.vertebras[id] ?? {}
    if (v.si && v.sd) inclinacionesCoronales.push({ vertebra: id, platillo: 'superior', grados: inclinacionCoronal(v.si, v.sd, op.derechaDelPaciente, fA) })
    if (id !== 'S1' && v.ii && v.id) inclinacionesCoronales.push({ vertebra: id, platillo: 'inferior', grados: inclinacionCoronal(v.ii, v.id, op.derechaDelPaciente, fA) })
  }
  const cobbCoronal = cobbCoronalDe(inclinacionesCoronales, op.cobbCoronal ?? null)
  if (!cobbCoronal) {
    faltan.push(
      op.cobbCoronal
        ? `Cobb coronal: faltan los platillos de ${op.cobbCoronal.superior} (superior) o de ${op.cobbCoronal.inferior} (inferior) en la AP.`
        : 'Cobb coronal: marca los platillos de al menos dos vértebras en la AP.',
    )
  }

  return {
    version: VERSION_CALCULO_RX,
    lordosisLumbar,
    cifosisToracica,
    cobbCoronal,
    listesis,
    discos,
    pelvis,
    inclinacionesSagitales: inclinacionesSagitales.map((i) => ({ ...i, grados: redondear(i.grados) })),
    inclinacionesCoronales: inclinacionesCoronales.map((i) => ({ ...i, grados: redondear(i.grados) })),
    escala: { lateral: cal.lateral.tipo, ap: cal.ap.tipo },
    faltan,
  }
}

/**
 * Cobb coronal (Cobb 1948): entre el platillo superior de la vértebra límite de
 * arriba y el inferior de la de abajo. Sin elección del médico, se toma el par
 * con mayor diferencia de inclinación (la curva mayor).
 */
export const cobbCoronalDe = (
  inclinaciones: InclinacionMedida[],
  eleccion: { superior: string; inferior: string } | null,
): CobbCoronal | null => {
  const sup = inclinaciones.filter((i) => i.platillo === 'superior')
  const inf = inclinaciones.filter((i) => i.platillo === 'inferior')
  let mejor: { a: InclinacionMedida; b: InclinacionMedida; d: number } | null = null
  if (eleccion) {
    const a = sup.find((i) => i.vertebra === eleccion.superior)
    const b = inf.find((i) => i.vertebra === eleccion.inferior)
    if (!a || !b || ordenRx(a.vertebra) >= ordenRx(b.vertebra)) return null
    mejor = { a, b, d: a.grados - b.grados }
  } else {
    for (const a of sup) {
      for (const b of inf) {
        if (ordenRx(b.vertebra) <= ordenRx(a.vertebra)) continue
        const d = a.grados - b.grados
        if (!mejor || Math.abs(d) > Math.abs(mejor.d) + 1e-9) mejor = { a, b, d }
      }
    }
  }
  if (!mejor) return null
  const g = redondear(Math.abs(mejor.d))
  return {
    grados: g,
    superior: mejor.a.vertebra,
    inferior: mejor.b.vertebra,
    convexidad: mejor.d >= 0 ? 'izquierda' : 'derecha',
    automatico: !eleccion,
    escoliosis: g >= UMBRAL_ESCOLIOSIS,
  }
}

// ── Hacia el eje de Neuro 3D ───────────────────────────────────────────────

export interface InclinacionDelEje {
  /** Índice de la vértebra (C1 = 0 … sacro = 24). */
  nivel: number
  platillo: Platillo
  grados: number
}

/**
 * Lo que el eje de Neuro 3D necesita para doblarse a las medidas del paciente.
 * Todo es opcional: lo que no se midió se queda como en el modelo esquemático.
 */
export interface AjusteDelEje {
  /** Inclinación sagital del eje en los platillos medidos (convención de `PERFIL_SAGITAL`). */
  sagital: InclinacionDelEje[]
  /** Inclinación coronal del eje: + = al bajar va hacia la izquierda del paciente (+x). */
  coronal: InclinacionDelEje[]
  /** Desplazamiento de la vértebra `nivel` sobre la de abajo, en fracción del fondo de esta; + = adelante. */
  listesis: { nivel: number; fraccion: number }[]
  /** Altura del disco bajo `nivel` ÷ altura del cuerpo de `nivel`, la del paciente. */
  discos: { nivel: number; indice: number }[]
}

export const AJUSTE_VACIO: AjusteDelEje = { sagital: [], coronal: [], listesis: [], discos: [] }

export const ajusteVacio = (a: AjusteDelEje | null | undefined): boolean =>
  !a || (a.sagital.length === 0 && a.coronal.length === 0 && a.listesis.length === 0 && a.discos.length === 0)

/** Convierte las mediciones en parámetros del eje. Sólo las listesis apreciables desplazan. */
export const ajusteDelEje = (r: ResultadoRx): AjusteDelEje => ({
  sagital: r.inclinacionesSagitales.map((i) => ({ nivel: indiceDeVertebra(i.vertebra), platillo: i.platillo, grados: i.grados })),
  coronal: r.inclinacionesCoronales.map((i) => ({ nivel: indiceDeVertebra(i.vertebra), platillo: i.platillo, grados: i.grados })),
  listesis: r.listesis
    .filter((l) => l.apreciable)
    .map((l) => ({ nivel: indiceDeVertebra(l.superior), fraccion: l.porcentaje / 100 })),
  discos: r.discos.map((d) => ({ nivel: indiceDeVertebra(d.superior), indice: d.indice })),
})

// ── Cómo se dice ───────────────────────────────────────────────────────────

export const FUENTES_RX = {
  cobb: 'Cobb 1948',
  meyerding: 'Meyerding 1932 (grados); % según Taillard 1954 (verificar)',
  disco: 'Cociente con el cuerpo vecino (verificar)',
  pelvis: 'Legaye, Duval-Beaupère 1998',
  srs: 'Scoliosis Research Society (verificar)',
} as const

/** Rangos de referencia de un adulto de pie (aproximados; varían entre personas). */
export const REFERENCIAS_RX = {
  lordosisLumbar: { min: 40, max: 60, texto: 'Referencia aproximada 40°–60° (verificar)' },
  cifosisToracica: { min: 20, max: 50, texto: 'Referencia aproximada 20°–50° (verificar)' },
  pendienteSacra: { min: 30, max: 50, texto: 'Referencia aproximada 30°–50° (verificar)' },
} as const

/** De dónde salen los mm de una vista, en palabras para la interfaz. */
export const textoDeEscala = (c: Calibracion): string => {
  if (c.tipo === 'dicom') return 'Milímetros con el espaciado del píxel del DICOM; la magnificación de la placa puede agregar 10–20 % (verificar).'
  if (c.tipo === 'referencia') return `Milímetros con la referencia de ${redondear(c.mm)} mm que marcaste.`
  return 'Sin escala: una foto no la trae. Se muestran ángulos y proporciones; para ver milímetros, marca una distancia conocida.'
}

/**
 * Discos claramente más bajos que los demás marcados: menos del 70 % de la
 * mediana del resto (umbral de este sistema, verificar). Con menos de tres
 * discos no hay contra qué comparar.
 */
export const discosBajos = (discos: AlturaDiscal[]): string[] => {
  if (discos.length < 3) return []
  return discos
    .filter((d) => {
      const otros = discos.filter((o) => o !== d).map((o) => o.indice).sort((a, b) => a - b)
      const m = otros.length % 2 ? otros[(otros.length - 1) / 2] : (otros[otros.length / 2 - 1] + otros[otros.length / 2]) / 2
      return d.indice < 0.7 * m
    })
    .map((d) => d.nivel)
}

/** ¿Fuera del rango de referencia? Sólo se avisa (ámbar), nunca se decide. */
export const fueraDeReferencia = (grados: number, ref: { min: number; max: number }) => grados < ref.min || grados > ref.max

export const textoDeListesis = (l: Listesis): string => {
  if (!l.apreciable) return `${l.nivel}: sin desplazamiento apreciable (${l.porcentaje} %)`
  if (l.grado === null) return `${l.nivel}: retrolistesis de ${Math.abs(l.porcentaje)} %`
  const romano = ['', 'I', 'II', 'III', 'IV', 'V'][l.grado]
  return `${l.nivel}: anterolistesis de ${l.porcentaje} % (grado ${romano} de Meyerding)`
}
