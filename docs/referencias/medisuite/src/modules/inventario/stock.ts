// Lógica pura de inventario: existencias por producto y lote, FEFO, kárdex con costo promedio ponderado,
// alertas de mínimo y caducidad, ajustes por conteo físico y CSV.
//
// Los movimientos son de solo alta (append-only): las existencias SIEMPRE se calculan sumando movimientos.
// Un error se corrige con un movimiento de ajuste, nunca editando o borrando el movimiento original.
import type { Registro } from '../../lib/types'

export type Categoria = 'medicamento' | 'insumo' | 'material-curacion' | 'vacuna' | 'otro'
export const CATEGORIAS: Record<Categoria, string> = {
  medicamento: 'Medicamento',
  insumo: 'Insumo',
  'material-curacion': 'Material de curación',
  vacuna: 'Vacuna / biológico',
  otro: 'Otro',
}

export interface Producto {
  nombre: string
  presentacion?: string
  unidad: string // unidad de conteo (pieza, ampolleta, caja, frasco…)
  categoria: Categoria
  stockMinimo: number
  ubicacion?: string
  precioVenta?: number
  controlado: boolean
  codigo?: string
}

export type TipoMov = 'entrada' | 'salida' | 'ajuste'
export type MotivoSalida = 'consumo' | 'aplicacion' | 'venta' | 'merma' | 'caducado'
export const MOTIVOS: Record<MotivoSalida, string> = {
  consumo: 'Consumo interno',
  aplicacion: 'Aplicación a paciente',
  venta: 'Venta',
  merma: 'Merma / daño',
  caducado: 'Baja por caducidad',
}

export interface Movimiento {
  id: string
  fecha: string
  productoId: string
  tipo: TipoMov
  cantidad: number // entrada/salida: positiva; ajuste: con signo (+ sobrante, − faltante)
  lote?: string
  caducidad?: string // YYYY-MM-DD
  costoUnitario?: number
  proveedor?: string
  factura?: string
  motivo?: MotivoSalida
  patientId?: string
  nota?: string
  usuario?: string
}

export const SIN_LOTE = 'SIN LOTE'
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

export function productoDe(r: Registro): Producto {
  const d = (r.datos ?? {}) as Partial<Producto>
  return {
    nombre: String(d.nombre ?? r.titulo ?? ''),
    presentacion: d.presentacion,
    unidad: String(d.unidad ?? 'pieza'),
    categoria: (d.categoria ?? 'otro') as Categoria,
    stockMinimo: Math.max(0, num(d.stockMinimo)),
    ubicacion: d.ubicacion,
    precioVenta: d.precioVenta === undefined || d.precioVenta === null ? undefined : num(d.precioVenta),
    controlado: !!d.controlado,
    codigo: d.codigo,
  }
}

export function movimientoDe(r: Registro): Movimiento {
  const d = (r.datos ?? {}) as Partial<Movimiento>
  return {
    id: r.id,
    fecha: r.fecha,
    productoId: String(d.productoId ?? ''),
    tipo: (d.tipo ?? 'ajuste') as TipoMov,
    cantidad: num(d.cantidad),
    lote: d.lote ? String(d.lote).trim() : undefined,
    caducidad: d.caducidad,
    costoUnitario: d.costoUnitario === undefined ? undefined : num(d.costoUnitario),
    proveedor: d.proveedor,
    factura: d.factura,
    motivo: d.motivo,
    patientId: r.patientId,
    nota: d.nota,
    usuario: d.usuario,
  }
}

/** Movimientos ordenados cronológicamente (estable por id). */
export function ordenar(movs: Movimiento[]): Movimiento[] {
  return [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
}

/** Efecto del movimiento sobre la existencia. */
export function delta(m: Movimiento): number {
  if (m.tipo === 'entrada') return Math.abs(m.cantidad)
  if (m.tipo === 'salida') return -Math.abs(m.cantidad)
  return m.cantidad
}

export function stockPorProducto(movs: Movimiento[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of movs) m.set(x.productoId, (m.get(x.productoId) ?? 0) + delta(x))
  return m
}

export interface LoteStock {
  lote: string
  caducidad?: string
  cantidad: number
  costoUnitario?: number
}

const loteKey = (l?: string) => (l && l.trim() ? l.trim().toUpperCase() : SIN_LOTE)

/** Compara caducidades: primero la más próxima; sin caducidad al final. */
export function cmpCaducidad(a?: string, b?: string): number {
  if (a && b) return a.localeCompare(b)
  return a ? -1 : b ? 1 : 0
}

/** Existencia por lote de un producto (solo lotes con existencia ≠ 0), ordenada FEFO. */
export function lotesDe(movs: Movimiento[], productoId: string, incluirCero = false): LoteStock[] {
  const m = new Map<string, LoteStock>()
  for (const x of ordenar(movs)) {
    if (x.productoId !== productoId) continue
    const k = loteKey(x.lote)
    const l = m.get(k) ?? { lote: k, cantidad: 0 }
    l.cantidad += delta(x)
    if (x.caducidad && (!l.caducidad || x.tipo === 'entrada')) l.caducidad = x.caducidad
    if (x.tipo === 'entrada' && x.costoUnitario !== undefined) l.costoUnitario = x.costoUnitario
    m.set(k, l)
  }
  return [...m.values()].filter((l) => incluirCero || Math.abs(l.cantidad) > 1e-9).sort((a, b) => cmpCaducidad(a.caducidad, b.caducidad) || a.lote.localeCompare(b.lote))
}

/** Días que faltan para la caducidad (negativo si ya caducó). La caducidad vence al final del día indicado. */
export function diasParaCaducar(caducidad: string, hoyISO: string): number {
  const c = Date.parse(caducidad.slice(0, 10) + 'T00:00:00Z')
  const h = Date.parse(hoyISO.slice(0, 10) + 'T00:00:00Z')
  return Math.round((c - h) / 86_400_000)
}

export interface AsignacionFEFO {
  asignacion: { lote: string; caducidad?: string; cantidad: number }[]
  faltante: number
  omitidosCaducados: string[]
}

/**
 * First-Expire-First-Out: sugiere de qué lotes surtir una salida, empezando por el que caduca primero.
 * Los lotes caducados no se surten (salvo que el motivo sea precisamente la baja por caducidad).
 */
export function sugerirFEFO(lotes: LoteStock[], cantidad: number, hoyISO: string, permitirCaducados = false): AsignacionFEFO {
  let resta = Math.max(0, cantidad)
  const asignacion: AsignacionFEFO['asignacion'] = []
  const omitidosCaducados: string[] = []
  for (const l of [...lotes].sort((a, b) => cmpCaducidad(a.caducidad, b.caducidad))) {
    if (resta <= 0) break
    if (l.cantidad <= 0) continue
    if (!permitirCaducados && l.caducidad && diasParaCaducar(l.caducidad, hoyISO) < 0) {
      omitidosCaducados.push(l.lote)
      continue
    }
    const q = Math.min(l.cantidad, resta)
    asignacion.push({ lote: l.lote, caducidad: l.caducidad, cantidad: q })
    resta -= q
  }
  return { asignacion, faltante: resta, omitidosCaducados }
}

export interface FilaKardex {
  id: string
  fecha: string
  tipo: TipoMov
  concepto: string
  lote: string
  entrada: number
  salida: number
  saldo: number
  costoUnitario?: number
  costoPromedio: number
  valorSaldo: number
  patientId?: string
}

/**
 * Kárdex de un producto con saldo corrido y costo promedio ponderado:
 *   entrada con costo c → promedio = (saldo·promedio + q·c) / (saldo + q)
 * Las salidas y ajustes se valúan al promedio vigente y no lo modifican.
 */
export function kardex(movs: Movimiento[], productoId: string): FilaKardex[] {
  let saldo = 0
  let prom = 0
  const out: FilaKardex[] = []
  for (const m of ordenar(movs)) {
    if (m.productoId !== productoId) continue
    const d = delta(m)
    if (m.tipo === 'entrada' && m.costoUnitario !== undefined && m.costoUnitario >= 0) {
      const base = Math.max(saldo, 0)
      prom = base + d > 0 ? (base * prom + d * m.costoUnitario) / (base + d) : m.costoUnitario
    }
    saldo += d
    const concepto =
      m.tipo === 'entrada' ? `Entrada${m.proveedor ? ' · ' + m.proveedor : ''}` : m.tipo === 'salida' ? (m.motivo ? MOTIVOS[m.motivo] : 'Salida') : 'Ajuste por conteo físico'
    out.push({
      id: m.id,
      fecha: m.fecha,
      tipo: m.tipo,
      concepto,
      lote: loteKey(m.lote),
      entrada: d > 0 ? d : 0,
      salida: d < 0 ? -d : 0,
      saldo: redondear(saldo),
      costoUnitario: m.tipo === 'entrada' ? m.costoUnitario : prom || undefined,
      costoPromedio: redondear(prom, 4),
      valorSaldo: redondear(Math.max(saldo, 0) * prom, 2),
      patientId: m.patientId,
    })
  }
  return out
}

export const redondear = (x: number, dec = 3) => Math.round(x * 10 ** dec) / 10 ** dec

export function costoPromedio(movs: Movimiento[], productoId: string): number {
  const k = kardex(movs, productoId)
  return k.length ? k[k.length - 1].costoPromedio : 0
}

/** Valor del inventario al costo promedio. */
export function valuacion(productoIds: string[], movs: Movimiento[]): number {
  let total = 0
  for (const id of productoIds) {
    const k = kardex(movs, id)
    if (k.length) total += k[k.length - 1].valorSaldo
  }
  return redondear(total, 2)
}

export interface AlertaLote {
  productoId: string
  lote: string
  caducidad: string
  cantidad: number
  dias: number
}

export interface Alertas {
  bajoMinimo: { productoId: string; stock: number; minimo: number }[]
  caducados: AlertaLote[]
  porCaducar: AlertaLote[] // dentro de `horizonte` días
}

/** Alertas de existencia mínima y caducidad (caducados y por caducar en ≤ horizonte días: 30/60/90). */
export function alertas(productos: { id: string; p: Producto }[], movs: Movimiento[], hoyISO: string, horizonte = 90): Alertas {
  const stock = stockPorProducto(movs)
  const res: Alertas = { bajoMinimo: [], caducados: [], porCaducar: [] }
  for (const { id, p } of productos) {
    const s = stock.get(id) ?? 0
    if (p.stockMinimo > 0 && s <= p.stockMinimo) res.bajoMinimo.push({ productoId: id, stock: s, minimo: p.stockMinimo })
    for (const l of lotesDe(movs, id)) {
      if (!l.caducidad || l.cantidad <= 0) continue
      const dias = diasParaCaducar(l.caducidad, hoyISO)
      const a = { productoId: id, lote: l.lote, caducidad: l.caducidad, cantidad: l.cantidad, dias }
      if (dias < 0) res.caducados.push(a)
      else if (dias <= horizonte) res.porCaducar.push(a)
    }
  }
  res.caducados.sort((a, b) => a.dias - b.dias)
  res.porCaducar.sort((a, b) => a.dias - b.dias)
  return res
}

/** Banda de caducidad para colorear: 30, 60 o 90 días (null si falta más o ya caducó). */
export function bandaCaducidad(dias: number): 30 | 60 | 90 | null {
  if (dias < 0) return null
  return dias <= 30 ? 30 : dias <= 60 ? 60 : dias <= 90 ? 90 : null
}

/** Ajustes necesarios para que el sistema coincida con el conteo físico (solo los lotes con diferencia). */
export function ajustesPorConteo(lotes: LoteStock[], conteo: Record<string, number | undefined>): { lote: string; caducidad?: string; sistema: number; fisico: number; diferencia: number }[] {
  const out: { lote: string; caducidad?: string; sistema: number; fisico: number; diferencia: number }[] = []
  const vistos = new Set<string>()
  for (const l of lotes) {
    vistos.add(l.lote)
    const f = conteo[l.lote]
    if (f === undefined || !Number.isFinite(f)) continue
    const dif = redondear(f - l.cantidad)
    if (dif !== 0) out.push({ lote: l.lote, caducidad: l.caducidad, sistema: l.cantidad, fisico: f, diferencia: dif })
  }
  for (const [lote, f] of Object.entries(conteo)) {
    const k = loteKey(lote)
    if (vistos.has(k) || f === undefined || !Number.isFinite(f) || f === 0) continue
    out.push({ lote: k, sistema: 0, fisico: f, diferencia: f })
  }
  return out
}

// ---------------------------------------------------------------- CSV
/** Parser CSV (RFC 4180): comillas dobles, saltos de línea dentro de comillas, separador «,» o «;» autodetectado. */
export function parseCSV(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primera = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"'
          i++
        } else q = false
      } else campo += ch
    } else if (ch === '"') q = true
    else if (ch === sep) {
      fila.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else campo += ch
  }
  if (campo !== '' || fila.length) {
    fila.push(campo)
    filas.push(fila)
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ''))
}

export function toCSV(filas: (string | number | boolean | undefined | null)[][]): string {
  const esc = (v: string | number | boolean | undefined | null) => {
    const s = v === undefined || v === null ? '' : String(v)
    // evita inyección de fórmulas al abrir en Excel
    const seguro = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s
    return /[",;\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
  }
  return '﻿' + filas.map((f) => f.map(esc).join(',')).join('\r\n') + '\r\n'
}

export const COLUMNAS_CSV = ['nombre', 'presentacion', 'unidad', 'categoria', 'stock_minimo', 'ubicacion', 'precio_venta', 'controlado', 'codigo'] as const

const normH = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')

const SI = new Set(['si', 'sí', 's', 'yes', 'y', 'true', '1', 'x'])

/** Convierte filas CSV (con encabezado) en productos. Devuelve también los errores por renglón. */
export function productosDesdeCSV(filas: string[][]): { productos: Producto[]; errores: string[] } {
  const errores: string[] = []
  if (!filas.length) return { productos: [], errores: ['El archivo está vacío.'] }
  const h = filas[0].map(normH)
  const col = (n: string) => h.indexOf(n)
  if (col('nombre') < 0) return { productos: [], errores: ['Falta la columna «nombre» en el encabezado.'] }
  const productos: Producto[] = []
  filas.slice(1).forEach((f, i) => {
    const v = (n: string) => (col(n) >= 0 ? (f[col(n)] ?? '').trim() : '')
    const nombre = v('nombre')
    if (!nombre) return void errores.push(`Renglón ${i + 2}: sin nombre, se omitió.`)
    const cat = normH(v('categoria')).replace(/_/g, '-')
    const categoria = (Object.keys(CATEGORIAS) as Categoria[]).find((k) => k === cat || normH(CATEGORIAS[k]).replace(/_/g, '-') === cat) ?? (cat.startsWith('medic') ? 'medicamento' : cat ? 'insumo' : 'otro')
    const minimo = Number(v('stock_minimo').replace(',', '.'))
    const precioTxt = v('precio_venta').replace(/[$\s]/g, '').replace(',', '.')
    const precio = precioTxt ? Number(precioTxt) : undefined
    if (v('stock_minimo') && !Number.isFinite(minimo)) errores.push(`Renglón ${i + 2}: stock mínimo inválido; se usó 0.`)
    productos.push({
      nombre,
      ...(v('presentacion') ? { presentacion: v('presentacion') } : {}),
      unidad: v('unidad') || 'pieza',
      categoria,
      stockMinimo: Number.isFinite(minimo) && minimo > 0 ? minimo : 0,
      ...(v('ubicacion') ? { ubicacion: v('ubicacion') } : {}),
      ...(precio !== undefined && Number.isFinite(precio) ? { precioVenta: precio } : {}),
      controlado: SI.has(normH(v('controlado'))),
      ...(v('codigo') ? { codigo: v('codigo') } : {}),
    })
  })
  return { productos, errores }
}

export function productosACSV(lista: { p: Producto; stock: number; costoPromedio: number }[]): string {
  return toCSV([
    [...COLUMNAS_CSV, 'existencia', 'costo_promedio'],
    ...lista.map(({ p, stock, costoPromedio }) => [p.nombre, p.presentacion, p.unidad, p.categoria, p.stockMinimo, p.ubicacion, p.precioVenta, p.controlado ? 'si' : 'no', p.codigo, stock, costoPromedio ? costoPromedio.toFixed(2) : '']),
  ])
}
