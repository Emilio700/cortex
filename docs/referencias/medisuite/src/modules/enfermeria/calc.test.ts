import { demoEnfermeria, demoEnfermeriaObs } from './demo'
import { describe, expect, it } from 'vitest'
import {
  concentracion, dosisDesdeVelocidad, gastoUrinario, gotasPorMinuto, inicioDia, intervaloHoras, mlHDesdeVolumen, perdidasInsensibles,
  programarDosis, rangoTurno, tiempoInfusionH, totales, turnoDe, velocidadMlH, fmtDuracion, type Movimiento,
} from './calc'

describe('Infusiones (ejemplos clásicos de cálculo de dosis)', () => {
  it('dopamina 5 mcg/kg/min, 70 kg, 400 mg/250 mL → 13.1 mL/h', () => {
    const c = concentracion(400, 'mg', 250, 'mcg/kg/min')
    expect(c).toBe(1600)
    expect(velocidadMlH(5, 'mcg/kg/min', c, 70)).toBeCloseTo(13.125, 3)
  })
  it('norepinefrina 0.1 mcg/kg/min, 80 kg, 4 mg/250 mL → 30 mL/h', () => {
    expect(velocidadMlH(0.1, 'mcg/kg/min', concentracion(4, 'mg', 250, 'mcg/kg/min'), 80)).toBeCloseTo(30, 6)
  })
  it('heparina 1000 U/h, 25 000 U/250 mL → 10 mL/h', () => {
    expect(velocidadMlH(1000, 'U/h', concentracion(25000, 'U', 250, 'U/h'))).toBeCloseTo(10)
  })
  it('insulina 0.1 U/kg/h, 70 kg, 100 U/100 mL → 7 mL/h', () => {
    expect(velocidadMlH(0.1, 'U/kg/h', concentracion(100, 'U', 100, 'U/kg/h'), 70)).toBeCloseTo(7)
  })
  it('midazolam 5 mg/h, 50 mg/50 mL → 5 mL/h; inverso', () => {
    const c = concentracion(50, 'mg', 50, 'mg/h')
    expect(velocidadMlH(5, 'mg/h', c)).toBe(5)
    expect(dosisDesdeVelocidad(13.125, 'mcg/kg/min', 1600, 70)).toBeCloseTo(5)
  })
  it('no mezcla U con masa y exige peso', () => {
    expect(concentracion(100, 'U', 100, 'mg/h')).toBeNaN()
    expect(velocidadMlH(5, 'mcg/kg/min', 1600)).toBeNaN()
  })
})

describe('Goteo y tiempo', () => {
  it('1000 mL en 8 h con macrogotero (20) → 41.7 gotas/min; microgotero = mL/h', () => {
    const v = mlHDesdeVolumen(1000, 8)
    expect(v).toBe(125)
    expect(gotasPorMinuto(v, 20)).toBeCloseTo(41.67, 2)
    expect(gotasPorMinuto(v, 60)).toBe(125)
  })
  it('tiempo de infusión', () => {
    expect(tiempoInfusionH(500, 125)).toBe(4)
    expect(fmtDuracion(2.5)).toBe('2 h 30 min')
  })
})

describe('Balance hídrico', () => {
  it('pérdidas insensibles 0.5 mL/kg/h: 70 kg × 24 h = 840 mL', () => {
    expect(perdidasInsensibles(70, 24)).toBe(840)
    expect(perdidasInsensibles(70, 8)).toBe(280)
  })
  it('totales y balance', () => {
    const movs: Movimiento[] = [
      { id: '1', hora: '', tipo: 'ingreso', via: 'oral', ml: 600 },
      { id: '2', hora: '', tipo: 'ingreso', via: 'iv', ml: 1000 },
      { id: '3', hora: '', tipo: 'egreso', via: 'diuresis', ml: 900 },
    ]
    const t = totales(movs, 70, 8)
    expect(t).toMatchObject({ ingresos: 1600, medidos: 900, insensibles: 280, egresos: 1180, balance: 420 })
  })
  it('gasto urinario', () => {
    expect(gastoUrinario(280, 70, 8)).toBeCloseTo(0.5)
  })
})

describe('Turnos', () => {
  const d = (h: number, dia = 10) => new Date(2026, 9, dia, h, 30).getTime()
  it('asigna turno y día de enfermería (07–15, 15–21, 21–07)', () => {
    expect(turnoDe(d(8))).toBe('matutino')
    expect(turnoDe(d(16))).toBe('vespertino')
    expect(turnoDe(d(22))).toBe('nocturno')
    expect(turnoDe(d(3))).toBe('nocturno')
    expect(inicioDia(d(3, 11))).toBe(new Date(2026, 9, 10, 7).getTime())
  })
  it('rango del nocturno cruza la medianoche', () => {
    const [a, b] = rangoTurno(new Date(2026, 9, 10, 7).getTime(), 'nocturno')
    expect(new Date(a).getHours()).toBe(21)
    expect(b - a).toBe(10 * 3600000)
  })
})

describe('Horario de medicamentos', () => {
  it('interpreta frecuencias comunes', () => {
    expect(intervaloHoras('Cada 8 horas')).toBe(8)
    expect(intervaloHoras('c/12 h')).toBe(12)
    expect(intervaloHoras('cada 6 hrs')).toBe(6)
    expect(intervaloHoras('Cada 24 horas')).toBe(24)
    expect(intervaloHoras('tres veces al día')).toBe(8)
    expect(intervaloHoras('Una vez al día')).toBe(24)
    expect(intervaloHoras('En caso de dolor')).toBe('prn')
    expect(intervaloHoras('Por razón necesaria')).toBe('prn')
    expect(intervaloHoras('Dosis única')).toBe('unica')
    expect(intervaloHoras('según indicación')).toBeNull()
  })
  it('programa dentro del día de enfermería', () => {
    const dia0 = new Date(2026, 9, 10, 7).getTime()
    const horas = (xs: number[]) => xs.map((t) => new Date(t).getHours())
    expect(horas(programarDosis(8, '08:00', dia0))).toEqual([8, 16, 0])
    expect(horas(programarDosis(6, '08:00', dia0))).toEqual([8, 14, 20, 2])
    expect(horas(programarDosis(24, '22:00', dia0))).toEqual([22])
    expect(horas(programarDosis(12, '06:00', dia0))).toEqual([18, 6])
  })
})

describe('Demo', () => {
  it('genera la hoja de p2 y solo eventos pasados', () => {
    const now = new Date(2026, 9, 24, 16, 0).getTime()
    const [h] = demoEnfermeria(now)
    const d = h.datos as { movimientos: { hora: string }[]; mar: Record<string, unknown> }
    expect(h.patientId).toBe('p2')
    expect(d.movimientos.every((m) => Date.parse(m.hora) <= now)).toBe(true)
    expect(Object.keys(d.mar).length).toBeGreaterThan(0)
    expect(demoEnfermeriaObs(now).every((o) => Date.parse(o.fecha) <= now)).toBe(true)
  })
})
