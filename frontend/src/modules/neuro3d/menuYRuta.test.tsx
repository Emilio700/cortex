/**
 * El atlas aparece en el menú y abre su ruta con el mismo permiso: `neuro3d.read`.
 * Sin él, ni el grupo «Imagen y señales» ni la pantalla.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import navigation, { filterNavByAccess } from '../../_nav'
import { buildRouteEntries, matchRoutePath } from '../../shared/tabs/routeMatch'
import { AccessGuard } from '../../shared/guards/AccessGuard'
import { Role } from '../../shared/types'
import { agruparEnSecciones } from '../../components/menuEnSecciones'

let mockAuth: { user: { role: Role } | null; permissions: string[]; loading: boolean }
vi.mock('../../shared/context/AuthContext', () => ({ useAuth: () => mockAuth }))

const entradas = buildRouteEntries()

const abrir = (path: string, permissions: string[], role: Role) => {
  mockAuth = { user: { role }, permissions, loading: false }
  const ruta = matchRoutePath(path, entradas)!
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <AccessGuard requires={ruta.requires} allowedRoles={ruta.roles}>
              <p>pantalla abierta</p>
            </AccessGuard>
          }
        />
        <Route path="/403" element={<p>sin acceso</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Neuro 3D en el menú y en las rutas', () => {
  it('con neuro3d.read aparece en el grupo «Imagen y señales»', () => {
    const menu = filterNavByAccess(navigation, { role: Role.DOCTOR, permissions: ['neuro3d.read', 'patients.read'] })
    const seccion = agruparEnSecciones(menu).secciones.find((s) => s.nombre === 'Imagen y señales')
    expect(seccion?.items.map((i) => i.to)).toEqual(['/imagen/neuro-3d'])
  })

  it('sin el permiso no aparece el grupo (ni un encabezado huérfano)', () => {
    const menu = filterNavByAccess(navigation, { role: Role.SECRETARIA, permissions: ['patients.read', 'appointments.read'] })
    expect(menu.some((i) => i.name === 'Imagen y señales')).toBe(false)
    expect(menu.some((i) => i.to === '/imagen/neuro-3d')).toBe(false)
  })

  it('las dos rutas piden neuro3d.read, igual que el menú', () => {
    expect(matchRoutePath('/imagen/neuro-3d', entradas)!.requires).toEqual(['neuro3d.read'])
    expect(matchRoutePath('/pacientes/7/neuro-3d', entradas)!.requires).toEqual(['neuro3d.read'])
  })

  it('el médico con el permiso abre el atlas', () => {
    abrir('/imagen/neuro-3d', ['doctor.dashboard.read', 'neuro3d.read'], Role.DOCTOR)
    expect(screen.getByText('pantalla abierta')).toBeInTheDocument()
  })

  it('recepción sin el permiso no lo abre aunque escriba la ruta', () => {
    abrir('/pacientes/7/neuro-3d', ['patients.read'], Role.SECRETARIA)
    expect(screen.getByText('sin acceso')).toBeInTheDocument()
  })
})
