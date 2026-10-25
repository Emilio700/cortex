/**
 * Dermatomas: la piel que inerva cada raíz, dibujada sobre una silueta.
 *
 * Dos fuentes, con distinta seguridad:
 *
 *  - **Puntos sensitivos clave** (ASIA / ISNCSCI, revisión 2019). Son la
 *    referencia estándar de la exploración neurológica y se dan tal cual.
 *  - **Contorno de cada dermatoma.** (verificar) Los límites finos varían
 *    entre fuentes (Keegan y Garrett, 1948; Foerster; los mapas de ASIA) y
 *    entre personas, y se solapan. Aquí son bandas esquemáticas para explicar
 *    al paciente, no para localizar una lesión.
 *
 * Coordenadas en la caja 0–200 × 0–470 de la silueta (`SiluetaDermatomas`).
 * Cada polígono se dibuja para la mitad IZQUIERDA de la imagen y se refleja
 * para la otra: en la vista anterior la mitad izquierda de la imagen es el
 * lado derecho del paciente; en la posterior, el izquierdo.
 */
import type { Lado } from './columna'

export type VistaSilueta = 'anterior' | 'posterior'
export type Punto = [number, number]
export type Poligono = Punto[]

export interface Dermatoma {
  /** Raíz o grupo («S4-S5» va junto, como en la hoja de ASIA). */
  id: string
  /** Dónde se siente, en palabras para el paciente. */
  zona: string
  /** Punto sensitivo clave de ASIA/ISNCSCI. */
  puntoClave: string
  /** Dónde se pinta el punto clave (mitad izquierda de la imagen). */
  punto: { vista: VistaSilueta; x: number; y: number }
  regiones: Partial<Record<VistaSilueta, Poligono[]>>
}

// Bandas del tronco: el mismo contorno por delante y por detrás, a la altura
// de su referencia (T4 pezón, T6 apéndice xifoides, T10 ombligo, T12 ligamento
// inguinal).
const banda = (arriba: number, abajo: number): Poligono => [
  [50, arriba],
  [100, arriba],
  [100, abajo],
  [50, abajo],
]
const ALTURA_TORACICA: Record<string, [number, number]> = {
  T3: [112, 124],
  T4: [124, 138],
  T5: [138, 150],
  T6: [150, 162],
  T7: [162, 174],
  T8: [174, 186],
  T9: [186, 198],
  T10: [198, 212],
  T11: [212, 226],
}
const PUNTO_TORACICO: Record<string, string> = {
  T3: 'Tercer espacio intercostal, en la línea medioclavicular.',
  T4: 'Cuarto espacio intercostal, a la altura del pezón.',
  T5: 'Quinto espacio intercostal, en la línea medioclavicular.',
  T6: 'Sexto espacio intercostal, a la altura del apéndice xifoides.',
  T7: 'Séptimo espacio intercostal, en la línea medioclavicular.',
  T8: 'Octavo espacio intercostal, en la línea medioclavicular.',
  T9: 'Noveno espacio intercostal, en la línea medioclavicular.',
  T10: 'Décimo espacio intercostal, a la altura del ombligo.',
  T11: 'Undécimo espacio intercostal, en la línea medioclavicular.',
}
const ZONA_TORACICA: Record<string, string> = {
  T3: 'Una franja del pecho, por debajo de la clavícula.',
  T4: 'Una franja del pecho a la altura de los pezones.',
  T5: 'Una franja del tórax, por debajo de los pezones.',
  T6: 'Una franja a la altura de la boca del estómago.',
  T7: 'Una franja del abdomen alto.',
  T8: 'Una franja del abdomen alto.',
  T9: 'Una franja del abdomen, por arriba del ombligo.',
  T10: 'Una franja del abdomen a la altura del ombligo.',
  T11: 'Una franja del abdomen, por debajo del ombligo.',
}

const toracicos: Dermatoma[] = Object.entries(ALTURA_TORACICA).map(([id, [a, b]]) => ({
  id,
  zona: ZONA_TORACICA[id],
  puntoClave: PUNTO_TORACICO[id],
  punto: { vista: 'anterior', x: 78, y: Math.round((a + b) / 2) },
  regiones: { anterior: [banda(a, b)], posterior: [banda(a - 4, b - 4)] },
}))

export const DERMATOMAS: Dermatoma[] = [
  {
    id: 'C2',
    zona: 'La nuca y la parte de atrás de la cabeza.',
    puntoClave: 'Al menos 1 cm lateral a la protuberancia occipital.',
    punto: { vista: 'posterior', x: 92, y: 32 },
    regiones: {
      anterior: [[[78, 48], [100, 56], [100, 64], [84, 66], [74, 56]]],
      posterior: [[[80, 12], [100, 10], [100, 60], [84, 58], [77, 40]]],
    },
  },
  {
    id: 'C3',
    zona: 'El cuello.',
    puntoClave: 'Fosa supraclavicular, en la línea medioclavicular.',
    punto: { vista: 'anterior', x: 82, y: 79 },
    regiones: {
      anterior: [[[74, 62], [100, 64], [100, 80], [70, 82], [66, 76]]],
      posterior: [[[78, 56], [100, 60], [100, 78], [66, 82]]],
    },
  },
  {
    id: 'C4',
    zona: 'Los hombros y la parte alta del pecho, como una capa.',
    puntoClave: 'Parte superior de la articulación acromioclavicular.',
    punto: { vista: 'anterior', x: 58, y: 89 },
    regiones: {
      anterior: [[[60, 78], [100, 80], [100, 98], [70, 100], [48, 104], [44, 92]]],
      posterior: [[[60, 78], [100, 78], [100, 96], [70, 98], [48, 104], [44, 92]]],
    },
  },
  {
    id: 'C5',
    zona: 'La cara externa del brazo, del hombro al codo.',
    puntoClave: 'Lado externo (radial) de la fosa del codo.',
    punto: { vista: 'anterior', x: 41, y: 176 },
    regiones: {
      anterior: [[[44, 98], [54, 100], [50, 130], [46, 160], [44, 182], [28, 182], [36, 150], [40, 120]]],
      posterior: [[[44, 98], [54, 100], [50, 130], [46, 160], [44, 182], [28, 182], [36, 150], [40, 120]]],
    },
  },
  {
    id: 'C6',
    zona: 'La cara externa del antebrazo, el pulgar y el índice.',
    puntoClave: 'Dorso de la falange proximal del pulgar.',
    punto: { vista: 'posterior', x: 17, y: 264 },
    regiones: {
      anterior: [[[44, 182], [28, 180], [20, 236], [10, 262], [14, 276], [20, 268], [22, 300], [27, 300], [28, 250], [36, 210]]],
      posterior: [[[36, 182], [28, 180], [20, 236], [10, 262], [14, 276], [20, 268], [22, 300], [26, 300], [28, 250]]],
    },
  },
  {
    id: 'C7',
    zona: 'El dedo medio y el centro de la mano.',
    puntoClave: 'Dorso de la falange proximal del dedo medio.',
    punto: { vista: 'posterior', x: 31, y: 286 },
    regiones: {
      anterior: [[[28, 250], [34, 250], [34, 300], [27, 300]]],
      posterior: [[[36, 182], [44, 184], [40, 240], [36, 300], [26, 300], [28, 250]]],
    },
  },
  {
    id: 'C8',
    zona: 'El borde interno del antebrazo y la mano, el anular y el meñique.',
    puntoClave: 'Dorso de la falange proximal del meñique.',
    punto: { vista: 'posterior', x: 40, y: 284 },
    regiones: {
      anterior: [[[36, 210], [47, 200], [44, 226], [44, 300], [34, 300], [34, 250]]],
      posterior: [[[44, 184], [50, 176], [44, 226], [44, 300], [36, 300], [40, 240]]],
    },
  },
  {
    id: 'T1',
    zona: 'La cara interna del brazo y del antebrazo, cerca del codo.',
    puntoClave: 'Lado interno (cubital) de la fosa del codo.',
    punto: { vista: 'anterior', x: 49, y: 182 },
    regiones: {
      anterior: [[[50, 120], [60, 120], [54, 150], [50, 176], [47, 200], [40, 200], [44, 176], [46, 150]]],
      posterior: [[[50, 122], [60, 122], [52, 176], [46, 182], [46, 150]]],
    },
  },
  {
    id: 'T2',
    zona: 'La parte alta del pecho y la axila.',
    puntoClave: 'Vértice de la axila.',
    punto: { vista: 'anterior', x: 59, y: 120 },
    regiones: {
      anterior: [[[48, 104], [100, 98], [100, 112], [62, 114], [60, 124], [52, 112]]],
      posterior: [[[48, 104], [100, 96], [100, 108], [62, 110], [60, 122], [52, 112]]],
    },
  },
  ...toracicos,
  {
    id: 'T12',
    zona: 'La parte baja del abdomen, hasta la ingle.',
    puntoClave: 'Punto medio del ligamento inguinal.',
    punto: { vista: 'anterior', x: 80, y: 244 },
    regiones: {
      anterior: [[[50, 226], [100, 226], [100, 248], [92, 256], [64, 238]]],
      posterior: [[[50, 222], [100, 222], [100, 228], [60, 230]]],
    },
  },
  {
    id: 'L1',
    zona: 'La ingle.',
    puntoClave: 'A la mitad de la distancia entre los puntos clave de T12 y L2.',
    punto: { vista: 'anterior', x: 80, y: 260 },
    regiones: {
      anterior: [[[64, 238], [92, 256], [100, 252], [100, 272], [92, 274], [80, 268], [60, 252]]],
      posterior: [[[60, 228], [100, 226], [100, 234], [60, 238]]],
    },
  },
  {
    id: 'L2',
    zona: 'La parte alta y media del muslo, por delante.',
    puntoClave: 'Cara anterior del muslo, a la mitad.',
    punto: { vista: 'anterior', x: 78, y: 292 },
    regiones: {
      anterior: [[[60, 252], [80, 268], [98, 276], [96, 298], [64, 316], [61, 290]]],
      posterior: [[[60, 238], [100, 234], [100, 242], [84, 246], [60, 248]]],
    },
  },
  {
    id: 'L3',
    zona: 'La parte baja del muslo y la cara interna de la rodilla.',
    puntoClave: 'Cóndilo femoral interno (cara interna de la rodilla).',
    punto: { vista: 'anterior', x: 89, y: 344 },
    regiones: {
      anterior: [[[64, 316], [96, 298], [94, 322], [93, 354], [84, 356], [67, 342]]],
      posterior: [[[60, 248], [84, 246], [86, 258], [64, 270]]],
    },
  },
  {
    id: 'L4',
    zona: 'La cara interna de la pierna, hasta el tobillo y el borde interno del pie.',
    puntoClave: 'Maléolo interno (tobillo, cara interna).',
    punto: { vista: 'anterior', x: 90, y: 438 },
    regiones: {
      anterior: [[[84, 352], [93, 348], [91, 390], [92, 440], [93, 456], [84, 458], [84, 430], [82, 390]]],
      posterior: [[[84, 360], [92, 358], [92, 430], [86, 432]]],
    },
  },
  {
    id: 'L5',
    zona: 'La cara externa de la pierna y el dorso del pie, hasta el dedo gordo.',
    puntoClave: 'Dorso del pie, en la tercera articulación metatarsofalángica.',
    punto: { vista: 'anterior', x: 80, y: 452 },
    regiones: {
      anterior: [[[67, 344], [84, 352], [82, 390], [84, 430], [86, 458], [74, 457], [70, 440], [69, 400]]],
      posterior: [[[68, 352], [78, 352], [77, 392], [70, 396]]],
    },
  },
  {
    id: 'S1',
    zona: 'El borde externo del pie, el talón y la planta.',
    puntoClave: 'Cara externa del talón.',
    punto: { vista: 'posterior', x: 71, y: 452 },
    regiones: {
      anterior: [[[66, 438], [74, 440], [76, 458], [66, 458]]],
      posterior: [[[70, 392], [78, 380], [82, 440], [84, 458], [66, 458], [69, 420]]],
    },
  },
  {
    id: 'S2',
    zona: 'La parte de atrás del muslo y de la rodilla.',
    puntoClave: 'Línea media del hueco de la rodilla (fosa poplítea).',
    punto: { vista: 'posterior', x: 84, y: 350 },
    regiones: {
      posterior: [[[78, 270], [94, 274], [92, 350], [88, 380], [80, 372], [77, 330]]],
    },
  },
  {
    id: 'S3',
    zona: 'La parte interna de la nalga.',
    puntoClave: 'Tuberosidad isquiática (donde uno se sienta).',
    punto: { vista: 'posterior', x: 90, y: 266 },
    regiones: {
      posterior: [[[86, 248], [100, 250], [100, 254], [92, 258], [92, 268], [100, 276], [100, 280], [86, 276], [82, 262]]],
    },
  },
  {
    id: 'S4-S5',
    zona: 'Alrededor del ano.',
    puntoClave: 'Zona perianal, a menos de 1 cm de la unión mucocutánea.',
    punto: { vista: 'posterior', x: 97, y: 266 },
    regiones: {
      posterior: [[[100, 254], [92, 258], [92, 268], [100, 276]]],
    },
  },
]

/** El dermatoma de una raíz. S4 y S5 comparten el suyo; C1 y la coccígea no tienen. */
export const dermatomaDeRaiz = (raiz: string): Dermatoma | undefined => {
  const id = raiz === 'S4' || raiz === 'S5' ? 'S4-S5' : raiz
  return DERMATOMAS.find((d) => d.id === id)
}

/** Por qué una raíz no tiene dermatoma en el mapa (para decirlo en vez de no pintar nada). */
export const sinDermatoma = (raiz: string): string | null => {
  if (raiz === 'C1') return 'La raíz C1 casi no tiene territorio en la piel: es sobre todo motora.'
  if (raiz === 'Co') return 'La raíz coccígea no tiene punto clave en la exploración estándar (ASIA).'
  return dermatomaDeRaiz(raiz) ? null : 'No hay dermatoma de referencia para esta raíz.'
}

/**
 * ¿Se pinta tal cual o reflejado? La mitad izquierda de la imagen es el lado
 * derecho del paciente visto de frente, y el izquierdo visto por detrás.
 */
export const reflejarPara = (vista: VistaSilueta, lado: Lado): boolean =>
  vista === 'anterior' ? lado === 'izquierdo' : lado === 'derecho'

/** Refleja un polígono sobre la línea media (x = 100). */
export const reflejar = (poligono: Poligono): Poligono => poligono.map(([x, y]) => [200 - x, y])

export const ANCHO_SILUETA = 200
export const ALTO_SILUETA = 470

/**
 * El contorno del cuerpo (sin la cabeza), de pie, de frente y con las palmas
 * hacia delante (posición anatómica). La mitad izquierda de la imagen; la otra
 * se obtiene reflejando.
 */
export const MEDIO_CONTORNO: Poligono = [
  [90, 56], [90, 74], [80, 79], [64, 84], [54, 90], [48, 100], [45, 114], [42, 140], [38, 168],
  [34, 182], [29, 212], [25, 238], [23, 246], [18, 256], [12, 268], [15, 274], [21, 264], [21, 284],
  [24, 296], [28, 300], [33, 298], [38, 294], [42, 286], [43, 272], [42, 252], [44, 226], [47, 196],
  [50, 176], [54, 150], [58, 122], [61, 128], [64, 160], [66, 192], [65, 210], [62, 232], [60, 250],
  [61, 280], [65, 320], [68, 346], [68, 362], [70, 398], [73, 428], [72, 438], [68, 450], [70, 457],
  [86, 459], [93, 455], [91, 440], [90, 420], [89, 390], [90, 364], [91, 348], [94, 320], [97, 288],
  [99, 272], [100, 272],
]

/** El contorno completo, cerrado. */
export const CONTORNO: Poligono = [
  ...MEDIO_CONTORNO,
  ...reflejar(MEDIO_CONTORNO).reverse(),
]

/** La cabeza: una elipse aparte. */
export const CABEZA = { cx: 100, cy: 34, rx: 20, ry: 25 }

export const comoPuntosSvg = (poligono: Poligono): string => poligono.map(([x, y]) => `${x},${y}`).join(' ')
