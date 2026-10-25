/**
 * Pestaña «Escalas» del expediente. Chart.js no se dibuja en jsdom: se cambia
 * por un doble que guarda lo que recibe.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const recibido = vi.hoisted(() => ({ props: null as any }))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get }, default: { get } }))
vi.mock('@coreui/react-chartjs', () => ({
  CChart: (props: any) => {
    recibido.props = props
    return <div data-testid="grafica" aria-label={props['aria-label']} />
  },
}))

import EvolucionEscalas from './EvolucionEscalas'

const odi = (id: number, puntaje: number, fecha: string, anulado_motivo: string | null = null) => ({
  id,
  patient_id: 3,
  appointment_id: null,
  doctor_id: 7,
  escala: 'oswestry',
  version_escala: '1',
  respuestas: {},
  puntaje,
  interpretacion: 'x',
  detalle: null,
  notas: null,
  aplicada_en: fecha,
  created_by_user_id: 7,
  created_at: fecha,
  anulado_at: anulado_motivo ? fecha : null,
  anulado_por_user_id: null,
  anulado_motivo,
  tono: 'neutral',
  avisos: [],
})

beforeEach(() => {
  get.mockReset()
  recibido.props = null
})

describe('Evolución de las escalas en el expediente', () => {
  it('ODI antes y después: grafica las vigentes y dice el cambio', async () => {
    get.mockResolvedValue({
      data: [
        odi(3, 20, '2026-10-01T10:00:00'),
        odi(2, 90, '2026-08-01T10:00:00', 'CAPTURA DUPLICADA'),
        odi(1, 52, '2026-06-01T10:00:00'),
      ],
    })
    render(<EvolucionEscalas patientId={3} />)
    expect(await screen.findByTestId('grafica')).toBeInTheDocument()
    expect(recibido.props.data.datasets[0].data).toEqual([52, 20])
    expect(recibido.props.options.scales.y).toMatchObject({ min: 0, max: 100 })
    expect(
      screen.getByText('−32 puntos porcentuales desde la primera aplicación (52 % → 20 %).'),
    ).toBeInTheDocument()
    // La anulada sigue en la tabla, con su motivo.
    expect(screen.getByText('Anulada: CAPTURA DUPLICADA')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/patients/3/escalas', { params: { escala: undefined, incluir_anuladas: true } })
  })

  it('sin escalas explica dónde se aplican', async () => {
    get.mockResolvedValue({ data: [] })
    render(<EvolucionEscalas patientId={3} />)
    expect(await screen.findByText(/Todavía no hay escalas aplicadas/)).toBeInTheDocument()
  })

  it('si no carga, lo dice y ofrece reintentar', async () => {
    get.mockRejectedValue({ response: { status: 500 } })
    render(<EvolucionEscalas patientId={3} />)
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
