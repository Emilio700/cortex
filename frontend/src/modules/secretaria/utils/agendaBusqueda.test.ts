/**
 * Búsqueda dentro de la agenda visible (S-07).
 *
 * Filtra por nombre, teléfono o folio sobre las citas ya cargadas, sin pegarle
 * al servidor y sin traer citas de otras fechas.
 */
import { describe, it, expect } from 'vitest'
import { filtrarCitasPorTexto } from './agendaBusqueda'
import type { Appointment } from '../types'

const cita = (id: number, first: string, last: string, phone?: string): Appointment =>
  ({
    id,
    patient: { id, first_name: first, last_name: last, phone },
  } as unknown as Appointment)

const citas = [
  cita(101, 'María', 'López Pérez', '669 111 2233'),
  cita(102, 'Ana', 'Gómez', '(669) 444-5566'),
  cita(103, 'Juan', 'Martínez', undefined),
]

describe('filtrarCitasPorTexto', () => {
  it('sin texto devuelve todas las citas', () => {
    expect(filtrarCitasPorTexto(citas, '')).toHaveLength(3)
    expect(filtrarCitasPorTexto(citas, '   ')).toHaveLength(3)
  })

  it('busca por nombre sin distinguir acentos ni mayúsculas', () => {
    const r = filtrarCitasPorTexto(citas, 'maria lopez')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe(101)
  })

  it('busca por apellido', () => {
    expect(filtrarCitasPorTexto(citas, 'gómez')[0].id).toBe(102)
  })

  it('busca por teléfono ignorando espacios, guiones y paréntesis', () => {
    expect(filtrarCitasPorTexto(citas, '6694445566')[0].id).toBe(102)
    expect(filtrarCitasPorTexto(citas, '444 55 66')[0].id).toBe(102)
  })

  it('busca por folio (id de la cita)', () => {
    const r = filtrarCitasPorTexto(citas, '103')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe(103)
  })

  it('no devuelve nada si no hay coincidencia', () => {
    expect(filtrarCitasPorTexto(citas, 'zzz')).toHaveLength(0)
  })
})
