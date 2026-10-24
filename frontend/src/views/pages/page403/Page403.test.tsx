/**
 * «Volver al inicio» desde la 403 no regresa a la 403 (plan 26, M9).
 *
 * Si a un rol le quitan el permiso de su propio tablero, su inicio lo mandaba a
 * la 403 y el botón lo volvía a mandar ahí. Se simula la ruta sin el respaldo
 * por rol, como quedará cuando los permisos sean la única fuente (plan 20, F6).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const sesion = vi.hoisted(() => ({ permisos: ['appointments.read'] as string[] }))

// Basta que `element` exista: el inicio solo cuenta rutas con pantalla.
const PANTALLA = vi.hoisted(() => () => null)

vi.mock('../../../routes', () => ({
  default: [
    { path: '/dashboard', name: 'Inicio' },
    { path: '/secretaria/agenda', requires: ['appointments.read'], element: PANTALLA },
    { path: '/doctor/dashboard', requires: ['doctor.dashboard.read'], element: PANTALLA },
  ],
}))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'doctor' }, permissions: sesion.permisos }),
}))

import Page403 from './Page403'

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/403']}>
      <Routes>
        <Route path="/403" element={<Page403 />} />
        <Route path="/secretaria/agenda" element={<div>Agenda</div>} />
        <Route path="/doctor/dashboard" element={<div>Tablero de la doctora</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('Page403 · volver al inicio', () => {
  it('sin permiso para su tablero, cae en otra pantalla que sí puede abrir en vez de volver a la 403', async () => {
    // Antes caía en la página genérica «/dashboard», retirada en el plan 28.
    sesion.permisos = ['appointments.read']
    montar()
    await userEvent.click(screen.getByRole('button', { name: /Volver al inicio/ }))
    expect(await screen.findByText('Agenda')).toBeInTheDocument()
  })

  it('con el permiso, vuelve a su tablero', async () => {
    sesion.permisos = ['doctor.dashboard.read']
    montar()
    await userEvent.click(screen.getByRole('button', { name: /Volver al inicio/ }))
    expect(await screen.findByText('Tablero de la doctora')).toBeInTheDocument()
  })
})
