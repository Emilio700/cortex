/**
 * El acceso ya no depende del globo del navegador: los faltantes se dicen
 * debajo de cada campo (`noValidate` + ErrorDeCampo) y no se llama al
 * servidor hasta que todo está completo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'

const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }))

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ login: loginMock, setupMfa: vi.fn(), completeMfa: vi.fn() }),
}))

const montar = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  )

const entrar = () => fireEvent.click(screen.getByRole('button', { name: /Iniciar Sesión/ }))

describe('Login · errores junto al campo', () => {
  beforeEach(() => loginMock.mockReset())

  it('sin datos dice qué falta debajo de cada campo y no llama al servidor', () => {
    montar()
    entrar()
    expect(screen.getByText('Escribe tu correo.')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('un correo mal escrito se señala junto al campo', () => {
    montar()
    fireEvent.change(screen.getByPlaceholderText('Correo electrónico'), { target: { value: 'ana@' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta123' } })
    entrar()
    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('el aviso se quita al corregir el campo', () => {
    montar()
    entrar()
    fireEvent.change(screen.getByPlaceholderText('Correo electrónico'), { target: { value: 'ana@gems.com' } })
    expect(screen.queryByText('Escribe tu correo.')).not.toBeInTheDocument()
  })
})

describe('Login · recordar mi correo y «Entrando…» (plan 32, punto 1)', () => {
  beforeEach(() => {
    loginMock.mockReset()
    localStorage.clear()
  })

  const llenar = (correo = 'ana@gems.com') => {
    fireEvent.change(screen.getByPlaceholderText('Correo electrónico'), { target: { value: correo } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta123' } })
  }

  it('con la casilla marcada guarda sólo el correo, y al volver ya está escrito', async () => {
    loginMock.mockResolvedValue({ user: { role: 'doctor' }, must_change_password: false })
    const { unmount } = montar()
    llenar()
    fireEvent.click(screen.getByLabelText('Recordar mi correo en este equipo'))
    entrar()
    await waitFor(() => expect(localStorage.getItem('gems_correo_recordado')).toBe('ana@gems.com'))
    // Nunca la contraseña.
    expect(JSON.stringify({ ...localStorage })).not.toContain('secreta123')

    unmount()
    montar()
    expect(screen.getByPlaceholderText('Correo electrónico')).toHaveValue('ana@gems.com')
    expect(screen.getByLabelText('Recordar mi correo en este equipo')).toBeChecked()
  })

  it('al desmarcarla se olvida', async () => {
    localStorage.setItem('gems_correo_recordado', 'ana@gems.com')
    loginMock.mockResolvedValue({ user: { role: 'doctor' }, must_change_password: false })
    montar()
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta123' } })
    fireEvent.click(screen.getByLabelText('Recordar mi correo en este equipo'))
    entrar()
    await waitFor(() => expect(localStorage.getItem('gems_correo_recordado')).toBeNull())
  })

  it('si el acceso falla no recuerda un correo que pudo estar mal escrito', async () => {
    loginMock.mockRejectedValue(new Error('Credenciales inválidas'))
    montar()
    llenar('ana@gemz.com')
    fireEvent.click(screen.getByLabelText('Recordar mi correo en este equipo'))
    entrar()
    await screen.findByText(/Credenciales|Verifica/)
    expect(localStorage.getItem('gems_correo_recordado')).toBeNull()
  })

  it('mientras espera, el botón dice «Entrando…»', async () => {
    loginMock.mockReturnValue(new Promise(() => {}))
    montar()
    llenar()
    entrar()
    expect(await screen.findByRole('button', { name: /Entrando…/ })).toBeDisabled()
  })

  it('lleva el nombre del sistema, no el lema viejo', () => {
    montar()
    expect(screen.getByText('Gynecology & Expert Management System')).toBeInTheDocument()
    expect(screen.queryByText(/Global Ecosystem/)).toBeNull()
  })
})
