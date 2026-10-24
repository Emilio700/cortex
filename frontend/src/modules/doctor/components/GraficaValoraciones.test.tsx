/**
 * Progreso de las valoraciones (plan 26, D-9).
 *
 * Chart.js no se puede dibujar en jsdom: se sustituye por un doble que guarda
 * lo que recibe, y se revisa eso y la tabla, que es lo que lee quien no ve el color.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const recibido = vi.hoisted(() => ({ props: null as any }))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))
vi.mock('@coreui/react-chartjs', () => ({
  CChart: (props: any) => {
    recibido.props = props
    return <div data-testid="grafica" aria-label={props['aria-label']} />
  },
}))

import GraficaValoraciones, { seriesPorEstudio } from './GraficaValoraciones'

const punto = (
  id: number,
  fecha: string,
  valoracion: string,
  estudio = 'Glucosa',
  codigo: string | null = 'GLU',
) => ({
  result_id: id,
  order_id: id,
  fecha,
  study_name: estudio,
  catalog_code: codigo,
  category: 'laboratory',
  valoracion,
})

beforeEach(() => {
  get.mockReset()
  recibido.props = null
})

describe('seriesPorEstudio', () => {
  it('agrupa por código del catálogo y ordena por fecha', () => {
    const series = seriesPorEstudio([
      punto(2, '2026-09-01', 'malo'),
      punto(1, '2026-06-01', 'regular'),
      punto(3, '2026-08-01', 'bien', 'USG obstétrico', null),
    ])
    expect(series[0].nombre).toBe('Glucosa')
    expect(series[0].puntos.map((p) => p.valoracion)).toEqual(['regular', 'malo'])
    expect(series[1].nombre).toBe('USG obstétrico')
  })
})

describe('GraficaValoraciones', () => {
  it('dibuja una línea por estudio con la valoración en el eje y la tabla equivalente', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          punto(1, '2026-06-01', 'regular'),
          punto(2, '2026-09-01', 'critico'),
          punto(3, '2026-09-01', 'excelente', 'TSH', 'TSH'),
        ],
      },
    })
    const user = userEvent.setup()
    render(<GraficaValoraciones patientId={12} />)

    await screen.findByTestId('grafica')
    expect(get).toHaveBeenCalledWith('/clinical-tracking/patient/12/valoraciones')
    const { datasets, labels } = recibido.props.data
    expect(labels).toHaveLength(2)
    expect(datasets.map((d: any) => d.label)).toEqual(['Glucosa', 'TSH'])
    expect(datasets[0].data).toEqual([3, 1])
    expect(datasets[1].data).toEqual([null, 5])
    // Cada estudio con su forma: la identidad no depende solo del color.
    expect(datasets[0].pointStyle).not.toBe(datasets[1].pointStyle)

    await user.click(screen.getByText('Ver como tabla'))
    const tabla = screen.getByRole('table')
    expect(within(tabla).getByText('Crítico')).toBeInTheDocument()
    expect(within(tabla).getByText('Excelente')).toBeInTheDocument()
  })

  it('sin valoraciones lo dice, sin gráfica vacía', async () => {
    get.mockResolvedValue({ data: { items: [] } })
    render(<GraficaValoraciones patientId={12} />)
    expect(await screen.findByText(/Todavía no hay resultados valorados/)).toBeInTheDocument()
    expect(screen.queryByTestId('grafica')).toBeNull()
  })

  it('si no carga lo dice y deja reintentar', async () => {
    get.mockRejectedValue({ message: 'Network Error', request: {} })
    render(<GraficaValoraciones patientId={12} />)
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('dos resultados del mismo estudio el mismo día se ven los dos (N10)', async () => {
    get.mockResolvedValue({
      data: { items: [punto(1, '2026-09-30', 'regular'), punto(2, '2026-09-30', 'bien')] },
    })
    render(<GraficaValoraciones patientId={12} />)
    await screen.findByTestId('grafica')
    expect(recibido.props.data.labels).toEqual(['30/09/26', '30/09/26 (2)'])
    expect(recibido.props.data.datasets[0].data).toEqual([3, 4])
  })

  it('en el celular se elige un estudio y la leyenda no se come la gráfica (N10)', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    try {
      get.mockResolvedValue({
        data: { items: [punto(1, '2026-06-01', 'regular'), punto(3, '2026-09-01', 'excelente', 'TSH', 'TSH')] },
      })
      const user = userEvent.setup()
      render(<GraficaValoraciones patientId={12} />)
      await screen.findByTestId('grafica')
      expect(recibido.props.data.datasets).toHaveLength(1)
      expect(recibido.props.options.plugins.legend.display).toBe(false)
      await user.selectOptions(screen.getByLabelText('Estudio'), 'TSH')
      expect(recibido.props.data.datasets[0].label).toBe('TSH')
    } finally {
      window.matchMedia = original
    }
  })
})
