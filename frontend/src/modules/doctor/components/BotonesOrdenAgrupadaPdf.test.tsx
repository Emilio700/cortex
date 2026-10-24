/**
 * «Imprimir orden» de un lote (O-02, plan 26 D-2).
 *
 * Lo que importa: la vista previa sale siempre, arranca con el modo que la
 * doctora fijó en su perfil, y al cambiarlo se vuelve a pedir el PDF, para que
 * lo que se imprime sea lo que se ve.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const sesion = vi.hoisted(() => ({
  permisos: ['clinical_tracking.print_order'] as string[],
  rol: 'doctor',
}))

vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => sesion.permisos.includes(p), user: { role: sesion.rol } }),
}))

import BotonesOrdenAgrupadaPdf from './BotonesOrdenAgrupadaPdf'
import { olvidarModoImpresion } from '../hooks/useModoImpresionPredeterminado'

const pdf = () => ({ status: 200, data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })

const responder = (modoDelPerfil: string) =>
  get.mockImplementation(async (ruta: string) =>
    ruta === '/doctor-profile/me' ? { data: { order_settings: { modo_impresion: modoDelPerfil } } } : pdf(),
  )

beforeEach(() => {
  get.mockReset()
  olvidarModoImpresion()
  sesion.permisos = ['clinical_tracking.print_order']
  sesion.rol = 'doctor'
  URL.createObjectURL = vi.fn(() => 'blob:lote')
  URL.revokeObjectURL = vi.fn()
})

const llamadasPdf = () => get.mock.calls.filter(([ruta]) => String(ruta).endsWith('/pdf'))

describe('BotonesOrdenAgrupadaPdf', () => {
  it('sin el permiso de imprimir no se ofrece', () => {
    sesion.permisos = ['clinical_tracking.read']
    render(<BotonesOrdenAgrupadaPdf groupId={9} />)
    expect(screen.queryByRole('button', { name: /Imprimir orden/ })).toBeNull()
  })

  it('el botón dice cuántos estudios lleva y que es un solo papel', () => {
    render(<BotonesOrdenAgrupadaPdf groupId={9} numEstudios={10} />)
    expect(screen.getByRole('button', { name: 'Imprimir orden (10 estudios, 1 papel)' })).toBeInTheDocument()
  })

  it('abre la vista previa con el modo del perfil de la doctora y lo pide una sola vez', async () => {
    responder('una_hoja')
    const user = userEvent.setup()
    render(<BotonesOrdenAgrupadaPdf groupId={9} />)

    await user.click(screen.getByRole('button', { name: 'Imprimir orden agrupada' }))

    await waitFor(() => expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull())
    expect(llamadasPdf()).toEqual([
      ['/clinical-tracking/order-groups/9/pdf', { responseType: 'blob', params: { modo: 'una_hoja' } }],
    ])
    expect(screen.getByLabelText('Cómo se imprime')).toHaveValue('una_hoja')
  })

  it('al cambiar el modo vuelve a pedir el PDF con ese modo', async () => {
    responder('separado')
    const user = userEvent.setup()
    render(<BotonesOrdenAgrupadaPdf groupId={9} />)
    await user.click(screen.getByRole('button', { name: 'Imprimir orden agrupada' }))
    await waitFor(() => expect(llamadasPdf()).toHaveLength(1))

    await user.selectOptions(screen.getByLabelText('Cómo se imprime'), 'una_hoja')

    await waitFor(() => expect(llamadasPdf()).toHaveLength(2))
    expect(llamadasPdf()[1][1]).toEqual({ responseType: 'blob', params: { modo: 'una_hoja' } })
  })

  it('recepción no tiene perfil: se pide sin modo y lo decide la doctora autora', async () => {
    sesion.rol = 'secretaria'
    get.mockResolvedValue(pdf())
    const user = userEvent.setup()
    render(<BotonesOrdenAgrupadaPdf groupId={9} />)
    await user.click(screen.getByRole('button', { name: 'Imprimir orden agrupada' }))

    await waitFor(() => expect(llamadasPdf()).toHaveLength(1))
    expect(llamadasPdf()[0]).toEqual(['/clinical-tracking/order-groups/9/pdf', { responseType: 'blob' }])
    expect(get).not.toHaveBeenCalledWith('/doctor-profile/me')
    expect(screen.getByLabelText('Cómo se imprime')).toHaveValue('')
  })

  it('si el servidor rechaza (409) muestra su motivo en la vista previa', async () => {
    const detalle = 'Ningún estudio del lote se puede imprimir.'
    get.mockImplementation(async (ruta: string) => {
      if (ruta === '/doctor-profile/me') return { data: {} }
      throw {
        response: { status: 409, data: new Blob([JSON.stringify({ detail: detalle })], { type: 'application/json' }) },
      }
    })
    const user = userEvent.setup()
    render(<BotonesOrdenAgrupadaPdf groupId={9} />)
    await user.click(screen.getByRole('button', { name: 'Imprimir orden agrupada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(detalle)
    expect(document.querySelector('canvas[aria-label^="Página"]')).toBeNull()
  })
})
