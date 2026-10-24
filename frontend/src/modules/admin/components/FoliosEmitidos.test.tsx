/**
 * Verificar un folio (plan 32): se busca y dice qué documento es; si no hay,
 * lo dice con el folio buscado; si falla, no se lee como «no existe».
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))

import FoliosEmitidos from './FoliosEmitidos'

beforeEach(() => {
  get.mockReset()
})

describe('FoliosEmitidos', () => {
  it('muestra de qué es el folio y busca por lo que se escribe', async () => {
    const usuario = userEvent.setup()
    get.mockResolvedValue({
      data: {
        total: 1,
        items: [{
          folio: 'GYG-REC-2026-0042', tipo: 'REC', tipo_nombre: 'Receta', patient_id: 7, patient_name: 'Ana López',
          emitted_by_name: 'Cintia', emitted_at: '2026-10-09T16:00:00', homologado: true,
        }],
      },
    })
    render(<FoliosEmitidos />)
    expect(await screen.findByText('GYG-REC-2026-0042')).toBeInTheDocument()
    expect(screen.getByText('Receta')).toBeInTheDocument()
    expect(screen.getByText('Ana López')).toBeInTheDocument()

    get.mockResolvedValue({ data: { total: 0, items: [] } })
    await usuario.type(screen.getByLabelText('Buscar folio'), 'XYZ')
    expect(await screen.findByText(/Ningún documento de esta sucursal tiene el folio «XYZ»/)).toBeInTheDocument()
    expect(get).toHaveBeenLastCalledWith('/audit-logs/folios', expect.objectContaining({ params: expect.objectContaining({ folio: 'XYZ' }) }))
  })

  it('si no se pudo leer no dice que el folio no exista', async () => {
    get.mockRejectedValue(new Error('sin red'))
    render(<FoliosEmitidos />)
    expect(await screen.findByText(/No quiere decir que el folio no exista/)).toBeInTheDocument()
  })
})
