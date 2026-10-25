import { describe, expect, it } from 'vitest'
import { demoInventario } from './demo'
import { alertas, movimientoDe, productoDe, stockPorProducto } from './stock'

describe('datos demo de inventario', () => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  const regs = demoInventario(now)
  const prods = regs.filter((r) => r.tipo === 'inventario').map((r) => ({ id: r.id, p: productoDe(r) }))
  const movs = regs.filter((r) => r.tipo === 'movimiento-inventario').map(movimientoDe)
  it('25 productos, ninguna existencia negativa', () => {
    expect(prods).toHaveLength(25)
    for (const v of stockPorProducto(movs).values()) expect(v).toBeGreaterThanOrEqual(0)
    expect(prods.some((x) => x.p.controlado)).toBe(true)
  })
  it('incluye alertas de mínimo, caducados y por caducar', () => {
    const a = alertas(prods, movs, '2026-10-24')
    expect(a.bajoMinimo.length).toBeGreaterThan(2)
    expect(a.caducados.length).toBeGreaterThan(0)
    expect(a.porCaducar.filter((x) => x.dias <= 30).length).toBeGreaterThan(0)
  })
})
