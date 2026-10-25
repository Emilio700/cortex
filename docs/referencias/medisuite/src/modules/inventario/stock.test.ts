import { describe, expect, it } from 'vitest'
import {
  ajustesPorConteo,
  alertas,
  bandaCaducidad,
  costoPromedio,
  diasParaCaducar,
  kardex,
  lotesDe,
  parseCSV,
  productosACSV,
  productosDesdeCSV,
  stockPorProducto,
  sugerirFEFO,
  toCSV,
  valuacion,
  type Movimiento,
  type Producto,
} from './stock'

let n = 0
const mv = (fecha: string, m: Partial<Movimiento>): Movimiento => ({ id: 'm' + String(++n).padStart(3, '0'), fecha: fecha + 'T10:00:00Z', productoId: 'A', tipo: 'entrada', cantidad: 0, ...m })

describe('costo promedio ponderado (método de costo promedio, NIF C-4 / ejemplo de libro)', () => {
  // Compra 100 @ $10, compra 50 @ $13 → promedio (1000 + 650) / 150 = $11.00
  // Venta 60 → saldo 90 @ $11 = $990. Compra 30 @ $15 → (990 + 450) / 120 = $12.00
  const movs = [
    mv('2026-01-01', { tipo: 'entrada', cantidad: 100, costoUnitario: 10, lote: 'L1', caducidad: '2027-01-01' }),
    mv('2026-01-05', { tipo: 'entrada', cantidad: 50, costoUnitario: 13, lote: 'L2', caducidad: '2026-12-01' }),
    mv('2026-01-10', { tipo: 'salida', cantidad: 60, motivo: 'venta', lote: 'L1' }),
    mv('2026-01-15', { tipo: 'entrada', cantidad: 30, costoUnitario: 15, lote: 'L3', caducidad: '2027-06-01' }),
  ]
  it('kárdex con saldo corrido', () => {
    const k = kardex(movs, 'A')
    expect(k.map((f) => f.saldo)).toEqual([100, 150, 90, 120])
    expect(k[1].costoPromedio).toBe(11)
    expect(k[2].valorSaldo).toBe(990)
    expect(k[3].costoPromedio).toBe(12)
    expect(k[3].valorSaldo).toBe(1440)
    expect(costoPromedio(movs, 'A')).toBe(12)
    expect(valuacion(['A', 'B'], movs)).toBe(1440)
  })
  it('existencia por lote ordenada FEFO', () => {
    const l = lotesDe(movs, 'A')
    expect(l.map((x) => [x.lote, x.cantidad])).toEqual([
      ['L2', 50],
      ['L1', 40],
      ['L3', 30],
    ])
  })
})

describe('existencias', () => {
  it('stock = suma de movimientos; ajuste con signo', () => {
    const movs = [mv('2026-01-01', { cantidad: 10 }), mv('2026-01-02', { tipo: 'salida', cantidad: 3 }), mv('2026-01-03', { tipo: 'ajuste', cantidad: -2 }), mv('2026-01-01', { productoId: 'B', cantidad: 5 })]
    const s = stockPorProducto(movs)
    expect(s.get('A')).toBe(5)
    expect(s.get('B')).toBe(5)
  })
})

describe('FEFO', () => {
  const lotes = [
    { lote: 'TARDE', caducidad: '2027-05-01', cantidad: 20 },
    { lote: 'VENCIDO', caducidad: '2026-09-01', cantidad: 5 },
    { lote: 'PRONTO', caducidad: '2026-11-15', cantidad: 4 },
    { lote: 'SIN LOTE', cantidad: 50 },
  ]
  it('surte primero lo que caduca antes y omite caducados', () => {
    const r = sugerirFEFO(lotes, 10, '2026-10-24')
    expect(r.asignacion).toEqual([
      { lote: 'PRONTO', caducidad: '2026-11-15', cantidad: 4 },
      { lote: 'TARDE', caducidad: '2027-05-01', cantidad: 6 },
    ])
    expect(r.faltante).toBe(0)
    expect(r.omitidosCaducados).toEqual(['VENCIDO'])
  })
  it('permite caducados para baja por caducidad e informa faltante', () => {
    expect(sugerirFEFO(lotes, 3, '2026-10-24', true).asignacion[0].lote).toBe('VENCIDO')
    expect(sugerirFEFO(lotes, 100, '2026-10-24').faltante).toBe(26)
  })
})

describe('caducidad y alertas', () => {
  it('días para caducar', () => {
    expect(diasParaCaducar('2026-10-24', '2026-10-24')).toBe(0)
    expect(diasParaCaducar('2026-11-23', '2026-10-24')).toBe(30)
    expect(diasParaCaducar('2026-10-01', '2026-10-24')).toBe(-23)
  })
  it('bandas 30/60/90', () => {
    expect(bandaCaducidad(0)).toBe(30)
    expect(bandaCaducidad(45)).toBe(60)
    expect(bandaCaducidad(90)).toBe(90)
    expect(bandaCaducidad(91)).toBeNull()
    expect(bandaCaducidad(-1)).toBeNull()
  })
  it('bajo mínimo, caducados y por caducar', () => {
    const p: Producto = { nombre: 'X', unidad: 'pieza', categoria: 'medicamento', stockMinimo: 10, controlado: false }
    const movs = [mv('2026-01-01', { cantidad: 4, lote: 'A1', caducidad: '2026-10-01' }), mv('2026-01-01', { cantidad: 3, lote: 'A2', caducidad: '2026-12-01' }), mv('2026-01-01', { cantidad: 2, lote: 'A3', caducidad: '2028-01-01' })]
    const a = alertas([{ id: 'A', p }], movs, '2026-10-24')
    expect(a.bajoMinimo).toEqual([{ productoId: 'A', stock: 9, minimo: 10 }])
    expect(a.caducados.map((x) => x.lote)).toEqual(['A1'])
    expect(a.porCaducar.map((x) => [x.lote, x.dias])).toEqual([['A2', 38]])
  })
})

describe('conteo físico', () => {
  it('genera ajustes solo donde hay diferencia (incluye lotes nuevos)', () => {
    const r = ajustesPorConteo(
      [
        { lote: 'L1', cantidad: 10 },
        { lote: 'L2', cantidad: 5 },
      ],
      { L1: 8, L2: 5, l9: 2 },
    )
    expect(r).toEqual([
      { lote: 'L1', caducidad: undefined, sistema: 10, fisico: 8, diferencia: -2 },
      { lote: 'L9', sistema: 0, fisico: 2, diferencia: 2 },
    ])
  })
})

describe('CSV', () => {
  it('parsea comillas, separador ; y saltos de línea en campos', () => {
    expect(parseCSV('a;b\r\n"x;1";"dijo ""hola""\nadiós"\r\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'dijo "hola"\nadiós'],
    ])
  })
  it('exporta con BOM, escapa y neutraliza fórmulas', () => {
    const s = toCSV([['=SUMA(A1)', 'a,b', -5]])
    expect(s).toBe('﻿\'=SUMA(A1),"a,b",-5\r\n')
  })
  it('importa productos con encabezados flexibles', () => {
    const filas = parseCSV('Nombre,Presentación,Unidad,Categoría,Stock mínimo,Precio venta,Controlado\nParacetamol,500 mg tab,caja,Medicamento,5,$35.50,no\nDiazepam,10 mg,ampolleta,medicamento,2,,sí\n,,\n')
    const { productos, errores } = productosDesdeCSV(filas)
    expect(productos).toHaveLength(2)
    expect(productos[0]).toMatchObject({ nombre: 'Paracetamol', presentacion: '500 mg tab', unidad: 'caja', categoria: 'medicamento', stockMinimo: 5, precioVenta: 35.5, controlado: false })
    expect(productos[1].controlado).toBe(true)
    expect(errores).toEqual([])
    expect(productosDesdeCSV([['producto']]).errores[0]).toMatch(/nombre/)
  })
  it('ida y vuelta exportar → importar', () => {
    const p: Producto = { nombre: 'Gasas "estériles"', presentacion: '10x10 cm', unidad: 'paquete', categoria: 'material-curacion', stockMinimo: 20, controlado: false, ubicacion: 'Estante 2' }
    const back = productosDesdeCSV(parseCSV(productosACSV([{ p, stock: 3, costoPromedio: 1.5 }]))).productos[0]
    expect(back).toMatchObject(p)
  })
})
