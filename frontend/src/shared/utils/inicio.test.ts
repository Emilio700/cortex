import { describe, expect, it } from 'vitest'
import { Role } from '../types'
import routes from '../../routes'
import { RUTA_DE_INICIO_POR_ROL, rutaDeInicio } from './inicio'

describe('rutaDeInicio', () => {
  it('cada rol llega a su propio inicio; el médico, a su tablero con métricas', () => {
    expect(rutaDeInicio(Role.DOCTOR)).toBe('/doctor/dashboard')
    expect(rutaDeInicio(Role.ADMIN)).toBe('/admin/dashboard')
    expect(rutaDeInicio(Role.SECRETARIA)).toBe('/secretaria/agenda')
    expect(rutaDeInicio(Role.MASTER)).toBe('/master')
  })

  it('sin rol conocido manda a «/», que se resuelve con los permisos de la sesión', () => {
    // La página genérica «/dashboard» se retiró en el plan 28 (Fase 1).
    expect(rutaDeInicio(undefined)).toBe('/')
    expect(rutaDeInicio('otro')).toBe('/')
  })

  it('todo inicio es una ruta con pantalla, y de ese mismo rol', () => {
    for (const [rol, ruta] of Object.entries(RUTA_DE_INICIO_POR_ROL)) {
      const destino = routes.find((r) => r.path === ruta)
      expect(destino?.element, ruta).toBeDefined()
      if (destino?.roles) expect(destino.roles, ruta).toContain(rol)
    }
  })
})

describe('rutaDeInicioPermitida', () => {
  it('con el respaldo por rol actual, cada rol entra a su inicio', async () => {
    const { rutaDeInicioPermitida } = await import('./inicio')
    expect(rutaDeInicioPermitida(Role.DOCTOR, [])).toBe('/doctor/dashboard')
    expect(rutaDeInicioPermitida(Role.ADMIN, ['admin.dashboard.read'])).toBe('/admin/dashboard')
  })

  it('sin rol propio cae en el inicio de otro rol que sí pueda abrir', async () => {
    const { rutaDeInicioPermitida } = await import('./inicio')
    expect(rutaDeInicioPermitida('otro', ['appointments.read'])).toBe('/secretaria/agenda')
    expect(rutaDeInicioPermitida('otro', ['doctor.dashboard.read', 'appointments.read'])).toBe(
      '/doctor/dashboard',
    )
  })

  it('si no hay inicio de rol a su alcance, usa la primera pantalla fija que pueda ver', async () => {
    const { rutaDeInicioPermitida } = await import('./inicio')
    expect(rutaDeInicioPermitida('otro', ['payments.read'])).toBe('/finanzas/pagos')
  })

  it('nunca devuelve «/» ni «/dashboard», que redirigen aquí y harían un bucle', async () => {
    const { rutaDeInicioPermitida } = await import('./inicio')
    // Sin rol ni permisos solo queda la 403, que dice la verdad.
    expect(rutaDeInicioPermitida(undefined, [])).toBe('/403')
    expect(rutaDeInicioPermitida('otro', ['permiso.inexistente'])).toBe('/403')
  })
})
