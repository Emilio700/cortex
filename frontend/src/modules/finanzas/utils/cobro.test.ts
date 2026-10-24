import { describe, it, expect } from 'vitest'
import { detalleDeError, fechaDelServidor, nuevoIdDeIntento } from './cobro'

describe('utilidades de cobro', () => {
  it('una fecha del servidor sin zona se lee como UTC, no como hora local', () => {
    // El servidor guarda UTC sin la "Z": leída como local, "cobrada a las
    // 11:05" en Mazatlán saldría a otra hora.
    expect(fechaDelServidor('2026-09-28T17:05:00').toISOString()).toBe('2026-09-28T17:05:00.000Z')
    expect(fechaDelServidor('2026-09-28T17:05:00.123456').getUTCHours()).toBe(17)
  })

  it('si la fecha ya trae zona, se respeta', () => {
    expect(fechaDelServidor('2026-09-28T17:05:00Z').toISOString()).toBe('2026-09-28T17:05:00.000Z')
    expect(fechaDelServidor('2026-09-28T11:05:00-06:00').toISOString()).toBe(
      '2026-09-28T17:05:00.000Z',
    )
  })

  it('cada intento estrena un id distinto con forma de UUID', () => {
    const a = nuevoIdDeIntento()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(nuevoIdDeIntento()).not.toBe(a)
  })

  it('un detail que no es texto (error de validación) no se pinta como "[object Object]"', () => {
    const err = { response: { data: { detail: [{ msg: 'field required' }] } } }
    expect(detalleDeError(err, 'No se pudo.')).toBe('No se pudo.')
    expect(detalleDeError({ response: { data: { detail: 'Ya anulado' } } }, 'x')).toBe('Ya anulado')
  })
})
