/**
 * La tarjeta de recordatorios del perfil dice lo que de verdad controla: el
 * correo a las pacientes. El aviso para la doctora se gobierna en el centro de
 * avisos; antes la tarjeta prometía «correo y notificación in-app» y el de
 * 24 h ya no existe (plan 29, punto 10).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const abrirCentro = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useDoctorProfile', () => ({
  useDoctorProfile: () => ({
    profile: null,
    loading: false,
    error: null,
    getProfile: vi.fn(async () => null),
    updateProfile: vi.fn(),
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
  useSpecialties: () => ({ specialties: [], getSpecialties: vi.fn() }),
}))
vi.mock('../../../shared/services/api', () => {
  const cliente = { get: vi.fn(async () => ({ data: [] })), put: vi.fn(), post: vi.fn() }
  return { default: cliente, apiClient: cliente }
})
vi.mock('../../../shared/avisos/AvisosContext', () => ({ useAvisosOpcional: () => ({ abrirCentro }) }))
vi.mock('../components/DoctorScheduleCard', () => ({ default: () => null }))
vi.mock('../components/RecetaConfigCard', () => ({ default: () => null }))
vi.mock('../components/OrdenConfigCard', () => ({ default: () => null }))
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showToast: vi.fn() }),
}))
vi.mock('../../../shared/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'doctor' } }) }))

import DoctorProfilePage from './DoctorProfilePage'

describe('DoctorProfilePage · recordatorios', () => {
  it('habla del correo a las pacientes, no de avisos en la campana, y lleva al centro de avisos', async () => {
    const usuario = userEvent.setup()
    render(<DoctorProfilePage />)

    expect(await screen.findByText('Recordatorios por correo a tus pacientes')).toBeInTheDocument()
    expect(screen.queryByText(/in-app/)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Abrir mis avisos' }))
    expect(abrirCentro).toHaveBeenCalled()
  })
})
