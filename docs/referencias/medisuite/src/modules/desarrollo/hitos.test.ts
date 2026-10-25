import { describe, expect, it } from 'vitest'
import { CHECKPOINTS, checkpointParaEdad, edadParaEvaluar, evaluar, hitosDe } from './hitos'

describe('hitos CDC 2022', () => {
  it('número de hitos por lista (CDC LTSAE 2022)', () => {
    const n = Object.fromEntries(CHECKPOINTS.map((c) => [c, hitosDe(c).length]))
    expect(n).toEqual({ 2: 11, 4: 13, 6: 12, 9: 13, 12: 10, 15: 13, 18: 15, 24: 13, 30: 15, 36: 12, 48: 17, 60: 15 })
  })
  it('ids únicos', () => {
    const ids = CHECKPOINTS.flatMap((c) => hitosDe(c).map((h) => h.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('lista por edad', () => {
    expect(checkpointParaEdad(1.5)).toBeNull()
    expect(checkpointParaEdad(2)).toBe(2)
    expect(checkpointParaEdad(10.9)).toBe(9)
    expect(checkpointParaEdad(50)).toBe(48)
    expect(checkpointParaEdad(70)).toBe(60)
  })
})

describe('edad corregida', () => {
  it('prematuro de 32 SDG a los 6 meses → ~4.2 meses corregidos', () => {
    const e = edadParaEvaluar('2024-01-01', '2024-07-01', 32)
    expect(e.usaCorregida).toBe(true)
    expect(e.corregidaMeses).toBeCloseTo((182 - 56) / 30.4375, 3)
  })
  it('no se corrige a término ni después de 24 meses', () => {
    expect(edadParaEvaluar('2024-01-01', '2024-07-01', 39).usaCorregida).toBe(false)
    expect(edadParaEvaluar('2020-01-01', '2022-03-01', 30).usaCorregida).toBe(false)
  })
})

describe('evaluación', () => {
  const todos = (cp: 48, r: 'si' | 'no') => Object.fromEntries(hitosDe(cp).map((h) => [h.id, r]))
  it('todo sí → ok', () => expect(evaluar(48, todos(48, 'si')).nivel).toBe('ok'))
  it('un "todavía no" → alerta', () => {
    const r = evaluar(48, { ...todos(48, 'si'), '48-lenguaje-1': 'no' })
    expect(r.nivel).toBe('alerta')
    expect(r.no.map((h) => h.id)).toEqual(['48-lenguaje-1'])
    expect(r.porDominio.lenguaje.no).toBe(1)
  })
  it('"no sé" → vigilar', () => expect(evaluar(48, { ...todos(48, 'si'), '48-social-1': 'nose' }).nivel).toBe('vigilar'))
  it('pérdida de habilidades → alerta', () => expect(evaluar(48, todos(48, 'si'), true).nivel).toBe('alerta'))
})
