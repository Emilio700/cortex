/**
 * La ayuda no le cuesta nada a quien no la pide.
 *
 * Vitest aísla el registro de módulos por archivo, así que aquí se ve el
 * estado inicial: ni el motor de driver.js ni el centro de ayuda pueden venir
 * en el paquete que se carga al iniciar sesión. Sólo al pedir la ayuda (el
 * «?» del encabezado) se traen con `import()`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Role } from '../types'
import type { Recorrido } from './tipos'
import { TutorialesProvider } from './TutorialesContext'
import BotonAyuda from './BotonAyuda'
import { motorCargado } from './motor'

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const recorridoPantalla: Recorrido = {
  id: 'carga-diferida-prueba',
  version: 1,
  titulo: 'La agenda',
  resumen: 'Ver citas',
  grupo: 'Recepción',
  ruta: '/secretaria/agenda',
  requiere: ['appointments.read'],
  roles: [Role.SECRETARIA],
  pasos: [{ titulo: 'Todo', texto: 'Tarjeta sin elemento' }],
}

const montarBoton = () =>
  render(
    <MemoryRouter initialEntries={['/secretaria/agenda']}>
      <TutorialesProvider catalogo={[recorridoPantalla]}>
        <BotonAyuda />
      </TutorialesProvider>
    </MemoryRouter>,
  )

describe('carga diferida de la ayuda', () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
    mockUseAuth.mockReturnValue({
      user: { id: 42, role: Role.SECRETARIA, full_name: 'Prueba' },
      permissions: ['appointments.read'],
      loading: false,
    })
  })

  it('el motor y el centro llegan sólo cuando se pide la ayuda, no antes', async () => {
    // Este archivo corre aislado: nadie tocó todavía el módulo del motor.
    expect(motorCargado()).toBe(false)

    montarBoton()
    // Con el encabezado montado y todo, la maquinaria sigue sin cargarse.
    expect(motorCargado()).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Ayuda y tutoriales' }))
    // Al pedirla aparece el centro (React.lazy) y con él llega el motor. El
    // margen es amplio a propósito: la primera vez Vitest transforma los
    // módulos al vuelo y con varios archivos en paralelo puede tardar.
    expect(await screen.findByText('Centro de ayuda', {}, { timeout: 5000 })).toBeInTheDocument()
    await vi.waitFor(() => expect(motorCargado()).toBe(true), { timeout: 5000 })
  })
})
