import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { buildRouteEntries, matchRoutePath, resolveTabTitle, humanizeSegment, destinoDeRedireccion } from './routeMatch'
import { Role } from '../types'

const entries = buildRouteEntries()

describe('matchRoutePath', () => {
  it('matches static routes exactly', () => {
    const route = matchRoutePath('/secretaria/pacientes', entries)
    expect(route?.path).toBe('/secretaria/pacientes')
  })

  it('matches dynamic routes with :param', () => {
    const route = matchRoutePath('/secretaria/pacientes/7202/historial', entries)
    expect(route?.path).toBe('/secretaria/pacientes/:patientId/historial')
  })

  it('matches doctor consultation dynamic route', () => {
    const route = matchRoutePath('/doctor/consultation/12345', entries)
    expect(route?.path).toBe('/doctor/consultation/:appointmentId')
    expect(route?.roles).toEqual(expect.arrayContaining([Role.DOCTOR, Role.MASTER]))
    // Administración quedó fuera a propósito (revisión de flujos, 2026-10-04):
    // su perfil no trae doctor.appointments.read y la consulta es el espacio de
    // escritura de la doctora; su lectura clínica va por el Expediente Clínico.
    expect(route?.roles).not.toContain(Role.ADMIN)
    expect(route?.roles).not.toContain(Role.SECRETARIA)
  })

  it('returns undefined for unknown paths', () => {
    expect(matchRoutePath('/no/existe/ruta', entries)).toBeUndefined()
  })

  it('does not match when segment count differs', () => {
    // /secretaria/pacientes/:patientId/historial has 4 segments
    expect(matchRoutePath('/secretaria/pacientes/7202', entries)?.path).not.toBe(
      '/secretaria/pacientes/:patientId/historial',
    )
  })
})

describe('resolveTabTitle', () => {
  it('uses string route names', () => {
    expect(resolveTabTitle('/pacientes/7202/expediente', entries)).toBe('Expediente')
  })

  it('las rutas retiradas del expediente llevan al expediente con su paciente (plan 32, punto 6)', () => {
    for (const vieja of ['/doctor/patients/7202/record', '/secretaria/pacientes/7202/historial']) {
      const entrada = matchRoutePath(vieja, entries)!
      expect(destinoDeRedireccion(vieja, entrada)).toBe('/pacientes/7202/expediente')
    }
    expect(destinoDeRedireccion('/secretaria/documentos', matchRoutePath('/secretaria/documentos', entries)!)).toBe(
      '/secretaria/pacientes',
    )
  })

  it('humanizes Translation/ReactNode names', () => {
    // «/dashboard» era el ejemplo y se retiró (plan 28); se arma uno a mano.
    const conNodo = [
      { path: '/reportes-del-mes', name: createElement('span', null, 'Reportes'), segments: ['reportes-del-mes'], hasParams: false },
    ] as unknown as typeof entries
    expect(resolveTabTitle('/reportes-del-mes', conNodo)).toBe('Reportes Del Mes')
  })

  it('el inicio de la doctora y el de administración se llaman «Inicio», como en el menú', () => {
    expect(resolveTabTitle('/doctor/dashboard', entries)).toBe('Inicio')
    expect(resolveTabTitle('/admin/dashboard', entries)).toBe('Inicio')
  })

  it('resolves doctor consultation title', () => {
    expect(resolveTabTitle('/doctor/consultation/99', entries)).toBe('Consulta Médica')
  })

  it('las pestañas de finanzas llevan los nombres nuevos del menú', () => {
    // Plan 23, ajustes del 2026-09-28: "Corte de caja" y "Cobros" para todos
    // los roles; las rutas no cambiaron.
    expect(resolveTabTitle('/finanzas', entries)).toBe('Corte de caja')
    expect(resolveTabTitle('/finanzas/pagos', entries)).toBe('Cobros')
  })

  it('falls back to humanized last segment for unknown routes', () => {
    expect(resolveTabTitle('/algo/raro', entries)).toBe('Raro')
  })
})

describe('humanizeSegment', () => {
  it('capitalizes single words', () => {
    expect(humanizeSegment('dashboard')).toBe('Dashboard')
  })

  it('splits hyphens and capitalizes', () => {
    expect(humanizeSegment('historial-del-paciente')).toBe('Historial Del Paciente')
  })
})
