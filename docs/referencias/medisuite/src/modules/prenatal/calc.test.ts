import { describe, expect, it } from 'vitest'
import {
  alertasConsulta, bandaIOM, categoriaIMC, datar, diasEntre, evaluarAU, fppNaegele, imc, lccAEdad, pesoEnZ, pesoMedianoHadlock91,
  percentilHadlock91, pfeHadlock, phi, sdgTexto, umbralRedatacion,
} from './calc'

describe('datación', () => {
  it('FPP = FUM + 280 días (Naegele / ACOG CO 700)', () => {
    expect(fppNaegele('2024-01-01')).toBe('2024-10-07')
    expect(fppNaegele('2023-05-10')).toBe('2024-02-14')
    expect(diasEntre('2024-01-01', fppNaegele('2024-01-01'))).toBe(280)
  })
  it('umbrales de re-datación ACOG CO 700', () => {
    expect(umbralRedatacion(8 * 7 + 6)).toBe(5)
    expect(umbralRedatacion(9 * 7)).toBe(7)
    expect(umbralRedatacion(13 * 7 + 6)).toBe(7)
    expect(umbralRedatacion(18 * 7)).toBe(10)
    expect(umbralRedatacion(25 * 7)).toBe(14)
    expect(umbralRedatacion(30 * 7)).toBe(21)
  })
  it('< 14 sem: discrepancia ≤ 7 días conserva FUM', () => {
    const d = datar('2024-01-01', { fecha: '2024-03-15', sdgDias: 68 }) // 74 d por FUM
    expect(d.metodo).toBe('FUM')
    expect(d.discrepanciaDias).toBe(6)
    expect(d.fpp).toBe('2024-10-07')
  })
  it('< 14 sem: discrepancia > 7 días re-data con USG', () => {
    const d = datar('2024-01-01', { fecha: '2024-03-15', sdgDias: 66 })
    expect(d.metodo).toBe('USG')
    expect(d.fumEfectiva).toBe('2024-01-09')
    expect(d.fpp).toBe('2024-10-15')
  })
  it('≤ 8 6/7 sem usa umbral de 5 días', () => {
    expect(datar('2024-01-01', { fecha: '2024-03-01', sdgDias: 54 }).metodo).toBe('USG') // 60 vs 54 → 6 > 5
  })
  it('sin FUM usa USG', () => {
    expect(datar(null, { fecha: '2024-03-15', sdgDias: 70 }).fumEfectiva).toBe('2024-01-05')
  })
  it('texto de SDG', () => expect(sdgTexto(170)).toBe('24.2 SDG'))
})

describe('biometría', () => {
  it('Robinson & Fleming 1975: LCC 45 mm ≈ 77.7 días (11.0 SDG)', () => {
    expect(lccAEdad(45)).toBeCloseTo(77.74, 1)
    expect(lccAEdad(84) / 7).toBeCloseTo(14.0, 0)
  })
  it('Hadlock 1985 (CC, CA, LF)', () => {
    expect(pfeHadlock(30, 30, 6.5)).toBeCloseTo(2250.6, 0)
  })
  it('Hadlock 1991: mediana de la ecuación (331 g a 20 sem; 3619 g a 40 sem)', () => {
    expect(Math.round(pesoMedianoHadlock91(20))).toBe(331)
    expect(Math.round(pesoMedianoHadlock91(40))).toBe(3619)
  })
  it('percentil con DE 12.7 %', () => {
    expect(percentilHadlock91(pesoMedianoHadlock91(30), 30).percentil).toBeCloseTo(50, 3)
    expect(percentilHadlock91(pesoEnZ(30, -1.2816), 30).percentil).toBeCloseTo(10, 1)
    expect(phi(1.96)).toBeCloseTo(0.975, 4)
  })
})

describe('IOM 2009 y altura uterina', () => {
  it('categorías de IMC', () => {
    expect(categoriaIMC(imc(50, 165))).toBe('bajo')
    expect(categoriaIMC(22)).toBe('normal')
    expect(categoriaIMC(27)).toBe('sobrepeso')
    expect(categoriaIMC(30)).toBe('obesidad')
  })
  it('banda IOM a término ≈ rango total', () => {
    const [a, b] = bandaIOM('normal', 40)
    expect(a).toBeCloseTo(9.95, 2)
    expect(b).toBeCloseTo(15.5, 2)
    expect(bandaIOM('obesidad', 13)).toEqual([0.5, 2])
  })
  it('McDonald SDG ± 2 cm', () => {
    expect(evaluarAU(28, 27)).toBe('normal')
    expect(evaluarAU(28, 25)).toBe('baja')
    expect(evaluarAU(28, 31)).toBe('alta')
    expect(evaluarAU(16, 10)).toBe('fuera-de-rango')
  })
})

describe('alertas', () => {
  it('TA ≥ 140/90 a ≥ 20 SDG alerta preeclampsia', () => {
    const a = alertasConsulta({ fecha: '2024-06-01', pas: 142, pad: 88 }, 30 * 7)
    expect(a[0].nivel).toBe('danger')
    expect(a[0].texto).toMatch(/preeclampsia/)
  })
  it('TA 160/110 rango severo', () => {
    expect(alertasConsulta({ fecha: '2024-06-01', pas: 120, pad: 110 }, 30 * 7)[0].texto).toMatch(/severo/)
  })
  it('sin alertas en consulta normal', () => {
    expect(alertasConsulta({ fecha: '2024-06-01', pas: 110, pad: 70, au: 24, fcf: 140, movimientos: 'presentes', proteinuria: 'negativa' }, 24 * 7)).toEqual([])
  })
  it('proteinuria + HTA', () => {
    const a = alertasConsulta({ fecha: '2024-06-01', pas: 145, pad: 95, proteinuria: '2+' }, 32 * 7)
    expect(a.some((x) => /sospecha de preeclampsia/.test(x.texto))).toBe(true)
  })
  it('FCF fuera de 110–160', () => {
    expect(alertasConsulta({ fecha: '2024-06-01', fcf: 100 }, 30 * 7).length).toBe(1)
  })
})
