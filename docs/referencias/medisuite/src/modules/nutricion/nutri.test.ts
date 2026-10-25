import { demoNutricion } from './demo'
import { describe, expect, it } from 'vitest'
import {
  SMAE, adecuacion, clasificaIMC, distribuir, gramosMeta, harrisBenedict, icc, ict, imc, mifflin, opcionesPorOmision, resolverEquivalentes,
  riesgoCintura, riesgoICC, riesgoICT, sumaFila, totalesPlan, tonoAdecuacion, COMIDAS,
} from './nutri'

describe('Antropometría', () => {
  it('IMC y clasificación OMS', () => {
    expect(imc(104, 174)).toBeCloseTo(34.35, 2)
    expect(clasificaIMC(34.35).texto).toBe('Obesidad grado I')
    expect(clasificaIMC(24.99).texto).toBe('Normal')
    expect(clasificaIMC(25).texto).toBe('Sobrepeso')
    expect(clasificaIMC(40).texto).toBe('Obesidad grado III')
  })
  it('ICC (OMS 2008) e ICT ≥ 0.5', () => {
    expect(icc(90, 100)).toBeCloseTo(0.9)
    expect(riesgoICC(0.9, 'M')).toBe(true)
    expect(riesgoICC(0.88, 'M')).toBe(false)
    expect(riesgoICC(0.85, 'F')).toBe(true)
    expect(ict(87, 174)).toBe(0.5)
    expect(riesgoICT(0.5)).toBe(true)
    expect(riesgoICT(0.49)).toBe(false)
    expect(riesgoCintura(80, 'F')).toBe(true)
    expect(riesgoCintura(89, 'M')).toBe(false)
  })
})

describe('Energía', () => {
  it('Mifflin-St Jeor (1990)', () => {
    expect(mifflin('M', 80, 180, 30)).toBeCloseTo(1780)
    expect(mifflin('F', 60, 165, 25)).toBeCloseTo(1345.25)
  })
  it('Harris-Benedict original (1919)', () => {
    expect(harrisBenedict('M', 70, 175, 30)).toBeCloseTo(1702.01, 1)
    expect(harrisBenedict('F', 60, 165, 25)).toBeCloseTo(655.0955 + 573.804 + 305.184 - 116.89, 2)
  })
  it('gramos por macronutriente (Atwater)', () => {
    expect(gramosMeta(1800, { hc: 50, prot: 20, lip: 30 })).toEqual({ kcal: 1800, hc: 225, prot: 90, lip: 60 })
  })
})

describe('SMAE', () => {
  it('cada grupo es coherente con Atwater (±10 kcal por redondeo del SMAE)', () => {
    for (const g of SMAE) expect(Math.abs(g.hc * 4 + g.prot * 4 + g.lip * 9 - g.kcal)).toBeLessThanOrEqual(10)
  })
  it('valores clave', () => {
    const v = Object.fromEntries(SMAE.map((g) => [g.id, [g.kcal, g.hc, g.prot, g.lip]]))
    expect(v.verduras).toEqual([25, 4, 2, 0])
    expect(v.frutas).toEqual([60, 15, 0, 0])
    expect(v['cereales-sg']).toEqual([70, 15, 2, 0])
    expect(v.leguminosas).toEqual([120, 20, 8, 1])
    expect([v['aoa-mb'][0], v['aoa-b'][0], v['aoa-m'][0], v['aoa-a'][0]]).toEqual([40, 55, 75, 100])
    expect(v['grasas-sp']).toEqual([45, 0, 0, 5])
    expect(v['azucares-cg']).toEqual([85, 10, 0, 5])
  })
})

describe('Solver de equivalentes', () => {
  it('1800 kcal, 50/20/30 → cereales 9, AOA bajo 6.5, grasas 7.5 (≈ 101 %)', () => {
    const meta = gramosMeta(1800, { hc: 50, prot: 20, lip: 30 })
    const eq = resolverEquivalentes(meta, opcionesPorOmision(1800))
    expect(eq).toMatchObject({ verduras: 4, frutas: 3, 'leche-d': 2, leguminosas: 1 })
    const t = totalesPlan(eq)
    for (const k of ['kcal', 'hc', 'prot', 'lip'] as const) expect(tonoAdecuacion(adecuacion(t[k], meta[k]))).not.toBe('danger')
  })
  it('ejemplo manual con leche 1', () => {
    const meta = gramosMeta(1800, { hc: 50, prot: 20, lip: 30 })
    const eq = resolverEquivalentes(meta, { ...opcionesPorOmision(1800), leche: 1 })
    expect(eq).toMatchObject({ 'cereales-sg': 9, 'aoa-b': 6.5, 'grasas-sp': 7.5 })
    expect(totalesPlan(eq).kcal).toBe(1820)
  })
  it('no genera equivalentes negativos', () => {
    const eq = resolverEquivalentes(gramosMeta(800, { hc: 20, prot: 30, lip: 50 }), opcionesPorOmision(1800))
    expect(Object.values(eq).every((n) => n >= 0)).toBe(true)
  })
})

describe('Distribución por tiempos', () => {
  it('la suma de cada grupo cuadra y usa múltiplos de 0.5', () => {
    const pcts = Object.fromEntries(COMIDAS.map((c) => [c.id, c.pct])) as Record<(typeof COMIDAS)[number]['id'], number>
    const d = distribuir({ verduras: 4, leguminosas: 1, 'cereales-sg': 9 }, pcts)
    for (const [g, n] of Object.entries({ verduras: 4, leguminosas: 1, 'cereales-sg': 9 })) {
      expect(sumaFila(d[g])).toBe(n)
      for (const x of Object.values(d[g])) expect((x * 2) % 1).toBe(0)
    }
    expect(d.leguminosas.comida).toBe(1)
  })
})

describe('Demo', () => {
  it('plan de Roberto dentro de 90–110 % de la meta energética', () => {
    const [r] = demoNutricion(Date.parse('2026-10-24T12:00:00Z'))
    const d = r.datos as { kcal: number; eq: Record<string, number> }
    expect(adecuacion(totalesPlan(d.eq).kcal, d.kcal)).toBeGreaterThan(90)
    expect(adecuacion(totalesPlan(d.eq).kcal, d.kcal)).toBeLessThan(110)
  })
})
