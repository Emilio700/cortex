import { describe, expect, it } from 'vitest'
import { CIE10, buscarCie10, norm } from './cie10'

const codigos = (q: string, n?: number) => buscarCie10(q, n).map((c) => c.codigo)

describe('catálogo CIE-10', () => {
  it('códigos con formato válido y sin duplicados', () => {
    const cs = CIE10.map((c) => c.codigo)
    expect(cs.length).toBeGreaterThan(250)
    expect(new Set(cs).size).toBe(cs.length)
    for (const c of cs) expect(c).toMatch(/^[A-Z]\d\d(\.\d{1,2})?$/)
    for (const c of CIE10) expect(c.nombre.trim()).not.toBe('')
  })
  it('sin sinónimos vacíos', () => {
    for (const c of CIE10) for (const s of c.sinonimos) expect(s.trim()).not.toBe('')
  })
})

describe('buscarCie10()', () => {
  it('por código exacto, con o sin punto y sin importar mayúsculas', () => {
    expect(codigos('E11.9')[0]).toBe('E11.9')
    expect(codigos('e119')[0]).toBe('E11.9')
    expect(codigos('j00')[0]).toBe('J00')
  })
  it('por prefijo de código', () => {
    const r = codigos('E11', 20)
    expect(r.length).toBeGreaterThanOrEqual(5)
    expect(r.every((c) => c.startsWith('E11'))).toBe(true)
  })
  it('por sinónimo coloquial, sin acentos', () => {
    expect(codigos('presion alta')[0]).toBe('I10')
    expect(codigos('PRESIÓN ALTA')[0]).toBe('I10')
    expect(codigos('gripa')[0]).toBe('J00')
    expect(codigos('dolor de cabeza')[0]).toBe('R51')
  })
  it('por palabras del nombre', () => {
    expect(codigos('infeccion urinaria')).toContain('N39.0')
  })
  it('vacío o sin coincidencias', () => {
    expect(buscarCie10('   ')).toEqual([])
    expect(buscarCie10('xyz123')).toEqual([])
  })
  it('respeta el límite', () => {
    expect(buscarCie10('a').length).toBe(12)
    expect(buscarCie10('a', 3).length).toBe(3)
  })
  it('norm() quita acentos y espacios', () => {
    expect(norm('  Cefalea Tensional ÁÉÍÓÚ ')).toBe('cefalea tensional aeiou')
  })
})
