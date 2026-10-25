// Modelo del odontograma (notación FDI), herramientas, plan de tratamiento y CPO-D.
export type Cara = 'V' | 'L' | 'M' | 'D' | 'O'
export type EstadoCara = 'caries' | 'resina' | 'amalgama' | 'sellador'
export type EstadoDiente = 'ausente' | 'extraccion' | 'corona' | 'corona-ind' | 'endodoncia' | 'endo-ind' | 'implante' | 'fractura'
export interface Odo {
  caras: Record<string, Partial<Record<Cara, EstadoCara>>>
  dientes: Record<string, EstadoDiente[]>
  excluidos: string[] // claves del plan desmarcadas
  extras: { concepto: string; precio: number }[]
  temporal: boolean
  notas: string
}
export const vacio = (): Odo => ({ caras: {}, dientes: {}, excluidos: [], extras: [], temporal: false, notas: '' })

export const ARCADAS = {
  supPerm: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  supTemp: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  infTemp: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
  infPerm: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
}
export const cuadrante = (n: number) => Math.floor(n / 10)
export const esSuperior = (n: number) => [1, 2, 5, 6].includes(cuadrante(n))
/** Dientes dibujados a la izquierda del observador (lado derecho del paciente): mesial hacia la derecha. */
export const ladoDerechoPaciente = (n: number) => [1, 4, 5, 8].includes(cuadrante(n))
export const esAnterior = (n: number) => n % 10 <= 3

export const NOMBRE_CARA = (c: Cara, n: number) =>
  ({ V: 'Vestibular', L: esSuperior(n) ? 'Palatino' : 'Lingual', M: 'Mesial', D: 'Distal', O: esAnterior(n) ? 'Incisal' : 'Oclusal' })[c]

export const HERR_CARA: { id: EstadoCara; label: string; color: string; pendiente?: boolean }[] = [
  { id: 'caries', label: 'Caries', color: '#dc2626', pendiente: true },
  { id: 'resina', label: 'Resina', color: '#2563eb' },
  { id: 'amalgama', label: 'Amalgama', color: '#6b7280' },
  { id: 'sellador', label: 'Sellador', color: '#16a34a' },
]
export const HERR_DIENTE: { id: EstadoDiente; label: string; color: string; pendiente?: boolean }[] = [
  { id: 'ausente', label: 'Ausente', color: '#2563eb' },
  { id: 'extraccion', label: 'Extracción indicada', color: '#dc2626', pendiente: true },
  { id: 'corona', label: 'Corona', color: '#2563eb' },
  { id: 'corona-ind', label: 'Corona indicada', color: '#dc2626', pendiente: true },
  { id: 'endodoncia', label: 'Endodoncia', color: '#2563eb' },
  { id: 'endo-ind', label: 'Endodoncia indicada', color: '#dc2626', pendiente: true },
  { id: 'implante', label: 'Implante', color: '#7c3aed' },
  { id: 'fractura', label: 'Fractura', color: '#dc2626', pendiente: true },
]
export const COLOR_CARA = Object.fromEntries(HERR_CARA.map((h) => [h.id, h.color])) as Record<EstadoCara, string>

export const PRECIOS_BASE: Record<string, { label: string; precio: number }> = {
  resina1: { label: 'Resina (1 cara)', precio: 700 },
  resina2: { label: 'Resina compuesta (2+ caras)', precio: 1000 },
  extraccion: { label: 'Extracción', precio: 800 },
  corona: { label: 'Corona', precio: 4500 },
  endodoncia: { label: 'Endodoncia', precio: 3500 },
  reconstruccion: { label: 'Reconstrucción / valoración de fractura', precio: 1200 },
  implante: { label: 'Rehabilitación (implante o prótesis)', precio: 15000 },
}

export interface ItemPlan {
  clave: string
  diente: number
  tipo: keyof typeof PRECIOS_BASE
  detalle: string
  incluidoPorDefecto: boolean
}
export function generarPlan(o: Odo): ItemPlan[] {
  const dientes = new Set([...Object.keys(o.caras), ...Object.keys(o.dientes)].map(Number))
  const out: ItemPlan[] = []
  for (const d of [...dientes].sort((a, b) => a - b)) {
    const est = o.dientes[d] ?? []
    const push = (tipo: ItemPlan['tipo'], detalle: string, inc = true) => out.push({ clave: `${d}-${tipo}`, diente: d, tipo, detalle, incluidoPorDefecto: inc })
    if (est.includes('ausente')) { push('implante', 'Diente ausente', false); continue }
    if (est.includes('extraccion')) { push('extraccion', 'Extracción indicada'); continue }
    const caries = (Object.entries(o.caras[d] ?? {}) as [Cara, EstadoCara][]).filter(([, e]) => e === 'caries').map(([c]) => c)
    if (caries.length) push(caries.length === 1 ? 'resina1' : 'resina2', `Caries ${caries.map((c) => NOMBRE_CARA(c, d).toLowerCase()).join(', ')}`)
    if (est.includes('endo-ind')) push('endodoncia', 'Endodoncia indicada')
    if (est.includes('corona-ind')) push('corona', 'Corona indicada')
    if (est.includes('fractura')) push('reconstruccion', 'Fractura')
  }
  return out
}

/** Índice CPO-D (dientes permanentes): cariados, perdidos (o extracción indicada), obturados. */
export function cpod(o: Odo) {
  let c = 0, p = 0, ob = 0
  for (const d of [...ARCADAS.supPerm, ...ARCADAS.infPerm]) {
    const est = o.dientes[d] ?? [], caras = Object.values(o.caras[d] ?? {})
    if (est.includes('ausente') || est.includes('extraccion')) p++
    else if (caras.includes('caries')) c++
    else if (caras.some((x) => x === 'resina' || x === 'amalgama') || est.includes('corona')) ob++
  }
  return { c, p, o: ob, total: c + p + ob }
}
