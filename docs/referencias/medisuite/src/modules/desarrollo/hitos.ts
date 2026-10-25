// Hitos del desarrollo de 2 a 60 meses. Lógica pura.
//
// Fuente: CDC "Learn the Signs. Act Early." (2022), material de dominio público, y
// Zubler JM, Wiggins LD, Macias MM, et al. Evidence-Informed Milestones for Developmental Surveillance
// Tools. Pediatrics. 2022;149(3):e2021052138. doi:10.1542/peds.2021-052138
// Cada hito es una habilidad que al menos el 75 % de las niñas y niños alcanzan a esa edad: si todavía no la
// tiene, se recomienda hablar con el médico y hacer una prueba de tamizaje del desarrollo.
// Traducción al español de MediSuite, apegada al texto original en inglés.

export type Dominio = 'social' | 'lenguaje' | 'cognitivo' | 'movimiento'
export const DOMINIO_LABEL: Record<Dominio, string> = {
  social: 'Social y emocional',
  lenguaje: 'Lenguaje y comunicación',
  cognitivo: 'Cognitivo (aprendizaje, pensamiento, resolución de problemas)',
  movimiento: 'Movimiento y desarrollo físico',
}
export const DOMINIOS: Dominio[] = ['social', 'lenguaje', 'cognitivo', 'movimiento']

export interface Hito {
  id: string
  dominio: Dominio
  texto: string
}
export const CHECKPOINTS = [2, 4, 6, 9, 12, 15, 18, 24, 30, 36, 48, 60] as const
export type Checkpoint = (typeof CHECKPOINTS)[number]

type Def = Record<Dominio, string[]>
const DEF: Record<Checkpoint, Def> = {
  2: {
    social: ['Se tranquiliza cuando le hablan o lo cargan', 'Mira su cara', 'Parece feliz de verle cuando usted se acerca', 'Sonríe cuando usted le habla o le sonríe'],
    lenguaje: ['Hace sonidos además del llanto', 'Reacciona a los ruidos fuertes'],
    cognitivo: ['Le sigue con la mirada cuando usted se mueve', 'Mira un juguete durante varios segundos'],
    movimiento: ['Levanta la cabeza cuando está boca abajo', 'Mueve ambos brazos y ambas piernas', 'Abre las manos brevemente'],
  },
  4: {
    social: ['Sonríe por sí solo para llamar su atención', 'Suelta risitas (todavía no una carcajada completa) cuando usted intenta hacerle reír', 'Le mira, se mueve o hace sonidos para obtener o mantener su atención'],
    lenguaje: ['Hace sonidos como "ooo" o "aaah" (arrullos)', 'Le responde con sonidos cuando usted le habla', 'Voltea la cabeza hacia el sonido de su voz'],
    cognitivo: ['Si tiene hambre, abre la boca cuando ve el pecho o el biberón', 'Se mira las manos con interés'],
    movimiento: ['Mantiene la cabeza firme, sin apoyo, cuando usted lo carga', 'Sostiene un juguete cuando se lo pone en la mano', 'Usa el brazo para dar manotazos a los juguetes', 'Se lleva las manos a la boca', 'Se apoya sobre los codos o antebrazos cuando está boca abajo'],
  },
  6: {
    social: ['Reconoce a las personas conocidas', 'Le gusta mirarse en el espejo', 'Se ríe'],
    lenguaje: ['Se turna con usted para hacer sonidos', 'Hace "trompetillas" (saca la lengua y sopla)', 'Hace chillidos'],
    cognitivo: ['Se lleva cosas a la boca para explorarlas', 'Estira la mano para agarrar un juguete que quiere', 'Cierra los labios para mostrar que no quiere más comida'],
    movimiento: ['Se voltea de boca abajo a boca arriba', 'Se empuja hacia arriba con los brazos estirados cuando está boca abajo', 'Se apoya en las manos para sostenerse cuando está sentado'],
  },
  9: {
    social: ['Es tímido, se aferra a usted o tiene miedo con personas desconocidas', 'Muestra varias expresiones faciales, como de alegría, tristeza, enojo y sorpresa', 'Mira cuando lo llaman por su nombre', 'Reacciona cuando usted se va (mira, estira los brazos hacia usted o llora)', 'Sonríe o se ríe cuando juegan a "¿dónde está?… ¡aquí está!"'],
    lenguaje: ['Hace sonidos diferentes como "mamamama" y "babababa"', 'Levanta los brazos para que lo carguen'],
    cognitivo: ['Busca objetos cuando se le caen y dejan de verse (como su cuchara o un juguete)', 'Golpea dos cosas entre sí'],
    movimiento: ['Se sienta por sí solo', 'Pasa cosas de una mano a la otra', 'Usa los dedos para "rastrillar" la comida hacia sí', 'Se mantiene sentado sin apoyo'],
  },
  12: {
    social: ['Juega con usted juegos como "palmitas"'],
    lenguaje: ['Dice "adiós" con la mano', 'Llama a uno de los padres "mamá", "papá" u otro nombre especial', 'Entiende el "no" (se detiene brevemente o deja de hacer algo cuando usted lo dice)'],
    cognitivo: ['Pone algo dentro de un recipiente, como un bloque en una taza', 'Busca cosas que vio que usted escondió, como un juguete debajo de una cobija'],
    movimiento: ['Se jala para ponerse de pie', 'Camina sosteniéndose de los muebles', 'Bebe de un vaso sin tapa mientras usted lo sostiene', 'Levanta cosas entre el pulgar y el índice, como pedacitos de comida'],
  },
  15: {
    social: ['Imita a otros niños mientras juega, como sacar juguetes de un recipiente cuando otro niño lo hace', 'Le muestra un objeto que le gusta', 'Aplaude cuando está emocionado', 'Abraza un muñeco de peluche u otro juguete', 'Le demuestra cariño (le abraza, se acurruca o le da besos)'],
    lenguaje: ['Intenta decir una o dos palabras además de "mamá" o "papá", como "ba" por pelota o "pe" por perro', 'Mira un objeto conocido cuando usted lo nombra', 'Sigue instrucciones dadas con un gesto y palabras; por ejemplo, le da un juguete cuando usted extiende la mano y le dice "dame el juguete"', 'Señala para pedir algo o para que le ayuden'],
    cognitivo: ['Intenta usar las cosas de la manera correcta, como un teléfono, un vaso o un libro', 'Apila al menos dos objetos pequeños, como bloques'],
    movimiento: ['Da algunos pasos por sí solo', 'Usa los dedos para comer algunos alimentos por sí solo'],
  },
  18: {
    social: ['Se aleja de usted, pero voltea para asegurarse de que usted está cerca', 'Señala para mostrarle algo interesante', 'Extiende las manos para que se las lave', 'Mira con usted algunas páginas de un libro', 'Le ayuda a vestirlo metiendo el brazo en la manga o levantando el pie'],
    lenguaje: ['Intenta decir tres o más palabras además de "mamá" o "papá"', 'Sigue instrucciones de un paso sin gestos, como darle el juguete cuando usted le dice "dámelo"'],
    cognitivo: ['Le imita en los quehaceres, como barrer con una escoba', 'Juega con juguetes de manera sencilla, como empujar un carrito'],
    movimiento: ['Camina sin sostenerse de nadie ni de nada', 'Hace garabatos', 'Bebe de un vaso sin tapa, aunque a veces lo derrame', 'Come por sí solo con los dedos', 'Intenta usar la cuchara', 'Se sube y se baja de un sillón o una silla sin ayuda'],
  },
  24: {
    social: ['Se da cuenta cuando otros están lastimados o molestos, como detenerse o poner cara triste cuando alguien llora', 'Mira su cara para saber cómo reaccionar ante una situación nueva'],
    lenguaje: ['Señala cosas en un libro cuando usted le pregunta, como "¿dónde está el oso?"', 'Dice al menos dos palabras juntas, como "más leche"', 'Señala al menos dos partes del cuerpo cuando usted le pide que se las muestre', 'Usa más gestos que solo decir adiós con la mano y señalar, como mandar un beso o asentir con la cabeza'],
    cognitivo: ['Sostiene algo en una mano mientras usa la otra; por ejemplo, sostiene un recipiente y le quita la tapa', 'Intenta usar interruptores, perillas o botones de un juguete', 'Juega con más de un juguete a la vez, como poner comida de juguete en un plato de juguete'],
    movimiento: ['Patea una pelota', 'Corre', 'Sube caminando (no gateando) algunos escalones, con o sin ayuda', 'Come con cuchara'],
  },
  30: {
    social: ['Juega al lado de otros niños y a veces juega con ellos', 'Le muestra lo que puede hacer diciendo "¡mírame!"', 'Sigue rutinas sencillas cuando se le pide, como ayudar a recoger los juguetes cuando usted dice "es hora de recoger"'],
    lenguaje: ['Dice unas 50 palabras', 'Dice dos o más palabras juntas, una de ellas de acción, como "perrito corre"', 'Nombra cosas de un libro cuando usted las señala y pregunta "¿qué es esto?"', 'Dice palabras como "yo", "mí" o "nosotros"'],
    cognitivo: ['Usa cosas para jugar a "hacer como que", como darle a una muñeca un bloque como si fuera comida', 'Muestra habilidades sencillas para resolver problemas, como subirse a un banquito para alcanzar algo', 'Sigue instrucciones de dos pasos, como "deja el juguete y cierra la puerta"', 'Muestra que conoce al menos un color, como señalar un crayón rojo cuando usted pregunta "¿cuál es el rojo?"'],
    movimiento: ['Usa las manos para girar cosas, como perillas de puertas o tapas de rosca', 'Se quita algo de ropa por sí solo, como pantalones flojos o una chamarra abierta', 'Salta despegando ambos pies del suelo', 'Pasa las páginas de un libro una por una cuando usted le lee'],
  },
  36: {
    social: ['Se calma en los 10 minutos siguientes a que usted se va, por ejemplo al dejarlo en la guardería', 'Se fija en otros niños y se une a ellos para jugar'],
    lenguaje: ['Conversa con usted con al menos dos intercambios de ida y vuelta', 'Hace preguntas con "quién", "qué", "dónde" o "por qué", como "¿dónde está mamá/papá?"', 'Dice qué acción ocurre en una imagen o libro cuando se le pregunta, como "corriendo", "comiendo" o "jugando"', 'Dice su nombre cuando se le pregunta', 'Habla lo suficientemente bien para que otras personas le entiendan la mayor parte del tiempo'],
    cognitivo: ['Dibuja un círculo cuando usted le muestra cómo', 'Evita tocar objetos calientes, como la estufa, cuando usted le advierte'],
    movimiento: ['Ensarta cosas, como cuentas grandes o pasta', 'Se pone algo de ropa por sí solo, como pantalones flojos o una chamarra', 'Usa el tenedor'],
  },
  48: {
    social: ['Juega a ser otra cosa (maestra, superhéroe, perro)', 'Pide ir a jugar con otros niños si no hay ninguno cerca, como "¿puedo jugar con Alex?"', 'Consuela a otros que están lastimados o tristes, como abrazar a un amigo que llora', 'Evita el peligro, como no saltar desde lugares altos en el parque', 'Le gusta ser "ayudante"', 'Cambia su comportamiento según el lugar donde está (templo, biblioteca, parque)'],
    lenguaje: ['Dice oraciones de cuatro o más palabras', 'Dice algunas palabras de una canción, cuento o rima infantil', 'Habla de al menos una cosa que pasó durante su día, como "jugué fútbol"', 'Responde preguntas sencillas como "¿para qué sirve un abrigo?" o "¿para qué sirve un crayón?"'],
    cognitivo: ['Nombra algunos colores de las cosas', 'Dice qué sigue en un cuento que conoce bien', 'Dibuja una persona con tres o más partes del cuerpo'],
    movimiento: ['Atrapa una pelota grande la mayoría de las veces', 'Se sirve comida o agua, con supervisión de un adulto', 'Desabotona algunos botones', 'Sostiene el crayón o lápiz entre los dedos y el pulgar (no con el puño)'],
  },
  60: {
    social: ['Sigue reglas o espera su turno al jugar con otros niños', 'Canta, baila o actúa para usted', 'Hace quehaceres sencillos en casa, como juntar calcetines en pares o levantar la mesa después de comer'],
    lenguaje: ['Cuenta un cuento que escuchó o inventó con al menos dos sucesos; por ejemplo, un gato se quedó atorado en un árbol y un bombero lo rescató', 'Responde preguntas sencillas sobre un libro o cuento después de que usted se lo lee o cuenta', 'Mantiene una conversación con más de tres intercambios de ida y vuelta', 'Usa o reconoce rimas sencillas (gato-pato, bola-ola)'],
    cognitivo: ['Cuenta hasta 10', 'Nombra algunos números entre 1 y 5 cuando usted los señala', 'Usa palabras de tiempo, como "ayer", "mañana", "en la mañana" o "en la noche"', 'Pone atención de 5 a 10 minutos durante actividades, como la hora del cuento o manualidades (el tiempo de pantallas no cuenta)', 'Escribe algunas letras de su nombre', 'Nombra algunas letras cuando usted las señala'],
    movimiento: ['Abotona algunos botones', 'Salta en un pie'],
  },
}

export function hitosDe(cp: Checkpoint): Hito[] {
  const d = DEF[cp]
  return DOMINIOS.flatMap((dom) => d[dom].map((texto, i) => ({ id: `${cp}-${dom}-${i + 1}`, dominio: dom, texto })))
}
export function checkpointLabel(cp: Checkpoint): string {
  return cp < 24 ? `${cp} meses` : cp % 12 === 0 ? `${cp / 12} años` : `${cp} meses`
}

// ---------------------------------------------------------------------------
// Edad corregida para prematuros (< 37 SDG al nacer): edad cronológica − (40 − SDG al nacer) semanas.
// Se usa hasta los 24 meses de edad cronológica (AAP, Engle WA. Pediatrics 2004;114:1362-4).
const DIA = 864e5
const DIAS_POR_MES = 30.4375
function utc(f: string) {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}
export interface EdadEval {
  cronologicaMeses: number
  corregidaMeses: number
  usaCorregida: boolean
}
export function edadParaEvaluar(fechaNac: string, fecha: string, sdgNacimiento?: number | null): EdadEval {
  const dias = Math.max(0, Math.round((utc(fecha) - utc(fechaNac)) / DIA))
  const cronologicaMeses = dias / DIAS_POR_MES
  const prematuro = !!sdgNacimiento && sdgNacimiento < 37
  const usaCorregida = prematuro && cronologicaMeses < 24
  const corregidaMeses = usaCorregida ? Math.max(0, (dias - (40 - sdgNacimiento!) * 7) / DIAS_POR_MES) : cronologicaMeses
  return { cronologicaMeses, corregidaMeses, usaCorregida }
}

/** Lista que corresponde a la edad: el último punto de control cumplido (CDC: usar la lista de la edad más reciente). */
export function checkpointParaEdad(meses: number): Checkpoint | null {
  let r: Checkpoint | null = null
  for (const c of CHECKPOINTS) if (meses + 1e-9 >= c) r = c
  return r
}

export type Respuesta = 'si' | 'no' | 'nose'
export interface Resultado {
  total: number
  si: number
  no: Hito[]
  nose: Hito[]
  sinResponder: number
  porDominio: Record<Dominio, { total: number; no: number }>
  nivel: 'ok' | 'vigilar' | 'alerta'
  mensaje: string
}
export function evaluar(cp: Checkpoint, resp: Record<string, Respuesta | undefined>, perdidaHabilidades = false): Resultado {
  const hs = hitosDe(cp)
  const porDominio = Object.fromEntries(DOMINIOS.map((d) => [d, { total: 0, no: 0 }])) as Resultado['porDominio']
  const no: Hito[] = []
  const nose: Hito[] = []
  let si = 0
  for (const h of hs) {
    porDominio[h.dominio].total++
    const r = resp[h.id]
    if (r === 'si') si++
    else if (r === 'no') {
      no.push(h)
      porDominio[h.dominio].no++
    }
    else if (r === 'nose') nose.push(h)
  }
  const sinResponder = hs.length - si - no.length - nose.length
  let nivel: Resultado['nivel'] = 'ok'
  let mensaje = 'Cumple todos los hitos marcados para la edad. Continúe la vigilancia en la siguiente visita.'
  if (perdidaHabilidades || no.length > 0) {
    nivel = 'alerta'
    mensaje = perdidaHabilidades
      ? 'Pérdida de habilidades previamente adquiridas: requiere evaluación del desarrollo sin demora.'
      : `${no.length} hito(s) que al menos el 75 % de las niñas y niños ya logran a esta edad todavía no se observan: aplicar una prueba de tamizaje del desarrollo y valorar referencia.`
  } else if (nose.length > 0 || sinResponder > 0) {
    nivel = 'vigilar'
    mensaje = 'Hay hitos sin confirmar: pida a la familia observarlos y reevalúe pronto.'
  }
  return { total: hs.length, si, no, nose, sinResponder, porDominio, nivel, mensaje }
}

// ---------------------------------------------------------------------------
// Señales de alerta (cualquier edad o edades específicas).
export const SENALES_ALERTA: { texto: string; ref: string }[] = [
  { texto: 'Pierde habilidades que ya tenía (lenguaje, sociales o motoras), a cualquier edad.', ref: 'CDC "Learn the Signs. Act Early."' },
  { texto: 'No balbucea, no señala ni usa otros gestos (como decir adiós con la mano) a los 12 meses.', ref: 'Filipek PA et al. Neurology 2000;55:468-79' },
  { texto: 'No dice palabras sueltas a los 16 meses.', ref: 'Filipek PA et al. Neurology 2000' },
  { texto: 'No dice frases espontáneas de dos palabras (no solo repetidas) a los 24 meses.', ref: 'Filipek PA et al. Neurology 2000' },
  { texto: 'Asimetría persistente del movimiento o del tono (usa solo un lado del cuerpo), o rigidez/flacidez marcadas.', ref: 'Vigilancia neurológica habitual (verificar)' },
  { texto: 'No responde a sonidos o no fija la mirada.', ref: 'Vigilancia de audición y visión (verificar)' },
  { texto: 'La familia o el cuidador están preocupados por el desarrollo.', ref: 'CDC; AAP (Lipkin PH, Macias MM. Pediatrics 2020;145:e20193449)' },
]

export const GUIA_PADRES =
  'Usted conoce mejor que nadie a su hija o hijo. Si no ha alcanzado uno o más de estos hitos, ha perdido habilidades que ya tenía o a usted le preocupa algo, no espere: hable con su médico, comparta sus dudas y pregunte por una prueba de tamizaje del desarrollo. Actuar pronto puede marcar una gran diferencia. Mientras tanto, háblele, léale, cántele y juegue con su hijo todos los días.'

export const NOTA_EDI =
  'En México, la prueba nacional de tamizaje del desarrollo es la Evaluación del Desarrollo Infantil (EDI) de la Secretaría de Salud (1 a 59 meses). Esta lista de hitos es de vigilancia y no sustituye una prueba de tamizaje; aplique la EDI con su material y capacitación oficiales (verificar vigencia). AAP recomienda tamizaje formal a los 9, 18 y 30 meses y tamizaje de autismo a los 18 y 24 meses (Lipkin & Macias, Pediatrics 2020).'

// Contenido de datos de un Registro tipo "desarrollo".
export interface DatosDesarrollo {
  fechaEval: string
  sdgNacimiento?: number
  edadCronologicaMeses: number
  edadCorregidaMeses: number
  usaCorregida: boolean
  checkpoint: Checkpoint
  respuestas: Record<string, Respuesta>
  perdidaHabilidades: boolean
  preocupaciones?: string
  notas?: string
  nivel: Resultado['nivel']
  noCumplidos: string[]
}
