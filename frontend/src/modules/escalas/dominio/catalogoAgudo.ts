/**
 * Escalas del paciente agudo: conciencia, evento vascular y hemorragia
 * subaracnoidea, y la clasificación de las malformaciones arteriovenosas.
 *
 * Contenido clínico: cada escala cita su fuente. Lo que no se pudo confirmar
 * contra un documento validado lleva `verificar` y se pinta «(verificar)» hasta
 * que un médico lo revise (lista completa en
 * `openspec/changes/escalas-neuro/proposal.md`). No se inventó ningún corte.
 */
import type { Escala, Opcion } from './tipos'

/** Opciones numéricas cuyo código es su propio puntaje. */
const num = (pares: [number, string][]): Opcion[] =>
  pares.map(([puntos, texto]) => ({ codigo: String(puntos), puntos, texto }))

export const GLASGOW: Escala = {
  id: 'glasgow',
  version: '1',
  nombre: 'Glasgow',
  titulo: 'Escala de coma de Glasgow',
  descripcion: 'Nivel de conciencia por apertura ocular, respuesta verbal y respuesta motora.',
  instrucciones:
    'Si un componente no se puede valorar (ojos cerrados por edema, intubación), elige «no valorable»: el total no se suma y se registra por componentes, por ejemplo O3 VT M5.',
  fuente: 'Teasdale G, Jennett B. Lancet 1974;2:81-4. Teasdale G et al. Lancet Neurol 2014;13:844-54.',
  items: [
    {
      id: 'ocular',
      titulo: 'Apertura ocular (O)',
      abreviatura: 'O',
      opciones: [
        ...num([
          [4, 'Espontánea'],
          [3, 'Al sonido (a la orden verbal)'],
          [2, 'A la presión'],
          [1, 'Ninguna'],
        ]),
        { codigo: 'C', puntos: null, texto: 'No valorable: ojos cerrados por edema o vendaje (C)' },
      ],
    },
    {
      id: 'verbal',
      titulo: 'Respuesta verbal (V)',
      abreviatura: 'V',
      opciones: [
        ...num([
          [5, 'Orientada'],
          [4, 'Confusa'],
          [3, 'Palabras'],
          [2, 'Sonidos'],
          [1, 'Ninguna'],
        ]),
        { codigo: 'T', puntos: null, texto: 'No valorable: intubado o con traqueostomía (T)' },
        { codigo: 'NT', puntos: null, texto: 'No valorable por otra causa (NT)' },
      ],
    },
    {
      id: 'motora',
      titulo: 'Respuesta motora (M)',
      abreviatura: 'M',
      opciones: [
        ...num([
          [6, 'Obedece órdenes'],
          [5, 'Localiza'],
          [4, 'Flexión normal (retirada)'],
          [3, 'Flexión anormal (decorticación)'],
          [2, 'Extensión (descerebración)'],
          [1, 'Ninguna'],
        ]),
        { codigo: 'NT', puntos: null, texto: 'No valorable (NT)' },
      ],
    },
  ],
  calculo: 'suma',
  noValorable: 'anula',
  min: 3,
  max: 15,
  presentacion: 'puntos',
  mayorEsMejor: true,
  bandas: [
    { hasta: 8, texto: 'Grave (3–8)', tono: 'alerta' },
    { hasta: 12, texto: 'Moderado (9–12)', tono: 'aviso' },
    { hasta: 15, texto: 'Leve (13–15)', tono: 'ok' },
  ],
}

const UN_EXTREMIDAD: Opcion = {
  codigo: 'UN',
  puntos: null,
  texto: 'No valorable: amputación o fusión articular (UN)',
}

const motorBrazo = (id: string, lado: string) => ({
  id,
  titulo: `${id}. Motor del brazo ${lado}`,
  verificar: true,
  ayuda: 'Brazo extendido a 90° (sentado) o 45° (acostado) durante 10 segundos.',
  opciones: [
    ...num([
      [0, 'Sin caída: sostiene 10 segundos'],
      [1, 'Cae antes de 10 segundos sin tocar la cama'],
      [2, 'Algún esfuerzo contra la gravedad'],
      [3, 'Sin esfuerzo contra la gravedad: cae'],
      [4, 'Ningún movimiento'],
    ]),
    UN_EXTREMIDAD,
  ],
})

const motorPierna = (id: string, lado: string) => ({
  id,
  titulo: `${id}. Motor de la pierna ${lado}`,
  verificar: true,
  ayuda: 'Pierna a 30°, acostado, durante 5 segundos.',
  opciones: [
    ...num([
      [0, 'Sin caída: sostiene 5 segundos'],
      [1, 'Cae antes de 5 segundos sin tocar la cama'],
      [2, 'Algún esfuerzo contra la gravedad'],
      [3, 'Sin esfuerzo contra la gravedad: cae de inmediato'],
      [4, 'Ningún movimiento'],
    ]),
    UN_EXTREMIDAD,
  ],
})

export const NIHSS: Escala = {
  id: 'nihss',
  version: '1',
  nombre: 'NIHSS',
  titulo: 'Escala de ictus de los Institutos Nacionales de Salud (NIHSS)',
  descripcion: 'Gravedad del déficit neurológico en el evento vascular cerebral.',
  instrucciones:
    'Califica lo que el paciente hace, no lo que crees que podría hacer. Un ítem no valorable (UN) cuenta 0 y queda anotado.',
  fuente: 'Brott T et al. Stroke 1989;20:864-70. National Institute of Neurological Disorders and Stroke.',
  verificar: [
    'Textos de los ítems: traducción libre del original en inglés; contrastar con la versión validada en español.',
    'Rangos de gravedad: son de uso común, no del artículo original.',
  ],
  bandasPorVerificar: true,
  items: [
    {
      id: '1a',
      titulo: '1a. Nivel de conciencia',
      verificar: true,
      opciones: num([
        [0, 'Alerta'],
        [1, 'Somnoliento: despierta con un estímulo menor'],
        [2, 'Estuporoso: necesita estímulos repetidos o dolorosos'],
        [3, 'Coma: solo respuestas reflejas o ninguna'],
      ]),
    },
    {
      id: '1b',
      titulo: '1b. Preguntas: mes y edad',
      verificar: true,
      ayuda: 'Intubado, trauma orotraqueal, disartria grave o barrera de idioma: 1. Afasia o estupor: 2.',
      opciones: num([
        [0, 'Responde bien las dos'],
        [1, 'Responde bien una'],
        [2, 'No responde bien ninguna'],
      ]),
    },
    {
      id: '1c',
      titulo: '1c. Órdenes: abrir y cerrar los ojos, apretar y soltar la mano',
      verificar: true,
      opciones: num([
        [0, 'Hace bien las dos'],
        [1, 'Hace bien una'],
        [2, 'No hace bien ninguna'],
      ]),
    },
    {
      id: '2',
      titulo: '2. Mirada',
      verificar: true,
      opciones: num([
        [0, 'Normal'],
        [1, 'Parálisis parcial de la mirada'],
        [2, 'Desviación forzada o parálisis total'],
      ]),
    },
    {
      id: '3',
      titulo: '3. Campos visuales',
      verificar: true,
      opciones: num([
        [0, 'Sin pérdida visual'],
        [1, 'Hemianopsia parcial'],
        [2, 'Hemianopsia completa'],
        [3, 'Hemianopsia bilateral (ceguera, incluida la cortical)'],
      ]),
    },
    {
      id: '4',
      titulo: '4. Parálisis facial',
      verificar: true,
      opciones: num([
        [0, 'Movimiento normal y simétrico'],
        [1, 'Menor: surco nasolabial borrado, asimetría al sonreír'],
        [2, 'Parcial: parálisis total o casi total de la parte inferior de la cara'],
        [3, 'Completa: de uno o ambos lados, partes superior e inferior'],
      ]),
    },
    motorBrazo('5a', 'izquierdo'),
    motorBrazo('5b', 'derecho'),
    motorPierna('6a', 'izquierda'),
    motorPierna('6b', 'derecha'),
    {
      id: '7',
      titulo: '7. Ataxia de las extremidades',
      verificar: true,
      ayuda: 'Dedo-nariz y talón-rodilla. Solo cuenta si es desproporcionada a la debilidad.',
      opciones: [
        ...num([
          [0, 'Ausente'],
          [1, 'En una extremidad'],
          [2, 'En dos extremidades'],
        ]),
        UN_EXTREMIDAD,
      ],
    },
    {
      id: '8',
      titulo: '8. Sensibilidad',
      verificar: true,
      opciones: num([
        [0, 'Normal'],
        [1, 'Pérdida leve a moderada'],
        [2, 'Pérdida grave o total'],
      ]),
    },
    {
      id: '9',
      titulo: '9. Lenguaje',
      verificar: true,
      opciones: num([
        [0, 'Normal, sin afasia'],
        [1, 'Afasia leve a moderada'],
        [2, 'Afasia grave'],
        [3, 'Mudo o afasia global'],
      ]),
    },
    {
      id: '10',
      titulo: '10. Disartria',
      verificar: true,
      opciones: [
        ...num([
          [0, 'Normal'],
          [1, 'Leve a moderada: se le entiende con dificultad'],
          [2, 'Grave: ininteligible o anártrico'],
        ]),
        { codigo: 'UN', puntos: null, texto: 'No valorable: intubado u otra barrera física (UN)' },
      ],
    },
    {
      id: '11',
      titulo: '11. Extinción e inatención',
      verificar: true,
      opciones: num([
        [0, 'Sin alteración'],
        [1, 'Inatención o extinción en una modalidad'],
        [2, 'Hemi-inatención profunda o en más de una modalidad'],
      ]),
    },
  ],
  calculo: 'suma',
  noValorable: 'cero',
  min: 0,
  max: 42,
  presentacion: 'puntos',
  bandas: [
    { hasta: 0, texto: 'Sin déficit medible', tono: 'ok' },
    { hasta: 4, texto: 'Déficit menor (1–4)', tono: 'ok' },
    { hasta: 15, texto: 'Déficit moderado (5–15)', tono: 'aviso' },
    { hasta: 20, texto: 'Déficit moderado a grave (16–20)', tono: 'alerta' },
    { hasta: 42, texto: 'Déficit grave (21–42)', tono: 'alerta' },
  ],
}

export const HUNT_HESS: Escala = {
  id: 'hunt_hess',
  version: '1',
  nombre: 'Hunt y Hess',
  titulo: 'Escala de Hunt y Hess',
  descripcion: 'Gravedad clínica de la hemorragia subaracnoidea aneurismática.',
  instrucciones:
    'El original sube un grado por enfermedad sistémica grave (hipertensión, diabetes, aterosclerosis grave, neumopatía crónica) o vasoespasmo grave en la angiografía. Si aplica, elige el grado ya ajustado.',
  fuente: 'Hunt WE, Hess RM. J Neurosurg 1968;28:14-20.',
  items: [
    {
      id: 'grado',
      titulo: 'Cuadro clínico',
      opciones: [
        { codigo: 'I', puntos: 1, texto: 'I. Asintomático, o cefalea mínima y leve rigidez de nuca' },
        { codigo: 'II', puntos: 2, texto: 'II. Cefalea moderada a grave, rigidez de nuca; sin déficit neurológico salvo parálisis de un nervio craneal' },
        { codigo: 'III', puntos: 3, texto: 'III. Somnolencia, confusión o déficit focal leve' },
        { codigo: 'IV', puntos: 4, texto: 'IV. Estupor, hemiparesia moderada a grave; posible rigidez de descerebración temprana y alteraciones vegetativas' },
        { codigo: 'V', puntos: 5, texto: 'V. Coma profundo, rigidez de descerebración, aspecto moribundo' },
      ],
    },
  ],
  calculo: 'suma',
  min: 1,
  max: 5,
  presentacion: 'romano',
  bandas: [
    { hasta: 1, texto: 'Grado I', tono: 'ok' },
    { hasta: 2, texto: 'Grado II', tono: 'ok' },
    { hasta: 3, texto: 'Grado III', tono: 'aviso' },
    { hasta: 4, texto: 'Grado IV', tono: 'alerta' },
    { hasta: 5, texto: 'Grado V', tono: 'alerta' },
  ],
}

export const FISHER_MODIFICADA: Escala = {
  id: 'fisher_modificada',
  version: '1',
  nombre: 'Fisher modificada',
  titulo: 'Escala de Fisher modificada',
  descripcion: 'Cantidad de sangre en la tomografía de la hemorragia subaracnoidea.',
  fuente: 'Frontera JA et al. Neurosurgery 2006;59:21-7.',
  items: [
    {
      id: 'grado',
      titulo: 'Hallazgo en la tomografía',
      opciones: [
        { codigo: '0', puntos: 0, texto: '0. Sin hemorragia subaracnoidea ni intraventricular' },
        { codigo: '1', puntos: 1, texto: '1. Hemorragia subaracnoidea focal o difusa delgada, sin hemorragia intraventricular' },
        { codigo: '2', puntos: 2, texto: '2. Hemorragia subaracnoidea focal o difusa delgada, con hemorragia intraventricular' },
        { codigo: '3', puntos: 3, texto: '3. Hemorragia subaracnoidea gruesa, sin hemorragia intraventricular' },
        { codigo: '4', puntos: 4, texto: '4. Hemorragia subaracnoidea gruesa, con hemorragia intraventricular' },
      ],
    },
  ],
  calculo: 'suma',
  min: 0,
  max: 4,
  presentacion: 'puntos',
  bandas: [
    { hasta: 0, texto: 'Grado 0', tono: 'ok' },
    { hasta: 1, texto: 'Grado 1', tono: 'aviso' },
    { hasta: 2, texto: 'Grado 2', tono: 'aviso' },
    { hasta: 3, texto: 'Grado 3', tono: 'alerta' },
    { hasta: 4, texto: 'Grado 4', tono: 'alerta' },
  ],
}

export const WFNS: Escala = {
  id: 'wfns',
  version: '1',
  nombre: 'WFNS',
  titulo: 'Escala de la Federación Mundial de Sociedades de Neurocirugía (WFNS)',
  descripcion: 'Gravedad de la hemorragia subaracnoidea por Glasgow y déficit motor.',
  fuente: 'Drake CG et al. J Neurosurg 1988;68:985-6.',
  items: [
    {
      id: 'grado',
      titulo: 'Glasgow y déficit motor',
      opciones: [
        { codigo: 'I', puntos: 1, texto: 'I. Glasgow 15, sin déficit motor' },
        { codigo: 'II', puntos: 2, texto: 'II. Glasgow 13–14, sin déficit motor' },
        { codigo: 'III', puntos: 3, texto: 'III. Glasgow 13–14, con déficit motor' },
        { codigo: 'IV', puntos: 4, texto: 'IV. Glasgow 7–12, con o sin déficit motor' },
        { codigo: 'V', puntos: 5, texto: 'V. Glasgow 3–6, con o sin déficit motor' },
      ],
    },
  ],
  calculo: 'suma',
  min: 1,
  max: 5,
  presentacion: 'romano',
  bandas: [
    { hasta: 1, texto: 'Grado I', tono: 'ok' },
    { hasta: 2, texto: 'Grado II', tono: 'ok' },
    { hasta: 3, texto: 'Grado III', tono: 'aviso' },
    { hasta: 4, texto: 'Grado IV', tono: 'alerta' },
    { hasta: 5, texto: 'Grado V', tono: 'alerta' },
  ],
}

export const SPETZLER_MARTIN: Escala = {
  id: 'spetzler_martin',
  version: '1',
  nombre: 'Spetzler-Martin',
  titulo: 'Escala de Spetzler-Martin',
  descripcion: 'Clasificación de las malformaciones arteriovenosas cerebrales.',
  instrucciones:
    'Área elocuente: corteza sensitivomotora, del lenguaje o visual; hipotálamo, tálamo, cápsula interna, tallo, pedúnculos cerebelosos o núcleos cerebelosos profundos.',
  fuente:
    'Spetzler RF, Martin NA. J Neurosurg 1986;65:476-83. Clases A–C: Spetzler RF, Ponce FA. J Neurosurg 2011;114:842-9.',
  items: [
    {
      id: 'tamano',
      titulo: 'Tamaño del nido',
      opciones: num([
        [1, 'Pequeño (menos de 3 cm)'],
        [2, 'Mediano (3 a 6 cm)'],
        [3, 'Grande (más de 6 cm)'],
      ]),
    },
    {
      id: 'elocuencia',
      titulo: 'Elocuencia del cerebro adyacente',
      opciones: num([
        [0, 'No elocuente'],
        [1, 'Elocuente'],
      ]),
    },
    {
      id: 'drenaje',
      titulo: 'Drenaje venoso',
      opciones: num([
        [0, 'Solo superficial'],
        [1, 'Profundo'],
      ]),
    },
  ],
  calculo: 'suma',
  min: 1,
  max: 5,
  presentacion: 'romano',
  bandas: [
    { hasta: 1, texto: 'Grado I · clase A', tono: 'ok' },
    { hasta: 2, texto: 'Grado II · clase A', tono: 'ok' },
    { hasta: 3, texto: 'Grado III · clase B', tono: 'aviso' },
    { hasta: 4, texto: 'Grado IV · clase C', tono: 'alerta' },
    { hasta: 5, texto: 'Grado V · clase C', tono: 'alerta' },
  ],
}
