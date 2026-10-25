// Lógica pura de encuestas de satisfacción: plantilla, NPS, promedios, tendencia y agrupación de comentarios.
//
// Net Promoter Score (Reichheld F. «The One Number You Need to Grow». Harvard Business Review, dic. 2003; metodología
// de Bain & Company / Satmetrix): pregunta 0–10 «¿Qué tan probable es que nos recomiende…?».
//   Promotores 9–10 · Pasivos 7–8 · Detractores 0–6 · NPS = % promotores − % detractores (rango −100 a +100).
import type { Registro } from '../../lib/types'

export type TipoPregunta = 'nps' | 'escala5' | 'opciones' | 'texto'

export interface Pregunta {
  id: string
  tipo: TipoPregunta
  texto: string
  opciones?: string[] // solo `opciones`
  opcional?: boolean
}

export interface Plantilla {
  titulo: string
  intro: string
  gracias: string
  preguntas: Pregunta[]
}

export const ESCALA5 = ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] as const

export const PLANTILLA_BASE: Plantilla = {
  titulo: 'Encuesta de satisfacción',
  intro: 'Su opinión nos ayuda a mejorar. Son 6 preguntas y es anónima.',
  gracias: '¡Gracias por su tiempo! Su opinión nos ayuda a mejorar.',
  preguntas: [
    {
      id: 'nps',
      tipo: 'nps',
      texto: '¿Qué tan probable es que nos recomiende con un familiar o amigo?',
    },
    {
      id: 'atencion',
      tipo: 'escala5',
      texto: '¿Qué tan satisfecho está con la atención médica que recibió?',
    },
    {
      id: 'espera',
      tipo: 'escala5',
      texto: '¿Cómo califica el tiempo de espera?',
    },
    {
      id: 'trato',
      tipo: 'escala5',
      texto: '¿Cómo califica el trato del personal (recepción y enfermería)?',
    },
    {
      id: 'limpieza',
      tipo: 'escala5',
      texto: '¿Cómo califica la limpieza de las instalaciones?',
    },
    {
      id: 'comentarios',
      tipo: 'texto',
      texto: '¿Algo que quiera contarnos o que podamos mejorar?',
      opcional: true,
    },
  ],
}

export type Respuestas = Record<string, number | string>

export interface DatosEncuesta {
  respuestas: Respuestas
  preguntas?: { id: string; tipo: TipoPregunta; texto: string }[] // copia de las preguntas al momento de responder
  medico?: string
  canal: 'kiosco' | 'qr' | 'captura'
  appointmentId?: string
}

// ---------- NPS ----------
export type ClaseNps = 'promotor' | 'pasivo' | 'detractor'

export function clasificarNps(v: number): ClaseNps {
  if (!Number.isFinite(v) || v < 0 || v > 10) throw new RangeError('El puntaje NPS debe estar entre 0 y 10')
  return v >= 9 ? 'promotor' : v >= 7 ? 'pasivo' : 'detractor'
}

export interface ResultadoNps {
  n: number
  promotores: number
  pasivos: number
  detractores: number
  pctPromotores: number
  pctPasivos: number
  pctDetractores: number
  /** −100 a +100, redondeado a entero (null si no hay respuestas) */
  nps: number | null
}

export function calcularNps(valores: number[]): ResultadoNps {
  const vs = valores.filter((v) => Number.isFinite(v) && v >= 0 && v <= 10)
  const n = vs.length
  let promotores = 0
  let pasivos = 0
  let detractores = 0
  for (const v of vs) {
    const c = clasificarNps(v)
    if (c === 'promotor') promotores++
    else if (c === 'pasivo') pasivos++
    else detractores++
  }
  const pct = (x: number) => (n ? (x / n) * 100 : 0)
  return {
    n,
    promotores,
    pasivos,
    detractores,
    pctPromotores: pct(promotores),
    pctPasivos: pct(pasivos),
    pctDetractores: pct(detractores),
    nps: n ? Math.round(pct(promotores) - pct(detractores)) : null,
  }
}

// ---------- Respuestas ----------
export interface Respuesta {
  id: string
  fecha: string
  patientId?: string
  medico?: string
  canal: string
  respuestas: Respuestas
}

export function aRespuesta(r: Registro): Respuesta {
  const d = (r.datos ?? {}) as Partial<DatosEncuesta>
  return {
    id: r.id,
    fecha: r.fecha,
    patientId: r.patientId,
    medico: typeof d.medico === 'string' ? d.medico : undefined,
    canal: typeof d.canal === 'string' ? d.canal : 'kiosco',
    respuestas: d.respuestas && typeof d.respuestas === 'object' ? (d.respuestas as Respuestas) : {},
  }
}

/** Valor numérico de la primera pregunta tipo NPS (por convención id `nps`). */
export function valorNps(r: Respuesta, idNps = 'nps'): number | undefined {
  const v = r.respuestas[idNps]
  return typeof v === 'number' && v >= 0 && v <= 10 ? v : undefined
}

export function filtrarRespuestas(rs: Respuesta[], f: { desde?: string; hasta?: string; medico?: string }): Respuesta[] {
  return rs.filter((r) => {
    const dia = r.fecha.slice(0, 10)
    if (f.desde && dia < f.desde) return false
    if (f.hasta && dia > f.hasta) return false
    if (f.medico && r.medico !== f.medico) return false
    return true
  })
}

/** Clave de mes local YYYY-MM. */
export function mesDe(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface PuntoTendencia {
  mes: string
  n: number
  nps: number | null
  pctPromotores: number
  pctPasivos: number
  pctDetractores: number
}

/** NPS por mes (ordenado), solo meses con respuestas. */
export function tendenciaMensual(rs: Respuesta[], idNps = 'nps'): PuntoTendencia[] {
  const m = new Map<string, number[]>()
  for (const r of rs) {
    const v = valorNps(r, idNps)
    if (v === undefined) continue
    const k = mesDe(r.fecha)
    m.set(k, [...(m.get(k) ?? []), v])
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, vs]) => {
      const x = calcularNps(vs)
      return {
        mes,
        n: x.n,
        nps: x.nps,
        pctPromotores: x.pctPromotores,
        pctPasivos: x.pctPasivos,
        pctDetractores: x.pctDetractores,
      }
    })
}

export interface PromedioPregunta {
  id: string
  texto: string
  tipo: TipoPregunta
  n: number
  promedio: number | null // escala5: 1–5; nps: 0–10
  distribucion: Record<string, number> // valor → conteo
}

export function promediosPorPregunta(rs: Respuesta[], preguntas: Pregunta[]): PromedioPregunta[] {
  return preguntas
    .filter((p) => p.tipo !== 'texto')
    .map((p) => {
      const distribucion: Record<string, number> = {}
      let suma = 0
      let n = 0
      for (const r of rs) {
        const v = r.respuestas[p.id]
        if (v === undefined || v === '') continue
        distribucion[String(v)] = (distribucion[String(v)] ?? 0) + 1
        if (typeof v === 'number') {
          suma += v
          n++
        } else if (p.tipo === 'opciones') n++
      }
      return {
        id: p.id,
        texto: p.texto,
        tipo: p.tipo,
        n,
        promedio: p.tipo === 'opciones' || !n ? null : suma / n,
        distribucion,
      }
    })
}

// ---------- Comentarios ----------
export const TEMAS: { id: string; label: string; claves: string[] }[] = [
  {
    id: 'espera',
    label: 'Tiempo de espera',
    claves: ['espera', 'esper', 'tard', 'retras', 'demor', 'puntual', 'rapid', 'lent', 'hora'],
  },
  {
    id: 'trato',
    label: 'Trato y amabilidad',
    claves: ['amabl', 'trato', 'groser', 'atent', 'cordial', 'recepcion', 'recepcionista', 'enfermer', 'personal', 'respet'],
  },
  {
    id: 'medico',
    label: 'Atención médica',
    claves: ['doctor', 'doctora', 'medic', 'explic', 'diagnost', 'tratamiento', 'consulta', 'escuch'],
  },
  {
    id: 'limpieza',
    label: 'Limpieza',
    claves: ['limpi', 'sucio', 'bano', 'higien', 'olor'],
  },
  {
    id: 'costo',
    label: 'Costos y pagos',
    claves: ['precio', 'caro', 'cost', 'cobr', 'pago', 'factur', 'tarjeta'],
  },
  {
    id: 'instalaciones',
    label: 'Instalaciones y acceso',
    claves: ['estacionamiento', 'sala', 'silla', 'aire', 'clima', 'instalacion', 'acceso', 'ubicacion', 'wifi'],
  },
  {
    id: 'citas',
    label: 'Citas y comunicación',
    claves: ['cita', 'agend', 'telefon', 'whatsapp', 'recordatorio', 'contest', 'llam'],
  },
]

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Temas (ids) que menciona un comentario. Coincidencia por raíz al inicio de palabra. */
export function temasDe(texto: string): string[] {
  const palabras = normalizar(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean)
  return TEMAS.filter((t) => t.claves.some((c) => palabras.some((w) => w.startsWith(c)))).map((t) => t.id)
}

export interface Comentario {
  id: string
  fecha: string
  texto: string
  nps?: number
  temas: string[]
}

/** Comentarios no vacíos con sus temas, del más reciente al más antiguo. */
export function comentarios(rs: Respuesta[], idTexto = 'comentarios', idNps = 'nps'): Comentario[] {
  return rs
    .map((r) => ({ r, t: r.respuestas[idTexto] }))
    .filter((x): x is { r: Respuesta; t: string } => typeof x.t === 'string' && x.t.trim().length > 0)
    .map(({ r, t }) => ({
      id: r.id,
      fecha: r.fecha,
      texto: t.trim(),
      nps: valorNps(r, idNps),
      temas: temasDe(t),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Conteo por tema (incluye «otros» para los que no coinciden con ninguno). */
export function agruparComentarios(cs: Comentario[]): { id: string; label: string; n: number }[] {
  const out = TEMAS.map((t) => ({
    id: t.id,
    label: t.label,
    n: cs.filter((c) => c.temas.includes(t.id)).length,
  }))
  out.push({
    id: 'otros',
    label: 'Otros',
    n: cs.filter((c) => c.temas.length === 0).length,
  })
  return out.filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
}

// ---------- Plantilla ----------
/** Valida/normaliza una plantilla guardada (tolera versiones viejas). Siempre hay como máximo una pregunta NPS. */
export function normalizarPlantilla(p: unknown): Plantilla {
  if (!p || typeof p !== 'object') return PLANTILLA_BASE
  const x = p as Partial<Plantilla>
  const vistos = new Set<string>()
  let hayNps = false
  const preguntas = (Array.isArray(x.preguntas) ? x.preguntas : [])
    .filter(
      (q): q is Pregunta => !!q && typeof q === 'object' && typeof q.id === 'string' && typeof q.texto === 'string' && ['nps', 'escala5', 'opciones', 'texto'].includes(q.tipo),
    )
    .filter((q) => {
      if (vistos.has(q.id)) return false
      vistos.add(q.id)
      if (q.tipo === 'nps') {
        if (hayNps) return false
        hayNps = true
      }
      return true
    })
    .map((q) =>
      q.tipo === 'opciones'
        ? {
            ...q,
            opciones: (q.opciones ?? []).filter((o) => typeof o === 'string' && o.trim()),
          }
        : q,
    )
  if (!preguntas.length) return PLANTILLA_BASE
  return {
    titulo: typeof x.titulo === 'string' && x.titulo.trim() ? x.titulo : PLANTILLA_BASE.titulo,
    intro: typeof x.intro === 'string' ? x.intro : PLANTILLA_BASE.intro,
    gracias: typeof x.gracias === 'string' && x.gracias.trim() ? x.gracias : PLANTILLA_BASE.gracias,
    preguntas,
  }
}

/** ¿Faltan respuestas obligatorias? Devuelve el id de la primera que falta. */
export function faltante(pl: Plantilla, r: Respuestas): string | null {
  for (const q of pl.preguntas) {
    if (q.opcional) continue
    const v = r[q.id]
    if (v === undefined || v === '' || (typeof v === 'string' && !v.trim())) return q.id
  }
  return null
}

/** Título corto para la línea de tiempo del paciente. */
export function tituloEncuesta(r: Respuestas): string {
  const v = r.nps
  if (typeof v !== 'number') return 'Encuesta de satisfacción'
  const c = clasificarNps(v)
  return `Encuesta de satisfacción · recomendación ${v}/10 (${c})`
}
