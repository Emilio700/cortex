/**
 * base-modulos-extra: un módulo opcional apagado no aparece en el menú ni abre
 * su ruta, aunque la sesión tenga el permiso. Ningún ítem real lo usa todavía,
 * así que las pruebas arman un menú y una ruta ficticios.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route as RutaRR, Routes } from 'react-router-dom'
import { CNavItem, CNavTitle } from '@coreui/react-pro'
import navigation, { filterNavByAccess, type NavItem } from './_nav'
import routes, { rutaConModuloActivo } from './routes'
import { buildRouteEntries } from './shared/tabs/routeMatch'
import { AccessGuard } from './shared/guards/AccessGuard'
import { Role } from './shared/types'

const mockUseAuth = vi.fn()
vi.mock('./shared/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }))

const MENU: NavItem[] = [
  { component: CNavItem, name: 'Inicio', to: '/' },
  { component: CNavItem, name: 'Agenda', to: '/agenda', requires: ['appointments.read'] },
  { component: CNavTitle, name: 'Operación', requires: ['tareas.read'] },
  { component: CNavItem, name: 'Tareas', to: '/tareas', requires: ['tareas.read'], modulo: 'tareas' },
]

const destinos = (items: NavItem[]) => items.map((i) => i.to ?? `[${String(i.name)}]`)

describe('menú con módulos opcionales', () => {
  it('con el módulo apagado el ítem no aparece, aunque haya permiso', () => {
    const visibles = filterNavByAccess(MENU, { permissions: ['tareas.read', 'appointments.read'], modulos: [] })
    expect(destinos(visibles)).toEqual(['/', '/agenda'])
  })

  it('con el módulo encendido aparece, con su encabezado', () => {
    const visibles = filterNavByAccess(MENU, {
      permissions: ['tareas.read', 'appointments.read'],
      modulos: ['tareas'],
    })
    expect(destinos(visibles)).toEqual(['/', '/agenda', '[Operación]', '/tareas'])
  })

  it('encender el módulo no abre nada a quien no tiene el permiso', () => {
    const visibles = filterNavByAccess(MENU, { permissions: ['appointments.read'], modulos: ['tareas'] })
    expect(destinos(visibles)).toEqual(['/', '/agenda'])
  })

  it('ni master por rol ve un módulo apagado', () => {
    const conRol: NavItem[] = [{ ...MENU[3], roles: [Role.MASTER] }]
    expect(filterNavByAccess(conRol, { role: Role.MASTER, modulos: [] })).toEqual([])
    expect(filterNavByAccess(conRol, { role: Role.MASTER, modulos: ['tareas'] })).toHaveLength(1)
  })

  it('sin la lista de módulos, lo opcional queda oculto y el núcleo sigue igual', () => {
    const visibles = filterNavByAccess(MENU, { permissions: ['tareas.read', 'appointments.read'] })
    expect(destinos(visibles)).toEqual(['/', '/agenda'])
  })

  it('el grupo «Sistema» se ve con sus permisos y no con los de otros', () => {
    const admin = filterNavByAccess(navigation, { permissions: ['servicios.read', 'modulos.manage'] })
    expect(destinos(admin)).toEqual(
      expect.arrayContaining(['[Sistema]', '/sistema/servicios', '/sistema/modulos']),
    )
    const medico = filterNavByAccess(navigation, { role: Role.DOCTOR, permissions: ['patients.read'] })
    expect(destinos(medico)).not.toContain('/sistema/modulos')
    expect(destinos(medico)).not.toContain('[Sistema]')
  })
})

describe('rutas con módulos opcionales', () => {
  it('una ruta del núcleo siempre abre y una opcional solo encendida', () => {
    expect(rutaConModuloActivo({}, [])).toBe(true)
    expect(rutaConModuloActivo({ modulo: 'tareas' }, [])).toBe(false)
    expect(rutaConModuloActivo({ modulo: 'tareas' }, ['tareas'])).toBe(true)
  })

  it('cada ítem del menú con módulo apunta a una ruta con el mismo módulo', () => {
    const entradas = buildRouteEntries()
    for (const item of navigation.filter((i) => i.modulo && i.to)) {
      const ruta = entradas.find((r) => r.path === item.to)
      expect(ruta?.modulo, String(item.to)).toBe(item.modulo)
    }
    // El campo viaja de routes.tsx a las pestañas.
    expect(routes.every((r) => !r.modulo || entradas.some((e) => e.modulo === r.modulo))).toBe(true)
  })

  const renderGuard = (modulo: string | undefined) =>
    render(
      <MemoryRouter initialEntries={['/tareas']}>
        <Routes>
          <RutaRR
            path="/tareas"
            element={
              <AccessGuard requires={['tareas.read']} modulo={modulo} alNegar="pestana">
                <div>PANTALLA DE TAREAS</div>
              </AccessGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

  it('la pestaña de un módulo apagado dice que no está activo, no «sin permiso»', () => {
    mockUseAuth.mockReturnValue({
      user: { role: Role.ADMIN },
      permissions: ['tareas.read'],
      loading: false,
      modulosActivos: [],
      modulosCargados: true,
    })
    renderGuard('tareas')
    expect(screen.queryByText('PANTALLA DE TAREAS')).not.toBeInTheDocument()
    expect(screen.getByText('Este módulo no está activo')).toBeInTheDocument()
  })

  it('con el módulo encendido y el permiso, abre', () => {
    mockUseAuth.mockReturnValue({
      user: { role: Role.ADMIN },
      permissions: ['tareas.read'],
      loading: false,
      modulosActivos: ['tareas'],
      modulosCargados: true,
    })
    renderGuard('tareas')
    expect(screen.getByText('PANTALLA DE TAREAS')).toBeInTheDocument()
  })

  it('no decide mientras no han llegado los módulos', () => {
    mockUseAuth.mockReturnValue({
      user: { role: Role.ADMIN },
      permissions: ['tareas.read'],
      loading: false,
      modulosActivos: [],
      modulosCargados: false,
    })
    renderGuard('tareas')
    expect(screen.queryByText('PANTALLA DE TAREAS')).not.toBeInTheDocument()
    expect(screen.queryByText('Este módulo no está activo')).not.toBeInTheDocument()
  })
})
