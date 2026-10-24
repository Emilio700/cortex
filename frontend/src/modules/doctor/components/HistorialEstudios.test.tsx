/**
 * Historial de estudios del expediente (O-08).
 *
 * Lo que importa: una sola llamada trae órdenes y resultados (sin N+1), el
 * estado se lee en español, se abre el archivo adjunto y un fallo de carga se
 * distingue de «no hay estudios».
 */
import { render, renderHook, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))

import HistorialEstudios from './HistorialEstudios'
import { olvidarOrdenesDePaciente, useHistorialDeOrdenes } from '../hooks/useFuenteDeOrdenes'

const respuestaOrdenes = () => ({
  status: 200,
  headers: { 'x-total-count': '1' },
  data: [
    {
      id: 57,
      patient_id: 12,
      order_group_id: 9,
      category: 'laboratory',
      study_name: 'Biometría hemática',
      clinical_indication: 'Control',
      priority: 'routine',
      requested_on: '2026-09-29',
      status: 'reviewed',
      created_at: '2026-09-29T10:00:00',
      results: [
        {
          id: 90,
          review_status: 'reviewed',
          resulted_on: '2026-10-02',
          reporting_provider: 'Laboratorio Central',
          is_critical: false,
          clinician_interpretation: 'Sin alteraciones',
          patient_document_id: 140,
          document_file_name: 'bh.pdf',
          document_mime_type: 'application/pdf',
          created_at: '2026-10-03T10:12:00',
        },
      ],
    },
  ],
})

beforeEach(() => {
  get.mockReset()
  olvidarOrdenesDePaciente()
})

describe('HistorialEstudios', () => {
  it('lista la orden con su estado en español y su resultado, con una sola llamada', async () => {
    get.mockResolvedValue(respuestaOrdenes())
    const { container } = render(<HistorialEstudios patientId={12} />)
    const vista = within(container)

    expect(await vista.findByText('Biometría hemática')).toBeInTheDocument()
    expect(vista.getByText('Revisada')).toBeInTheDocument() // estado de la orden
    expect(vista.getByText('Revisado')).toBeInTheDocument() // estado del resultado
    expect(vista.getByText(/Laboratorio Central/)).toBeInTheDocument()
    expect(vista.getByText(/Sin alteraciones/)).toBeInTheDocument()
    // Sólo una llamada: la página 0 de la fuente compartida trae órdenes y
    // resultados embebidos (sin N+1), con el total en X-Total-Count.
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(
      '/clinical-tracking/patient/12/orders',
      expect.objectContaining({ params: expect.objectContaining({ limit: 100 }) }),
    )
  })

  it('no vuelve a pedir la página 0 si la consulta ya la cargó', async () => {
    get.mockResolvedValue(respuestaOrdenes())
    // La consulta ya dejó la página 0 cargada en la fuente compartida.
    const { unmount } = renderHook(() => useHistorialDeOrdenes(12))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))

    const { container } = render(<HistorialEstudios patientId={12} />)
    const vista = within(container)
    expect(await vista.findByText('Biometría hemática')).toBeInTheDocument()
    // Montar la pestaña Estudios no agrega ninguna petición.
    expect(get).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('las páginas siguientes se siguen pidiendo al servidor', async () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ({
      ...respuestaOrdenes().data[0],
      id: i + 1,
      study_name: `Estudio ${i + 1}`,
    }))
    get.mockImplementation(
      async (ruta: string, config?: { params?: { skip?: number; limit?: number } }) => {
        if (ruta === '/clinical-tracking/patient/12/orders') {
          const skip = config?.params?.skip ?? 0
          const limit = config?.params?.limit ?? 25
          return {
            status: 200,
            headers: { 'x-total-count': '30' },
            data: muchas.slice(skip, skip + limit),
          }
        }
        throw new Error(`ruta inesperada ${ruta}`)
      },
    )
    const user = userEvent.setup()
    const { container } = render(<HistorialEstudios patientId={12} />)
    const vista = within(container)

    expect(await vista.findByText('30 órdenes')).toBeInTheDocument()
    await user.click(vista.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/clinical-tracking/patient/12/orders', {
        params: { skip: 25, limit: 25 },
      }),
    )
    expect(vista.getByText('Estudio 26')).toBeInTheDocument()
  })

  it('abre el archivo adjunto del resultado', async () => {
    get.mockResolvedValueOnce(respuestaOrdenes())
    get.mockResolvedValue({ status: 200, data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })
    URL.createObjectURL = vi.fn(() => 'blob:doc')
    URL.revokeObjectURL = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<HistorialEstudios patientId={12} />)
    const vista = within(container)

    await user.click(await vista.findByRole('button', { name: 'Ver bh.pdf' }))

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/documents/140/download', { responseType: 'blob' }),
    )
    // Se ve en el visor, no en otra pestaña (plan 26, D-2).
    await waitFor(() => expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull())
  })

  it('si la carga falla lo dice y no finge que no hay estudios', async () => {
    get.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }))
    const { container } = render(<HistorialEstudios patientId={12} />)
    const vista = within(container)

    expect(await vista.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(vista.queryByText(/no tiene órdenes de estudios/)).toBeNull()
  })

  it('sin órdenes lo dice con claridad', async () => {
    get.mockResolvedValue({ status: 200, headers: { 'x-total-count': '0' }, data: [] })
    const { container } = render(<HistorialEstudios patientId={12} />)
    const vista = within(container)

    expect(
      await vista.findByText('Esta paciente no tiene órdenes de estudios registradas.'),
    ).toBeInTheDocument()
  })
})
