/**
 * Línea base (Fase 0 del plan 20) — congela el menú que ve hoy cada rol.
 *
 * Por qué una lista exacta y no comprobaciones sueltas: la Fase 4 cambia el
 * criterio de filtrado de rol a permiso. Si alguien pierde un ítem por el camino,
 * no se entera al revisar el diff, se entera la doctora a media consulta. Aquí
 * la lista completa y en orden hace que cualquier alta o baja falle de inmediato.
 *
 * Actualizar este archivo es legítimo cuando el cambio es deliberado; lo que no
 * es legítimo es que cambie el menú y este archivo siga en verde.
 *
 * Plan 28, Fase 1: «/» es el ítem «Inicio», que la barra lateral cambia por el
 * inicio de cada rol; por eso salieron «/dashboard», «/doctor/dashboard» y
 * «/admin/dashboard» sin que nadie pierda adónde llegar.
 */
import { describe, it, expect } from 'vitest'
import navigation, { filterNavByRole } from './_nav'
import { Role } from './shared/types'

const destinosPorRol = (role?: Role): string[] =>
  filterNavByRole(navigation, role)
    .map((item) => item.to)
    .filter((to): to is string => Boolean(to))

/** Lo que ve hoy cada rol, en el orden en que aparece en la barra lateral. */
export const MENU_VIGENTE: Record<Role, string[]> = {
  [Role.MASTER]: [
    '/',
    '/master',
    '/master/sucursales',
    '/master/roles',
    '/master/permisos',
    '/admin/usuarios',
    '/admin/servicios',
    '/admin/salas',
    '/admin/reportes',
    '/admin/auditoria',
    '/secretaria/agenda',
    '/secretaria/pacientes',
    '/secretaria/triage',
    '/finanzas',
    '/finanzas/pagos',
    '/doctor/appointments',
    '/doctor/results',
    '/doctor/profile',
  ],
  [Role.ADMIN]: [
    '/',
    '/admin/usuarios',
    '/admin/servicios',
    '/admin/salas',
    '/admin/reportes',
    '/admin/auditoria',
    '/secretaria/agenda',
    '/secretaria/pacientes',
    '/secretaria/triage',
    '/finanzas',
    '/finanzas/pagos',
    // '/doctor/appointments' salió a propósito (revisión de flujos, 2026-10-04):
    // su endpoint exige doctor.appointments.read, que administración no tiene
    // —una agenda «mía» de administración no existe— y la puerta abría en error.
    '/doctor/results',
    '/doctor/profile',
  ],
  [Role.SECRETARIA]: [
    '/',
    '/secretaria/agenda',
    '/secretaria/pacientes',
    '/secretaria/triage',
    '/secretaria/resultados',
    '/finanzas/pagos',
  ],
  [Role.DOCTOR]: [
    '/',
    '/secretaria/agenda',
    '/secretaria/pacientes',
    '/doctor/appointments',
    '/doctor/results',
    '/doctor/profile',
  ],
}

describe('línea base del menú por rol', () => {
  it.each(Object.keys(MENU_VIGENTE) as Role[])(
    'el rol %s ve exactamente los destinos congelados',
    (role) => {
      expect(destinosPorRol(role)).toEqual(MENU_VIGENTE[role])
    },
  )

  it('el preregistro ya no está en el menú de nadie (plan 32, punto 5)', () => {
    for (const role of Object.keys(MENU_VIGENTE) as Role[]) {
      expect(destinosPorRol(role)).not.toContain('/secretaria/preregistro')
    }
  })

  it('sin sesión sólo quedan los ítems sin restricción', () => {
    expect(destinosPorRol(undefined)).toEqual(['/'])
  })

  it('la doctora no ve hoy triage ni pagos', () => {
    // Es justamente el defecto que motiva el plan 20: aunque se le concedan los
    // permisos desde Master, el menú filtra por rol y no se entera.
    const doctora = destinosPorRol(Role.DOCTOR)
    expect(doctora).not.toContain('/secretaria/triage')
    expect(doctora).not.toContain('/finanzas/pagos')
  })
})
