/** Documentos de la paciente (plan 29: lote 4 y lote 7, corrección). */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  valor: { loading: false, error: null as string | null, documents: [] as unknown[], hasMore: false },
}))
const fetchPatientDocuments = vi.hoisted(() => vi.fn())
const anularDocumento = vi.hoisted(() => vi.fn())
const moverDocumento = vi.hoisted(() => vi.fn())
const revertirAnulacion = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/hooks/usePatientDocuments', () => ({
  VENTANA_DE_CORRECCION_MS: 24 * 60 * 60 * 1000,
  usePatientDocuments: () => ({
    ...estado.valor,
    fetchPatientDocuments,
    downloadDocument: vi.fn(),
    anularDocumento,
    moverDocumento,
    revertirAnulacion,
  }),
}))
const sesion = vi.hoisted(() => ({ user: { id: 3, role: 'doctor' }, permisos: ['documents.correct'] as string[] }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: sesion.user, can: (p: string) => sesion.permisos.includes(p) }),
}))
const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))
vi.mock('../../../shared/components/VisorDocumentos', () => ({ default: () => null, archivoDeDocumento: vi.fn() }))

import PatientDocuments from './PatientDocuments'

const DOC = {
  id: 9,
  patient_id: 4,
  tenant_id: 2,
  uploaded_by_user_id: 20,
  document_type: 'lab_result',
  title: 'Biometría',
  file_path: 'x',
  file_name: 'biometria.pdf',
  created_at: '2026-09-01T10:00:00',
}

beforeEach(() => {
  fetchPatientDocuments.mockReset()
  anularDocumento.mockReset()
  moverDocumento.mockReset()
  revertirAnulacion.mockReset()
  get.mockReset()
  sesion.user = { id: 3, role: 'doctor' }
  sesion.permisos = ['documents.correct']
})

describe('PatientDocuments', () => {
  it('si no se pudieron leer, dice el error y ofrece reintentar; no «No hay documentos» ni 0', () => {
    estado.valor = { loading: false, error: 'No se pudo conectar.', documents: [], hasMore: false }
    render(<PatientDocuments patientId={4} />)

    expect(screen.getByText('No se pudo conectar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByText('No hay documentos subidos')).toBeNull()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('sin documentos y sin error, lo dice', () => {
    estado.valor = { loading: false, error: null, documents: [], hasMore: false }
    render(<PatientDocuments patientId={4} />)
    expect(screen.getByText('No hay documentos subidos')).toBeInTheDocument()
  })
})

describe('PatientDocuments · corrección (plan 29, lote 7)', () => {
  beforeEach(() => {
    estado.valor = { loading: false, error: null, documents: [DOC], hasMore: false }
  })

  it('anular pide motivo y solo anuncia lo que el servidor confirmó', async () => {
    anularDocumento.mockResolvedValue({ ...DOC, anulado_at: '2026-10-04T10:00:00', anulado_motivo: 'Era de otra' })
    const user = userEvent.setup()
    render(<PatientDocuments patientId={4} />)

    await user.click(screen.getByRole('button', { name: 'Corregir Biometría' }))
    await user.click(screen.getByRole('button', { name: 'Anular' }))
    const dialogo = await screen.findByRole('dialog')
    const confirmar = within(dialogo).getByRole('button', { name: 'Anular documento' })
    expect(confirmar).toBeDisabled()
    await user.type(within(dialogo).getByLabelText(/Motivo/), 'Era de otra')
    await user.click(confirmar)

    expect(anularDocumento).toHaveBeenCalledWith(9, 'Era de otra')
    expect(await screen.findByText(/Se anuló «Biometría»/)).toBeInTheDocument()
  })

  it('si el servidor lo rechaza (resultado de orden), lo dice en el diálogo y no anuncia nada', async () => {
    anularDocumento.mockRejectedValue(new Error('Este archivo es el resultado de la orden n.º 7 de esta paciente.'))
    const user = userEvent.setup()
    render(<PatientDocuments patientId={4} />)

    await user.click(screen.getByRole('button', { name: 'Corregir Biometría' }))
    await user.click(screen.getByRole('button', { name: 'Anular' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText(/Motivo/), 'Error')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular documento' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('orden n.º 7')
    expect(screen.queryByText(/Se anuló/)).toBeNull()
  })

  it('mover busca a la paciente correcta y la manda con el motivo', async () => {
    get.mockResolvedValue({ data: [{ id: 5, first_name: 'BERTA', last_name: 'RUIZ' }] })
    moverDocumento.mockResolvedValue({ ...DOC, patient_id: 5, movido_desde_patient_id: 4 })
    const user = userEvent.setup()
    render(<PatientDocuments patientId={4} />)

    await user.click(screen.getByRole('button', { name: 'Corregir Biometría' }))
    await user.click(screen.getByRole('button', { name: 'Mover a otra paciente' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Paciente correcta'), 'ber')
    await user.click(await within(dialogo).findByRole('button', { name: /BERTA RUIZ/ }))
    await user.type(within(dialogo).getByLabelText(/Motivo/), 'Se subió a otra')
    await user.click(within(dialogo).getByRole('button', { name: 'Mover a otra paciente' }))

    expect(moverDocumento).toHaveBeenCalledWith(9, 5, 'Se subió a otra')
    expect(await screen.findByText(/Se movió «Biometría» al expediente de BERTA RUIZ/)).toBeInTheDocument()
  })

  it('sin permiso y sin haberlo subido, no se ofrece corregir', () => {
    sesion.permisos = []
    render(<PatientDocuments patientId={4} />)
    expect(screen.queryByRole('button', { name: 'Corregir Biometría' })).toBeNull()
  })

  it('administración puede ver los anulados', async () => {
    sesion.user = { id: 1, role: 'admin' }
    const user = userEvent.setup()
    render(<PatientDocuments patientId={4} />)

    await user.click(screen.getByLabelText('Anulados'))
    await waitFor(() => expect(fetchPatientDocuments).toHaveBeenLastCalledWith(4, 0, 50, false, true))
  })
})
