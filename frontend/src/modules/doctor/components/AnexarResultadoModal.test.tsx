/**
 * Anexar resultado con varios archivos (plan 26, D-1).
 *
 * Lo que no puede pasar: decir que se anexó lo que el servidor rechazó, o
 * perder de vista cuál archivo falló cuando se subieron varios.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { post } }))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))

import AnexarResultadoModal from './AnexarResultadoModal'

const orden = { id: 57, study_name: 'Ultrasonido obstétrico', patient_name: 'ANA PRUEBA' }
const archivo = (nombre: string, tipo: string) => new File(['x'], nombre, { type: tipo })
const confirmado = (id: number, nombre: string) => ({
  data: {
    result_id: id,
    order_id: 57,
    order_status: 'result_received',
    patient_document_id: 100 + id,
    file_name: nombre,
    mime_type: 'application/pdf',
    file_size: 1,
    uploaded_at: '2026-10-03T20:00:00',
  },
})

beforeEach(() => {
  post.mockReset()
})

const montar = () => {
  const onAnexado = vi.fn()
  const onClose = vi.fn()
  render(<AnexarResultadoModal visible orden={orden} onAnexado={onAnexado} onClose={onClose} />)
  return { onAnexado, onClose }
}

describe('AnexarResultadoModal', () => {
  it('sube varios archivos, uno por uno, y cierra cuando el servidor confirma todos', async () => {
    post.mockResolvedValueOnce(confirmado(1, 'reporte.pdf')).mockResolvedValueOnce(confirmado(2, 'foto.jpg'))
    const user = userEvent.setup()
    const { onAnexado, onClose } = montar()

    expect(screen.getByRole('button', { name: 'Anexar' })).toBeDisabled()
    await user.upload(screen.getByLabelText(/Archivos del resultado/), [
      archivo('reporte.pdf', 'application/pdf'),
      archivo('foto.jpg', 'image/jpeg'),
    ])
    await user.type(screen.getByLabelText('Quién lo emitió (opcional)'), 'Laboratorio Central')
    await user.click(screen.getByRole('button', { name: 'Anexar 2 archivos' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[0][0]).toBe('/clinical-tracking/orders/57/result-attachment')
    const cuerpo = post.mock.calls[0][1] as FormData
    expect((cuerpo.get('file') as File).name).toBe('reporte.pdf')
    expect(cuerpo.get('reporting_provider')).toBe('Laboratorio Central')
    expect(onAnexado).toHaveBeenCalledWith([
      expect.objectContaining({ result_id: 1 }),
      expect.objectContaining({ result_id: 2 }),
    ])
  })

  it('si uno falla dice cuántos quedaron, deja el fallido con su motivo y no cierra', async () => {
    post
      .mockResolvedValueOnce(confirmado(1, 'reporte.pdf'))
      .mockRejectedValueOnce({ response: { status: 413, data: { detail: 'El archivo pesa más de 15 MB.' } } })
    const user = userEvent.setup()
    const { onAnexado, onClose } = montar()

    await user.upload(screen.getByLabelText(/Archivos del resultado/), [
      archivo('reporte.pdf', 'application/pdf'),
      archivo('enorme.png', 'image/png'),
    ])
    await user.click(screen.getByRole('button', { name: 'Anexar 2 archivos' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Se anexaron 1 de 2 archivos.')
    expect(screen.getByText('El archivo pesa más de 15 MB.')).toBeInTheDocument()
    expect(screen.getByText('enorme.png')).toBeInTheDocument()
    expect(screen.queryByText('reporte.pdf')).toBeNull()
    expect(onAnexado).toHaveBeenCalledWith([expect.objectContaining({ result_id: 1 })])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('si no se anexa ninguno lo dice y no avisa a quien lo abrió', async () => {
    post.mockRejectedValue({ message: 'Network Error', request: {} })
    const user = userEvent.setup()
    const { onAnexado } = montar()

    await user.upload(screen.getByLabelText(/Archivos del resultado/), archivo('a.pdf', 'application/pdf'))
    await user.click(screen.getByRole('button', { name: 'Anexar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se anexó ningún archivo.')
    expect(screen.getByText(/No se pudo conectar/)).toBeInTheDocument()
    expect(onAnexado).not.toHaveBeenCalled()
  })
})
