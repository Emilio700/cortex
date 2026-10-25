// Motor de reglas de prevención (tamizajes y detecciones) por edad y sexo. Lógica pura, sin React.
//
// Prioridad de fuentes: Normas Oficiales Mexicanas (NOM) y Guías de Práctica Clínica (GPC, CENETEC/IMSS);
// donde México no fija una regla, U.S. Preventive Services Task Force (USPSTF) o AAP Bright Futures.
// Cuando el intervalo exacto no está confirmado se marca `verificar` y la interfaz lo muestra como «(verificar)».

export type Estado = 'al-dia' | 'proximo' | 'vencido' | 'no-aplica'
export type Categoria = 'Cáncer' | 'Cardiometabólico' | 'Salud mental' | 'Infecciosas' | 'Pediatría' | 'Otros'

export interface CtxPaciente {
  sexo: 'F' | 'M' | 'O'
  fechaNac: string // YYYY-MM-DD
  antecedentes?: string
  observations: { codigo: string; fecha: string; etiqueta?: string; valor?: number }[]
  registros: { tipo: string; fecha: string; datos: Record<string, unknown>; titulo?: string }[]
  documentos?: { nombre: string; fecha: string }[]
}

export interface Evidencia {
  fecha: string // ISO
  detalle: string
  prueba?: string
  manual?: boolean
  noAplica?: string // motivo (registro manual que excluye la regla)
}

export interface Regla {
  id: string
  nombre: string
  categoria: Categoria
  prueba: string
  sexo?: 'F' | 'M'
  edadMin: number // años (puede ser fracción)
  edadMax?: number // años, inclusive (hasta antes de cumplir edadMax + 1)
  intervaloMeses: number | null // null = una sola vez
  pruebas?: { id: string; nombre: string; intervaloMeses: number | null }[]
  fuente: string
  verificar?: string
  nota?: string
  /** Si devuelve texto, la regla no aplica (p. ej., diagnóstico ya establecido). */
  noAplicaSi?: (c: CtxPaciente) => string | null
  /** Condición adicional (factores de riesgo). */
  requiere?: { test: (c: CtxPaciente) => boolean; texto: string }
  /** Evidencia automática a partir de los datos del expediente. */
  detectar?: (c: CtxPaciente) => Evidencia[]
}

export interface Resultado {
  regla: Regla
  estado: Estado
  motivo: string
  ultima?: Evidencia
  proxima?: string // ISO (fecha en que vence)
}

// ---------- utilidades ----------
const DIA = 86_400_000
export const VENTANA_PROXIMO_DIAS = 60

export function edadAnios(fechaNac: string, now: number): number {
  const n = new Date(fechaNac + 'T00:00:00')
  const r = new Date(now)
  let meses = (r.getFullYear() - n.getFullYear()) * 12 + (r.getMonth() - n.getMonth())
  if (r.getDate() < n.getDate()) meses--
  return Math.max(0, meses) / 12
}

export function sumarMeses(iso: string, meses: number): string {
  const d = new Date(iso)
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + meses)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimo))
  return d.toISOString()
}

const txt = (c: CtxPaciente) => (c.antecedentes ?? '').toLowerCase()
/** Tabaquismo actual o previo, excluyendo negaciones («no fuma», «niega tabaquismo»). */
export function tabaquismo(c: CtxPaciente): boolean {
  const t = txt(c)
  if (/(no fuma|nunca ha fumado|niega tabaquismo|sin tabaquismo|no fumador)/.test(t)) return false
  return /(fuma|fumador|tabaquismo|tabaco|cigarr)/.test(t)
}

function obsCodigos(codigos: string[], detalle: (o: CtxPaciente['observations'][number]) => string) {
  return (c: CtxPaciente): Evidencia[] => c.observations.filter((o) => codigos.includes(o.codigo)).map((o) => ({ fecha: o.fecha, detalle: detalle(o) }))
}
function obsEtiqueta(re: RegExp) {
  return (c: CtxPaciente): Evidencia[] => c.observations.filter((o) => o.etiqueta && re.test(o.etiqueta)).map((o) => ({ fecha: o.fecha, detalle: `${o.etiqueta}: ${o.valor ?? ''}`.trim() }))
}
function regTipo(tipo: string, pred?: (d: Record<string, unknown>) => boolean) {
  return (c: CtxPaciente): Evidencia[] =>
    c.registros.filter((r) => r.tipo === tipo && (!pred || pred(r.datos ?? {}))).map((r) => ({ fecha: r.fecha, detalle: r.titulo ?? tipo }))
}
function docs(re: RegExp, prueba?: string) {
  return (c: CtxPaciente): Evidencia[] => (c.documentos ?? []).filter((d) => re.test(d.nombre)).map((d) => ({ fecha: d.fecha, detalle: `Documento: ${d.nombre}`, prueba }))
}
const juntar =
  (...fs: ((c: CtxPaciente) => Evidencia[])[]) =>
  (c: CtxPaciente) =>
    fs.flatMap((f) => f(c))

// ---------- Reglas ----------
export const REGLAS: Regla[] = [
  // ---- Cáncer ----
  {
    id: 'mama-mastografia',
    nombre: 'Cáncer de mama: mastografía',
    categoria: 'Cáncer',
    prueba: 'Mastografía de tamizaje',
    sexo: 'F',
    edadMin: 40,
    edadMax: 69,
    intervaloMeses: 24,
    fuente: 'NOM-041-SSA2-2011, prevención y control del cáncer de mama: mastografía de tamizaje cada 2 años en mujeres de 40 a 69 años.',
    detectar: docs(/mastograf/i),
  },
  {
    id: 'mama-exploracion',
    nombre: 'Cáncer de mama: exploración clínica',
    categoria: 'Cáncer',
    prueba: 'Examen clínico de mama por personal de salud',
    sexo: 'F',
    edadMin: 25,
    intervaloMeses: 12,
    fuente: 'NOM-041-SSA2-2011: examen clínico de mama anual a partir de los 25 años (y autoexploración mensual desde los 20).',
  },
  {
    id: 'cacu',
    nombre: 'Cáncer cervicouterino',
    categoria: 'Cáncer',
    prueba: 'Citología cervical (Papanicolaou) o prueba de VPH',
    sexo: 'F',
    edadMin: 25,
    edadMax: 64,
    intervaloMeses: 36,
    pruebas: [
      { id: 'citologia', nombre: 'Citología cervical', intervaloMeses: 36 },
      { id: 'vph', nombre: 'Prueba de VPH (35 a 64 años)', intervaloMeses: 60 },
    ],
    fuente: 'NOM-014-SSA2-1994 (modificación 2007): citología cervical de 25 a 64 años; prueba de VPH de 35 a 64 años.',
    verificar: 'Citología anual y, tras 2 resultados negativos consecutivos, cada 3 años; intervalo de VPH de 5 años.',
    detectar: juntar(docs(/papanicolau|citolog/i, 'citologia'), docs(/\bvph\b|papiloma/i, 'vph')),
  },
  {
    id: 'colorrectal',
    nombre: 'Cáncer colorrectal',
    categoria: 'Cáncer',
    prueba: 'Sangre oculta en heces (inmunoquímica) o colonoscopía',
    edadMin: 50,
    edadMax: 75,
    intervaloMeses: 12,
    pruebas: [
      { id: 'soh', nombre: 'Sangre oculta en heces (inmunoquímica / guayaco)', intervaloMeses: 12 },
      { id: 'colonoscopia', nombre: 'Colonoscopía', intervaloMeses: 120 },
      { id: 'sigmoidoscopia', nombre: 'Sigmoidoscopía flexible', intervaloMeses: 60 },
    ],
    fuente: 'GPC IMSS-145-08, detección oportuna de cáncer de colon y recto no hereditario: sangre oculta en heces de 50 a 75 años. USPSTF 2021 recomienda iniciar a los 45 años.',
    verificar: 'Intervalo de sangre oculta (anual o bienal) según la GPC; colonoscopía normal cada 10 años.',
    detectar: juntar(docs(/sangre oculta|\bfit\b/i, 'soh'), docs(/colonoscop/i, 'colonoscopia')),
  },
  {
    id: 'prostata',
    nombre: 'Cáncer de próstata (decisión compartida)',
    categoria: 'Cáncer',
    prueba: 'Antígeno prostático específico, previa información de riesgos y beneficios',
    sexo: 'M',
    edadMin: 55,
    edadMax: 69,
    intervaloMeses: 24,
    fuente: 'USPSTF 2018 (grado C): decisión individual de 55 a 69 años. NOM-048-SSA2-2017 regula la detección de cáncer de próstata en México.',
    verificar: 'Edades e intervalo de la NOM-048-SSA2-2017.',
    detectar: juntar(obsCodigos(['ape', 'psa'], (o) => `APE ${o.valor ?? ''} ng/mL`), docs(/antígeno prost|antigeno prost|\bape\b|\bpsa\b/i)),
  },
  {
    id: 'pulmon',
    nombre: 'Cáncer de pulmón',
    categoria: 'Cáncer',
    prueba: 'Tomografía de tórax de baja dosis',
    edadMin: 50,
    edadMax: 80,
    intervaloMeses: 12,
    requiere: { test: tabaquismo, texto: 'antecedente de tabaquismo (confirme ≥ 20 paquetes-año y que fuma o dejó de fumar hace < 15 años)' },
    fuente: 'USPSTF 2021 (grado B): 50 a 80 años, ≥ 20 paquetes-año, fumador actual o que dejó de fumar hace menos de 15 años.',
    detectar: docs(/tomograf.*t[oó]rax|tc de t[oó]rax|baja dosis/i),
  },
  // ---- Cardiometabólico ----
  {
    id: 'diabetes',
    nombre: 'Diabetes mellitus',
    categoria: 'Cardiometabólico',
    prueba: 'Glucosa capilar o plasmática en ayuno (o HbA1c)',
    edadMin: 20,
    intervaloMeses: 36,
    fuente: 'NOM-015-SSA2-2010, prevención y control de la diabetes: detección a partir de los 20 años; antes si hay obesidad y factores de riesgo.',
    verificar: 'Repetición cada 3 años si el resultado es normal; anual con factores de riesgo.',
    noAplicaSi: (c) => (/diabetes|dm2|dm 2|dm tipo/.test(txt(c)) ? 'Diagnóstico de diabetes: control con HbA1c, no tamizaje.' : null),
    detectar: obsCodigos(['glucosa', 'hba1c'], (o) => (o.codigo === 'hba1c' ? `HbA1c ${o.valor}%` : `Glucosa ${o.valor} mg/dL`)),
  },
  {
    id: 'hipertension',
    nombre: 'Hipertensión arterial',
    categoria: 'Cardiometabólico',
    prueba: 'Toma de presión arterial',
    edadMin: 20,
    intervaloMeses: 12,
    fuente: 'NOM-030-SSA2-2009, prevención, detección y control de la hipertensión arterial sistémica: detección a partir de los 20 años.',
    verificar: 'Periodicidad anual (puede ampliarse si la presión es óptima).',
    noAplicaSi: (c) => (/hipertensi|\bhas\b|\bhta\b/.test(txt(c)) ? 'Diagnóstico de hipertensión: control, no tamizaje.' : null),
    detectar: obsCodigos(['pas'], (o) => `PA sistólica ${o.valor} mmHg`),
  },
  {
    id: 'dislipidemia',
    nombre: 'Dislipidemias',
    categoria: 'Cardiometabólico',
    prueba: 'Perfil de lípidos (colesterol total, HDL, triglicéridos)',
    edadMin: 20,
    intervaloMeses: 60,
    fuente: 'NOM-037-SSA2-2012, prevención, tratamiento y control de las dislipidemias: detección a partir de los 20 años.',
    verificar: 'Cada 5 años sin factores de riesgo; más frecuente (anual) con factores de riesgo cardiovascular.',
    detectar: obsCodigos(['colesterol', 'ldl', 'hdl', 'trigliceridos'], (o) => `${o.codigo === 'colesterol' ? 'Colesterol total' : o.codigo.toUpperCase()} ${o.valor} mg/dL`),
  },
  {
    id: 'obesidad',
    nombre: 'Sobrepeso y obesidad',
    categoria: 'Cardiometabólico',
    prueba: 'Peso, talla, IMC y circunferencia de cintura',
    edadMin: 20,
    intervaloMeses: 12,
    fuente: 'NOM-008-SSA3-2017, tratamiento integral del sobrepeso y la obesidad.',
    verificar: 'Periodicidad anual.',
    detectar: obsCodigos(['imc', 'peso'], (o) => (o.codigo === 'imc' ? `IMC ${o.valor}` : `Peso ${o.valor} kg`)),
  },
  // ---- Salud mental ----
  {
    id: 'depresion',
    nombre: 'Depresión',
    categoria: 'Salud mental',
    prueba: 'PHQ-2 / PHQ-9 (PHQ-A en adolescentes)',
    edadMin: 12,
    intervaloMeses: 12,
    fuente: 'USPSTF 2016/2023 (adultos, grado B) y 2022 (12 a 18 años, grado B).',
    verificar: 'USPSTF no fija intervalo; se usa anual.',
    detectar: obsEtiqueta(/^PHQ/i),
  },
  {
    id: 'ansiedad',
    nombre: 'Ansiedad',
    categoria: 'Salud mental',
    prueba: 'GAD-2 / GAD-7',
    edadMin: 8,
    edadMax: 64,
    intervaloMeses: 12,
    fuente: 'USPSTF 2022 (8 a 18 años, grado B) y 2023 (adultos < 65 años, grado B).',
    verificar: 'USPSTF no fija intervalo; se usa anual.',
    detectar: obsEtiqueta(/^GAD/i),
  },
  // ---- Infecciosas ----
  {
    id: 'vih',
    nombre: 'VIH',
    categoria: 'Infecciosas',
    prueba: 'Prueba de VIH (rápida o de laboratorio)',
    edadMin: 15,
    edadMax: 65,
    intervaloMeses: null,
    fuente: 'USPSTF 2019 (grado A): al menos una vez de 15 a 65 años; NOM-010-SSA2-2010 (ofrecer la prueba de forma voluntaria).',
    nota: 'Repetir periódicamente si hay riesgo.',
    detectar: docs(/\bvih\b|hiv/i),
  },
  {
    id: 'vhc',
    nombre: 'Hepatitis C',
    categoria: 'Infecciosas',
    prueba: 'Anticuerpos contra VHC',
    edadMin: 18,
    edadMax: 79,
    intervaloMeses: null,
    fuente: 'USPSTF 2020 (grado B): una vez de 18 a 79 años. Programa Nacional de Eliminación de la Hepatitis C (México).',
    detectar: docs(/\bvhc\b|hepatitis c/i),
  },
  // ---- Otros adultos ----
  {
    id: 'osteoporosis',
    nombre: 'Osteoporosis',
    categoria: 'Otros',
    prueba: 'Densitometría ósea (DXA)',
    sexo: 'F',
    edadMin: 65,
    intervaloMeses: null,
    fuente: 'USPSTF 2025 (grado B): mujeres ≥ 65 años y posmenopáusicas < 65 con factores de riesgo. GPC mexicana de osteoporosis (verificar).',
    nota: 'Intervalo de repetición no establecido; individualizar según resultado.',
    detectar: docs(/densitometr|dxa/i),
  },
  {
    id: 'aaa',
    nombre: 'Aneurisma de aorta abdominal',
    categoria: 'Otros',
    prueba: 'Ultrasonido abdominal',
    sexo: 'M',
    edadMin: 65,
    edadMax: 75,
    intervaloMeses: null,
    requiere: { test: tabaquismo, texto: 'antecedente de tabaquismo (alguna vez fumó)' },
    fuente: 'USPSTF 2019 (grado B): hombres de 65 a 75 años que alguna vez fumaron, una sola vez.',
    detectar: docs(/aorta|aneurisma/i),
  },
  {
    id: 'bucal',
    nombre: 'Salud bucal',
    categoria: 'Otros',
    prueba: 'Revisión odontológica',
    edadMin: 1,
    intervaloMeses: 12,
    fuente: 'NOM-013-SSA2-2015, prevención y control de enfermedades bucales.',
    verificar: 'Periodicidad (6 a 12 meses según riesgo).',
    detectar: juntar(docs(/odontograma/i), regTipo('odontograma')),
  },
  // ---- Pediatría ----
  {
    id: 'neonatal-metabolico',
    nombre: 'Tamiz metabólico neonatal',
    categoria: 'Pediatría',
    prueba: 'Tamiz neonatal (talón) entre el 3.er y 5.º día de vida',
    edadMin: 0,
    edadMax: 2,
    intervaloMeses: null,
    fuente: 'NOM-034-SSA2-2013, prevención y control de los defectos al nacimiento.',
    nota: 'Confirme el resultado con la cartilla o el comprobante del tamiz.',
    detectar: docs(/tamiz (metab|neonatal)/i),
  },
  {
    id: 'neonatal-auditivo',
    nombre: 'Tamiz auditivo neonatal',
    categoria: 'Pediatría',
    prueba: 'Emisiones otoacústicas o potenciales auditivos automatizados',
    edadMin: 0,
    edadMax: 2,
    intervaloMeses: null,
    fuente: 'NOM-034-SSA2-2013 y programa de Tamiz Auditivo Neonatal e Intervención Temprana (TANIT): antes de los 3 meses de vida.',
    detectar: juntar(regTipo('audiometria'), docs(/tamiz auditivo|emisiones otoac/i)),
  },
  {
    id: 'vision-preescolar',
    nombre: 'Agudeza visual preescolar (ambliopía)',
    categoria: 'Pediatría',
    prueba: 'Agudeza visual con optotipos / fotocribado',
    edadMin: 3,
    edadMax: 5,
    intervaloMeses: null,
    fuente: 'USPSTF 2017 (grado B): al menos una vez entre los 3 y 5 años.',
    detectar: regTipo('agudeza-visual', (d) => Array.isArray(d.resultados)),
  },
  {
    id: 'vision-escolar',
    nombre: 'Agudeza visual escolar',
    categoria: 'Pediatría',
    prueba: 'Agudeza visual con optotipos',
    edadMin: 6,
    edadMax: 18,
    intervaloMeses: 24,
    fuente: 'AAP Bright Futures (periodicidad): agudeza visual a los 6, 8, 10, 12, 15 y 18 años.',
    verificar: 'Intervalo aproximado de 2 años.',
    detectar: regTipo('agudeza-visual', (d) => Array.isArray(d.resultados)),
  },
  {
    id: 'audicion-escolar',
    nombre: 'Audición en la infancia',
    categoria: 'Pediatría',
    prueba: 'Audiometría de tamiz',
    edadMin: 4,
    edadMax: 10,
    intervaloMeses: 24,
    fuente: 'AAP Bright Futures (periodicidad): audiometría a los 4, 5, 6, 8 y 10 años.',
    verificar: 'Intervalo aproximado (anual de 4 a 6 años, luego cada 2 años).',
    detectar: regTipo('audiometria'),
  },
]

// ---------- Evaluación ----------
/** Evidencias manuales (registros tipo `tamizaje` con `datos.regla`). */
export function evidenciasManuales(c: CtxPaciente, reglaId: string): Evidencia[] {
  return c.registros
    .filter((r) => r.tipo === 'tamizaje' && r.datos?.regla === reglaId)
    .map((r) => {
      const d = r.datos as { prueba?: string; resultado?: string; notas?: string; noAplica?: string }
      const det = [d.resultado && RESULTADOS[d.resultado as keyof typeof RESULTADOS], d.notas].filter(Boolean).join(' · ')
      return { fecha: r.fecha, detalle: det || 'Registrado manualmente', prueba: d.prueba, manual: true, noAplica: d.noAplica || undefined }
    })
}

export const RESULTADOS = { normal: 'Normal / negativo', anormal: 'Anormal / positivo (seguimiento)', pendiente: 'Resultado pendiente' } as const

export function evaluarRegla(r: Regla, c: CtxPaciente, now: number): Resultado {
  const edad = edadAnios(c.fechaNac, now)
  if (r.sexo && c.sexo !== r.sexo) return { regla: r, estado: 'no-aplica', motivo: r.sexo === 'F' ? 'Solo mujeres' : 'Solo hombres' }
  if (edad < r.edadMin || (r.edadMax !== undefined && edad >= r.edadMax + 1))
    return { regla: r, estado: 'no-aplica', motivo: `Edad ${rango(r)}` }
  const excl = r.noAplicaSi?.(c)
  if (excl) return { regla: r, estado: 'no-aplica', motivo: excl }
  if (r.requiere && !r.requiere.test(c)) return { regla: r, estado: 'no-aplica', motivo: `Solo con ${r.requiere.texto}` }

  const ev = [...evidenciasManuales(c, r.id), ...(r.detectar?.(c) ?? [])].filter((e) => Date.parse(e.fecha) <= now + DIA).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const ultima = ev[0]
  if (ultima?.noAplica) return { regla: r, estado: 'no-aplica', motivo: ultima.noAplica, ultima }
  // la evidencia válida más reciente que no sea una exclusión
  const hecho = ev.find((e) => !e.noAplica)
  if (!hecho) return { regla: r, estado: 'vencido', motivo: 'Sin registro' }
  const intervalo = r.pruebas?.find((p) => p.id === hecho.prueba)?.intervaloMeses ?? r.intervaloMeses
  if (intervalo === null) return { regla: r, estado: 'al-dia', motivo: 'Realizado (una sola vez)', ultima: hecho }
  const proxima = sumarMeses(hecho.fecha, intervalo)
  const t = Date.parse(proxima)
  if (t < now) return { regla: r, estado: 'vencido', motivo: `Vencido desde ${proxima.slice(0, 10)}`, ultima: hecho, proxima }
  if (t - now <= VENTANA_PROXIMO_DIAS * DIA) return { regla: r, estado: 'proximo', motivo: `Vence el ${proxima.slice(0, 10)}`, ultima: hecho, proxima }
  return { regla: r, estado: 'al-dia', motivo: `Próximo: ${proxima.slice(0, 10)}`, ultima: hecho, proxima }
}

export function evaluar(c: CtxPaciente, now: number, reglas: Regla[] = REGLAS): Resultado[] {
  return reglas.map((r) => evaluarRegla(r, c, now))
}

export function rango(r: Regla): string {
  if (r.edadMax === undefined) return `≥ ${r.edadMin} ${r.edadMin === 1 ? 'año' : 'años'}`
  return `${r.edadMin} a ${r.edadMax} años`
}

export function intervaloTexto(r: Regla): string {
  if (r.pruebas) return r.pruebas.map((p) => `${p.nombre.replace(/ \(.*\)/, '')}: ${meses(p.intervaloMeses)}`).join(' · ')
  return meses(r.intervaloMeses)
}
function meses(m: number | null) {
  if (m === null) return 'una vez'
  if (m % 12 === 0) return m === 12 ? 'cada año' : `cada ${m / 12} años`
  return `cada ${m} meses`
}

export const ORDEN_ESTADO: Record<Estado, number> = { vencido: 0, proximo: 1, 'al-dia': 2, 'no-aplica': 3 }
