/**
 * Catálogo anatómico del atlas: cada estructura que se puede ver, buscar y
 * tocar, con su nombre en español, su sistema, su capa, una descripción breve
 * para el paciente y su color (un token `--cx-anat-*`, nunca un color suelto).
 *
 * El `id` es el mismo que lleva la malla en la escena: la escena no decide
 * nombres, los toma de aquí. Las estructuras compuestas (la médula entera, el
 * cono, la cola de caballo) no tienen malla propia: declaran sus
 * `componentes` y la escena enciende esos.
 */
import type { CapaId } from './capas'
import {
  DISCOS,
  NIVELES_VERTEBRALES,
  RAICES,
  RAICES_DE_LA_COLA_DE_CABALLO,
  SEGMENTOS_MEDULARES,
  salidaDeRaiz,
  type Lado,
  type RegionColumna,
} from './columna'
import { dermatomaDeRaiz, sinDermatoma } from './dermatomas'

export type Sistema =
  | 'Envolturas'
  | 'Encéfalo'
  | 'Ventrículos'
  | 'Vasos'
  | 'Columna'
  | 'Médula espinal'
  | 'Raíces nerviosas'
  | 'Vías (esquemáticas)'

export interface Estructura {
  id: string
  nombre: string
  sistema: Sistema
  capa: CapaId
  descripcion: string
  /** Token de color, p. ej. `--cx-anat-frontal`. */
  color: string
  lado?: Lado
  /** Queda tapada por otras (ínsula, ventrículos): al elegirla, lo de encima se aclara. */
  profunda?: boolean
  /** Para las compuestas: ids de las mallas que la forman. */
  componentes?: string[]
  /** Otras formas de buscarla. */
  sinonimos?: string[]
  /** Si es una raíz o un segmento medular, cuál. */
  raiz?: string
  /** Si es una vértebra, su nivel; si es un disco, el disco. */
  nivel?: string
  disco?: string
  esquematica?: boolean
}

const LADOS: [Lado, string, string][] = [
  ['izquierdo', 'izq', 'izquierdo'],
  ['derecho', 'der', 'derecho'],
]

const bilateral = (
  base: string,
  nombre: (lado: string) => string,
  resto: Omit<Estructura, 'id' | 'nombre' | 'lado'>,
): Estructura[] =>
  LADOS.map(([lado, sufijo, texto]) => ({ ...resto, id: `${base}-${sufijo}`, nombre: nombre(texto), lado }))

const femenino = (lado: string) => (lado === 'izquierdo' ? 'izquierda' : 'derecha')

// ── Envolturas ──────────────────────────────────────────────────────────────

const ENVOLTURAS: Estructura[] = [
  {
    id: 'piel',
    nombre: 'Piel',
    sistema: 'Envolturas',
    capa: 'piel',
    color: '--cx-anat-piel',
    descripcion: 'Silueta de la cabeza y el tronco, translúcida para ver lo de adentro.',
  },
  {
    id: 'craneo',
    nombre: 'Cráneo',
    sistema: 'Envolturas',
    capa: 'craneo',
    color: '--cx-anat-hueso',
    descripcion: 'Caja de hueso que protege al encéfalo.',
    sinonimos: ['calota', 'hueso del cráneo'],
  },
]

// ── Encéfalo ────────────────────────────────────────────────────────────────

const LOBULOS: [id: string, nombre: string, color: string, descripcion: string, sinonimos?: string[]][] = [
  [
    'lobulo-frontal',
    'Lóbulo frontal',
    '--cx-anat-frontal',
    'Planea, decide y controla la conducta. Su circunvolución precentral es la corteza motora; en el hemisferio dominante está el área de Broca (hablar).',
    ['frente', 'motor', 'broca'],
  ],
  [
    'lobulo-parietal',
    'Lóbulo parietal',
    '--cx-anat-parietal',
    'Recibe la sensibilidad del cuerpo (circunvolución poscentral) y ubica al cuerpo en el espacio.',
    ['sensitivo', 'sensibilidad'],
  ],
  [
    'lobulo-temporal',
    'Lóbulo temporal',
    '--cx-anat-temporal',
    'Audición y memoria (hipocampo, en su cara interna). En el hemisferio dominante, el área de Wernicke: entender el lenguaje.',
    ['memoria', 'audicion', 'wernicke', 'hipocampo'],
  ],
  [
    'lobulo-occipital',
    'Lóbulo occipital',
    '--cx-anat-occipital',
    'Corteza visual: procesa lo que ven los ojos.',
    ['vision', 'visual'],
  ],
]

const ENCEFALO: Estructura[] = [
  ...LOBULOS.flatMap(([id, nombre, color, descripcion, sinonimos]) =>
    bilateral(id, (lado) => `${nombre} ${lado}`, { sistema: 'Encéfalo', capa: 'encefalo', color, descripcion, sinonimos }),
  ),
  ...bilateral('insula', (lado) => `Ínsula ${femenino(lado)}`, {
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-insula',
    profunda: true,
    descripcion:
      'Corteza escondida en el fondo de la cisura lateral (de Silvio). Participa en el gusto, el dolor y las sensaciones del propio cuerpo.',
    sinonimos: ['lobulo de la insula', 'silvio'],
  }),
  {
    id: 'cerebelo',
    nombre: 'Cerebelo',
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-cerebelo',
    descripcion: 'Coordina el movimiento, el equilibrio y la postura.',
  },
  {
    id: 'mesencefalo',
    nombre: 'Mesencéfalo',
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-tronco',
    descripcion: 'Parte alta del tronco del encéfalo. Por aquí pasan las vías motoras y sensitivas; origen de los nervios III y IV (movimiento de los ojos).',
    sinonimos: ['tronco', 'tronco del encefalo', 'cerebro medio'],
  },
  {
    id: 'protuberancia',
    nombre: 'Protuberancia',
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-tronco',
    descripcion: 'Parte media del tronco: comunica la corteza con el cerebelo. Origen de los nervios V a VIII.',
    sinonimos: ['puente', 'tronco', 'pons'],
  },
  {
    id: 'bulbo',
    nombre: 'Bulbo raquídeo',
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-tronco',
    descripcion: 'Parte baja del tronco: centros de la respiración y del ritmo del corazón. Aquí se cruzan las vías motoras (decusación de las pirámides).',
    sinonimos: ['medula oblongada', 'tronco'],
  },
]

// ── Ventrículos ─────────────────────────────────────────────────────────────

const VENTRICULOS: Estructura[] = [
  ...bilateral('ventriculo-lateral', (lado) => `Ventrículo lateral ${lado}`, {
    sistema: 'Ventrículos',
    capa: 'ventriculos',
    color: '--cx-anat-lcr',
    profunda: true,
    descripcion: 'Cavidad en forma de C dentro de cada hemisferio. Su plexo coroideo produce el líquido cefalorraquídeo.',
    sinonimos: ['ventriculos', 'lcr', 'hidrocefalia'],
  }),
  {
    id: 'tercer-ventriculo',
    nombre: 'Tercer ventrículo',
    sistema: 'Ventrículos',
    capa: 'ventriculos',
    color: '--cx-anat-lcr',
    profunda: true,
    descripcion: 'Cavidad estrecha en la línea media, entre los dos tálamos.',
    sinonimos: ['ventriculos', 'lcr'],
  },
  {
    id: 'acueducto',
    nombre: 'Acueducto de Silvio',
    sistema: 'Ventrículos',
    capa: 'ventriculos',
    color: '--cx-anat-lcr',
    profunda: true,
    descripcion: 'Conducto del mesencéfalo que une el tercer ventrículo con el cuarto. Si se tapa, el líquido se acumula (hidrocefalia).',
    sinonimos: ['acueducto del mesencefalo', 'hidrocefalia'],
  },
  {
    id: 'cuarto-ventriculo',
    nombre: 'Cuarto ventrículo',
    sistema: 'Ventrículos',
    capa: 'ventriculos',
    color: '--cx-anat-lcr',
    profunda: true,
    descripcion: 'Entre el tronco y el cerebelo. Desde aquí el líquido sale a rodear el encéfalo y la médula.',
    sinonimos: ['ventriculos', 'lcr'],
  },
]

// ── Vasos: polígono de Willis ───────────────────────────────────────────────

const ARTERIA = { sistema: 'Vasos' as const, capa: 'vasos' as const, color: '--cx-anat-arteria' }

const VASOS: Estructura[] = [
  ...bilateral('carotida-interna', (lado) => `Arteria carótida interna ${femenino(lado)}`, {
    ...ARTERIA,
    descripcion: 'Sube por el cuello y lleva sangre a la mayor parte del hemisferio de su lado. Termina dividiéndose en la cerebral anterior y la media.',
    sinonimos: ['carotida', 'aci', 'willis'],
  }),
  ...bilateral('cerebral-anterior', (lado) => `Arteria cerebral anterior ${femenino(lado)}`, {
    ...ARTERIA,
    descripcion: 'Irriga la cara interna de los lóbulos frontal y parietal, incluida la zona que mueve la pierna.',
    sinonimos: ['aca', 'willis'],
  }),
  ...bilateral('cerebral-media', (lado) => `Arteria cerebral media ${femenino(lado)}`, {
    ...ARTERIA,
    descripcion: 'Irriga casi toda la cara externa del hemisferio: movimiento y sensibilidad de cara y brazo, y el lenguaje en el hemisferio dominante.',
    sinonimos: ['acm', 'silviana', 'willis'],
  }),
  ...bilateral('cerebral-posterior', (lado) => `Arteria cerebral posterior ${femenino(lado)}`, {
    ...ARTERIA,
    descripcion: 'Irriga el lóbulo occipital (la visión) y la cara inferior del temporal.',
    sinonimos: ['acp', 'willis'],
  }),
  ...bilateral('comunicante-posterior', (lado) => `Arteria comunicante posterior ${femenino(lado)}`, {
    ...ARTERIA,
    descripcion: 'Une la carótida interna con la cerebral posterior: cierra el polígono por detrás. Sitio frecuente de aneurismas.',
    sinonimos: ['acop', 'pcom', 'willis', 'aneurisma'],
  }),
  {
    id: 'comunicante-anterior',
    nombre: 'Arteria comunicante anterior',
    ...ARTERIA,
    descripcion: 'Une las dos cerebrales anteriores y cierra el polígono por delante. Es el sitio más frecuente de aneurismas.',
    sinonimos: ['acoa', 'acom', 'willis', 'aneurisma'],
  },
  {
    id: 'basilar',
    nombre: 'Arteria basilar',
    ...ARTERIA,
    descripcion: 'Nace de la unión de las dos vertebrales, corre por delante del tronco y termina en las dos cerebrales posteriores.',
    sinonimos: ['willis', 'vertebrobasilar'],
  },
  ...bilateral('vertebral', (lado) => `Arteria vertebral ${femenino(lado)}`, {
    ...ARTERIA,
    descripcion: 'Sube por los agujeros de las vértebras del cuello y entra al cráneo por el agujero magno, donde se une con la del otro lado.',
    sinonimos: ['vertebrobasilar'],
  }),
]

/** Las arterias del polígono de Willis propiamente dicho (para encenderlas juntas). */
export const POLIGONO_DE_WILLIS: string[] = VASOS.filter((v) => !v.id.startsWith('vertebral')).map((v) => v.id)

// ── Columna ─────────────────────────────────────────────────────────────────

const DESCRIPCION_POR_REGION: Record<RegionColumna, string> = {
  cervical: 'Vértebra del cuello: cuerpo pequeño y agujeros a los lados por donde suben las arterias vertebrales.',
  toracica: 'Vértebra del tórax: se articula con las costillas; su apófisis espinosa es larga e inclinada hacia abajo.',
  lumbar: 'Vértebra lumbar: el cuerpo más grande de la columna, el que soporta más carga.',
  sacra: 'Cinco vértebras fusionadas (S1 a S5) que unen la columna con la pelvis. Las raíces sacras salen por sus agujeros.',
  coccigea: '',
}

const COLUMNA: Estructura[] = [
  ...NIVELES_VERTEBRALES.map((n) => ({
    id: n.id === 'S' ? 'sacro' : `vertebra-${n.id}`,
    nombre: n.id === 'S' ? 'Sacro' : n.nombre,
    sistema: 'Columna' as const,
    capa: 'columna' as const,
    color: '--cx-anat-hueso',
    nivel: n.id,
    descripcion:
      n.id === 'C1'
        ? 'Primera vértebra del cuello: un anillo sin cuerpo que sostiene el cráneo (movimiento de «sí»).'
        : n.id === 'C2'
          ? 'Segunda vértebra del cuello: su diente (apófisis odontoides) es el eje sobre el que gira el atlas (movimiento de «no»).'
          : DESCRIPCION_POR_REGION[n.region],
    sinonimos: n.id === 'S' ? ['S1', 'sacro', 'pelvis'] : [n.id, 'vertebra'],
  })),
  ...DISCOS.map((d) => ({
    id: `disco-${d}`,
    nombre: `Disco ${d}`,
    sistema: 'Columna' as const,
    capa: 'columna' as const,
    color: '--cx-anat-disco',
    disco: d,
    descripcion: `Disco intervertebral ${d}: amortigua entre dos vértebras. Un anillo fibroso rodea al núcleo pulposo, que es lo que se hernia.`,
    sinonimos: [d, 'hernia', 'disco'],
  })),
]

// ── Médula espinal ──────────────────────────────────────────────────────────

const segmentoId = (raiz: string) => `segmento-${raiz}`
const segmentosEntre = (desde: string, hasta: string): string[] => {
  const ids = SEGMENTOS_MEDULARES.map((s) => s.raiz)
  return ids.slice(ids.indexOf(desde), ids.indexOf(hasta) + 1).map(segmentoId)
}

const MEDULA_BASE = { sistema: 'Médula espinal' as const, capa: 'medula' as const, color: '--cx-anat-medula' }

const MEDULA: Estructura[] = [
  ...SEGMENTOS_MEDULARES.map((s) => ({
    ...MEDULA_BASE,
    id: segmentoId(s.raiz),
    nombre: `Segmento medular ${s.raiz}`,
    raiz: s.raiz,
    descripcion: `Tramo de la médula del que nacen las raíces ${s.raiz} de los dos lados.`,
    sinonimos: [s.raiz, 'medula'],
  })),
  {
    ...MEDULA_BASE,
    id: 'medula-espinal',
    nombre: 'Médula espinal',
    componentes: SEGMENTOS_MEDULARES.map((s) => segmentoId(s.raiz)),
    descripcion: 'Cordón de tejido nervioso que baja desde el bulbo dentro de la columna. Lleva las órdenes de movimiento y trae la sensibilidad.',
    sinonimos: ['medula', 'cordon'],
  },
  {
    ...MEDULA_BASE,
    id: 'engrosamiento-cervical',
    nombre: 'Engrosamiento cervical',
    componentes: segmentosEntre('C4', 'T1'),
    descripcion: 'La médula se ensancha de C4 a T1: de aquí salen los nervios de los brazos.',
  },
  // (verificar) Los límites de los engrosamientos y del cono, en segmentos,
  // cambian según la fuente (Moore; Haines: lumbar L1–S2 o L2–S3). Se toma el
  // más citado y se dice «aproximadamente» donde el paciente lo lee.
  {
    ...MEDULA_BASE,
    id: 'engrosamiento-lumbar',
    nombre: 'Engrosamiento lumbar',
    componentes: segmentosEntre('L1', 'S2'),
    descripcion: 'La médula se ensancha, aproximadamente de los segmentos L1 a S2: de aquí salen los nervios de las piernas.',
  },
  {
    ...MEDULA_BASE,
    id: 'cono-medular',
    nombre: 'Cono medular',
    componentes: segmentosEntre('S3', 'Co'),
    descripcion: 'El final de la médula, en forma de cono, hacia la altura del disco L1-L2 en el adulto (varía entre personas).',
    sinonimos: ['cono', 'conus'],
  },
]

// ── Raíces ──────────────────────────────────────────────────────────────────

export const idDeRaiz = (raiz: string, lado: Lado) => `raiz-${raiz}-${lado === 'izquierdo' ? 'izq' : 'der'}`

const descripcionDeRaiz = (raiz: string): string => {
  const salida = salidaDeRaiz(raiz)?.descripcion ?? ''
  const derm = dermatomaDeRaiz(raiz)
  const piel = derm ? ` Siente la piel de: ${derm.zona.charAt(0).toLowerCase()}${derm.zona.slice(1)}` : ` ${sinDermatoma(raiz) ?? ''}`
  return `${salida}${piel}`.trim()
}

const RAICES_CATALOGO: Estructura[] = [
  ...RAICES.flatMap((r) =>
    LADOS.map(([lado, , texto]) => ({
      id: idDeRaiz(r.id, lado),
      nombre: `Raíz ${r.id} ${femenino(texto)}`,
      sistema: 'Raíces nerviosas' as const,
      capa: 'raices' as const,
      color: '--cx-anat-raiz',
      lado,
      raiz: r.id,
      descripcion: descripcionDeRaiz(r.id),
      sinonimos: [r.id, 'raiz', 'nervio'],
    })),
  ),
  {
    id: 'cola-de-caballo',
    nombre: 'Cola de caballo',
    sistema: 'Raíces nerviosas',
    capa: 'raices',
    color: '--cx-anat-raiz',
    componentes: RAICES_DE_LA_COLA_DE_CABALLO.flatMap((r) => [idDeRaiz(r, 'izquierdo'), idDeRaiz(r, 'derecho')]),
    descripcion: 'Por debajo del cono medular, las raíces lumbares y sacras bajan juntas dentro del conducto hasta su agujero de salida.',
    sinonimos: ['cauda equina'],
  },
]

// ── Vías (esquemáticas) ─────────────────────────────────────────────────────

const VIAS: Estructura[] = [
  ...bilateral('via-corticoespinal', (lado) => `Vía corticoespinal ${femenino(lado)} (esquemática)`, {
    sistema: 'Vías (esquemáticas)',
    capa: 'tractos',
    color: '--cx-anat-via-motora',
    esquematica: true,
    descripcion: 'Lleva la orden de movimiento de la corteza motora a la médula. Se cruza al otro lado en el bulbo: por eso una lesión del hemisferio izquierdo debilita el lado derecho.',
    sinonimos: ['piramidal', 'motora', 'tracto'],
  }),
  ...bilateral('via-columnas-dorsales', (lado) => `Columnas dorsales y lemnisco medial ${femenino(lado)} (esquemática)`, {
    sistema: 'Vías (esquemáticas)',
    capa: 'tractos',
    color: '--cx-anat-via-sensitiva',
    esquematica: true,
    descripcion: 'Sube la sensibilidad fina, la vibración y la posición. Asciende por el mismo lado de la médula y se cruza en el bulbo hacia la corteza sensitiva.',
    sinonimos: ['cordones posteriores', 'lemnisco', 'sensitiva', 'tracto'],
  }),
]

export const CATALOGO: Estructura[] = [
  ...ENVOLTURAS,
  ...ENCEFALO,
  ...VENTRICULOS,
  ...VASOS,
  ...COLUMNA,
  ...MEDULA,
  ...RAICES_CATALOGO,
  ...VIAS,
]

const POR_ID = new Map(CATALOGO.map((e) => [e.id, e]))

export const estructuraPorId = (id: string): Estructura | undefined => POR_ID.get(id)

/** Las mallas que hay que encender para una estructura (ella misma o sus componentes). */
export const mallasDe = (id: string): string[] => {
  const e = POR_ID.get(id)
  if (!e) return []
  return e.componentes ?? [id]
}

/** Ids que deben existir como malla en la escena (todo lo que no es compuesto). */
export const IDS_DE_MALLAS: string[] = CATALOGO.filter((e) => !e.componentes).map((e) => e.id)

export const SISTEMAS: Sistema[] = [
  'Encéfalo',
  'Ventrículos',
  'Vasos',
  'Columna',
  'Médula espinal',
  'Raíces nerviosas',
  'Vías (esquemáticas)',
  'Envolturas',
]

/** Para buscar: minúsculas y sin acentos. */
export const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/**
 * Busca por nombre, sinónimo o nivel. Cada palabra tiene que aparecer (al
 * inicio de una palabra del nombre o de un sinónimo). Primero lo que empieza
 * igual; las compuestas, antes que sus piezas.
 */
export const buscarEstructuras = (texto: string, limite = 8): Estructura[] => {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return []
  const puntuadas: { e: Estructura; puntos: number }[] = []
  for (const e of CATALOGO) {
    const nombre = normalizar(e.nombre)
    const extra = (e.sinonimos ?? []).map(normalizar)
    const tokens = [...nombre.split(/[\s()]+/), ...extra.flatMap((s) => s.split(/\s+/)), ...extra]
    const cumple = palabras.every((p) => tokens.some((t) => t.startsWith(p)))
    if (!cumple) continue
    let puntos = 0
    if (nombre.startsWith(palabras.join(' '))) puntos += 10
    if (palabras.every((p) => nombre.split(/[\s()]+/).some((t) => t.startsWith(p)))) puntos += 5
    if (e.componentes) puntos += 3
    if (extra.some((s) => s === palabras.join(' '))) puntos += 4
    puntuadas.push({ e, puntos })
  }
  return puntuadas
    .sort((a, b) => b.puntos - a.puntos || a.e.nombre.localeCompare(b.e.nombre, 'es'))
    .slice(0, limite)
    .map((p) => p.e)
}
