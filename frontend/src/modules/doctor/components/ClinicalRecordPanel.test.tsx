/**
 * El resumen del expediente no inventa datos cuando no se pudo leer (plan 29).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post: vi.fn() } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, role: 'doctor' }, can: () => true }),
}))
vi.mock('./PrenatalCarePanel', () => ({ default: () => null }))
vi.mock('./ClinicalConsentHistory', () => ({ default: () => null }))
vi.mock('./CareTeamPanel', () => ({ default: () => null }))

import ClinicalRecordPanel from './ClinicalRecordPanel'

const errorDeRed = () => Object.assign(new Error('Network Error'), { request: {} })

beforeEach(() => get.mockReset())

describe('ClinicalRecordPanel · lecturas que fallan', () => {
  it('si el resumen falla dice «—» y lo avisa; nunca «Sin registro» ni 0 seguimientos', async () => {
    get.mockImplementation((url: string) =>
      String(url).endsWith('/summary') ? Promise.reject(errorDeRed()) : Promise.resolve({ data: { items: [], total: 0 } }),
    )
    render(<ClinicalRecordPanel patientId={4} ownerDoctorId={3} />)

    expect(await screen.findByText(/No se pudo|conectar/)).toBeInTheDocument()
    expect(screen.queryByText('Sin registro')).toBeNull()
    expect(screen.getAllByText('—')).toHaveLength(3)
    // Los episodios sí llegaron.
    expect(screen.getByText(/Aún no hay episodios clínicos/)).toBeInTheDocument()
  })

  it('si los episodios fallan no dice «aún no hay», y reintentar los vuelve a pedir', async () => {
    get.mockImplementation((url: string) =>
      String(url).endsWith('/summary')
        ? Promise.resolve({ data: { last_appointment_at: null, next_appointment_at: null, open_follow_ups: 2 } })
        : Promise.reject(errorDeRed()),
    )
    render(<ClinicalRecordPanel patientId={4} ownerDoctorId={3} />)

    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(screen.queryByText(/Aún no hay episodios clínicos/)).toBeNull()

    get.mockImplementation((url: string) =>
      Promise.resolve({ data: String(url).endsWith('/summary') ? { open_follow_ups: 2 } : { items: [], total: 0 } }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/Aún no hay episodios clínicos/)).toBeInTheDocument()
  })
})
