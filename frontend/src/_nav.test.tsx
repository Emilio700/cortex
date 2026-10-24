import { describe, it, expect } from 'vitest'
import navigation, { DESTINO_INICIO, filterNavByAccess, filterNavByRole, resolverInicio } from './_nav'
import { Role } from './shared/types'

const tosFor = (role?: Role): string[] =>
  filterNavByRole(navigation, role)
    .map((item) => item.to)
    .filter((to): to is string => Boolean(to))

describe('filterNavByRole', () => {
  it('shows secretaria her section and the shared home item, hiding doctor routes', () => {
    const tos = tosFor(Role.SECRETARIA)
    expect(tos).toContain(DESTINO_INICIO)
    expect(tos).toContain('/secretaria/agenda')
    expect(tos.some((to) => to.startsWith('/doctor'))).toBe(false)
  })

  it('shows doctor his section, shared consultorio routes, and the home item', () => {
    const tos = tosFor(Role.DOCTOR)
    expect(tos).toContain(DESTINO_INICIO)
    expect(tos).toContain('/doctor/appointments')
    // Doctor shares consultorio routes (agenda, pacientes, documentos) with secretaria
    expect(tos).toContain('/secretaria/agenda')
    expect(tos).toContain('/secretaria/pacientes')
    // Documentos salió del menú a propósito (plan 32, punto 6): vive en el expediente.
    expect(tos).not.toContain('/secretaria/documentos')
    // But doctor does NOT see triage (secretaria-only); el preregistro ya no existe
    expect(tos).not.toContain('/secretaria/triage')
    expect(tos).not.toContain('/secretaria/preregistro')
    // Doctor does NOT see admin routes
    expect(tos.some((to) => to.startsWith('/admin'))).toBe(false)
  })

  it('shows every route to admin', () => {
    const tos = tosFor(Role.ADMIN)
    expect(tos).toContain('/secretaria/agenda')
    // «Consultas» (doctora) ya no: su endpoint exige doctor.appointments.read,
    // que administración no tiene; la puerta abría en error (2026-10-04).
    expect(tos).not.toContain('/doctor/appointments')
    expect(tos).toContain('/doctor/results')
  })

  it('only shows role-less items when there is no user', () => {
    const items = filterNavByRole(navigation, undefined)
    // «Inicio» has no `roles`, everything else is role-scoped.
    expect(items.every((item) => !item.roles)).toBe(true)
    expect(tosFor(undefined)).toContain(DESTINO_INICIO)
  })
})

describe('nombres del menú de finanzas', () => {
  it('son los mismos para todos: "Corte de caja" y "Cobros", sin cambiar las rutas', () => {
    // Plan 23, ajustes del 2026-09-28. Un nombre por rol obligaba a
    // condiciones en el menú y a mantener recorridos por separado.
    const porRuta = Object.fromEntries(
      navigation.filter((item) => item.to).map((item) => [item.to as string, item.name]),
    )
    expect(porRuta['/finanzas']).toBe('Corte de caja')
    expect(porRuta['/finanzas/pagos']).toBe('Cobros')
    expect(navigation.map((item) => item.name)).not.toContain('Dashboard Financiero')
    expect(navigation.map((item) => item.name)).not.toContain('Pagos')
  })
})

describe('un solo «Inicio» en el menú (plan 28, Fase 1)', () => {
  const nombres = navigation.map((item) => item.name)

  it('ya no hay ítems «Dashboard»: el menú tiene un único «Inicio», arriba', () => {
    expect(nombres.filter((n) => n === 'Inicio')).toHaveLength(1)
    expect(navigation[0].name).toBe('Inicio')
    expect(nombres).not.toContain('Dashboard')
    expect(nombres).not.toContain('Dashboard Admin')
    const destinos = navigation.map((item) => item.to)
    expect(destinos).not.toContain('/dashboard')
    expect(destinos).not.toContain('/doctor/dashboard')
    expect(destinos).not.toContain('/admin/dashboard')
  })

  const menuDe = (role: Role, permissions: string[], inicio: string) =>
    resolverInicio(filterNavByAccess(navigation, { role, permissions }), inicio)

  it('a la doctora «Inicio» la lleva a su tablero', () => {
    const items = menuDe(Role.DOCTOR, ['doctor.dashboard.read', 'appointments.read'], '/doctor/dashboard')
    expect(items[0]).toMatchObject({ name: 'Inicio', to: '/doctor/dashboard' })
    expect(items.filter((item) => item.to === '/doctor/dashboard')).toHaveLength(1)
  })

  it('a administración «Inicio» la lleva a su resumen', () => {
    const items = menuDe(Role.ADMIN, ['admin.dashboard.read', 'users.read'], '/admin/dashboard')
    expect(items[0]).toMatchObject({ name: 'Inicio', to: '/admin/dashboard' })
  })

  it('a recepción no se le repite la Agenda: su inicio ya es un ítem del menú', () => {
    const items = menuDe(Role.SECRETARIA, ['appointments.read'], '/secretaria/agenda')
    expect(items.map((item) => item.name)).not.toContain('Inicio')
    expect(items.filter((item) => item.to === '/secretaria/agenda')).toHaveLength(1)
  })

  it('ningún ítem se queda apuntando al destino simbólico', () => {
    const items = menuDe(Role.DOCTOR, ['doctor.dashboard.read'], '/doctor/dashboard')
    expect(items.map((item) => item.to)).not.toContain(DESTINO_INICIO)
  })
})

describe('nombres alineados (plan 32, punto 6)', () => {
  it('«Órdenes y resultados» de recepción no se le duplica a quien tiene la bandeja clínica', async () => {
    const { default: items, filterNavByAccess } = await import('./_nav')
    const nombres = (permissions: string[], role: Role) =>
      filterNavByAccess(items, { role, permissions }).filter((i) => i.name === 'Órdenes y resultados').map((i) => i.to)
    expect(nombres(['clinical_tracking.deliver_order'], Role.SECRETARIA)).toEqual(['/secretaria/resultados'])
    expect(nombres(['clinical_tracking.read', 'clinical_tracking.deliver_order'], Role.DOCTOR)).toEqual(['/doctor/results'])
    expect(filterNavByAccess(items, { role: Role.DOCTOR, permissions: ['doctor.appointments.read'] }).find((i) => i.to === '/doctor/appointments')?.name).toBe('Mis Consultas')
  })
})
