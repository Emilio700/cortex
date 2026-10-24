/**
 * Al entrar, cada quien cae en su inicio (plan 26, D-6).
 *
 * Lo que pasaba: «/» no tiene pantalla, así que al abrir la aplicación (o al
 * pulsar «Inicio» en las migas) se veía «Selecciona una sección del menú», y
 * una ruta que no existe abría una pestaña en blanco.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sesion = vi.hoisted(() => ({ role: 'doctor' as string | undefined }))
const openTab = vi.hoisted(() => vi.fn())

vi.mock('../shared/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: sesion.role ? { role: sesion.role } : null }),
}))
vi.mock('../shared/tabs/TabsContext', () => ({
  useTabs: () => ({ openTab, clearTabs: vi.fn(), tabs: [], activeTabKey: null }),
}))
vi.mock('../shared/tabs/TabsBar', () => ({ default: () => null }))
vi.mock('../shared/tabs/TabsOutlet', () => ({ default: () => null }))

import AppContent from './AppContent'

const DondeEstoy = () => <div data-testid="ruta">{useLocation().pathname}</div>

const montar = (ruta: string) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppContent />
      <DondeEstoy />
    </MemoryRouter>,
  )

beforeEach(() => {
  openTab.mockReset()
  sesion.role = 'doctor'
})

describe('AppContent · inicio por rol', () => {
  it('la raíz lleva al médico a su tablero y le abre esa pestaña', async () => {
    montar('/')
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/doctor/dashboard'))
    expect(openTab).toHaveBeenCalledWith(expect.objectContaining({ path: '/doctor/dashboard' }))
    expect(openTab).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/' }))
  })

  it('recepción cae en su agenda', async () => {
    sesion.role = 'secretaria'
    montar('/')
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/secretaria/agenda'))
  })

  it('una ruta que no existe lleva al inicio en vez de abrir una pestaña en blanco', async () => {
    montar('/home')
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/doctor/dashboard'))
    expect(openTab).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/home' }))
  })

  it.each([
    ['doctor', '/doctor/dashboard'],
    ['secretaria', '/secretaria/agenda'],
    ['admin', '/admin/dashboard'],
    ['master', '/master'],
  ])('«/dashboard», ya retirada, lleva a %s a su inicio sin abrirle una pestaña vacía', async (rol, inicio) => {
    // Plan 28, Fase 1: la página genérica de accesos se quitó; marcadores y
    // pestañas guardadas con «/dashboard» no deben dar una pantalla en blanco.
    sesion.role = rol
    montar('/dashboard')
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(inicio))
    expect(openTab).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/dashboard' }))
  })

  it('una ruta que sí existe se abre tal cual', async () => {
    montar('/doctor/appointments')
    await waitFor(() =>
      expect(openTab).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/doctor/appointments' }),
      ),
    )
    expect(screen.getByTestId('ruta')).toHaveTextContent('/doctor/appointments')
  })

  it('el preregistro, ya retirado, lleva a la Agenda y no al inicio (plan 32, punto 5)', async () => {
    sesion.role = 'secretaria'
    montar('/secretaria/preregistro')
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/secretaria/agenda'))
    expect(openTab).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/secretaria/preregistro' }))
  })
})
