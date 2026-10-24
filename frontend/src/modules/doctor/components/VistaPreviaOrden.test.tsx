/**
 * La vista previa descarga y anota en la bitácora con el folio que imprimió
 * el servidor, no con el que la pantalla armaba (plan 32, folios homologados).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => {
  const cliente = { get: vi.fn(), post }
  return { apiClient: cliente, default: cliente }
})
vi.mock('../../../shared/components/pdf/acciones', () => ({
  esDispositivoTactil: () => false,
  imprimirPdfReal: vi.fn(async () => {}),
  abrirOCompartirPdf: vi.fn(async () => 'compartido'),
}))

vi.mock('../hooks/useModoImpresionPredeterminado', () => ({
  useModoImpresionPredeterminado: () => ({ modo: null, listo: true }),
}))

import VistaPreviaOrden from './VistaPreviaOrden'

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} })
  URL.createObjectURL = vi.fn(() => 'blob:1')
  URL.revokeObjectURL = vi.fn()
})

describe('VistaPreviaOrden · folio del servidor', () => {
  it('el archivo toma el nombre con el folio ORD y la bitácora anota ese folio', async () => {
    const obtener = vi.fn(async () => ({
      pdf: new Blob(['%PDF'], { type: 'application/pdf' }),
      orderIds: [5, 6],
      folio: 'GYG-ORD-2026-0118',
      nombreArchivo: 'Orden_de_estudios_GYG-ORD-2026-0118.pdf',
    }))
    render(
      <VistaPreviaOrden
        visible
        onClose={vi.fn()}
        titulo="Órdenes de estudio de esta consulta"
        nombreArchivo="Orden_de_estudios.pdf"
        obtener={obtener}
        folio="C-41"
      />,
    )

    expect(await screen.findByTitle('Orden_de_estudios_GYG-ORD-2026-0118.pdf')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: /Descargar/ }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).toEqual(
      expect.objectContaining({ order_ids: [5, 6], folio: 'GYG-ORD-2026-0118' }),
    )
  })
})
