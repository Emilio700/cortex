/**
 * «Generar modelo 3D»: dice sólo lo que confirmó el servidor.
 *
 * Mandar la serie no es tener el modelo: hasta que el servidor responde
 * «listo», el botón dice «Procesando…». Si falla, dice el motivo que dio el
 * servidor. Mientras está en curso, vuelve a preguntar solo.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))

import BotonModelo3D, { INTERVALO_DE_CONSULTA_MS } from './BotonModelo3D'

const RUTA = '/imaging/studies/3/series/11/modelo-3d'
const base = {
  id: 9, patient_id: 7, study_id: 3, series_id: 11, region: 'columna',
  sintetico: false, solicitado_en: '2026-10-25T10:00:00',
}
const no404 = () => Promise.reject(Object.assign(new Error('404'), { response: { status: 404, data: { detail: 'Aún no' } } }))

const montar = (puedeGenerar = true) =>
  render(
    <MemoryRouter>
      <BotonModelo3D patientId={7} estudioId={3} serieId={11} puedeGenerar={puedeGenerar} />
    </MemoryRouter>,
  )

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('BotonModelo3D', () => {
  it('sin modelo, ofrece generarlo', async () => {
    get.mockImplementation(no404)
    montar()
    expect(await screen.findByRole('button', { name: 'Generar modelo 3D' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(RUTA)
  })

  it('sin permiso y sin modelo no pinta nada', async () => {
    get.mockImplementation(no404)
    const { container } = montar(false)
    await act(() => Promise.resolve())
    expect(container).toBeEmptyDOMElement()
  })

  it('mientras procesa vuelve a preguntar y sólo dice «listo» cuando el servidor lo dice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    get.mockImplementation(no404)
    post.mockResolvedValue({ data: { ...base, estado: 'pendiente' } })
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Generar modelo 3D' }))
    expect(await screen.findByText(/Procesando el modelo 3D/)).toBeInTheDocument()
    expect(screen.queryByText(/listo/)).toBeNull()

    get.mockResolvedValue({ data: { ...base, estado: 'procesando' } })
    await act(() => vi.advanceTimersByTimeAsync(INTERVALO_DE_CONSULTA_MS))
    expect(screen.getByText(/Procesando el modelo 3D/)).toBeInTheDocument()

    get.mockResolvedValue({ data: { ...base, estado: 'listo', motor: 'TotalSegmentator' } })
    await act(() => vi.advanceTimersByTimeAsync(INTERVALO_DE_CONSULTA_MS))
    expect(await screen.findByText('Modelo 3D listo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver en Neuro 3D' })).toHaveAttribute('href', '/pacientes/7/neuro-3d?modelo=9')

    // Listo: ya no pregunta más.
    const llamadas = get.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(INTERVALO_DE_CONSULTA_MS * 3))
    expect(get.mock.calls.length).toBe(llamadas)
  })

  it('un modelo que falló dice el motivo del servidor y deja reintentar', async () => {
    get.mockResolvedValue({ data: { ...base, estado: 'fallo', motivo_fallo: 'No se encontró columna en el estudio.' } })
    montar()
    expect(await screen.findByText('No se pudo: No se encontró columna en el estudio.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeInTheDocument()
  })

  it('si el servidor rechaza la petición, lo dice y no finge que empezó', async () => {
    get.mockImplementation(no404)
    post.mockRejectedValue(
      Object.assign(new Error('422'), { response: { status: 422, data: { detail: 'La serie tiene muy pocos cortes (3) para armar un volumen.' } } }),
    )
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Generar modelo 3D' }))
    expect(await screen.findByText(/muy pocos cortes/)).toBeInTheDocument()
    expect(screen.queryByText(/Procesando/)).toBeNull()
  })

  it('un modelo sintético se dice sintético', async () => {
    get.mockResolvedValue({ data: { ...base, estado: 'listo', sintetico: true } })
    montar()
    expect(await screen.findByText(/sintético, de prueba/)).toBeInTheDocument()
  })
})
