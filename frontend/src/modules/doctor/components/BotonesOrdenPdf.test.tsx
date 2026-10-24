/**
 * «Imprimir orden» de un solo estudio (O-01, plan 26 D-2).
 *
 * Lo que no puede pasar: imprimir sin que nadie vea el papel, ofrecer imprimir
 * una orden que el servidor rechaza, o mostrar una hoja en blanco cuando el
 * servidor no generó el PDF.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
const permisos = vi.hoisted(() => ({ lista: ['clinical_tracking.print_order'] as string[] }))

vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => permisos.lista.includes(p), user: { role: 'doctor' } }),
}))

const acciones = vi.hoisted(() => ({
  tactil: false,
  imprimir: vi.fn(async (_pdf: Blob) => {}),
  compartir: vi.fn(async (_pdf: Blob, _nombre: string) => 'compartido' as const),
}))
vi.mock('../../../shared/components/pdf/acciones', () => ({
  esDispositivoTactil: () => acciones.tactil,
  imprimirPdfReal: (pdf: Blob) => acciones.imprimir(pdf),
  abrirOCompartirPdf: (pdf: Blob, nombre: string) => acciones.compartir(pdf, nombre),
}))

import BotonesOrdenPdf from './BotonesOrdenPdf'

const pdf = () => ({ status: 200, data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  permisos.lista = ['clinical_tracking.print_order']
  URL.createObjectURL = vi.fn(() => 'blob:orden')
  URL.revokeObjectURL = vi.fn()
})

describe('BotonesOrdenPdf', () => {
  it('sin el permiso de imprimir órdenes no se ofrece', () => {
    permisos.lista = ['clinical_tracking.read']
    render(<BotonesOrdenPdf orderId={4} status="ordered" />)
    expect(screen.queryByRole('button', { name: 'Imprimir orden' })).toBeNull()
  })

  it('una orden cancelada, rechazada o en borrador no se ofrece para imprimir', () => {
    for (const status of ['cancelled', 'rejected', 'draft']) {
      const { unmount } = render(<BotonesOrdenPdf orderId={4} status={status} />)
      expect(screen.queryByRole('button', { name: 'Imprimir orden' })).toBeNull()
      unmount()
    }
  })

  it('imprimir abre la vista previa con el PDF real y desde ahí se imprime', async () => {
    get.mockResolvedValue(pdf())
    const user = userEvent.setup()
    render(<BotonesOrdenPdf orderId={4} status="ordered" />)

    await user.click(screen.getByRole('button', { name: 'Imprimir orden' }))

    expect(get).toHaveBeenCalledWith('/clinical-tracking/orders/4/pdf', { responseType: 'blob' })
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    // La hoja suelta no se reparte por destino: no hay selector de modo.
    expect(screen.queryByLabelText('Cómo se imprime')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Imprimir' }))
    expect(acciones.imprimir).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('descargar desde la vista previa guarda el archivo con el nombre de la orden', async () => {
    get.mockResolvedValue(pdf())
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<BotonesOrdenPdf orderId={4} status="result_received" />)

    await user.click(screen.getByRole('button', { name: 'Imprimir orden' }))
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    await user.click(screen.getByRole('button', { name: 'Descargar' }))

    expect((clic.mock.contexts[0] as HTMLAnchorElement).download).toBe('Orden_de_estudio_4.pdf')
    clic.mockRestore()
  })

  it('si el servidor rechaza (409) muestra su motivo y no ofrece imprimir', async () => {
    const detalle = 'Esta orden está cancelada o no se ha emitido, así que no se imprime.'
    get.mockRejectedValue({
      response: {
        status: 409,
        data: new Blob([JSON.stringify({ detail: detalle })], { type: 'application/json' }),
      },
    })
    const user = userEvent.setup()
    render(<BotonesOrdenPdf orderId={4} status="ordered" />)

    await user.click(screen.getByRole('button', { name: 'Imprimir orden' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(detalle)
    expect(document.querySelector('canvas[aria-label^="Página"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled()
  })
})

describe('BotonesOrdenPdf · bitácora (plan 26, M2)', () => {
  it('abrir la vista previa no anota impresión; descargar sí', async () => {
    get.mockResolvedValue(pdf())
    post.mockResolvedValue({ data: { registrado: true } })
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<BotonesOrdenPdf orderId={4} status="ordered" />)

    await user.click(screen.getByRole('button', { name: 'Imprimir orden' }))
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    expect(post).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Descargar' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/clinical-tracking/orders/print-record', {
        order_ids: [4],
        accion: 'descargado',
      }),
    )
    clic.mockRestore()
  })
})
