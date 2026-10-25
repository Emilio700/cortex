// Esquema Nacional de Vacunación (México) y cálculo del estado de cada dosis. Lógica pura.
//
// Fuente: Secretaría de Salud / CeNSIA, Esquema Nacional de Vacunación y Lineamientos Generales del
// Programa de Vacunación Universal 2024–2025. Solo se incluyen vacunas y edades del esquema universal;
// todo lo que no pudimos confirmar se marca con `verificar`. Revise siempre la versión vigente en CeNSIA.

export const ESQUEMA_VERSION = 'Esquema Nacional de Vacunación, México — referencia 2024–2025 (verificar con CeNSIA)'

export type Grupo = 'infantil' | 'adolescente' | 'adulto' | 'embarazo' | 'adulto-mayor'
export const GRUPO_LABEL: Record<Grupo, string> = {
  infantil: 'Niñas y niños (0–9 años)',
  adolescente: 'Adolescentes (10–19 años)',
  adulto: 'Grupos de riesgo (5–59 años)',
  embarazo: 'Embarazadas',
  'adulto-mayor': 'Adultos mayores (60 años y más)',
}

export interface Vacuna {
  id: string
  nombre: string
  protege: string
  via: string
  sitio: string
  equivalentes?: string[] // nombres comerciales/anteriores que cuentan para la misma dosis
}

export const VACUNAS: Vacuna[] = [
  { id: 'bcg', nombre: 'BCG', protege: 'Tuberculosis (formas graves)', via: 'Intradérmica', sitio: 'Región deltoidea derecha' },
  { id: 'hb', nombre: 'Hepatitis B', protege: 'Hepatitis B', via: 'Intramuscular', sitio: 'Cara anterolateral externa del muslo derecho' },
  { id: 'hexa', nombre: 'Hexavalente acelular', protege: 'Difteria, tos ferina, tétanos, poliomielitis, H. influenzae b y hepatitis B', via: 'Intramuscular', sitio: 'Muslo (< 18 meses) / deltoides', equivalentes: ['Pentavalente acelular (esquemas anteriores)'] },
  { id: 'rota', nombre: 'Rotavirus', protege: 'Diarrea por rotavirus', via: 'Oral', sitio: 'Boca' },
  { id: 'pcv', nombre: 'Neumocócica conjugada', protege: 'Neumonía, meningitis y otitis por neumococo', via: 'Intramuscular', sitio: 'Muslo / deltoides' },
  { id: 'flu', nombre: 'Influenza estacional', protege: 'Influenza', via: 'Intramuscular', sitio: 'Muslo (< 18 meses) / deltoides' },
  { id: 'srp', nombre: 'SRP (triple viral)', protege: 'Sarampión, rubéola y parotiditis', via: 'Subcutánea', sitio: 'Región deltoidea izquierda' },
  { id: 'dpt', nombre: 'DPT', protege: 'Difteria, tos ferina y tétanos', via: 'Intramuscular', sitio: 'Región deltoidea izquierda' },
  { id: 'vph', nombre: 'VPH', protege: 'Virus del papiloma humano (cáncer cervicouterino y otros)', via: 'Intramuscular', sitio: 'Región deltoidea' },
  { id: 'td', nombre: 'Td', protege: 'Tétanos y difteria', via: 'Intramuscular', sitio: 'Región deltoidea' },
  { id: 'tdpa', nombre: 'Tdpa', protege: 'Tétanos, difteria y tos ferina acelular', via: 'Intramuscular', sitio: 'Región deltoidea' },
  { id: 'neumo23', nombre: 'Neumocócica polisacárida 23-valente', protege: 'Neumonía por neumococo', via: 'Intramuscular', sitio: 'Región deltoidea' },
  { id: 'sr', nombre: 'SR (doble viral)', protege: 'Sarampión y rubéola', via: 'Subcutánea', sitio: 'Región deltoidea' },
  { id: 'covid', nombre: 'COVID-19', protege: 'COVID-19', via: 'Intramuscular', sitio: 'Región deltoidea' },
]
export const vacunaPorId = (id: string) => VACUNAS.find((v) => v.id === id)

export type Regla = 'unica' | 'anual' | 'cada10' | 'embarazo'
export interface Dosis {
  id: string
  vacunaId: string
  dosis: string // "1.ª", "Refuerzo"…
  grupo: Grupo
  edadMeses: number // edad recomendada
  edadTexto: string
  maxMeses?: number // después de esta edad ya no se aplica esta dosis del esquema
  regla?: Regla // por defecto 'unica'
  sexo?: 'F' | 'M'
  verificar?: string
}

export const ESQUEMA: Dosis[] = [
  { id: 'bcg-u', vacunaId: 'bcg', dosis: 'Única', grupo: 'infantil', edadMeses: 0, edadTexto: 'Al nacer' },
  { id: 'hb-1', vacunaId: 'hb', dosis: '1.ª (al nacer)', grupo: 'infantil', edadMeses: 0, edadTexto: 'Al nacer', verificar: 'Las dosis de 2 y 6 meses se cubren con la hexavalente.' },
  { id: 'hexa-1', vacunaId: 'hexa', dosis: '1.ª', grupo: 'infantil', edadMeses: 2, edadTexto: '2 meses', maxMeses: 59 },
  { id: 'hexa-2', vacunaId: 'hexa', dosis: '2.ª', grupo: 'infantil', edadMeses: 4, edadTexto: '4 meses', maxMeses: 59 },
  { id: 'hexa-3', vacunaId: 'hexa', dosis: '3.ª', grupo: 'infantil', edadMeses: 6, edadTexto: '6 meses', maxMeses: 59 },
  { id: 'hexa-4', vacunaId: 'hexa', dosis: '4.ª (refuerzo)', grupo: 'infantil', edadMeses: 18, edadTexto: '18 meses', maxMeses: 59 },
  { id: 'rota-1', vacunaId: 'rota', dosis: '1.ª', grupo: 'infantil', edadMeses: 2, edadTexto: '2 meses', maxMeses: 8, verificar: 'Esquema de 2 dosis con vacuna monovalente (lineamientos 2025); edad máxima de aplicación por verificar.' },
  { id: 'rota-2', vacunaId: 'rota', dosis: '2.ª', grupo: 'infantil', edadMeses: 4, edadTexto: '4 meses', maxMeses: 8, verificar: 'Edad máxima de aplicación por verificar.' },
  { id: 'pcv-1', vacunaId: 'pcv', dosis: '1.ª', grupo: 'infantil', edadMeses: 2, edadTexto: '2 meses', maxMeses: 59 },
  { id: 'pcv-2', vacunaId: 'pcv', dosis: '2.ª', grupo: 'infantil', edadMeses: 4, edadTexto: '4 meses', maxMeses: 59 },
  { id: 'pcv-3', vacunaId: 'pcv', dosis: 'Refuerzo', grupo: 'infantil', edadMeses: 12, edadTexto: '12 meses', maxMeses: 59 },
  { id: 'flu-1', vacunaId: 'flu', dosis: '1.ª', grupo: 'infantil', edadMeses: 6, edadTexto: '6 meses', maxMeses: 59 },
  { id: 'flu-2', vacunaId: 'flu', dosis: '2.ª', grupo: 'infantil', edadMeses: 7, edadTexto: '7 meses (4 semanas después)', maxMeses: 59 },
  { id: 'flu-inf', vacunaId: 'flu', dosis: 'Anual', grupo: 'infantil', edadMeses: 12, edadTexto: 'Cada temporada hasta los 59 meses', maxMeses: 59, regla: 'anual' },
  { id: 'srp-1', vacunaId: 'srp', dosis: '1.ª', grupo: 'infantil', edadMeses: 12, edadTexto: '12 meses' },
  { id: 'srp-2', vacunaId: 'srp', dosis: '2.ª', grupo: 'infantil', edadMeses: 18, edadTexto: '18 meses', verificar: 'Desde 2021 la 2.ª dosis pasó de los 6 años a los 18 meses.' },
  { id: 'dpt-r', vacunaId: 'dpt', dosis: 'Refuerzo', grupo: 'infantil', edadMeses: 48, edadTexto: '4 años', maxMeses: 83 },
  { id: 'vph-1', vacunaId: 'vph', dosis: 'Única', grupo: 'adolescente', edadMeses: 132, edadTexto: '5.º de primaria / 11 años', maxMeses: 239, verificar: 'Número de dosis y aplicación a niños por verificar con el lineamiento vigente.' },
  { id: 'td-ado', vacunaId: 'td', dosis: 'Refuerzo', grupo: 'adolescente', edadMeses: 180, edadTexto: '15 años y cada 10 años', regla: 'cada10', verificar: 'Edad del refuerzo adolescente por verificar.' },
  { id: 'flu-riesgo', vacunaId: 'flu', dosis: 'Anual', grupo: 'adulto', edadMeses: 60, edadTexto: '5–59 años con factores de riesgo', maxMeses: 719, regla: 'anual' },
  { id: 'tdpa-emb', vacunaId: 'tdpa', dosis: '1 por embarazo', grupo: 'embarazo', edadMeses: 0, edadTexto: 'A partir de la semana 20 de cada embarazo', regla: 'embarazo', sexo: 'F', verificar: 'Ventana de aplicación por verificar (CeNSIA: desde la semana 20).' },
  { id: 'flu-emb', vacunaId: 'flu', dosis: 'Temporada', grupo: 'embarazo', edadMeses: 0, edadTexto: 'Cualquier trimestre en temporada', regla: 'embarazo', sexo: 'F' },
  { id: 'flu-am', vacunaId: 'flu', dosis: 'Anual', grupo: 'adulto-mayor', edadMeses: 720, edadTexto: '60 años y más, cada temporada', regla: 'anual' },
  { id: 'neumo23-am', vacunaId: 'neumo23', dosis: 'Única', grupo: 'adulto-mayor', edadMeses: 780, edadTexto: '65 años', verificar: 'Dosis única a los 65 años; tipo de vacuna neumocócica en adultos por verificar.' },
]
export const dosisPorId = (id: string) => ESQUEMA.find((d) => d.id === id)

/** Vacunas que se registran solo como "otra/campaña" (no forman parte del cálculo de atraso). */
export const NOTAS_ESQUEMA = [
  'COVID-19: según la campaña vigente de la Secretaría de Salud (verificar).',
  'SR, hepatitis B y Td en adolescentes y adultos no vacunados: completar esquema de rescate según el Manual de Vacunación (verificar).',
  'Hepatitis A, varicela y otras vacunas fuera del esquema universal: no se incluyen en el cálculo (verificar si su unidad las aplica).',
]

// ---------------------------------------------------------------------------
export interface Aplicacion {
  id?: string
  dosisId: string // id de ESQUEMA o 'otra'
  vacunaId: string
  fecha: string // YYYY-MM-DD
  lote?: string
  laboratorio?: string
  sitio?: string
  via?: string
  aplicador?: string
  proxima?: string
  nombre?: string // nombre comercial / vacuna "otra"
}

export type Estado = 'aplicada' | 'pendiente' | 'atrasada' | 'no-aplica' | 'riesgo'
export interface EstadoDosis {
  dosis: Dosis
  estado: Estado
  /** Pendiente cuya edad ya se cumplió (toca aplicarla ahora). */
  toca: boolean
  fechaObjetivo?: string
  aplicacion?: Aplicacion
  detalle: string
}

const DIA = 864e5
function utc(f: string) {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}
export function sumarMeses(f: string, meses: number): string {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + meses, 1, 12))
  const ultimo = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).getUTCDate()
  t.setUTCDate(Math.min(d, ultimo))
  return t.toISOString().slice(0, 10)
}
export function mesesCumplidos(nac: string, hoy: string): number {
  const [y1, m1, d1] = nac.split('-').map(Number)
  const [y2, m2, d2] = hoy.slice(0, 10).split('-').map(Number)
  let m = (y2 - y1) * 12 + (m2 - m1)
  if (d2 < d1) m--
  return Math.max(0, m)
}
const dias = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DIA)

/** Inicio de la temporada invernal de influenza (1 de octubre) vigente a una fecha. Temporada: oct–mar. */
export function inicioTemporada(hoy: string): string {
  const [y, m] = hoy.split('-').map(Number)
  return `${m >= 10 ? y : y - 1}-10-01`
}
export const enTemporada = (hoy: string) => {
  const m = Number(hoy.slice(5, 7))
  return m >= 10 || m <= 3
}

/** Dosis infantiles sin edad máxima propia dejan de contarse como atrasadas después de los 9 años: en
 * adolescentes y adultos se completa el esquema de rescate (SR, Td, hepatitis B) en lugar de la dosis infantil. */
export const MAX_INFANTIL = 119

/** Días de tolerancia después de la edad recomendada antes de considerar una dosis atrasada. */
export const TOLERANCIA_DIAS = 30

export interface Contexto {
  fechaNac: string
  sexo: 'F' | 'M' | 'O'
  hoy: string
  aplicaciones: Aplicacion[]
  /** FUM efectiva de un embarazo activo, si lo hay (desde Control prenatal). */
  embarazoFum?: string | null
}

export function evaluarDosis(d: Dosis, c: Contexto): EstadoDosis {
  const meses = mesesCumplidos(c.fechaNac, c.hoy)
  const regla = d.regla ?? 'unica'
  const delVac = c.aplicaciones.filter((a) => a.vacunaId === d.vacunaId).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const base = { dosis: d, toca: false }
  if (d.sexo && c.sexo !== 'O' && c.sexo !== d.sexo) return { ...base, estado: 'no-aplica', detalle: 'No aplica por sexo.' }

  if (regla === 'unica') {
    const ap = c.aplicaciones.find((a) => a.dosisId === d.id)
    const objetivo = sumarMeses(c.fechaNac, d.edadMeses)
    if (ap) return { ...base, estado: 'aplicada', aplicacion: ap, fechaObjetivo: objetivo, detalle: `Aplicada el ${ap.fecha}.` }
    if (meses < d.edadMeses) return { ...base, estado: 'pendiente', fechaObjetivo: objetivo, detalle: `Programada a partir del ${objetivo}.` }
    const max = d.maxMeses ?? (d.grupo === 'infantil' ? MAX_INFANTIL : undefined)
    if (max !== undefined && meses > max) return { ...base, estado: 'no-aplica', fechaObjetivo: objetivo, detalle: 'Edad máxima rebasada: valorar esquema de rescate.' }
    if (dias(objetivo, c.hoy) > TOLERANCIA_DIAS) return { ...base, estado: 'atrasada', toca: true, fechaObjetivo: objetivo, detalle: `Debió aplicarse desde el ${objetivo}.` }
    return { ...base, estado: 'pendiente', toca: true, fechaObjetivo: objetivo, detalle: 'Toca aplicarla ahora.' }
  }

  if (regla === 'anual') {
    const desde = d.edadMeses
    if (meses < desde) return { ...base, estado: 'pendiente', fechaObjetivo: sumarMeses(c.fechaNac, desde), detalle: 'Aún no corresponde.' }
    if (d.maxMeses !== undefined && meses > d.maxMeses) return { ...base, estado: 'no-aplica', detalle: 'Fuera del grupo de edad.' }
    const ini = inicioTemporada(c.hoy)
    const ap = delVac.find((a) => a.fecha >= ini)
    if (ap) return { ...base, estado: 'aplicada', aplicacion: ap, detalle: `Temporada ${ini.slice(0, 4)}–${Number(ini.slice(0, 4)) + 1}: aplicada el ${ap.fecha}.` }
    if (d.grupo === 'adulto') return { ...base, estado: 'riesgo', toca: enTemporada(c.hoy), detalle: 'Recomendada si hay factores de riesgo (enfermedad crónica, obesidad, asma, personal de salud…).' }
    if (!enTemporada(c.hoy)) return { ...base, estado: 'pendiente', fechaObjetivo: `${Number(ini.slice(0, 4)) + 1}-10-01`, detalle: 'Próxima temporada a partir de octubre.' }
    // en temporada: pendiente el primer mes, atrasada después
    return dias(ini, c.hoy) > TOLERANCIA_DIAS
      ? { ...base, estado: 'atrasada', toca: true, detalle: 'Sin dosis en la temporada actual.' }
      : { ...base, estado: 'pendiente', toca: true, detalle: 'Toca la dosis de esta temporada.' }
  }

  if (regla === 'cada10') {
    // Cuenta cualquier vacuna con componente tetánico (DPT, hexavalente, Td, Tdpa)
    const tet = c.aplicaciones.filter((a) => ['td', 'tdpa', 'dpt', 'hexa'].includes(a.vacunaId)).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    const inicio = sumarMeses(c.fechaNac, d.edadMeses)
    if (meses < d.edadMeses) return { ...base, estado: 'pendiente', fechaObjetivo: inicio, detalle: `Programada a partir del ${inicio}.` }
    const vence = tet ? sumarMeses(tet.fecha, 120) : null
    if (tet && vence! > c.hoy)
      return { ...base, estado: 'aplicada', aplicacion: tet, detalle: `Vigente hasta ${vence}.` }
    const objetivo = vence && vence > inicio ? vence : inicio
    if (dias(objetivo, c.hoy) > TOLERANCIA_DIAS) return { ...base, estado: 'atrasada', toca: true, fechaObjetivo: objetivo, detalle: tet ? `Último refuerzo ${tet.fecha}; refuerzo vencido.` : 'Sin refuerzo registrado.' }
    return { ...base, estado: 'pendiente', toca: true, fechaObjetivo: objetivo, detalle: 'Toca refuerzo.' }
  }

  // regla 'embarazo'
  if (!c.embarazoFum) return { ...base, estado: 'no-aplica', detalle: 'Sin embarazo activo registrado.' }
  const sdg = dias(c.embarazoFum, c.hoy) / 7
  const ap = delVac.find((a) => a.fecha >= c.embarazoFum!)
  if (ap) return { ...base, estado: 'aplicada', aplicacion: ap, detalle: `Aplicada en este embarazo (${ap.fecha}).` }
  if (d.vacunaId === 'tdpa') {
    const desde = new Date(utc(c.embarazoFum) + 140 * DIA).toISOString().slice(0, 10)
    if (sdg < 20) return { ...base, estado: 'pendiente', fechaObjetivo: desde, detalle: `A partir de la semana 20 (${desde}).` }
    if (sdg > 36) return { ...base, estado: 'atrasada', toca: true, fechaObjetivo: desde, detalle: 'No aplicada antes de la semana 36.' }
    return { ...base, estado: 'pendiente', toca: true, fechaObjetivo: desde, detalle: `Toca aplicarla (${Math.floor(sdg)} SDG).` }
  }
  if (!enTemporada(c.hoy)) return { ...base, estado: 'pendiente', detalle: 'Aplicar si el embarazo coincide con la temporada invernal.' }
  return { ...base, estado: 'pendiente', toca: true, detalle: 'Toca la dosis de influenza (temporada actual).' }
}

export function evaluarCartilla(c: Contexto): EstadoDosis[] {
  return ESQUEMA.map((d) => evaluarDosis(d, c))
}

/** Grupos que se muestran para la edad (los anteriores también, como historial). */
export function gruposVisibles(fechaNac: string, hoy: string, sexo: string, embarazada: boolean): Grupo[] {
  const anios = mesesCumplidos(fechaNac, hoy) / 12
  const g: Grupo[] = ['infantil']
  if (anios >= 9) g.push('adolescente')
  if (anios >= 5) g.push('adulto')
  if (sexo !== 'M' && embarazada) g.push('embarazo')
  if (anios >= 60) g.push('adulto-mayor')
  return g
}

export function atrasadas(estados: EstadoDosis[]): EstadoDosis[] {
  return estados.filter((e) => e.estado === 'atrasada')
}

export const ESTADO_LABEL: Record<Estado, string> = {
  aplicada: 'Aplicada',
  pendiente: 'Pendiente',
  atrasada: 'Atrasada',
  'no-aplica': 'No aplica',
  riesgo: 'Según riesgo',
}

export const NOTA_RESCATE =
  'Esquema atrasado: no se reinicia. Aplique las dosis faltantes respetando los intervalos mínimos entre dosis y las edades máximas de cada vacuna, conforme al Manual de Vacunación vigente (CeNSIA). Puede aplicar varias vacunas el mismo día en sitios distintos.'
