/**
 * La columna como datos: niveles vertebrales, discos, raíces y su relación con
 * los segmentos de la médula.
 *
 * Es la base del momento más útil del atlas: al tocar una raíz se encienden
 * juntos su vértebra, su disco, su segmento medular y su dermatoma. Para que esa
 * conexión no mienta, las reglas viven aquí, puras y con pruebas, y la escena
 * 3D sólo las dibuja.
 *
 * Reglas estándar (anatomía clásica):
 *  - Hay 8 raíces cervicales y 7 vértebras: C1–C7 salen POR ENCIMA de su
 *    vértebra; C8 sale entre C7 y T1.
 *  - Desde T1 hacia abajo, cada raíz sale POR DEBAJO de su vértebra
 *    (T1 entre T1 y T2 … L5 entre L5 y S1).
 *  - S1–S4 salen por los agujeros sacros; S5 y la coccígea, por el hiato sacro.
 *  - Una hernia lumbar paracentral comprime la raíz que «pasa» (la del nivel de
 *    abajo: L4-L5 → L5); una foraminal o extraforaminal, la que «sale» (L4).
 *  - Una hernia cervical C(n)-C(n+1) comprime la raíz C(n+1) (C5-C6 → C6).
 */

export type RegionColumna = 'cervical' | 'toracica' | 'lumbar' | 'sacra' | 'coccigea'

export interface NivelVertebral {
  /** «C1» … «L5»; el sacro es «S». */
  id: string
  nombre: string
  region: RegionColumna
  /** Posición de arriba abajo (C1 = 0, sacro = 24). */
  indice: number
}

const nivel = (id: string, region: RegionColumna, indice: number, nombre?: string): NivelVertebral => ({
  id,
  region,
  indice,
  nombre: nombre ?? `Vértebra ${id}`,
})

export const NIVELES_VERTEBRALES: NivelVertebral[] = [
  nivel('C1', 'cervical', 0, 'Atlas (C1)'),
  nivel('C2', 'cervical', 1, 'Axis (C2)'),
  ...[3, 4, 5, 6, 7].map((n, i) => nivel(`C${n}`, 'cervical', 2 + i)),
  ...Array.from({ length: 12 }, (_, i) => nivel(`T${i + 1}`, 'toracica', 7 + i)),
  ...Array.from({ length: 5 }, (_, i) => nivel(`L${i + 1}`, 'lumbar', 19 + i)),
  nivel('S', 'sacra', 24, 'Sacro (S1–S5)'),
]

export const nivelPorId = (id: string): NivelVertebral | undefined =>
  NIVELES_VERTEBRALES.find((n) => n.id === id)

/**
 * Discos intervertebrales, de C2-C3 a L5-S1. Entre el occipital y C1, y entre
 * C1 y C2, no hay disco: son articulaciones.
 */
export const DISCOS: string[] = NIVELES_VERTEBRALES.slice(1, -1).map((n, i) => {
  const siguiente = NIVELES_VERTEBRALES[i + 2]
  return `${n.id}-${siguiente.id === 'S' ? 'S1' : siguiente.id}`
})

/** Las dos vértebras que separa un disco («L5-S1» → L5 y sacro). */
export const vertebrasDelDisco = (disco: string): [string, string] | null => {
  if (!DISCOS.includes(disco)) return null
  const [arriba, abajo] = disco.split('-')
  return [arriba, abajo === 'S1' ? 'S' : abajo]
}

// ── Raíces ─────────────────────────────────────────────────────────────────

export interface Raiz {
  /** «C1» … «S5», «Co». */
  id: string
  region: RegionColumna
  /** Orden de arriba abajo (C1 = 0 … Co = 30): también el orden de los segmentos medulares. */
  indice: number
}

export const RAICES: Raiz[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `C${i + 1}`, region: 'cervical' as const })),
  ...Array.from({ length: 12 }, (_, i) => ({ id: `T${i + 1}`, region: 'toracica' as const })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `L${i + 1}`, region: 'lumbar' as const })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `S${i + 1}`, region: 'sacra' as const })),
  { id: 'Co', region: 'coccigea' as const },
].map((r, indice) => ({ ...r, indice }))

export const raizPorId = (id: string): Raiz | undefined => RAICES.find((r) => r.id === id)

export type Lado = 'derecho' | 'izquierdo'

export interface SalidaDeRaiz {
  /** Lo que queda arriba del agujero: una vértebra o el occipital. */
  arriba: string
  /** Lo que queda abajo; `null` en el hiato sacro. */
  abajo: string | null
  /** El disco a la altura del agujero, si lo hay. */
  disco: string | null
  /** La salida en palabras, para la ficha. */
  descripcion: string
}

/** Por dónde sale cada raíz. */
export const salidaDeRaiz = (id: string): SalidaDeRaiz | null => {
  const raiz = raizPorId(id)
  if (!raiz) return null
  const n = Number(id.slice(1))
  if (raiz.region === 'cervical') {
    if (n === 1) {
      return { arriba: 'occipital', abajo: 'C1', disco: null, descripcion: 'Sale entre el occipital y el atlas (C1).' }
    }
    if (n === 2) {
      return { arriba: 'C1', abajo: 'C2', disco: null, descripcion: 'Sale entre el atlas (C1) y el axis (C2).' }
    }
    if (n === 8) {
      return { arriba: 'C7', abajo: 'T1', disco: 'C7-T1', descripcion: 'Sale entre C7 y T1: es la única raíz cervical sin vértebra propia.' }
    }
    return {
      arriba: `C${n - 1}`,
      abajo: `C${n}`,
      disco: `C${n - 1}-C${n}`,
      descripcion: `Sale entre C${n - 1} y C${n}, por encima de su vértebra.`,
    }
  }
  if (raiz.region === 'toracica') {
    const abajo = n === 12 ? 'L1' : `T${n + 1}`
    return { arriba: `T${n}`, abajo, disco: `T${n}-${abajo}`, descripcion: `Sale entre T${n} y ${abajo}, por debajo de su vértebra.` }
  }
  if (raiz.region === 'lumbar') {
    const abajo = n === 5 ? 'S' : `L${n + 1}`
    const disco = `L${n}-${n === 5 ? 'S1' : `L${n + 1}`}`
    return {
      arriba: `L${n}`,
      abajo,
      disco,
      descripcion: `Sale entre L${n} y ${n === 5 ? 'el sacro' : `L${n + 1}`}, por debajo de su vértebra.`,
    }
  }
  if (raiz.region === 'sacra' && n <= 4) {
    return { arriba: 'S', abajo: 'S', disco: null, descripcion: `Sale por el ${n}.º agujero sacro.` }
  }
  return { arriba: 'S', abajo: null, disco: null, descripcion: 'Sale por el hiato sacro, al final del sacro.' }
}

// ── Coordenada vertebral y segmentos medulares ─────────────────────────────
//
// Una sola escala continua para ubicar todo a lo largo de la columna: el
// entero es la vértebra (C1 = 0 … L5 = 23, sacro = 24) y la fracción, cuánto
// se ha bajado dentro de ella y de su disco. La escena la convierte en
// posición 3D; aquí sólo se decide qué va a qué altura.

/** Altura (coordenada vertebral) del agujero por donde sale la raíz. */
export const coordenadaDeAgujero = (id: string): number | null => {
  const raiz = raizPorId(id)
  if (!raiz) return null
  const n = Number(id.slice(1))
  switch (raiz.region) {
    case 'cervical':
      // C1 sale por encima del atlas; C2–C8, entre la vértebra n-1 y la n.
      return n === 1 ? -0.15 : n - 1 - 0.1
    case 'toracica':
      return 7 + n - 0.1
    case 'lumbar':
      return 19 + n - 0.1
    case 'sacra':
      // Sobre el sacro (24 → 25): S1 arriba … S4 abajo; S5 por el hiato.
      return 24 + [0.14, 0.34, 0.52, 0.68, 0.86][n - 1]
    default:
      return 24.98
  }
}

export interface SegmentoMedular {
  raiz: string
  /** Coordenada vertebral donde empieza y termina el segmento. */
  desde: number
  hasta: number
}

/**
 * Altura aproximada de cada segmento medular respecto de las vértebras.
 *
 * (verificar) La médula es más corta que la columna y la relación varía entre
 * personas. Se usa la aproximación clásica de los textos de neuroanatomía
 * (p. ej. Chusid; Haines): segmentos cervicales ≈ una vértebra por arriba de su
 * número; torácicos altos ≈ dos; torácicos bajos ≈ tres; lumbares frente a
 * T10–T12; sacros y coccígeo en el cono medular, frente a T12–L1. El cono
 * termina hacia el disco L1-L2.
 */
export const SEGMENTOS_MEDULARES: SegmentoMedular[] = (() => {
  const tramos: [prefijo: string, cantidad: number, desde: number, hasta: number][] = [
    ['C', 8, 0, 7],
    ['T', 12, 7, 16],
    ['L', 5, 16, 18.6],
    ['S', 5, 18.6, 19.75],
    ['Co', 1, 19.75, 20.05],
  ]
  return tramos.flatMap(([prefijo, cantidad, desde, hasta]) => {
    const paso = (hasta - desde) / cantidad
    return Array.from({ length: cantidad }, (_, i) => ({
      raiz: prefijo === 'Co' ? 'Co' : `${prefijo}${i + 1}`,
      desde: desde + paso * i,
      hasta: desde + paso * (i + 1),
    }))
  })
})()

export const segmentoDeRaiz = (id: string): SegmentoMedular | undefined =>
  SEGMENTOS_MEDULARES.find((s) => s.raiz === id)

/** Coordenada vertebral donde termina el cono medular (≈ disco L1-L2). */
export const FIN_DEL_CONO = 20.05

/** Vértebra frente a la que queda el segmento medular (a la mitad del segmento). */
export const vertebraFrenteAlSegmento = (id: string): NivelVertebral | undefined => {
  const seg = segmentoDeRaiz(id)
  if (!seg) return undefined
  const medio = Math.floor((seg.desde + seg.hasta) / 2)
  return NIVELES_VERTEBRALES[Math.min(medio, NIVELES_VERTEBRALES.length - 1)]
}

/** Raíces cuyo trayecto dentro del conducto pasa por debajo del cono: la cola de caballo. */
export const RAICES_DE_LA_COLA_DE_CABALLO: string[] = RAICES.filter((r) => {
  const salida = coordenadaDeAgujero(r.id)
  return salida !== null && salida > FIN_DEL_CONO
}).map((r) => r.id)

// ── Hernias de disco ───────────────────────────────────────────────────────

export type TipoDeHernia = 'central' | 'paracentral' | 'foraminal'

export const TIPOS_DE_HERNIA: { id: TipoDeHernia; nombre: string }[] = [
  { id: 'paracentral', nombre: 'Paracentral (posterolateral)' },
  { id: 'foraminal', nombre: 'Foraminal o extraforaminal' },
  { id: 'central', nombre: 'Central' },
]

export interface EfectoDeHernia {
  /** Raíz comprimida, si la regla la determina. */
  raiz: string | null
  /** Comprime la médula (cervical o torácica central). */
  medula: boolean
  /** Comprime la cola de caballo (central por debajo del cono). */
  colaDeCaballo: boolean
  explicacion: string
}

/** Qué estructura comprime una hernia según su nivel y su posición. */
export const efectoDeHernia = (disco: string, tipo: TipoDeHernia): EfectoDeHernia | null => {
  const par = vertebrasDelDisco(disco)
  if (!par) return null
  const [arriba] = par
  const region = nivelPorId(arriba)!.region
  const abajoTexto = disco.split('-')[1]

  if (region === 'cervical') {
    const raiz = abajoTexto === 'T1' ? 'C8' : `C${Number(abajoTexto.slice(1))}`
    if (tipo === 'central') {
      return { raiz: null, medula: true, colaDeCaballo: false, explicacion: `Una hernia central ${disco} puede comprimir la médula cervical (mielopatía).` }
    }
    return {
      raiz,
      medula: false,
      colaDeCaballo: false,
      explicacion: `En el cuello, la hernia ${disco} comprime la raíz que sale por ese agujero: ${raiz}.`,
    }
  }

  if (region === 'toracica') {
    if (tipo === 'foraminal') {
      return { raiz: arriba, medula: false, colaDeCaballo: false, explicacion: `La hernia foraminal ${disco} comprime la raíz que sale por ese agujero: ${arriba}.` }
    }
    return {
      raiz: null,
      medula: true,
      colaDeCaballo: false,
      explicacion: `En la columna torácica, una hernia central o paracentral ${disco} suele comprimir la médula.`,
    }
  }

  // Lumbar (incluye L5-S1).
  const n = Number(arriba.slice(1))
  const pasa = abajoTexto === 'S1' ? 'S1' : `L${n + 1}`
  if (tipo === 'central') {
    const sobreElCono = n === 1
    return {
      raiz: null,
      medula: sobreElCono,
      colaDeCaballo: true,
      explicacion: sobreElCono
        ? `Una hernia central ${disco} queda a la altura del final del cono medular y de la cola de caballo.`
        : `Una hernia central ${disco} comprime la cola de caballo: puede afectar varias raíces de los dos lados.`,
    }
  }
  if (tipo === 'paracentral') {
    return {
      raiz: pasa,
      medula: false,
      colaDeCaballo: false,
      explicacion: `La hernia paracentral ${disco} comprime la raíz que pasa por ese nivel hacia abajo: ${pasa}.`,
    }
  }
  return {
    raiz: arriba,
    medula: false,
    colaDeCaballo: false,
    explicacion: `La hernia foraminal ${disco} comprime la raíz que sale por ese agujero: ${arriba}.`,
  }
}
