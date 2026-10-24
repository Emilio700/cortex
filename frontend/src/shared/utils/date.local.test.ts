import { describe, it, expect, afterEach, vi } from 'vitest'
import { formatearFechaISO, hoyLocalISO, primerDiaDelMesLocalISO } from './date'

// El reloj se fija con el constructor local (año, mes, día, hora): en la máquina
// de la clínica (America/Mazatlan, UTC−7) las 23:30 del 3 de octubre ya son el 4
// en UTC, que es el desfase de F-1. Construirlo en hora local mantiene la prueba
// válida aunque se corra en otra zona.
afterEach(() => {
  vi.useRealTimers()
})

describe('hoyLocalISO', () => {
  it('a las 23:30 de Mazatlán da la fecha de hoy y no la de mañana', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 3, 23, 30))
    expect(hoyLocalISO()).toBe('2026-10-03')
    if (new Date().getTimezoneOffset() > 30) {
      // Lo que hacía el código anterior: en UTC ya es mañana.
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-04')
    }
  })

  it('a las 17:30, cuando en UTC ya cambió el día, sigue en el mismo día', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 3, 17, 30))
    expect(hoyLocalISO()).toBe('2026-10-03')
  })

  it('el primer día del mes también se calcula en hora local', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 31, 23, 30))
    expect(primerDiaDelMesLocalISO()).toBe('2026-10-01')
  })
})

describe('formatearFechaISO', () => {
  it('muestra el mismo día que trae la fecha, sin restarle uno', () => {
    expect(formatearFechaISO('2026-09-30', '', 'short')).toBe('30/09/26')
    expect(formatearFechaISO('2026-09-01', '', 'short')).toBe('01/09/26')
  })

  it('con una fecha que trae hora se queda con el día escrito', () => {
    expect(formatearFechaISO('2026-09-30T00:00:00', '', 'short')).toBe('30/09/26')
  })

  it('devuelve el texto de respaldo cuando no hay fecha utilizable', () => {
    expect(formatearFechaISO(null)).toBe('Sin fecha')
    expect(formatearFechaISO('', '—')).toBe('—')
    expect(formatearFechaISO('no es fecha', '—')).toBe('—')
  })
})
