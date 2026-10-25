// npx vitest run src/modules/audiometria
import { describe, expect, it } from 'vitest'
import * as a from './audiograma'

function aud(der: number[], izq: number[], oseaDer?: number[], oseaIzq?: number[]): a.Umbrales {
  const u = a.vacio()
  a.FRECUENCIAS.forEach((f, i) => {
    u.der.aerea[f] = { db: der[i] }
    u.izq.aerea[f] = { db: izq[i] }
    if (oseaDer) u.der.osea[f] = { db: oseaDer[i] }
    if (oseaIzq) u.izq.osea[f] = { db: oseaIzq[i] }
  })
  return u
}
//                250 500 1k 2k 3k 4k 6k 8k

describe('PTA (0.5/1/2/4 kHz)', () => {
  it('promedia 4 frecuencias', () => {
    expect(a.pta({ 500: { db: 10 }, 1000: { db: 20 }, 2000: { db: 30 }, 4000: { db: 40 } })).toBe(25)
  })
  it('null si falta una frecuencia', () => {
    expect(a.pta({ 500: { db: 10 }, 1000: { db: 20 }, 2000: { db: 30 } })).toBeNull()
  })
})

describe('grados OMS 2021 (límites exactos)', () => {
  it.each([
    [19.9, 'normal'],
    [20, 'leve'],
    [34.9, 'leve'],
    [35, 'moderada'],
    [49.9, 'moderada'],
    [50, 'moderadamente-severa'],
    [65, 'severa'],
    [79.9, 'severa'],
    [80, 'profunda'],
    [94.9, 'profunda'],
    [95, 'completa'],
    [-5, 'normal'],
  ])('%s dB → %s', (v, g) => expect(a.gradoOMS(v).id).toBe(g))

  it('el grado global usa el mejor oído; unilateral si mejor < 20 y peor ≥ 35', () => {
    const c = a.clasificacion(10, 45)
    expect(c.grado?.id).toBe('normal')
    expect(c.unilateral).toBe(true)
    expect(a.clasificacion(40, 60).grado?.id).toBe('moderada')
  })
})

describe('asimetría (NICE NG98: ≥15 dB en 2 frecuencias adyacentes)', () => {
  it('detecta 2 adyacentes (2k y 4k)', () => {
    const u = aud([10, 10, 15, 40, 45, 50, 50, 50], [10, 10, 15, 20, 25, 30, 40, 45])
    const r = a.asimetria(u)
    expect(r.asimetrica).toBe(true)
    expect(r.frecuencias.sort()).toEqual([2000, 4000])
  })
  it('no cuenta frecuencias no adyacentes (0.5k y 4k)', () => {
    const u = aud([10, 30, 15, 20, 25, 50, 50, 50], [10, 10, 15, 20, 25, 30, 40, 45])
    expect(a.asimetria(u).asimetrica).toBe(false)
  })
  it('3 kHz y 6 kHz no se consideran', () => {
    const u = aud([10, 10, 15, 20, 50, 30, 70, 45], [10, 10, 15, 20, 25, 30, 40, 45])
    expect(a.asimetria(u).asimetrica).toBe(false)
  })
})

describe('brecha aéreo-ósea', () => {
  it('conductiva: brecha ≥15 dB en ≥2 frecuencias', () => {
    const u = aud([40, 40, 35, 30, 30, 30, 30, 30], [10, 10, 10, 10, 10, 10, 10, 10], [10, 10, 10, 15, 20, 20, 20, 20])
    const r = a.brechaAereoOsea(u, 'der')
    expect(r.significativa).toBe(true)
    expect(r.frecuencias).toEqual([250, 500, 1000, 2000])
  })
  it('sin vía ósea → sin brecha', () => {
    const u = aud([40, 40, 35, 30, 30, 30, 30, 30], [10, 10, 10, 10, 10, 10, 10, 10])
    expect(a.brechaAereoOsea(u, 'der').significativa).toBe(false)
  })
})

describe('geometría', () => {
  it('escala log: 1 kHz a la mitad entre 125 Hz y 8 kHz', () => {
    expect(a.xFrec(1000)).toBeCloseTo(0.5, 6)
    expect(a.xFrec(125)).toBe(0)
    expect(a.xFrec(8000)).toBe(1)
  })
  it('dB invertido: −10 arriba, 120 abajo', () => {
    expect(a.yDb(-10)).toBe(0)
    expect(a.yDb(120)).toBe(1)
  })
  it('valida múltiplos de 5', () => {
    expect(a.umbralValido(25)).toBe(true)
    expect(a.umbralValido(22)).toBe(false)
    expect(a.umbralValido(125)).toBe(false)
  })
})

describe('Hughson-Westlake simplificado (baja 10 / sube 5)', () => {
  it('umbral = nivel con 2 respuestas en ascenso', () => {
    let s = a.hwInicio(-40)
    s = a.hwResponder(s, true) // -40 oye → -50
    expect(s.nivel).toBe(-50)
    s = a.hwResponder(s, false) // -50 no → -45 (ascenso)
    expect(s.nivel).toBe(-45)
    s = a.hwResponder(s, true) // -45 oye en ascenso (1) → -55
    expect(s.nivel).toBe(-55)
    s = a.hwResponder(s, false) // → -50
    s = a.hwResponder(s, false) // → -45
    s = a.hwResponder(s, true) // -45 oye en ascenso (2) → umbral
    expect(s.terminado).toBe(true)
    expect(s.umbral).toBe(-45)
  })
  it('sin respuesta al máximo → umbral null', () => {
    let s = a.hwInicio(-10)
    for (let i = 0; i < 5 && !s.terminado; i++) s = a.hwResponder(s, false)
    expect(s.terminado).toBe(true)
    expect(s.umbral).toBeNull()
  })
  it('ganancia: −20 dBFS = 0.1', () => {
    expect(a.dbfsAGanancia(-20)).toBeCloseTo(0.1, 6)
  })
})

describe('evaluación del tamiz relativo', () => {
  it('diferencia entre oídos ≥15 dB → sugerir audiometría', () => {
    const r = a.evaluarTamiz({ 1000: -60, 2000: -55 }, { 1000: -60, 2000: -35 })
    expect(r.sugerirAudiometria).toBe(true)
    expect(r.motivos[0]).toMatch(/20 dB a 2kHz/)
  })
  it('simétrico y sin referencia → sin hallazgos', () => {
    expect(a.evaluarTamiz({ 1000: -60 }, { 1000: -55 }).sugerirAudiometria).toBe(false)
  })
  it('compara contra referencia del mismo equipo', () => {
    expect(a.evaluarTamiz({ 1000: -40 }, { 1000: -40 }, { 1000: -60 }).motivos).toHaveLength(2)
  })
})
