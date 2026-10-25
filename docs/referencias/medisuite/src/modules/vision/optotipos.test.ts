// npx vitest run src/modules/vision
import { describe, expect, it } from 'vitest'
import * as o from './optotipos'

describe('tamaño de optotipos', () => {
  it('20/20 a 6 m mide 8.73 mm (5′ de arco)', () => {
    expect(o.alturaOptotipoMm(6, 0)).toBeCloseTo(8.73, 2)
  })
  it('20/200 (logMAR 1.0) a 6 m mide 87.3 mm', () => {
    expect(o.alturaOptotipoMm(6, 1)).toBeCloseTo(87.3, 1)
  })
  it('a 3 m el optotipo mide la mitad que a 6 m', () => {
    expect(o.alturaOptotipoMm(3, 0.3)).toBeCloseTo(o.alturaOptotipoMm(6, 0.3) / 2, 6)
  })
  it('cerca 40 cm, logMAR 0 (N5 aprox.) ≈ 0.58 mm', () => {
    expect(o.alturaOptotipoMm(0.4, 0)).toBeCloseTo(0.582, 3)
  })
  it('calibración: tarjeta de 323.5 px → 3.78 px/mm (96 dpi)', () => {
    expect(o.pxPorMm(323.5)).toBeCloseTo(3.779, 3)
  })
  it('detecta líneas no renderizables', () => {
    expect(o.renderizable(0.4, -0.3, 3.78)).toBe(false)
    expect(o.renderizable(3, 0, 3.78)).toBe(true)
  })
  it('14 líneas de 1.0 a −0.3', () => {
    expect(o.LINEAS_LOGMAR).toHaveLength(14)
    expect(o.LINEAS_LOGMAR[0]).toBe(1)
    expect(o.LINEAS_LOGMAR[13]).toBe(-0.3)
  })
})

describe('conversiones', () => {
  it.each([
    [1.0, '20/200', '6/60', 0.1],
    [0.5, '20/63', '6/19', 0.316],
    [0.3, '20/40', '6/12', 0.501],
    [0.2, '20/32', '6/9.5', 0.631],
    [0.1, '20/25', '6/7.5', 0.794],
    [0, '20/20', '6/6', 1],
    [-0.1, '20/16', '6/4.8', 1.259],
    [-0.3, '20/10', '6/3', 1.995],
  ])('logMAR %s → %s, %s, decimal %s', (l, s20, s6, dec) => {
    expect(o.snellen(l, 20)).toBe(s20)
    expect(o.snellen(l, 6)).toBe(s6)
    expect(o.logmarADecimal(l)).toBeCloseTo(dec, 2)
  })
  it('parsea Snellen y decimal', () => {
    expect(o.parseAgudeza('20/40')).toBe(0.3)
    expect(o.parseAgudeza('6/60')).toBe(1)
    expect(o.parseAgudeza('0,5')).toBe(0.3)
    expect(o.parseAgudeza('abc')).toBeNull()
  })
  it('formatea logMAR con signo', () => {
    expect(o.fmtLogmar(-0.04)).toBe('−0.04')
    expect(o.fmtLogmar(0.3)).toBe('+0.30')
  })
})

describe('puntuación letra por letra (ETDRS)', () => {
  it('línea 0.0 completa + 2 letras de −0.1 → −0.04', () => {
    expect(o.puntuarLetras({ '0': 5, '-0.1': 2 })).toBe(-0.04)
  })
  it('solo línea 0.3 completa → 0.30', () => {
    expect(o.puntuarLetras({ '0.3': 5 })).toBe(0.3)
  })
  it('0.3 con 3 de 5 → 0.34', () => {
    expect(o.puntuarLetras({ '0.3': 3 })).toBe(0.34)
  })
  it('varias líneas: 0.5 (5), 0.4 (5), 0.3 (4), 0.2 (1) → 0.30', () => {
    expect(o.puntuarLetras({ '0.5': 5, '0.4': 5, '0.3': 4, '0.2': 1 })).toBe(0.3)
  })
  it('sin líneas → null', () => {
    expect(o.puntuarLetras({})).toBeNull()
  })
})

describe('categoría OMS (CIE-11)', () => {
  it('6/6 sin deterioro', () => expect(o.categoriaOMS(0).grado).toMatch(/Sin deterioro/))
  it('6/12 sin deterioro (límite)', () => expect(o.categoriaOMS(0.3).grado).toMatch(/Sin deterioro/))
  it('6/15 leve', () => expect(o.categoriaOMS(0.4).grado).toMatch(/leve/))
  it('6/60 moderado (límite)', () => expect(o.categoriaOMS(1).grado).toMatch(/moderado/))
  it('logMAR 1.3 grave', () => expect(o.categoriaOMS(1.3).grado).toMatch(/grave/))
})

describe('secuencias y Amsler', () => {
  it('línea Sloan sin repetir', () => {
    const l = o.lineaSloan(5)
    expect(new Set(l).size).toBe(5)
  })
  it('E sin dos iguales seguidas', () => {
    const l = o.lineaE(30)
    for (let i = 1; i < l.length; i++) expect(l[i]).not.toBe(l[i - 1])
  })
  it('cuadro Amsler de 5 mm a 30 cm ≈ 0.95°', () => {
    expect(o.anguloGrados(5, 30)).toBeCloseTo(0.955, 2)
  })
})
