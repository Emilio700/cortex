// Definición de escalas clínicas: ítems en español, puntaje y bandas de severidad.
export type Tone = 'ok' | 'warn' | 'danger' | 'neutral'
export interface Item {
  name: string
  title: string
  choices: [number, string][]
  scored?: boolean // false = no suma al puntaje
}
export interface Ctx {
  sexo?: 'F' | 'M' | 'O'
  edad?: number
  imc?: number
  cintura?: number
}
export interface Escala {
  id: string
  nombre: string // etiqueta guardada en la observación
  titulo: string
  area: string
  desc: string
  instrucciones?: string
  items: (x: Ctx) => Item[]
  min: number
  max: number
  menorEsPeor?: boolean
  banda: (p: number, x: Ctx, data: Record<string, number>) => [string, Tone]
  detalle?: (data: Record<string, number>, p: number) => string | undefined
  defaults?: (x: Ctx) => Record<string, number>
  ref: string
}

const frec4 = (txt: string[]): [number, string][] => txt.map((t, i) => [i, t])
const PHQ_OPC = frec4(['Ningún día', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días'])
const GAD_OPC = frec4(['Nunca', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días'])
const lista = (titulos: string[], opc: [number, string][]): Item[] => titulos.map((t, i) => ({ name: 'q' + (i + 1), title: t, choices: opc }))

export const ESCALAS: Escala[] = [
  {
    id: 'phq9', nombre: 'PHQ-9', titulo: 'PHQ-9 · Cuestionario de salud del paciente', area: 'Salud mental', desc: 'Tamizaje y severidad de depresión',
    instrucciones: 'Durante las últimas 2 semanas, ¿qué tan seguido ha tenido molestias debido a los siguientes problemas?',
    items: () => [
      ...lista([
        'Poco interés o placer en hacer cosas',
        'Se ha sentido decaído(a), deprimido(a) o sin esperanzas',
        'Ha tenido dificultad para quedarse o permanecer dormido(a), o ha dormido demasiado',
        'Se ha sentido cansado(a) o con poca energía',
        'Sin apetito o ha comido en exceso',
        'Se ha sentido mal con usted mismo(a), o que es un fracaso, o que ha quedado mal con usted mismo(a) o con su familia',
        'Ha tenido dificultad para concentrarse en ciertas actividades, tales como leer el periódico o ver la televisión',
        '¿Se ha movido o hablado tan lento que otras personas podrían haberlo notado? O lo contrario: muy inquieto(a) o agitado(a), moviéndose mucho más de lo normal',
        'Pensamientos de que estaría mejor muerto(a) o de lastimarse de alguna manera',
      ], PHQ_OPC),
      { name: 'dif', scored: false, title: 'Si marcó cualquiera de los problemas, ¿qué tanta dificultad le han dado para hacer su trabajo, encargarse de las tareas del hogar o llevarse bien con otras personas?', choices: frec4(['No ha sido difícil', 'Un poco difícil', 'Muy difícil', 'Extremadamente difícil']) },
    ],
    min: 0, max: 27,
    banda: (p) => (p <= 4 ? ['Depresión mínima', 'ok'] : p <= 9 ? ['Depresión leve', 'ok'] : p <= 14 ? ['Depresión moderada', 'warn'] : p <= 19 ? ['Depresión moderadamente severa', 'danger'] : ['Depresión severa', 'danger']),
    ref: 'Kroenke K, Spitzer RL, Williams JB. J Gen Intern Med 2001;16:606-13. Versión en español © Pfizer Inc., de uso libre.',
  },
  {
    id: 'gad7', nombre: 'GAD-7', titulo: 'GAD-7 · Trastorno de ansiedad generalizada', area: 'Salud mental', desc: 'Tamizaje y severidad de ansiedad',
    instrucciones: 'Durante las últimas 2 semanas, ¿con qué frecuencia le han molestado los siguientes problemas?',
    items: () => lista([
      'Se ha sentido nervioso(a), ansioso(a) o con los nervios de punta',
      'No ha sido capaz de parar o controlar su preocupación',
      'Se ha preocupado demasiado por motivos diferentes',
      'Ha tenido dificultad para relajarse',
      'Se ha sentido tan inquieto(a) que no ha podido quedarse quieto(a)',
      'Se ha molestado o irritado fácilmente',
      'Ha tenido miedo de que algo terrible fuera a pasar',
    ], GAD_OPC),
    min: 0, max: 21,
    banda: (p) => (p <= 4 ? ['Ansiedad mínima', 'ok'] : p <= 9 ? ['Ansiedad leve', 'ok'] : p <= 14 ? ['Ansiedad moderada', 'warn'] : ['Ansiedad severa', 'danger']),
    ref: 'Spitzer RL et al. Arch Intern Med 2006;166:1092-7. García-Campayo J et al. Health Qual Life Outcomes 2010 (validación en español). © Pfizer Inc.',
  },
  {
    id: 'auditc', nombre: 'AUDIT-C', titulo: 'AUDIT-C · Consumo de alcohol', area: 'Salud mental', desc: 'Consumo de riesgo de alcohol (3 preguntas)',
    items: () => [
      { name: 'q1', title: '¿Con qué frecuencia consume alguna bebida que contenga alcohol?', choices: frec4(['Nunca', 'Una o menos veces al mes', 'De 2 a 4 veces al mes', 'De 2 a 3 veces a la semana', '4 o más veces a la semana']) },
      { name: 'q2', title: '¿Cuántas bebidas alcohólicas suele tomar en un día de consumo normal?', choices: frec4(['1 o 2', '3 o 4', '5 o 6', 'De 7 a 9', '10 o más']) },
      { name: 'q3', title: '¿Con qué frecuencia toma 6 o más bebidas alcohólicas en un solo día?', choices: frec4(['Nunca', 'Menos de una vez al mes', 'Mensualmente', 'Semanalmente', 'A diario o casi a diario']) },
    ],
    min: 0, max: 12,
    banda: (p, x) => {
      const corte = x.sexo === 'M' ? 4 : 3
      return p >= 8 ? ['Positivo: posible consumo perjudicial o dependencia; aplicar AUDIT completo', 'danger'] : p >= corte ? [`Positivo (≥ ${corte}): consumo de riesgo`, 'warn'] : ['Negativo', 'ok']
    },
    ref: 'Bush K et al. Arch Intern Med 1998;158:1789-95. Corte ≥ 4 hombres, ≥ 3 mujeres (Bradley 2007).',
  },
  {
    id: 'glasgow', nombre: 'Glasgow', titulo: 'Escala de coma de Glasgow', area: 'Urgencias y neurología', desc: 'Nivel de conciencia (ocular, verbal, motora)',
    items: () => [
      { name: 'o', title: 'Apertura ocular (O)', choices: [[4, 'Espontánea'], [3, 'A la orden verbal'], [2, 'Al dolor (presión)'], [1, 'Ninguna']] },
      { name: 'v', title: 'Respuesta verbal (V)', choices: [[5, 'Orientada'], [4, 'Confusa'], [3, 'Palabras inapropiadas'], [2, 'Sonidos incomprensibles'], [1, 'Ninguna']] },
      { name: 'm', title: 'Respuesta motora (M)', choices: [[6, 'Obedece órdenes'], [5, 'Localiza el dolor'], [4, 'Retirada al dolor (flexión normal)'], [3, 'Flexión anormal (decorticación)'], [2, 'Extensión (descerebración)'], [1, 'Ninguna']] },
    ],
    min: 3, max: 15, menorEsPeor: true,
    banda: (p) => (p >= 13 ? ['Leve (13–15)', 'ok'] : p >= 9 ? ['Moderado (9–12)', 'warn'] : ['Grave (≤ 8): considerar protección de la vía aérea', 'danger']),
    detalle: (d) => `O${d.o} V${d.v} M${d.m}`,
    ref: 'Teasdale G, Jennett B. Lancet 1974;2:81-4.',
  },
  {
    id: 'apgar', nombre: 'Apgar', titulo: 'Apgar del recién nacido', area: 'Neonatología', desc: 'Valoración al minuto 1 y 5',
    items: () => [
      { name: 'min', scored: false, title: 'Minuto de valoración', choices: [[1, '1 minuto'], [5, '5 minutos'], [10, '10 minutos']] },
      { name: 'fc', title: 'Frecuencia cardiaca', choices: [[0, 'Ausente'], [1, 'Menor de 100 lpm'], [2, '100 lpm o más']] },
      { name: 'resp', title: 'Esfuerzo respiratorio', choices: [[0, 'Ausente'], [1, 'Lento o irregular, llanto débil'], [2, 'Bueno, llanto vigoroso']] },
      { name: 'tono', title: 'Tono muscular', choices: [[0, 'Flácido'], [1, 'Cierta flexión de extremidades'], [2, 'Movimiento activo']] },
      { name: 'refl', title: 'Irritabilidad refleja', choices: [[0, 'Sin respuesta'], [1, 'Muecas'], [2, 'Llanto, tos o estornudo']] },
      { name: 'color', title: 'Color', choices: [[0, 'Cianosis o palidez generalizada'], [1, 'Cuerpo rosado, extremidades cianóticas (acrocianosis)'], [2, 'Completamente rosado']] },
    ],
    min: 0, max: 10, menorEsPeor: true,
    banda: (p) => (p >= 7 ? ['Normal / tranquilizador (7–10)', 'ok'] : p >= 4 ? ['Moderadamente anormal (4–6)', 'warn'] : ['Bajo (0–3)', 'danger']),
    detalle: (d) => `Minuto ${d.min}`,
    ref: 'Apgar V. Curr Res Anesth Analg 1953;32:260-7. AAP/ACOG Committee Opinion 644 (2015).',
  },
  {
    id: 'silverman', nombre: 'Silverman-Andersen', titulo: 'Silverman-Andersen', area: 'Neonatología', desc: 'Dificultad respiratoria neonatal',
    items: () => [
      { name: 'ta', title: 'Movimientos toracoabdominales', choices: [[0, 'Rítmicos y regulares'], [1, 'Tórax inmóvil, solo movimiento abdominal'], [2, 'Disociación toracoabdominal (balanceo)']] },
      { name: 'ti', title: 'Tiraje intercostal', choices: [[0, 'Ausente'], [1, 'Discreto'], [2, 'Acentuado']] },
      { name: 'rx', title: 'Retracción xifoidea', choices: [[0, 'Ausente'], [1, 'Discreta'], [2, 'Muy marcada']] },
      { name: 'an', title: 'Aleteo nasal', choices: [[0, 'Ausente'], [1, 'Discreto'], [2, 'Muy acentuado']] },
      { name: 'qe', title: 'Quejido espiratorio', choices: [[0, 'Ausente'], [1, 'Audible con estetoscopio'], [2, 'Audible sin estetoscopio']] },
    ],
    min: 0, max: 10,
    banda: (p) => (p === 0 ? ['Sin dificultad respiratoria', 'ok'] : p <= 3 ? ['Dificultad respiratoria leve', 'warn'] : p <= 6 ? ['Dificultad respiratoria moderada', 'danger'] : ['Dificultad respiratoria grave', 'danger']),
    ref: 'Silverman WA, Andersen DH. Pediatrics 1956;17:1-10.',
  },
  {
    id: 'barthel', nombre: 'Barthel', titulo: 'Índice de Barthel', area: 'Geriatría y enfermería', desc: 'Independencia en actividades básicas',
    items: () => [
      { name: 'comer', title: 'Comer', choices: [[10, 'Independiente'], [5, 'Necesita ayuda para cortar, untar, etc.'], [0, 'Dependiente']] },
      { name: 'banarse', title: 'Bañarse', choices: [[5, 'Independiente'], [0, 'Dependiente']] },
      { name: 'arreglo', title: 'Arreglarse (lavarse cara, peinarse, afeitarse, dientes)', choices: [[5, 'Independiente'], [0, 'Necesita ayuda']] },
      { name: 'vestir', title: 'Vestirse', choices: [[10, 'Independiente (incluye botones, cierres, cordones)'], [5, 'Necesita ayuda; hace al menos la mitad'], [0, 'Dependiente']] },
      { name: 'heces', title: 'Deposiciones', choices: [[10, 'Continente'], [5, 'Accidente ocasional (≤ 1/semana)'], [0, 'Incontinente o necesita enemas']] },
      { name: 'orina', title: 'Micción', choices: [[10, 'Continente (o maneja la sonda solo)'], [5, 'Accidente ocasional (≤ 1/día)'], [0, 'Incontinente o sondado sin autonomía']] },
      { name: 'retrete', title: 'Uso del retrete', choices: [[10, 'Independiente'], [5, 'Necesita alguna ayuda'], [0, 'Dependiente']] },
      { name: 'traslado', title: 'Trasladarse (cama ↔ sillón)', choices: [[15, 'Independiente'], [10, 'Mínima ayuda o supervisión'], [5, 'Gran ayuda, pero puede sentarse'], [0, 'Incapaz']] },
      { name: 'deamb', title: 'Deambulación', choices: [[15, 'Independiente > 50 m (puede usar bastón)'], [10, 'Camina > 50 m con ayuda de una persona'], [5, 'Independiente en silla de ruedas > 50 m'], [0, 'Inmóvil o < 50 m']] },
      { name: 'escal', title: 'Subir y bajar escaleras', choices: [[10, 'Independiente'], [5, 'Necesita ayuda o supervisión'], [0, 'Incapaz']] },
    ],
    min: 0, max: 100, menorEsPeor: true,
    banda: (p) => (p === 100 ? ['Independiente', 'ok'] : p >= 91 ? ['Dependencia escasa', 'ok'] : p >= 61 ? ['Dependencia moderada', 'warn'] : p >= 21 ? ['Dependencia severa', 'danger'] : ['Dependencia total', 'danger']),
    ref: 'Mahoney FI, Barthel DW. Md State Med J 1965;14:61-5. Cid-Ruzafa J, Damián-Moreno J. Rev Esp Salud Pública 1997;71:127-37.',
  },
  {
    id: 'morse', nombre: 'Morse', titulo: 'Escala de caídas de Morse', area: 'Geriatría y enfermería', desc: 'Riesgo de caídas en hospitalización',
    items: () => [
      { name: 'cai', title: 'Antecedente de caídas (inmediato o en los últimos 3 meses)', choices: [[0, 'No'], [25, 'Sí']] },
      { name: 'dx', title: 'Diagnóstico secundario (más de un diagnóstico médico)', choices: [[0, 'No'], [15, 'Sí']] },
      { name: 'ayuda', title: 'Ayuda para deambular', choices: [[0, 'Ninguna, reposo en cama o asistido por enfermería'], [15, 'Bastón, muletas o andadera'], [30, 'Se apoya en el mobiliario']] },
      { name: 'iv', title: 'Terapia intravenosa o catéter heparinizado', choices: [[0, 'No'], [20, 'Sí']] },
      { name: 'marcha', title: 'Marcha', choices: [[0, 'Normal, reposo en cama o inmóvil'], [10, 'Débil'], [20, 'Alterada']] },
      { name: 'mental', title: 'Estado mental', choices: [[0, 'Consciente de sus capacidades'], [15, 'Sobreestima u olvida sus limitaciones']] },
    ],
    min: 0, max: 125,
    banda: (p) => (p >= 45 ? ['Riesgo alto: medidas específicas de prevención', 'danger'] : p >= 25 ? ['Riesgo moderado: medidas estándar de prevención', 'warn'] : ['Riesgo bajo: cuidados básicos', 'ok']),
    ref: 'Morse JM, Morse RM, Tylko SJ. Can J Aging 1989;8:366-77.',
  },
  {
    id: 'braden', nombre: 'Braden', titulo: 'Escala de Braden', area: 'Geriatría y enfermería', desc: 'Riesgo de lesiones por presión',
    items: () => [
      { name: 'per', title: 'Percepción sensorial', choices: [[1, 'Completamente limitada'], [2, 'Muy limitada'], [3, 'Ligeramente limitada'], [4, 'Sin limitaciones']] },
      { name: 'hum', title: 'Exposición a la humedad', choices: [[1, 'Constantemente húmeda'], [2, 'A menudo húmeda'], [3, 'Ocasionalmente húmeda'], [4, 'Raramente húmeda']] },
      { name: 'act', title: 'Actividad', choices: [[1, 'Encamado'], [2, 'En silla'], [3, 'Deambula ocasionalmente'], [4, 'Deambula frecuentemente']] },
      { name: 'mov', title: 'Movilidad', choices: [[1, 'Completamente inmóvil'], [2, 'Muy limitada'], [3, 'Ligeramente limitada'], [4, 'Sin limitaciones']] },
      { name: 'nut', title: 'Nutrición', choices: [[1, 'Muy pobre'], [2, 'Probablemente inadecuada'], [3, 'Adecuada'], [4, 'Excelente']] },
      { name: 'fri', title: 'Fricción y cizallamiento', choices: [[1, 'Problema'], [2, 'Problema potencial'], [3, 'Sin problema aparente']] },
    ],
    min: 6, max: 23, menorEsPeor: true,
    banda: (p) => (p <= 9 ? ['Riesgo muy alto', 'danger'] : p <= 12 ? ['Riesgo alto', 'danger'] : p <= 14 ? ['Riesgo moderado', 'warn'] : p <= 18 ? ['Riesgo bajo', 'warn'] : ['Sin riesgo', 'ok']),
    ref: 'Bergstrom N et al. Nurs Res 1987;36:205-10.',
  },
  {
    id: 'findrisc', nombre: 'FINDRISC', titulo: 'FINDRISC · Riesgo de diabetes tipo 2', area: 'Prevención', desc: 'Riesgo de DM2 a 10 años',
    items: (x) => [
      { name: 'edad', title: 'Edad', choices: [[0, 'Menos de 45 años'], [2, '45–54 años'], [3, '55–64 años'], [4, 'Más de 64 años']] },
      { name: 'imc', title: 'Índice de masa corporal', choices: [[0, 'Menos de 25 kg/m²'], [1, '25–30 kg/m²'], [3, 'Más de 30 kg/m²']] },
      { name: 'cintura', title: 'Perímetro de cintura', choices: x.sexo === 'M' ? [[0, 'Menos de 94 cm'], [3, '94–102 cm'], [4, 'Más de 102 cm']] : [[0, 'Menos de 80 cm'], [3, '80–88 cm'], [4, 'Más de 88 cm']] },
      { name: 'af', title: '¿Realiza habitualmente al menos 30 minutos de actividad física al día (en el trabajo o en su tiempo libre)?', choices: [[0, 'Sí'], [2, 'No']] },
      { name: 'fruta', title: '¿Con qué frecuencia come verduras o frutas?', choices: [[0, 'Todos los días'], [1, 'No todos los días']] },
      { name: 'hta', title: '¿Le han recetado alguna vez medicamentos para la presión alta?', choices: [[0, 'No'], [2, 'Sí']] },
      { name: 'glu', title: '¿Le han encontrado alguna vez la glucosa alta (en un examen, enfermedad o embarazo)?', choices: [[0, 'No'], [5, 'Sí']] },
      { name: 'fam', title: '¿Algún familiar ha sido diagnosticado con diabetes (tipo 1 o 2)?', choices: [[0, 'No'], [3, 'Sí: abuelos, tíos o primos'], [5, 'Sí: padres, hermanos o hijos']] },
    ],
    defaults: (x) => {
      const d: Record<string, number> = {}
      if (x.edad !== undefined) d.edad = x.edad < 45 ? 0 : x.edad < 55 ? 2 : x.edad < 65 ? 3 : 4
      if (x.imc) d.imc = x.imc < 25 ? 0 : x.imc <= 30 ? 1 : 3
      if (x.cintura) d.cintura = x.sexo === 'M' ? (x.cintura < 94 ? 0 : x.cintura <= 102 ? 3 : 4) : x.cintura < 80 ? 0 : x.cintura <= 88 ? 3 : 4
      return d
    },
    min: 0, max: 26,
    banda: (p) => (p < 7 ? ['Riesgo bajo (≈ 1 % a 10 años)', 'ok'] : p <= 11 ? ['Riesgo ligeramente elevado (≈ 4 %)', 'ok'] : p <= 14 ? ['Riesgo moderado (≈ 17 %)', 'warn'] : p <= 20 ? ['Riesgo alto (≈ 33 %)', 'danger'] : ['Riesgo muy alto (≈ 50 %)', 'danger']),
    ref: 'Lindström J, Tuomilehto J. Diabetes Care 2003;26:725-31.',
  },
]

export function puntuar(e: Escala, x: Ctx, data: Record<string, number>) {
  return e.items(x).filter((i) => i.scored !== false).reduce((a, i) => a + (Number(data[i.name]) || 0), 0)
}
