/** El modal único de subir (plan 32, punto 6): la pregunta decide a dónde va. */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
const permisos = vi.hoisted(() => ({ actuales: [] as string[] }))
vi.mock('../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))
vi.mock('../../shared/context/AuthContext', () => ({ useAuth: () => ({ can: (a: string) => permisos.actuales.includes(a) }) }))
vi.mock('../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))
vi.mock('../doctor/hooks/useCatalogoEstudios', () => ({ useCatalogoEstudios: () => ({ grupos: [], cargando: false }) }))

import SubirArchivoModal from './SubirArchivoModal'

const pdf = () => new File(['%PDF'], 'bh.pdf', { type: 'application/pdf' })

const montar = (onSubido = vi.fn(), onClose = vi.fn()) => {
  render(<SubirArchivoModal visible patientId={7} patientName="Ana López" onClose={onClose} onSubido={onSubido} />)
  return { onSubido, onClose }
}

describe('SubirArchivoModal', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    permisos.actuales = ['clinical_tracking.attach_result', 'documents.upload', 'medical_history.read']
    get.mockResolvedValue({ data: { items: [{ order_id: 31, study_name: 'Biometría', requested_on: '2026-10-01', status: 'ordered' }] } })
  })

  it('si es el resultado de una orden, lo adjunta a su orden', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ data: { result_id: 1, order_id: 31 } })
    const { onSubido, onClose } = montar()
    await user.click(screen.getByLabelText('Sí, de una orden de Cortex'))
    await user.selectOptions(await screen.findByLabelText('Su orden pendiente'), '31')
    await user.upload(screen.getByLabelText(/Archivo/), pdf())
    await user.click(screen.getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(onSubido).toHaveBeenCalledWith('estudios', expect.stringContaining('Biometría')))
    expect(post.mock.calls[0][0]).toBe('/clinical-tracking/orders/31/result-attachment')
    expect(onClose).toHaveBeenCalled()
  })

  it('una referencia de otro médico va a Documentos', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ data: { id: 3 } })
    const { onSubido } = montar()
    await user.click(screen.getByLabelText('No'))
    await user.click(screen.getByLabelText('Referencia o nota de otro médico'))
    await user.upload(screen.getByLabelText(/Archivo/), pdf())
    await user.click(screen.getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(onSubido).toHaveBeenCalledWith('documentos', expect.any(String)))
    const datos = post.mock.calls[0][1] as FormData
    expect(post.mock.calls[0][0]).toBe('/documents/upload')
    expect(datos.get('document_type')).toBe('external_note')
  })

  it('un estudio de otro lugar escrito a mano va a Estudios como externo', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ data: { order_id: 40 } })
    const { onSubido } = montar()
    await user.click(screen.getByLabelText('No'))
    await user.click(screen.getByRole('button', { name: /escribir|a mano/i }))
    await user.type(screen.getByLabelText(/Estudio o referencia/), 'Perfil tiroideo')
    await user.selectOptions(screen.getByLabelText('Tipo de estudio'), 'laboratory')
    await user.upload(screen.getByLabelText(/Archivo/), pdf())
    await user.click(screen.getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(onSubido).toHaveBeenCalledWith('estudios', expect.stringContaining('Perfil tiroideo')))
    const datos = post.mock.calls[0][1] as FormData
    expect(post.mock.calls[0][0]).toBe('/clinical-tracking/external-studies')
    expect(datos.get('study_name')).toBe('Perfil tiroideo')
    expect(datos.get('category')).toBe('laboratory')
  })

  it('recepción no ve «Otro archivo»', async () => {
    const user = userEvent.setup()
    permisos.actuales = ['clinical_tracking.attach_result', 'documents.upload']
    montar()
    await user.click(screen.getByLabelText('No'))
    expect(screen.queryByLabelText('Otro archivo')).toBeNull()
  })

  it('si el servidor lo rechaza, lo dice y no cierra', async () => {
    const user = userEvent.setup()
    post.mockRejectedValueOnce({ response: { status: 422, data: { detail: 'El archivo pesa más de 15 MB.' } } })
    const { onSubido, onClose } = montar()
    await user.click(screen.getByLabelText('No'))
    await user.click(screen.getByLabelText('Referencia o nota de otro médico'))
    await user.upload(screen.getByLabelText(/Archivo/), pdf())
    await user.click(screen.getByRole('button', { name: 'Subir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('15 MB')
    expect(onSubido).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
