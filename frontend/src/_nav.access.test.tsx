/**
 * El menú se arma por permiso (B1 del plan maestro).
 *
 * La prueba que más importa aquí es la primera: cada rol conserva exactamente lo
 * que veía antes. Si el cambio dejara a un médico sin agenda, se enteraría a
 * media consulta, así que la línea base de `_nav.baseline.test.tsx` se vuelve a
 * exigir palabra por palabra contra el criterio nuevo.
 */
import { describe, it, expect } from 'vitest'
import navigation, { filterNavByAccess } from './_nav'
import { Role } from './shared/types'
import { MENU_VIGENTE } from './_nav.baseline.test'

const destinos = (access: { role?: Role; permissions?: string[] }): string[] =>
  filterNavByAccess(navigation, access)
    .map((item) => item.to)
    .filter((to): to is string => Boolean(to))

/**
 * Permisos por defecto de cada rol, recortados a los que el menú consulta.
 * Se copian del catálogo del backend (`ROLE_DEFAULT_PERMISSIONS`); si allá
 * cambian, aquí debe fallar algo.
 */
const PERMISOS_POR_DEFECTO: Record<Role, string[]> = {
  [Role.MASTER]: [
    'settings.global',
    'permissions.manage',
    'admin.dashboard.read',
    'users.read',
    'services.create',
    'reports.read',
    'audit.read',
    'appointments.read',
    'patients.read',
    'triage.create',
    'documents.read',
    'preregistration.read',
    'clinical_tracking.attach_result',
    'payments.read',
    'payments.cashcut',
    'doctor.dashboard.read',
    'doctor.appointments.read',
    'clinical_tracking.read',
    'doctor_profile.read',
  ],
  [Role.ADMIN]: [
    'admin.dashboard.read',
    'users.read',
    'services.create',
    'reports.read',
    'audit.read',
    'appointments.read',
    'patients.read',
    'triage.create',
    'documents.read',
    'preregistration.read',
    'clinical_tracking.attach_result',
    'payments.read',
    'payments.cashcut',
    'clinical_tracking.read',
    'doctor_profile.read',
  ],
  [Role.SECRETARIA]: [
    'appointments.read',
    'patients.read',
    'triage.create',
    'documents.read',
    'preregistration.read',
    'clinical_tracking.attach_result',
    'payments.read',
  ],
  [Role.DOCTOR]: [
    'appointments.read',
    'patients.read',
    'documents.read',
    'clinical_tracking.attach_result',
    // Plan 23: el médico cobra y ve su propio corte.
    'payments.read',
    'payments.cashcut',
    'doctor.dashboard.read',
    'doctor.appointments.read',
    'clinical_tracking.read',
    'doctor_profile.read',
  ],
}

/**
 * Lo que ve cada rol con sus permisos por defecto. Es la línea base más lo que
 * se agregó a propósito después: el plan 23 le da al médico "Mis cobros" y
 * su corte de caja. Cambia a propósito; lo que no puede pasar es que alguien
 * PIERDA un destino —la única baja deliberada es «Consultas» de administración
 * (2026-10-04), cuya puerta el servidor negaba; hay prueba de eso abajo—.
 */
const MENU_CON_PERMISOS: Record<Role, string[]> = {
  ...MENU_VIGENTE,
  [Role.DOCTOR]: [
    '/',
    '/secretaria/agenda',
    '/secretaria/pacientes',
    '/finanzas',
    '/finanzas/pagos',
    '/doctor/appointments',
    '/doctor/results',
    '/doctor/profile',
  ],
}

describe('filterNavByAccess', () => {
  it.each(Object.keys(MENU_VIGENTE) as Role[])(
    'el rol %s no pierde nada de lo que ya veía',
    (role) => {
      const visto = destinos({ role, permissions: PERMISOS_POR_DEFECTO[role] })
      expect(visto).toEqual(MENU_CON_PERMISOS[role])
      expect(visto).toEqual(expect.arrayContaining(MENU_VIGENTE[role]))
    },
  )

  it('con los permisos del plan 23 el médico ve sus cobros y su corte', () => {
    const doctora = destinos({ role: Role.DOCTOR, permissions: PERMISOS_POR_DEFECTO[Role.DOCTOR] })

    expect(doctora).toContain('/finanzas/pagos')
    expect(doctora).toContain('/finanzas')
  })

  it.each(Object.keys(MENU_VIGENTE) as Role[])(
    'una sesión antigua del rol %s, sin permisos en el perfil, sigue viendo su menú',
    (role) => {
      // Es el escenario de despliegue: el backend ya manda permisos pero el
      // perfil guardado en el navegador es de antes. Nadie puede quedarse fuera.
      // (Finanzas del médico no entra por rol, a propósito: ver _nav.tsx.)
      expect(destinos({ role })).toEqual(MENU_VIGENTE[role])
    },
  )

  it('un médico con permisos de recepción ve triage y pagos', () => {
    // El caso que motiva el plan 20. Antes, conceder estos permisos desde la
    // pantalla de Master no cambiaba absolutamente nada en la interfaz.
    const conRecepcion = destinos({
      role: Role.DOCTOR,
      permissions: [
        ...PERMISOS_POR_DEFECTO[Role.DOCTOR],
        'triage.create',
        'preregistration.read',
        'payments.read',
      ],
    })

    expect(conRecepcion).toContain('/secretaria/triage')
    // El preregistro se quitó (plan 32): ni con su permiso vuelve al menú.
    expect(conRecepcion).not.toContain('/secretaria/preregistro')
    expect(conRecepcion).toContain('/finanzas/pagos')
    // Y conserva lo suyo.
    expect(conRecepcion).toEqual(expect.arrayContaining(MENU_VIGENTE[Role.DOCTOR]))
  })

  it('el permiso de pagos no abre el corte de caja: ése es payments.cashcut', () => {
    // ADR-006: ver pagos no da el corte por arrastre. El plan 23 le concede
    // al médico su corte con payments.cashcut, explícito; aquí se prueba
    // que sin ese permiso no aparece.
    const conPagos = destinos({
      role: Role.DOCTOR,
      permissions: [
        ...PERMISOS_POR_DEFECTO[Role.DOCTOR].filter((p) => p !== 'payments.cashcut'),
        'payments.read',
      ],
    })

    expect(conPagos).not.toContain('/finanzas')
  })

  it('a la secretaria el corte le aparece sólo si se le concedió payments.cashcut', () => {
    // Plan 23, ajustes del 2026-09-28: el corte de la secretaria (acotado a
    // los médicos que apoya) se concede por usuaria, no viene con el rol.
    const sinPermiso = destinos({ role: Role.SECRETARIA, permissions: PERMISOS_POR_DEFECTO[Role.SECRETARIA] })
    const conPermiso = destinos({
      role: Role.SECRETARIA,
      permissions: [...PERMISOS_POR_DEFECTO[Role.SECRETARIA], 'payments.cashcut'],
    })

    expect(sinPermiso).not.toContain('/finanzas')
    expect(sinPermiso).toContain('/finanzas/pagos')
    expect(conPermiso).toContain('/finanzas')
    expect(conPermiso).toContain('/finanzas/pagos')
  })

  it('administración ya no ve «Consultas»: el servidor no le da esa agenda', () => {
    // Revisión de flujos, 2026-10-04: el ítem abría por rol, pero el endpoint
    // exige doctor.appointments.read, que su perfil no trae; y «mis citas» de
    // una administradora estaría siempre vacía. El médico la conserva.
    const admin = destinos({ role: Role.ADMIN, permissions: PERMISOS_POR_DEFECTO[Role.ADMIN] })
    expect(admin).not.toContain('/doctor/appointments')
    expect(admin).toContain('/doctor/results')
    expect(destinos({ role: Role.DOCTOR, permissions: PERMISOS_POR_DEFECTO[Role.DOCTOR] })).toContain(
      '/doctor/appointments',
    )
  })

  it('un encabezado de sección sin ítems debajo no se muestra', () => {
    // Un médico que además hace recepción debe ver un menú coherente, no un
    // título "Administración" sobre una sección vacía.
    const items = filterNavByAccess(navigation, { permissions: ['patients.read'] })
    const nombres = items.map((item) => item.name)

    expect(nombres).toContain('Consultorio')
    expect(nombres).not.toContain('Administración')
    expect(nombres).not.toContain('Médico')
    expect(nombres).not.toContain('Finanzas')
  })

  it('sin rol ni permisos sólo quedan los ítems sin restricción', () => {
    expect(destinos({})).toEqual(['/'])
  })
})
