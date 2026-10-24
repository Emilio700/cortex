/**
 * Resultados críticos en el inicio del médico (plan 26, D-3).
 *
 * Lo que no puede pasar: que un fallo al consultar se lea como «no hay
 * críticos», o que la incidencia no lleve a revisarlos.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get }, default: { get } }))

import IncidenciasCriticas from './IncidenciasCriticas'
import { avisarResultadosActualizados } from '../hooks/useResultadosSinRevisar'

const CRITICO = {
  result_id: 70,
  order_id: 57,
  patient_id: 12,
  patient_name: 'ANA PRUEBA',
  study_name: 'Potasio sérico',
  is_critical: true,
  review_status: 'received',
  resulted_on: '2026-10-02',
  created_at: '2026-10-02T18:00:00',
  patient_document_id: 140,
  document_file_name: 'k.pdf',
  document_mime_type: 'application/pdf',
}

beforeEach(() => {
  get.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:k')
  URL.revokeObjectURL = vi.fn()
})

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/doctor/dashboard']}>
      <Routes>
        <Route path="/doctor/dashboard" element={<IncidenciasCriticas />} />
        <Route path="/doctor/results" element={<div>Bandeja abierta</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('IncidenciasCriticas', () => {
  it('sin críticos no pinta nada', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } })
    const { container } = montar()
    await waitFor(() => expect(get).toHaveBeenCalledWith('/clinical-tracking/critical-results'))
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra cada crítico y lleva a revisarlos en la bandeja', async () => {
    get.mockResolvedValue({ data: { items: [CRITICO], total: 1 } })
    const user = userEvent.setup()
    montar()

    expect(await screen.findByText('1 resultado crítico sin cerrar')).toBeInTheDocument()
    expect(screen.getByText('ANA PRUEBA')).toBeInTheDocument()
    expect(screen.getByText(/Potasio sérico · Orden n\.º 57/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Verlos en la bandeja' }))
    expect(await screen.findByText('Bandeja abierta')).toBeInTheDocument()
  })

  it('el archivo se ve en el visor sin salir del inicio', async () => {
    get.mockImplementation(async (ruta: string) =>
      ruta.startsWith('/documents/')
        ? { data: new Blob(['%PDF']), headers: { 'content-type': 'application/pdf' } }
        : { data: { items: [CRITICO], total: 1 } },
    )
    const user = userEvent.setup()
    montar()
    await user.click(await screen.findByRole('button', { name: 'Ver archivo' }))
    await waitFor(() => expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull())
  })

  it('si no se pudo consultar lo dice, no lo da por vacío', async () => {
    get.mockRejectedValue({ message: 'Network Error', request: {} })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Puede que tengas resultados críticos sin cerrar.',
    )
  })

  it('al revisar en la bandeja se vuelve a consultar y la incidencia se va', async () => {
    get.mockResolvedValueOnce({ data: { items: [CRITICO], total: 1 } })
    get.mockResolvedValue({ data: { items: [], total: 0 } })
    montar()
    await screen.findByText('1 resultado crítico sin cerrar')

    avisarResultadosActualizados()

    await waitFor(() => expect(screen.queryByText('1 resultado crítico sin cerrar')).toBeNull())
  })
})
