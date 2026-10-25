// Desidentificación local (y opcionalmente con Presidio) antes de enviar texto a un LLM,
// con re-identificación local de los marcadores en la respuesta.
import type { Patient } from '../../lib/types'

export type Mapa = Record<string, string>

const ACENTOS: Record<string, string> = { a: '[aáà]', e: '[eéè]', i: '[iíì]', o: '[oóò]', u: '[uúüù]', n: '[nñ]' }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patron = (s: string) =>
  esc(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
    .split('')
    .map((ch) => ACENTOS[ch] ?? ch)
    .join('')
    .replace(/\s+/g, '\\s+')

function reemplaza(texto: string, original: string, marcador: string, mapa: Mapa) {
  if (!original || original.trim().length < 2) return texto
  const re = new RegExp(`(?<![\\p{L}\\d])${patron(original.trim())}(?![\\p{L}\\d])`, 'giu')
  if (!re.test(texto)) return texto
  mapa[marcador] = original.trim()
  return texto.replace(re, marcador)
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const GENERICOS: [string, RegExp][] = [
  ['CURP', /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi],
  ['RFC', /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi],
  ['CORREO', /[\w.+-]+@[\w-]+(\.[\w-]+)+/g],
  ['TELEFONO', /(?<!\d)(\+?52[\s-]?)?(\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}(?!\d)/g],
  ['NSS', /\b\d{11}\b/g],
  ['DIRECCION', /\b(calle|av\.|avenida|blvd\.?|boulevard|calzada|col\.|colonia|fracc\.|fraccionamiento|c\.\s?p\.)\s+(?:[^\n,;.[]|\.(?!\s)){2,50}/gi],
]

/** Reemplaza datos identificables del paciente y patrones genéricos por marcadores [TIPO_n]. */
export function desidentificar(texto: string, p: Patient | null, mapa: Mapa = {}): { texto: string; mapa: Mapa } {
  let t = texto
  if (p?.email) t = reemplaza(t, p.email, '[CORREO]', mapa)
  if (p?.curp) t = reemplaza(t, p.curp, '[CURP]', mapa)
  t = genericos(t, mapa, ['CURP', 'RFC', 'CORREO'])
  if (p) {
    t = reemplaza(t, `${p.nombre} ${p.apellidos}`, '[PACIENTE]', mapa)
    t = reemplaza(t, p.apellidos, '[APELLIDOS]', mapa)
    t = reemplaza(t, p.nombre, '[NOMBRE]', mapa)
    p.apellidos.split(/\s+/).filter((w) => w.length >= 3).forEach((w, i) => (t = reemplaza(t, w, `[APELLIDO_${i + 1}]`, mapa)))
    p.nombre.split(/\s+/).filter((w) => w.length >= 3).forEach((w, i) => (t = reemplaza(t, w, `[NOMBRE_${i + 1}]`, mapa)))
    if (p.curp) t = reemplaza(t, p.curp, '[CURP]', mapa)
    if (p.email) t = reemplaza(t, p.email, '[CORREO]', mapa)
    if (p.telefono) t = reemplaza(t, p.telefono, '[TELEFONO]', mapa)
    const [y, m, d] = p.fechaNac.split('-')
    for (const f of [p.fechaNac, `${d}/${m}/${y}`, `${+d}/${+m}/${y}`, `${d}-${m}-${y}`, `${+d} de ${MESES[+m - 1]} de ${y}`, `${+d} de ${MESES[+m - 1]} del ${y}`])
      t = reemplaza(t, f, '[FECHA_NAC]', mapa)
  }
  t = genericos(t, mapa)
  return { texto: t, mapa }
}

function genericos(texto: string, mapa: Mapa, solo?: string[]) {
  let t = texto
  for (const [tipo, re] of GENERICOS) {
    if (solo && !solo.includes(tipo)) continue
    t = t.replace(re, (m) => {
      const ya = Object.entries(mapa).find(([, v]) => v === m)
      if (ya) return ya[0]
      const k = `[${tipo}_${Object.keys(mapa).filter((x) => x.startsWith(`[${tipo}_`)).length + 1}]`
      mapa[k] = m
      return k
    })
  }
  return t
}

const TIPOS_PRESIDIO: Record<string, string> = {
  PERSON: 'PERSONA', LOCATION: 'LUGAR', PHONE_NUMBER: 'TELEFONO', EMAIL_ADDRESS: 'CORREO', CREDIT_CARD: 'TARJETA',
  IBAN_CODE: 'CUENTA', IP_ADDRESS: 'IP', ES_NIF: 'ID', ES_NIE: 'ID', URL: 'URL', MX_CURP: 'CURP', MX_RFC: 'RFC',
}

/**
 * Usa el analizador de Presidio (POST {base}/analyze) para encontrar entidades adicionales.
 * El reemplazo se hace aquí mismo para poder re-identificar después. Lanza error si no responde.
 */
export async function presidio(base: string, texto: string, mapa: Mapa): Promise<string> {
  const ctl = new AbortController()
  const to = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(base.replace(/\/$/, '') + '/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: texto, language: 'es', score_threshold: 0.5 }),
      signal: ctl.signal,
    })
    if (!r.ok) throw new Error(`Presidio ${r.status}`)
    const ents = ((await r.json()) as { entity_type: string; start: number; end: number }[])
      .filter((e) => TIPOS_PRESIDIO[e.entity_type])
      .sort((a, b) => b.start - a.start)
    let t = texto
    let ultimoInicio = Infinity
    for (const e of ents) {
      if (e.end > ultimoInicio) continue // traslape
      const orig = t.slice(e.start, e.end)
      if (/^\[[A-Z_0-9]+\]$/.test(orig)) continue
      const tipo = TIPOS_PRESIDIO[e.entity_type]
      const k = Object.entries(mapa).find(([, v]) => v === orig)?.[0] ?? `[${tipo}_${Object.keys(mapa).filter((x) => x.startsWith(`[${tipo}_`)).length + 1}]`
      mapa[k] = orig
      t = t.slice(0, e.start) + k + t.slice(e.end)
      ultimoInicio = e.start
    }
    return t
  } finally {
    clearTimeout(to)
  }
}

/** Sustituye los marcadores de la respuesta por los datos originales (solo en este navegador). */
export function reidentificar(texto: string, mapa: Mapa) {
  let t = texto
  for (let i = 0; i < 3; i++) t = t.replace(/\[[A-Z]+(?:_[A-Z]+)*(?:_\d+)?\]/g, (m) => mapa[m] ?? m)
  return t
}
