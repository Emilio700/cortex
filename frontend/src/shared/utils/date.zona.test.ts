/**
 * Hora del consultorio sin importar la zona del navegador (plan 26, D-12).
 *
 * Se cambia la zona del proceso a Tokio y a UTC: si alguna utilidad dependiera
 * del reloj local, la hora o el día mostrados cambiarían.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  diaDelConsultorio,
  formatearFechaISO,
  formatearHoraDeCita,
  formatearInstante,
  hoyLocalISO,
  instanteDelServidor,
} from './date'

const zonaOriginal = process.env.TZ

afterEach(() => {
  process.env.TZ = zonaOriginal
  vi.useRealTimers()
})

describe.each(['Asia/Tokyo', 'UTC', 'America/Mexico_City'])('con el navegador en %s', (zona) => {
  beforeEach(() => {
    process.env.TZ = zona
  })

  it('un instante del servidor sin «Z» se lee como UTC y se muestra en hora de Mazatlán', () => {
    // 03:46 UTC del 4 de octubre = 20:46 del 3 de octubre en Mazatlán (P-7).
    expect(instanteDelServidor('2026-10-04T03:46:00').toISOString()).toBe('2026-10-04T03:46:00.000Z')
    expect(formatearInstante('2026-10-04T03:46:00', { dateStyle: 'short', timeStyle: 'short' })).toMatch(
      /^03\/10\/26, 8:46\s?p\.\s?m\.$/,
    )
  })

  it('una hora de cita (hora local del consultorio) se muestra tal cual', () => {
    expect(
      formatearHoraDeCita('2026-10-03T18:00:00', { hour: '2-digit', minute: '2-digit', hour12: false }),
    ).toBe('18:00')
  })

  it('el día de una nota de las 18:00 de Mazatlán es ese día, no el siguiente', () => {
    expect(diaDelConsultorio('2026-10-04T01:00:00')).toBe('2026-10-03')
  })

  it('una fecha sin hora no se corre de día', () => {
    expect(formatearFechaISO('2026-09-30', '', 'short')).toBe('30/09/26')
  })

  it('hoy es el día de Mazatlán', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T06:30:00Z')) // 23:30 del 3 en Mazatlán
    expect(hoyLocalISO()).toBe('2026-10-03')
  })
})

describe('formatDate con patrón', () => {
  afterEach(() => {
    process.env.TZ = zonaOriginal
  })

  it('un created_at sale en hora de Mazatlán aunque el navegador esté en Tokio', async () => {
    process.env.TZ = 'Asia/Tokyo'
    const { formatDate, formatDateCita } = await import('./date')
    expect(formatDate('2026-10-04T03:46:00')).toBe('03/10/2026 20:46')
    expect(formatDateCita('2026-10-03T18:00:00', 'HH:mm')).toBe('18:00')
  })
})

describe('rangos y campos en hora del consultorio', () => {
  afterEach(() => {
    process.env.TZ = zonaOriginal
    vi.useRealTimers()
  })

  it('el día de la agenda empieza a medianoche de Mazatlán, sin zona', async () => {
    process.env.TZ = 'Asia/Tokyo'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T06:30:00Z')) // 23:30 del 3 en Mazatlán
    const { inicioDelDiaEnConsultorio } = await import('./date')
    expect(inicioDelDiaEnConsultorio()).toBe('2026-10-03T00:00:00')
    expect(inicioDelDiaEnConsultorio(1)).toBe('2026-10-04T00:00:00')
  })

  it('el campo «Tomada el» se prellena y se guarda en hora del consultorio', async () => {
    process.env.TZ = 'UTC'
    const { ahoraParaCampoFechaHora, instanteDesdeHoraDelConsultorio } = await import('./date')
    expect(ahoraParaCampoFechaHora(new Date('2026-10-04T03:46:00Z'))).toBe('2026-10-03T20:46')
    expect(instanteDesdeHoraDelConsultorio('2026-10-03T20:46')).toBe('2026-10-04T03:46:00.000Z')
  })
})
