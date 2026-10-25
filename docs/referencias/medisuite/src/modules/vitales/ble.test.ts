import { describe, expect, it } from 'vitest'
import {
  encFloat, encSfloat, float32, parseBloodPressure, parseGlucose, parseHeartRate, parsePlxContinuous,
  parsePlxSpot, parseTemperature, parseWeight, sfloat, sim,
} from './ble'

const dv = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]

describe('IEEE-11073 SFLOAT / FLOAT', () => {
  it('SFLOAT positivos y negativos', () => {
    expect(sfloat(0x0078)).toBe(120) // 120 × 10^0
    expect(sfloat(0xf16f)).toBe(36.7) // 367 × 10^-1
    expect(sfloat(0xffff & ((0x0 << 12) | 0xff6))).toBe(-10) // mantisa −10
    expect(sfloat(0x2001)).toBe(100) // 1 × 10^2
  })
  it('SFLOAT valores especiales', () => {
    expect(sfloat(0x07ff)).toBeNaN()
    expect(sfloat(0x0800)).toBeNaN()
    expect(sfloat(0x0801)).toBeNaN()
    expect(sfloat(0x07fe)).toBe(Infinity)
    expect(sfloat(0x0802)).toBe(-Infinity)
  })
  it('FLOAT 32 bits', () => {
    expect(float32(0xff00016f)).toBe(36.7)
    expect(float32(0x00000064)).toBe(100)
    expect(float32(0xfefffc18)).toBe(-10) // −1000 × 10^-2
    expect(float32(0x007fffff)).toBeNaN()
    expect(float32(0x007ffffe)).toBe(Infinity)
  })
  it('codificar y decodificar es reversible', () => {
    for (const v of [0, 1, 36.6, -4.2, 120, 204.7]) expect(sfloat(encSfloat(v, -1))).toBeCloseTo(v, 6)
    for (const v of [36.65, -12.34, 98.6, 1000]) expect(float32(encFloat(v, -2))).toBeCloseTo(v, 6)
  })
})

describe('0x2A35 presión arterial', () => {
  it('mmHg sin campos opcionales', () => {
    const l = parseBloodPressure(dv(0x00, ...le16(120), ...le16(80), ...le16(93)))
    expect(l.valores).toEqual({ pas: 120, pad: 80 })
    expect(l.detalle).toContain('PAM 93')
  })
  it('kPa se convierte a mmHg', () => {
    // 16.0 kPa / 10.7 kPa / 12.5 kPa con exponente −1
    const l = parseBloodPressure(dv(0x01, ...le16(encSfloat(16, -1)), ...le16(encSfloat(10.7, -1)), ...le16(encSfloat(12.5, -1))))
    expect(l.valores).toEqual({ pas: 120, pad: 80 })
    expect(l.detalle).toContain('kPa')
  })
  it('fecha, pulso, usuario y estado', () => {
    const l = parseBloodPressure(dv(0x1e, ...le16(135), ...le16(85), ...le16(102), ...le16(2026), 10, 24, 8, 30, 0, ...le16(70), 3, ...le16(0b100101)))
    expect(l.valores).toEqual({ pas: 135, pad: 85, fc: 70 })
    expect(l.fechaAparato).toBe(new Date(2026, 9, 24, 8, 30, 0).toISOString())
    expect(l.detalle).toContain('usuario 3')
    expect(l.detalle).toContain('movimiento detectado')
    expect(l.detalle).toContain('pulso irregular')
    expect(l.detalle).toContain('posición incorrecta')
  })
  it('simulador ida y vuelta (mmHg y kPa)', () => {
    expect(parseBloodPressure(sim.bp({ sys: 128, dia: 79, pr: 66 })).valores).toEqual({ pas: 128, pad: 79, fc: 66 })
    expect(parseBloodPressure(sim.bp({ sys: 128, dia: 79, pr: 66, kpa: true })).valores).toEqual({ pas: 128, pad: 79, fc: 66 })
  })
})

describe('0x2A37 frecuencia cardiaca', () => {
  it('uint8 simple', () => {
    expect(parseHeartRate(dv(0x00, 72)).valores.fc).toBe(72)
  })
  it('uint16 + intervalos RR en 1/1024 s', () => {
    const l = parseHeartRate(dv(0x11, ...le16(60), ...le16(1024), ...le16(512)))
    expect(l.valores.fc).toBe(60)
    expect(l.rr).toEqual([1000, 500])
  })
  it('sin contacto con la piel y energía', () => {
    const l = parseHeartRate(dv(0x0c, 80, ...le16(15)))
    expect(l.detalle).toContain('sin contacto')
    expect(l.detalle).toContain('energía 15 kJ')
  })
  it('simulador', () => {
    expect(parseHeartRate(sim.hr({ hr: 77 })).valores.fc).toBe(77)
    expect(parseHeartRate(sim.hr({ hr: 180, u16: true })).valores.fc).toBe(180)
  })
})

describe('0x2A1C temperatura', () => {
  it('Celsius con sitio', () => {
    const l = parseTemperature(dv(0x04, ...le32(0xff00016f), 2))
    expect(l.valores.temp).toBe(36.7)
    expect(l.detalle).toBe('Sitio: corporal')
  })
  it('Fahrenheit se convierte', () => {
    const l = parseTemperature(dv(0x01, ...le32(encFloat(98.6, -1))))
    expect(l.valores.temp).toBe(37)
    expect(l.detalle).toContain('°F')
  })
  it('valor NaN no genera lectura', () => {
    expect(parseTemperature(dv(0x00, ...le32(0x007fffff))).valores).toEqual({})
  })
  it('simulador', () => {
    expect(parseTemperature(sim.temp({ c: 38.4 })).valores.temp).toBe(38.4)
    expect(parseTemperature(sim.temp({ c: 38.4, f: true })).valores.temp).toBe(38.4)
  })
})

describe('0x2A9D peso', () => {
  it('kg (resolución 5 g)', () => {
    expect(parseWeight(dv(0x00, ...le16(14000))).valores).toEqual({ peso: 70 })
  })
  it('libras con IMC y talla', () => {
    // 154.32 lb = 70 kg; talla 68.9 in = 175 cm; IMC 22.9
    const l = parseWeight(dv(0x09, ...le16(15432), ...le16(229), ...le16(689)))
    expect(l.valores).toEqual({ peso: 70, imc: 22.9, talla: 175 })
    expect(l.detalle).toContain('lb')
  })
  it('0xFFFF = medición no exitosa', () => {
    expect(parseWeight(dv(0x00, 0xff, 0xff)).valores).toEqual({})
  })
  it('simulador', () => {
    expect(parseWeight(sim.weight({ kg: 82.5, tallaCm: 178 })).valores).toEqual({ peso: 82.5, talla: 178, imc: 26 })
  })
})

describe('0x2A18 glucosa', () => {
  it('kg/L → mg/dL', () => {
    // 95 mg/dL = 0.00095 kg/L = 95 × 10^-5
    const l = parseGlucose(dv(0x02, ...le16(7), ...le16(2026), 10, 24, 7, 0, 0, ...le16(encSfloat(95e-5, -5)), 0x11))
    expect(l.valores.glucosa).toBe(95)
    expect(l.seq).toBe(7)
    expect(l.detalle).toContain('sangre capilar')
  })
  it('mol/L → mg/dL', () => {
    // 5.5 mmol/L = 0.0055 mol/L = 550 × 10^-5 → 99 mg/dL
    const l = parseGlucose(dv(0x06, ...le16(1), ...le16(2026), 10, 24, 7, 0, 0, ...le16(encSfloat(0.0055, -5)), 0x12))
    expect(l.valores.glucosa).toBe(99)
    expect(l.detalle).toContain('plasma capilar')
  })
  it('aplica el desfase horario (minutos)', () => {
    const l = parseGlucose(dv(0x01, ...le16(1), ...le16(2026), 10, 24, 7, 0, 0, ...le16(90)))
    expect(l.fechaAparato).toBe(new Date(2026, 9, 24, 8, 30, 0).toISOString())
    expect(l.valores).toEqual({})
  })
  it('simulador', () => {
    expect(parseGlucose(sim.glucose({ mg: 140, seq: 3 })).valores.glucosa).toBe(140)
    expect(parseGlucose(sim.glucose({ mg: 140, mol: true })).valores.glucosa).toBe(140)
  })
})

describe('0x2A5E / 0x2A5F oximetría', () => {
  it('spot-check con fecha', () => {
    const l = parsePlxSpot(dv(0x01, ...le16(97), ...le16(68), ...le16(2026), 10, 24, 9, 0, 0))
    expect(l.valores).toEqual({ spo2: 97, fc: 68 })
    expect(l.fechaAparato).toBeDefined()
  })
  it('continuo', () => {
    expect(parsePlxContinuous(dv(0x00, ...le16(95), ...le16(88))).valores).toEqual({ spo2: 95, fc: 88 })
  })
  it('valor no disponible (NaN) se omite', () => {
    expect(parsePlxContinuous(dv(0x00, ...le16(0x07ff), ...le16(88))).valores).toEqual({ fc: 88 })
  })
  it('simulador', () => {
    expect(parsePlxSpot(sim.plxSpot({ spo2: 92, pr: 101 })).valores).toEqual({ spo2: 92, fc: 101 })
    expect(parsePlxContinuous(sim.plxCont({ spo2: 99, pr: 55 })).valores).toEqual({ spo2: 99, fc: 55 })
  })
})
