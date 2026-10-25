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
  | 'Venas y senos'
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
  /**
   * Sólo existe en el atlas detallado (BodyParts3D): un giro, un hueso del
   * cráneo. El modelo simplificado no la dibuja; el buscador sólo la ofrece con
   * el atlas a la vista.
   */
  soloAtlas?: boolean
  /** La estructura que la contiene: al elegir el lóbulo se encienden sus giros. */
  parteDe?: string
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

// ── Venas y senos ───────────────────────────────────────────────────────────
// (verificar) Trayectos típicos (Rhoton, «The cerebral veins», 2002; Gray, 42.ª
// ed.): la simetría y el tamaño de los senos varían mucho entre personas.

const VENA = { sistema: 'Venas y senos' as const, capa: 'venas' as const, color: '--cx-anat-vena' }

const plural = (lado: string) => (lado === 'izquierdo' ? 'izquierdas' : 'derechas')

const VENAS: Estructura[] = [
  {
    id: 'seno-sagital-superior',
    nombre: 'Seno sagital superior',
    ...VENA,
    descripcion:
      'Canal venoso en la línea media, en el borde superior de la hoz del cerebro, que corre de adelante hacia atrás. Recoge la sangre de la superficie de los hemisferios y el líquido cefalorraquídeo que se reabsorbe.',
    sinonimos: ['seno longitudinal superior', 'senos venosos', 'trombosis venosa'],
  },
  {
    id: 'seno-sagital-inferior',
    nombre: 'Seno sagital inferior',
    ...VENA,
    profunda: true,
    descripcion: 'Seno delgado en el borde libre de la hoz del cerebro, por encima del cuerpo calloso. Desemboca en el seno recto.',
    sinonimos: ['seno longitudinal inferior', 'senos venosos'],
  },
  {
    id: 'vena-cerebral-magna',
    nombre: 'Vena cerebral magna (de Galeno)',
    ...VENA,
    profunda: true,
    descripcion: 'Vena corta y gruesa que recoge la sangre de la profundidad del cerebro. Con el seno sagital inferior forma el seno recto.',
    sinonimos: ['galeno', 'vena de galeno', 'venas profundas'],
  },
  {
    id: 'seno-recto',
    nombre: 'Seno recto',
    ...VENA,
    profunda: true,
    descripcion: 'Corre donde la hoz del cerebro se une con la tienda del cerebelo y lleva la sangre de las venas profundas a la confluencia de los senos.',
    sinonimos: ['senos venosos'],
  },
  {
    id: 'confluencia-de-los-senos',
    nombre: 'Confluencia de los senos',
    ...VENA,
    descripcion:
      'Unión, a la altura de la protuberancia occipital interna, del seno sagital superior, el recto y los transversos. Su forma varía mucho entre personas.',
    sinonimos: ['torcula', 'torcular', 'prensa de herofilo', 'senos venosos'],
  },
  ...bilateral('seno-transverso', (lado) => `Seno transverso ${lado}`, {
    ...VENA,
    descripcion:
      'Sale de la confluencia hacia el lado por el borde de la tienda del cerebelo y sigue como seno sigmoideo. Es común que uno sea más grande que el otro.',
    sinonimos: ['seno lateral', 'senos venosos'],
  }),
  ...bilateral('seno-sigmoideo', (lado) => `Seno sigmoideo ${lado}`, {
    ...VENA,
    descripcion: 'Baja en forma de S por detrás del hueso temporal, junto a la mastoides, hasta el agujero yugular, donde se vuelve la vena yugular interna.',
    sinonimos: ['senos venosos', 'mastoides'],
  }),
  ...bilateral('yugular-interna', (lado) => `Vena yugular interna ${femenino(lado)}`, {
    ...VENA,
    descripcion:
      'Sale del cráneo por el agujero yugular y baja por el cuello, por fuera de la carótida, llevando casi toda la sangre del encéfalo de regreso al corazón.',
    sinonimos: ['yugular', 'vyi'],
  }),
  // Las puenteantes (venas puente) y la anastomótica inferior (de Labbé), en una
  // sola malla por lado. «Puente» a secas sigue llevando a la protuberancia.
  ...bilateral('venas-puenteantes', (lado) => `Venas cerebrales superficiales ${plural(lado)}`, {
    ...VENA,
    descripcion:
      'Venas de la superficie del cerebro. Las que suben al seno sagital superior cruzan bajo la duramadre («venas puente»): si se rompen por un golpe, sobre todo en el adulto mayor, causan un hematoma subdural.',
    sinonimos: ['venas puente', 'puenteantes', 'venas cerebrales superiores', 'venas corticales', 'hematoma subdural', 'subdural', 'labbe'],
  }),
]

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

// ── Atlas detallado (feat/neuro3d-atlas) ────────────────────────────────────
// Lo que BodyParts3D trae más fino que el modelo simplificado. Cada una dice de
// qué estructura es parte, para que elegir «Lóbulo frontal» encienda sus giros
// y «Cráneo» todos sus huesos.

const HUESO_DEL_CRANEO = {
  sistema: 'Envolturas' as const,
  capa: 'craneo' as const,
  color: '--cx-anat-hueso',
  soloAtlas: true,
  parteDe: 'craneo',
}

const HUESOS_DEL_CRANEO: Estructura[] = [
  {
    id: 'hueso-frontal',
    nombre: 'Hueso frontal',
    ...HUESO_DEL_CRANEO,
    descripcion: 'Forma la frente y el techo de las órbitas. Protege a los lóbulos frontales.',
    sinonimos: ['frontal', 'frente'],
  },
  {
    id: 'hueso-occipital',
    nombre: 'Hueso occipital',
    ...HUESO_DEL_CRANEO,
    descripcion: 'La parte de atrás y de abajo del cráneo. Por su agujero magno pasa el tronco del encéfalo hacia la médula.',
    sinonimos: ['occipital', 'nuca', 'agujero magno'],
  },
  {
    id: 'hueso-esfenoides',
    nombre: 'Hueso esfenoides',
    ...HUESO_DEL_CRANEO,
    descripcion: 'Hueso en forma de mariposa en la base del cráneo. En su silla turca descansa la hipófisis.',
    sinonimos: ['esfenoides', 'silla turca', 'base del craneo'],
  },
  {
    id: 'hueso-etmoides',
    nombre: 'Hueso etmoides',
    ...HUESO_DEL_CRANEO,
    descripcion: 'Hueso delgado entre las órbitas. Su lámina cribosa deja pasar los nervios del olfato.',
    sinonimos: ['etmoides', 'lamina cribosa'],
  },
  ...bilateral('hueso-temporal', (lado) => `Hueso temporal ${lado}`, {
    ...HUESO_DEL_CRANEO,
    descripcion: 'A los lados y en la base del cráneo. Guarda el oído y deja pasar los nervios facial y auditivo.',
    sinonimos: ['temporal', 'oido', 'mastoides'],
  }),
  ...bilateral('hueso-parietal', (lado) => `Hueso parietal ${lado}`, {
    ...HUESO_DEL_CRANEO,
    descripcion: 'Forma la parte alta y lateral de la bóveda del cráneo.',
    sinonimos: ['parietal', 'boveda'],
  }),
  ...bilateral('hueso-cigomatico', (lado) => `Hueso cigomático ${lado}`, {
    ...HUESO_DEL_CRANEO,
    descripcion: 'El pómulo: forma el borde de afuera de la órbita.',
    sinonimos: ['malar', 'pomulo'],
  }),
  ...bilateral('maxilar', (lado) => `Maxilar ${lado}`, {
    ...HUESO_DEL_CRANEO,
    descripcion: 'Hueso de la cara que sostiene los dientes de arriba y forma el piso de la órbita.',
    sinonimos: ['maxilar superior'],
  }),
  {
    id: 'mandibula',
    nombre: 'Mandíbula',
    ...HUESO_DEL_CRANEO,
    descripcion: 'El hueso de la quijada, el único del cráneo que se mueve.',
    sinonimos: ['quijada', 'maxilar inferior'],
  },
]

/** Un giro de cada lado; con `lobulo`, como parte de ese lóbulo. */
const giro = (
  base: string,
  nombre: string,
  lobulo: string | null,
  color: string,
  descripcion: string,
  extra: Pick<Estructura, 'profunda' | 'sinonimos'> = {},
): Estructura[] =>
  LADOS.map(([lado, sufijo, texto]) => ({
    ...extra,
    id: `${base}-${sufijo}`,
    // «Giros orbitarios izquierdos»: el lado concuerda en plural.
    nombre: `${nombre} ${nombre.startsWith('Giros ') ? `${texto}s` : texto}`,
    sistema: 'Encéfalo' as const,
    capa: 'encefalo' as const,
    soloAtlas: true,
    lado,
    color,
    descripcion,
    parteDe: lobulo ? `${lobulo}-${sufijo}` : undefined,
  }))

const GIROS: Estructura[] = [
  ...giro(
    'giro-frontal-superior',
    'Giro frontal superior',
    'lobulo-frontal',
    '--cx-anat-frontal',
    'Parte alta del lóbulo frontal. Participa en planear el movimiento y en la atención.',
  ),
  ...giro('giro-frontal-medio', 'Giro frontal medio', 'lobulo-frontal', '--cx-anat-frontal', 'Participa en la memoria de trabajo y en dirigir la mirada.'),
  ...giro(
    'giro-frontal-inferior',
    'Giro frontal inferior',
    'lobulo-frontal',
    '--cx-anat-frontal',
    'En el hemisferio dominante (casi siempre el izquierdo) está el área de Broca: producir el lenguaje.',
    { sinonimos: ['broca', 'lenguaje'] },
  ),
  ...giro(
    'giro-precentral',
    'Giro precentral',
    'lobulo-frontal',
    '--cx-anat-frontal',
    'La corteza motora primaria: de aquí sale la orden de mover el lado contrario del cuerpo.',
    { sinonimos: ['motor', 'corteza motora', 'circunvolucion precentral'] },
  ),
  ...giro(
    'giros-orbitarios',
    'Giros orbitarios',
    'lobulo-frontal',
    '--cx-anat-frontal',
    'Cara de abajo del lóbulo frontal, sobre las órbitas. Participa en la conducta y las emociones.',
  ),
  ...giro(
    'giro-poscentral',
    'Giro poscentral',
    'lobulo-parietal',
    '--cx-anat-parietal',
    'La corteza sensitiva primaria: recibe tacto, dolor y temperatura del lado contrario del cuerpo.',
    { sinonimos: ['sensitivo', 'corteza sensitiva', 'circunvolucion poscentral'] },
  ),
  ...giro('giro-supramarginal', 'Giro supramarginal', 'lobulo-parietal', '--cx-anat-parietal', 'Participa en el lenguaje y en reconocer objetos por el tacto.'),
  ...giro('giro-angular', 'Giro angular', 'lobulo-parietal', '--cx-anat-parietal', 'En el hemisferio dominante participa en la lectura, la escritura y el cálculo.'),
  ...giro(
    'lobulillo-parietal-superior',
    'Lobulillo parietal superior',
    'lobulo-parietal',
    '--cx-anat-parietal',
    'Ubica al cuerpo en el espacio y guía el movimiento de la mano hacia lo que ve.',
  ),
  ...giro(
    'giro-temporal-superior',
    'Giro temporal superior',
    'lobulo-temporal',
    '--cx-anat-temporal',
    'Corteza auditiva. En su parte de atrás, en el hemisferio dominante, el área de Wernicke: entender el lenguaje.',
    { sinonimos: ['wernicke', 'audicion'] },
  ),
  ...giro('giro-temporal-medio', 'Giro temporal medio', 'lobulo-temporal', '--cx-anat-temporal', 'Participa en el significado de las palabras y en reconocer el movimiento.'),
  ...giro('giro-temporal-inferior', 'Giro temporal inferior', 'lobulo-temporal', '--cx-anat-temporal', 'Participa en reconocer formas y objetos que se ven.'),
  ...giro('giro-fusiforme', 'Giro fusiforme', 'lobulo-temporal', '--cx-anat-temporal', 'En la cara de abajo del temporal: reconoce caras y palabras escritas.'),
  ...giro(
    'giro-parahipocampico',
    'Giro parahipocampal',
    'lobulo-temporal',
    '--cx-anat-temporal',
    'Rodea al hipocampo y participa en la memoria de lugares.',
    { profunda: true },
  ),
  ...giro(
    'hipocampo',
    'Hipocampo',
    'lobulo-temporal',
    '--cx-anat-temporal',
    'En la cara interna del temporal: guarda los recuerdos nuevos. Se afecta en la epilepsia del lóbulo temporal.',
    { profunda: true, sinonimos: ['memoria', 'epilepsia'] },
  ),
  ...giro(
    'giro-cingulado',
    'Giro cingulado',
    null,
    '--cx-anat-insula',
    'Rodea al cuerpo calloso por la cara interna del hemisferio. Participa en las emociones, la atención y el dolor.',
    { profunda: true, sinonimos: ['cingulo', 'limbico'] },
  ),
]

const PROFUNDAS_Y_NERVIOS: Estructura[] = [
  ...bilateral('talamo', (lado) => `Tálamo ${lado}`, {
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-tronco',
    soloAtlas: true,
    profunda: true,
    descripcion: 'Estación de relevo en el centro del encéfalo: casi toda la sensibilidad pasa por aquí antes de llegar a la corteza.',
    sinonimos: ['nucleos grises'],
  }),
  {
    id: 'cuerpo-calloso',
    nombre: 'Cuerpo calloso',
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-medula',
    soloAtlas: true,
    profunda: true,
    descripcion: 'Puente de fibras que une los dos hemisferios para que trabajen juntos.',
    sinonimos: ['calloso', 'comisura'],
  },
  ...bilateral('nervio-optico', (lado) => `Nervio óptico ${lado}`, {
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-raiz',
    soloAtlas: true,
    descripcion: 'Par craneal II: lleva la imagen del ojo al encéfalo.',
    sinonimos: ['optico', 'par craneal', 'vision'],
  }),
  {
    id: 'quiasma-optico',
    nombre: 'Quiasma óptico',
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-raiz',
    soloAtlas: true,
    descripcion: 'Donde se cruzan las fibras de la mitad interna de cada ojo. Un tumor de hipófisis lo aprieta y quita la visión de los lados.',
    sinonimos: ['quiasma', 'hipofisis', 'vision'],
  },
  ...bilateral('nervio-troclear', (lado) => `Nervio troclear ${lado}`, {
    sistema: 'Encéfalo',
    capa: 'encefalo',
    color: '--cx-anat-raiz',
    soloAtlas: true,
    descripcion: 'Par craneal IV: mueve el ojo hacia abajo y adentro. Si falla, se ve doble al bajar escaleras.',
    sinonimos: ['troclear', 'patetico', 'par craneal'],
  }),
]

const ATLAS_DETALLADO: Estructura[] = [...HUESOS_DEL_CRANEO, ...GIROS, ...PROFUNDAS_Y_NERVIOS]
// ── fin atlas detallado ─────────────────────────────────────────────────────

export const CATALOGO: Estructura[] = [
  ...ENVOLTURAS,
  ...ENCEFALO,
  ...VENTRICULOS,
  ...VASOS,
  ...VENAS,
  ...COLUMNA,
  ...MEDULA,
  ...RAICES_CATALOGO,
  ...VIAS,
  ...ATLAS_DETALLADO,
]

const POR_ID = new Map(CATALOGO.map((e) => [e.id, e]))

export const estructuraPorId = (id: string): Estructura | undefined => POR_ID.get(id)

/** Las mallas que hay que encender para una estructura (ella misma o sus componentes). */
export const mallasDe = (id: string): string[] => {
  const e = POR_ID.get(id)
  if (!e) return []
  return e.componentes ?? [id]
}

/**
 * Ids que deben existir como malla en la escena del modelo simplificado (todo
 * lo que no es compuesto ni exclusivo del atlas detallado).
 */
export const IDS_DE_MALLAS: string[] = CATALOGO.filter((e) => !e.componentes && !e.soloAtlas).map((e) => e.id)

export const SISTEMAS: Sistema[] = [
  'Encéfalo',
  'Ventrículos',
  'Vasos',
  'Venas y senos',
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
export const buscarEstructuras = (texto: string, limite = 8, opciones: { incluirAtlas?: boolean } = {}): Estructura[] => {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return []
  const puntuadas: { e: Estructura; puntos: number }[] = []
  for (const e of CATALOGO) {
    // Sin el atlas a la vista, ofrecer un giro llevaría a algo que no se ve.
    if (e.soloAtlas && !opciones.incluirAtlas) continue
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
