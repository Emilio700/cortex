/**
 * El perfil en el teléfono: secciones plegables, la incompleta abierta, y el
 * aviso de «falta» lleva a su sección (plan 29). Antes «falta cédula»
 * mandaba a un bloque ~6 000 px más abajo, después de los dos membretes.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const abrirCentro = vi.hoisted(() => vi.fn())

const perfil = vi.hoisted(() => ({ actual: null as Record<string, unknown> | null }))

// Estables entre renders: las pruebas de validación asertan sobre ellos.
const { updateProfile, apiClient } = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  apiClient: {
    get: vi.fn(async () => ({ data: [] })),
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../hooks/useDoctorProfile', () => ({
  useDoctorProfile: () => ({
    profile: perfil.actual,
    loading: false,
    error: null,
    getProfile: vi.fn(async () => null),
    updateProfile,
    uploadLogo: vi.fn(),
    uploadSignature: vi.fn(),
  }),
}))
vi.mock('../hooks/useReminderPreferences', () => ({
  useReminderPreferences: () => ({
    preference: null,
    loading: false,
    error: null,
    getPreference: vi.fn(async () => null),
    updatePreference: vi.fn(),
  }),
}))
vi.mock('../../../shared/hooks/useSpecialties', () => ({
  // Con una especialidad se puede elegir en el formulario de datos.
  useSpecialties: () => ({
    specialties: [{ id: 1, name: 'Ginecología' }],
    getSpecialties: vi.fn(),
  }),
}))
vi.mock('../../../shared/services/api', () => ({ default: apiClient, apiClient }))
vi.mock('../../../shared/avisos/AvisosContext', () => ({ useAvisosOpcional: () => ({ abrirCentro }) }))
vi.mock('../components/DoctorScheduleCard', () => ({ default: () => null }))
vi.mock('../components/RecetaConfigCard', () => ({ default: () => null }))
vi.mock('../components/OrdenConfigCard', () => ({ default: () => null }))
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showToast: vi.fn() }),
}))
vi.mock('../../../shared/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'doctor' } }) }))

import DoctorProfilePage from './DoctorProfilePage'

const comoTelefono = (telefono: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: telefono, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )

const perfilSinCedula = {
  general_registry: 'RGP-1',
  specialty_license: null,
  logo_url: '/logo.png',
  signature_url: '/firma.png',
}

describe('DoctorProfilePage · en el teléfono', () => {
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    vi.unstubAllGlobals()
    perfil.actual = null
  })

  it('va en orden: datos, logo y firma, receta, orden, agenda, contraseña', () => {
    comoTelefono(true)
    perfil.actual = perfilSinCedula
    render(<DoctorProfilePage />)

    const titulos = Array.from(document.querySelectorAll('.perfil-seccion__boton')).map((b) =>
      (b.textContent ?? '').replace(/Falta.*$/, ''),
    )
    expect(titulos).toEqual(['Datos profesionales', 'Logo y firma', 'Mi receta', 'Mi orden de estudio', 'Agenda y recordatorios', 'Contraseña'])
  })

  it('abre sola la sección incompleta y deja plegadas las demás', () => {
    comoTelefono(true)
    perfil.actual = perfilSinCedula
    render(<DoctorProfilePage />)

    expect(screen.getByRole('button', { name: /Datos profesionales/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Datos profesionales/ })).toHaveTextContent('Falta cédula de especialidad')
    expect(screen.getByRole('button', { name: /Mi receta/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('el aviso de lo que falta abre esa sección y la lleva a la vista', async () => {
    // jsdom no implementa scrollIntoView.
    const desplazar = vi.fn()
    Element.prototype.scrollIntoView = desplazar
    const usuario = userEvent.setup()
    comoTelefono(true)
    perfil.actual = { ...perfilSinCedula, specialty_license: 'CE-1', logo_url: null }
    render(<DoctorProfilePage />)
    const seccion = screen.getByRole('button', { name: /Logo y firma/ })
    await usuario.click(seccion)
    expect(seccion).toHaveAttribute('aria-expanded', 'false')

    await usuario.click(screen.getByRole('button', { name: 'Falta logo' }))

    expect(seccion).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(desplazar).toHaveBeenCalledWith({ block: 'start' }))
    expect(desplazar.mock.contexts[0]).toHaveProperty('id', 'perfil-seccion-logo-firma')
  })

  it('en la computadora no hay botones de sección: todo a la vista', () => {
    comoTelefono(false)
    perfil.actual = perfilSinCedula
    render(<DoctorProfilePage />)

    expect(document.querySelector('.perfil-seccion__boton')).toBeNull()
  })
})

/**
 * Los formularios del perfil ya no usan la validación nativa: el aviso sale
 * junto al campo (`noValidate` + `ErrorDeCampo`) y, si falta algo, no se llama
 * al API. La especialidad y la cédula ya eran obligatorias aquí; los correos
 * son opcionales y sólo se revisa su forma cuando hay algo escrito.
 */
describe('DoctorProfilePage · errores junto al campo', () => {
  beforeEach(() => {
    perfil.actual = null
    updateProfile.mockReset()
    apiClient.post.mockReset()
    apiClient.patch.mockReset()
  })

  afterEach(() => {
    perfil.actual = null
  })

  const guardarDatos = () => screen.getByRole('button', { name: /Guardar Cambios/ })

  it('guardar sin especialidad se avisa junto al campo y no llama al API', async () => {
    const usuario = userEvent.setup()
    render(<DoctorProfilePage />)

    await usuario.click(guardarDatos())

    expect(screen.getByText('Selecciona una especialidad.')).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('el aviso de la especialidad se quita al elegirla; luego pide la cédula', async () => {
    const usuario = userEvent.setup()
    render(<DoctorProfilePage />)

    await usuario.click(guardarDatos())
    await usuario.selectOptions(screen.getByLabelText('Especialidad'), '1')

    expect(screen.queryByText('Selecciona una especialidad.')).not.toBeInTheDocument()

    await usuario.click(guardarDatos())

    expect(screen.getByText('Escribe la cédula profesional.')).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('un correo de contacto mal escrito se avisa y no se guarda', async () => {
    const usuario = userEvent.setup()
    render(<DoctorProfilePage />)

    await usuario.selectOptions(screen.getByLabelText('Especialidad'), '1')
    await usuario.type(screen.getByLabelText('Cédula Profesional'), '1234567')
    await usuario.type(screen.getByLabelText('Correo de contacto'), 'consulta@')

    await usuario.click(guardarDatos())

    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('el aviso del correo se quita al corregirlo', async () => {
    const usuario = userEvent.setup()
    render(<DoctorProfilePage />)

    const correo = screen.getByLabelText('Correo de contacto')
    await usuario.type(correo, 'consulta@')
    await usuario.click(guardarDatos())
    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()

    await usuario.type(correo, 'clinica.com')
    expect(screen.queryByText('Escribe un correo válido.')).not.toBeInTheDocument()
  })

  it('cambiar la contraseña con campos vacíos avisa junto al campo y no llama al API', async () => {
    const usuario = userEvent.setup()
    render(<DoctorProfilePage />)

    await usuario.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }))

    expect(screen.getByText('Escribe tu contraseña actual.')).toBeInTheDocument()
    expect(screen.getByText('Escribe la nueva contraseña.')).toBeInTheDocument()
    expect(screen.getByText('Repite la nueva contraseña.')).toBeInTheDocument()
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('si las contraseñas no coinciden lo dice junto a confirmar; al corregir sí guarda', async () => {
    const usuario = userEvent.setup()
    apiClient.post.mockResolvedValue({ data: {} })
    render(<DoctorProfilePage />)

    await usuario.type(screen.getByLabelText('Contraseña Actual'), 'actual123')
    await usuario.type(screen.getByLabelText('Nueva Contraseña'), 'nueva12345')
    await usuario.type(screen.getByLabelText('Confirmar Contraseña'), 'otra12345')
    await usuario.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }))

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(apiClient.post).not.toHaveBeenCalled()

    await usuario.clear(screen.getByLabelText('Confirmar Contraseña'))
    await usuario.type(screen.getByLabelText('Confirmar Contraseña'), 'nueva12345')
    expect(screen.queryByText('Las contraseñas no coinciden.')).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Cambiar Contraseña' }))

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/auth/change-password', {
        current_password: 'actual123',
        new_password: 'nueva12345',
      }),
    )
  })
})
