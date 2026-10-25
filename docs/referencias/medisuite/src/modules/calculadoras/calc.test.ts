// Pruebas de las calculadoras (vitest): `npx vitest run src/modules/calculadoras`
// Portadas de la autoprueba original (`eq(nombre, obtenido, esperado, tolerancia)`).
import { describe, expect, it } from 'vitest'
import * as c from './calc'

function eq(nombre: string, obtenido: number | string, esperado: number | string, tol = 0.05) {
  it(nombre, () => {
    if (typeof esperado === 'number') {
      expect(typeof obtenido).toBe('number')
      expect(Math.abs((obtenido as number) - esperado)).toBeLessThanOrEqual(tol)
    } else expect(obtenido).toBe(esperado)
  })
}

describe('calculadoras (autoprueba portada)', () => {

eq('IMC 70 kg 175 cm', c.imc(70, 175), 22.86, 0.01)
eq('Mosteller 80 kg 180 cm = 2.00 m²', c.scMosteller(80, 180), 2.0, 0.001)
eq('Devine hombre 180 cm', c.pesoIdealDevine(180, 'M'), 74.99, 0.02)
eq('Devine mujer 165 cm', c.pesoIdealDevine(165, 'F'), 45.5 + 2.3 * (165 / 2.54 - 60), 0.001)
eq('PAM 120/80', c.pam(120, 80), 93.33, 0.01)
// CKD-EPI 2021 (Inker NEJM 2021): valores comparados con la calculadora NKF
eq('CKD-EPI 2021 H 40a Cr 1.0', c.ckdEpi2021(1.0, 40, 'M'), 97, 0.6)
eq('CKD-EPI 2021 M 50a Cr 1.0', c.ckdEpi2021(1.0, 50, 'F'), 69, 0.5)
eq('CKD-EPI 2021 H 60a Cr 0.8 (rama < kappa)', c.ckdEpi2021(0.8, 60, 'M'), 142 * (0.8 / 0.9) ** -0.302 * 0.9938 ** 60, 0.001)
eq('Cockcroft-Gault H 60a 72kg Cr1', c.cockcroftGault(60, 72, 1, 'M'), 80, 0.001)
eq('Cockcroft-Gault M 60a 72kg Cr1', c.cockcroftGault(60, 72, 1, 'F'), 68, 0.001)
eq('Bazett QT 400 FC 60', c.qtcBazett(400, 60), 400, 0.001)
eq('Bazett QT 400 FC 75', c.qtcBazett(400, 75), 447.2, 0.1)
eq('Fridericia QT 400 FC 75', c.qtcFridericia(400, 75), 430.9, 0.1)
eq('Naegele FUM 2026-01-01', c.fppNaegele('2026-01-01'), '2026-10-08')
eq('Naegele FUM 2025-05-10 (cruce de año)', c.fppNaegele('2025-05-10'), '2026-02-14')
eq('HOMA-IR glu 100 ins 10', c.homaIR(100, 10), 2.469, 0.001)
eq('eAG A1c 7% (ADAG: 154 mg/dL)', c.eAG(7), 154.2, 0.1)
eq('eAG A1c 6% (ADAG: 126 mg/dL)', c.eAG(6), 125.5, 0.1)
eq('FIB-4 50a AST40 ALT25 PLT200', c.fib4(50, 40, 25, 200), 2.0, 0.001)
eq('Child-Pugh mínimo', c.childPugh(1, 4, 1, 1, 1), 5, 0)
eq('Child-Pugh bili 2.5 alb 3 inr 2 ascitis leve', c.childPugh(2.5, 3, 2, 2, 1), 9, 0)
eq('MELD Cr1.2 Bili2 INR1.5 → 15', c.meld(1.2, 2, 1.5, false).meld, 15, 0)
eq('MELD valores <1 se llevan a 1 → 6', c.meld(0.5, 0.5, 0.9, false).meld, 6, 0)
eq('MELD diálisis Cr=4, bili 4, INR 2', c.meld(1, 4, 2, true).meld, Math.round(10 * (0.957 * Math.log(4) + 0.378 * Math.log(4) + 1.12 * Math.log(2) + 0.643)), 0)
eq('MELD tope 40', c.meld(10, 40, 8, false).meld, 40, 0)
eq('MELD-Na MELD 20 Na 130', c.meld(2, 3, 2, false, 130).meldNa!, (() => { const m = c.meld(2, 3, 2, false).meld; return Math.round(m + 1.32 * 7 - 0.033 * m * 7) })(), 0)
eq('Mifflin H 70kg 175cm 30a', c.mifflin(70, 175, 30, 'M'), 1648.75, 0.01)
eq('Mifflin M 60kg 165cm 40a', c.mifflin(60, 165, 40, 'F'), 1270.25, 0.01)
eq('Harris-Benedict H 70kg 175cm 30a', c.harrisBenedict(70, 175, 30, 'M'), 1702.0, 0.5)
const d = c.dosisPediatrica({ peso: 20, mgkg: 15, modo: 'dosis', cadaH: 6, mg: 160, ml: 5 })
eq('Paracetamol 20 kg 15 mg/kg → 300 mg', d.dosisMg, 300, 0.001)
eq('… 160 mg/5 mL → 9.375 mL', d.ml, 9.375, 0.001)
const d2 = c.dosisPediatrica({ peso: 50, mgkg: 15, modo: 'dosis', cadaH: 6, mg: 160, ml: 5, maxDosis: 500 })
eq('Tope por dosis 500 mg', d2.dosisMg, 500, 0.001)
eq('… aviso de tope', String(d2.limitada), 'true')
const d3 = c.dosisPediatrica({ peso: 10, mgkg: 50, modo: 'dia', cadaH: 12, mg: 250, ml: 5 })
eq('Amoxicilina 50 mg/kg/día c/12 h 10 kg → 250 mg/dosis', d3.dosisMg, 250, 0.001)
eq('Calcio corregido Ca 8 alb 2', c.calcioCorregido(8, 2), 9.6, 0.001)
eq('Anion gap 140-(104+24)', c.anionGap(140, 104, 24), 12, 0.001)
eq('Déficit agua 70 kg Na 160 H', c.deficitAgua(70, 160, 0.6), 6, 0.001)
eq('Umbral redatar 10 sem', c.umbralRedatar(70), 7, 0)
eq('Umbral redatar 20 sem', c.umbralRedatar(140), 10, 0)
})

describe('calculadoras: categorías y fechas', () => {
  it('IMC por categoría OMS (límites)', () => {
    expect(c.imcCategoria(18.49)[0]).toMatch(/bajo peso/)
    expect(c.imcCategoria(18.5)[0]).toBe('Normal')
    expect(c.imcCategoria(25)[0]).toMatch(/Sobrepeso/)
    expect(c.imcCategoria(30)[0]).toBe('Obesidad grado I')
    expect(c.imcCategoria(40)[0]).toBe('Obesidad grado III')
  })
  it('KDIGO G por TFG (límites)', () => {
    expect(c.kdigoG(90)[0]).toMatch(/^G1/)
    expect(c.kdigoG(59.9)[0]).toMatch(/^G3a/)
    expect(c.kdigoG(44.9)[0]).toMatch(/^G3b/)
    expect(c.kdigoG(14.9)[0]).toMatch(/^G5/)
  })
  it('Child-Pugh clase', () => {
    expect([5, 6, 7, 9, 10, 15].map(c.childClase)).toEqual(['A', 'A', 'B', 'B', 'C', 'C'])
  })
  it('mortalidad MELD a 90 días por rango', () => {
    expect([9, 10, 19, 20, 30, 40].map(c.meldMortalidad)).toEqual([1.9, 6.0, 6.0, 19.6, 52.6, 71.3])
  })
  it('fechas sin corrimiento por zona horaria', () => {
    expect(c.addDays('2026-03-07', 1)).toBe('2026-03-08') // cambio de horario en EUA
    expect(c.diffDays('2026-01-01', '2026-10-08')).toBe(280)
    expect(c.fmtEG(280)).toBe('40 sem 0 d')
    expect(c.fmtEG(97)).toBe('13 sem 6 d')
  })
  it('MELD sin doble redondeo', () => {
    expect(c.meld(1, 1, 1.2, false).meld).toBe(8)
    expect(c.meld(1, 1, 1.1, false).meld).toBe(7)
    expect(c.meld(1, 1.1, 2.6, false).meld).toBe(17)
  })
})
