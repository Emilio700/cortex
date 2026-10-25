import { describe, expect, it } from 'vitest'
import { edad, iniciales, nombreCompleto, cx } from './utils'

// Fechas de referencia construidas en hora local (como lo hace la app).
const d = (y: number, m: number, dia: number) => new Date(y, m - 1, dia, 12)

describe('edad()', () => {
  it('cumpleaños exacto cuenta el año completo', () => {
    expect(edad('2000-06-15', d(2026, 6, 15))).toMatchObject({ anios: 26, meses: 312, texto: '26 años' })
  })
  it('un día antes del cumpleaños todavía no cumple', () => {
    expect(edad('2000-06-15', d(2026, 6, 14))).toMatchObject({ anios: 25, texto: '25 años' })
  })
  it('entre 1 y 3 años muestra años y meses', () => {
    expect(edad('2024-03-10', d(2026, 1, 20))).toMatchObject({ anios: 1, meses: 22, texto: '1 a 10 m' })
  })
  it('menores de un año en meses', () => {
    expect(edad('2026-01-05', d(2026, 7, 4))).toMatchObject({ anios: 0, meses: 5, texto: '5 meses' })
    expect(edad('2026-01-05', d(2026, 7, 5))).toMatchObject({ anios: 0, meses: 6 })
  })
  it('recién nacido: 0 meses', () => {
    expect(edad('2026-10-01', d(2026, 10, 24))).toMatchObject({ anios: 0, meses: 0, texto: '0 meses' })
  })
  it('fin de mes: 31-ene → 28-feb no cumple el mes', () => {
    expect(edad('2025-01-31', d(2025, 2, 28)).meses).toBe(0)
    expect(edad('2025-01-31', d(2025, 3, 31)).meses).toBe(2)
  })
  it('nacido el 29 de febrero cumple 4 años el 29-feb del bisiesto siguiente', () => {
    expect(edad('2020-02-29', d(2024, 2, 29)).anios).toBe(4)
    expect(edad('2020-02-29', d(2024, 2, 28)).anios).toBe(3)
  })
  it('texto en singular para 1 mes', () => {
    expect(edad('2025-01-15', d(2025, 2, 20)).texto).toBe('1 mes')
  })
  it('fecha de nacimiento futura no produce edades negativas', () => {
    const e = edad('2030-01-01', d(2026, 1, 1))
    expect(e.anios).toBe(0)
    expect(e.meses).toBe(0)
  })
  it('la fecha de nacimiento se interpreta en hora local (sin corrimiento por UTC)', () => {
    // A medianoche local del cumpleaños ya cumple (new Date("YYYY-MM-DD") sería UTC y fallaría en México).
    expect(edad('2000-10-24', new Date(2026, 9, 24, 0, 0, 1)).anios).toBe(26)
  })
})

describe('utilidades de nombre', () => {
  it('nombreCompleto e iniciales', () => {
    const p = { nombre: 'María José', apellidos: 'López Hernández' }
    expect(nombreCompleto(p)).toBe('María José López Hernández')
    expect(iniciales(p)).toBe('ML')
  })
  it('iniciales sin apellidos', () => {
    expect(iniciales({ nombre: 'ana', apellidos: '' })).toBe('A')
  })
  it('cx() descarta valores falsos', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b')
  })
})
