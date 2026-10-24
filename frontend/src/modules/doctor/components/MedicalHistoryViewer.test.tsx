/**
 * El panel de notas, recetas y certificados habla solo de lo que leyó: si
 * están vacíos lo dice sin afirmar que el paciente no tenga historial —sus
 * citas se ven aparte, en la misma pestaña— (plan 29, T-1 y el pendiente de
 * unificar el historial de la consulta).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notas = vi.hoisted(() => vi.fn())
const recetas = vi.hoisted(() => vi.fn())
const certificados = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useSOAPNotes', () => ({ useSOAPNotes: () => ({ getPatientSOAPNotes: notas, loading: false }) }))
vi.mock('../hooks/usePrescriptions', () => ({
  usePrescriptions: () => ({ getPatientPrescriptions: recetas, loading: false }),
}))
vi.mock('../hooks/useCertificates', () => ({
  useCertificates: () => ({ getPatientCertificates: certificados, loading: false }),
}))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get }, default: { get } }))
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import MedicalHistoryViewer from './MedicalHistoryViewer'

beforeEach(() => {
  notas.mockReset().mockResolvedValue([])
  recetas.mockReset().mockResolvedValue([])
  certificados.mockReset().mockResolvedValue([])
  get.mockReset().mockResolvedValue({ data: [] })
})

describe('MedicalHistoryViewer', () => {
  it('sin notas, recetas ni certificados lo dice sin negar las citas', async () => {
    render(<MedicalHistoryViewer patientId={4} />)
    // Este panel no sabe de citas: solo puede hablar de las tres fuentes que
    // consultó. Un paciente con citas y sin documentos entra aquí.
    expect(
      await screen.findByText('Este paciente no tiene notas, recetas ni certificados registrados.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No hay registros médicos previos/)).not.toBeInTheDocument()
  })

  it('si las recetas no se pudieron leer, no lo presenta como vacío', async () => {
    const user = userEvent.setup()
    recetas.mockRejectedValueOnce(new Error('No se pudieron cargar las recetas del paciente.'))
    render(<MedicalHistoryViewer patientId={4} />)

    expect(await screen.findByText(/No se pudieron cargar las recetas del paciente/)).toBeInTheDocument()
    expect(
      screen.queryByText('Este paciente no tiene notas, recetas ni certificados registrados.'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByText('Este paciente no tiene notas, recetas ni certificados registrados.'),
    ).toBeInTheDocument()
  })
})
