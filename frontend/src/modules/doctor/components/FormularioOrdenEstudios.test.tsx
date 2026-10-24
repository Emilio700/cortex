/**
 * Alta de órdenes de estudios, suelta o agrupada (O-02).
 *
 * Lo que no puede pasar: decir «orden creada» cuando el servidor no la creó, o
 * mandar varios estudios como una sola orden suelta en lugar de agrupada.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get, post },
  default: { get, post },
}))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ can: () => true }),
}))

import FormularioOrdenEstudios from './FormularioOrdenEstudios'

const renderForm = (onCreated = vi.fn()) => {
  render(
    <FormularioOrdenEstudios
      patientId={12}
      appointmentId={345}
      pregnancyContext={{}}
      onCreated={onCreated}
    />,
  )
  return onCreated
}

/** Escribe un estudio a mano (sin depender del catálogo) y devuelve el input. */
const escribirEstudioAMano = async (user: ReturnType<typeof userEvent.setup>, nombre: string) => {
  await user.click(
    await screen.findByRole('button', {
      name: 'El estudio no está en el catálogo: escribirlo a mano',
    }),
  )
  const input = screen.getByPlaceholderText('Ej. Perfil tiroideo')
  await user.type(input, nombre)
  return input
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  // El catálogo carga vacío: se prueba con la ruta de «escribir a mano».
  get.mockResolvedValue({ data: { fuente: 'prueba', grupos: [] } })
})

describe('FormularioOrdenEstudios', () => {
  it('un solo estudio crea una orden suelta y avisa sólo tras el 201', async () => {
    post.mockResolvedValue({
      data: { id: 57, study_name: 'Perfil tiroideo', status: 'ordered' },
    })
    const user = userEvent.setup()
    const onCreated = renderForm()

    await user.type(screen.getByLabelText('Indicación clínica'), 'Sospecha de hipotiroidismo')
    await escribirEstudioAMano(user, 'Perfil tiroideo')

    // Antes de emitir no hay aviso de éxito.
    expect(screen.queryByText('Orden creada.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Crear orden' }))

    expect(await screen.findByText('Orden creada.')).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
    const [ruta, cuerpo] = post.mock.calls[0]
    expect(ruta).toBe('/clinical-tracking/orders')
    expect(cuerpo).toMatchObject({
      patient_id: 12,
      appointment_id: 345,
      clinical_indication: 'Sospecha de hipotiroidismo',
      study_name: 'Perfil tiroideo',
      priority: 'routine',
    })
    expect(onCreated).toHaveBeenCalled()
  })

  it('dos estudios crean una orden agrupada con la lista de estudios', async () => {
    post.mockResolvedValue({
      data: {
        id: 9,
        patient_id: 12,
        doctor_id: 4,
        clinical_indication: 'Perfil prenatal',
        requested_on: '2026-09-29',
        created_at: '2026-09-29T10:00:00',
        orders: [
          { id: 57, study_name: 'Biometría hemática', status: 'ordered' },
          { id: 58, study_name: 'Glucosa en ayuno', status: 'ordered' },
        ],
      },
    })
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Indicación clínica'), 'Perfil prenatal')
    await escribirEstudioAMano(user, 'Biometría hemática')
    // D-10: este estudio va antes que el resto del lote.
    await user.selectOptions(screen.getByLabelText('Prioridad de este estudio (opcional)'), 'urgent')
    await user.click(screen.getByRole('button', { name: 'Agregar otro estudio' }))
    // El primer estudio queda en la lista y el botón de crear ya cuenta dos.
    await escribirEstudioAMano(user, 'Glucosa en ayuno')

    await user.click(screen.getByRole('button', { name: 'Crear orden con 2 estudios' }))

    expect(await screen.findByText(/Orden agrupada creada con 2 estudios/)).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
    const [ruta, cuerpo] = post.mock.calls[0]
    expect(ruta).toBe('/clinical-tracking/order-groups')
    expect(cuerpo.studies).toHaveLength(2)
    expect(cuerpo.studies[0].study_name).toBe('Biometría hemática')
    expect(cuerpo.studies[1].study_name).toBe('Glucosa en ayuno')
    expect(cuerpo.studies[0].priority).toBe('urgent')
    // Sin prioridad propia no se manda: hereda la del lote.
    expect(cuerpo.studies[1]).not.toHaveProperty('priority')
    // Una sola acción de impresión: el papel del lote, sin un botón por estudio (C-3).
    expect(
      screen.getByRole('button', { name: 'Imprimir orden (2 estudios, 1 papel)' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Imprimir orden' })).toBeNull()
  })

  it('si el servidor rechaza, muestra su motivo y no dice que se creó', async () => {
    post.mockRejectedValue({
      response: { status: 422, data: { detail: 'El estudio «Perfil tiroideo» está repetido en la orden' } },
    })
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Indicación clínica'), 'Motivo')
    await escribirEstudioAMano(user, 'Perfil tiroideo')
    await user.click(screen.getByRole('button', { name: 'Crear orden' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El estudio «Perfil tiroideo» está repetido en la orden',
    )
    expect(screen.queryByText('Orden creada.')).toBeNull()
  })

  it('a las 23:30 de Mazatlán la orden lleva la fecha de hoy, no la de mañana', async () => {
    // Solo se congela `Date`: los temporizadores reales siguen para userEvent.
    // En UTC ya es el 4 de octubre; antes así se guardaba la orden (F-1).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 3, 23, 30))
    try {
      post.mockResolvedValue({ data: { id: 60, study_name: 'Glucosa', status: 'ordered' } })
      const user = userEvent.setup()
      renderForm()
      await user.type(screen.getByLabelText('Indicación clínica'), 'Control')
      await escribirEstudioAMano(user, 'Glucosa')
      await user.click(screen.getByRole('button', { name: 'Crear orden' }))
      await screen.findByText('Orden creada.')
      expect(post.mock.calls[0][1].requested_on).toBe('2026-10-03')
    } finally {
      vi.useRealTimers()
    }
  })

  it('quitar un estudio de la lista lo saca de la orden', async () => {
    const user = userEvent.setup()
    renderForm()

    await escribirEstudioAMano(user, 'Ultrasonido pélvico')
    await user.click(screen.getByRole('button', { name: 'Agregar otro estudio' }))

    const lista = screen.getByText('Estudios en esta orden (1)').parentElement as HTMLElement
    expect(within(lista).getByText('Ultrasonido pélvico')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Quitar Ultrasonido pélvico de la orden' }))

    await waitFor(() => expect(screen.queryByText('Estudios en esta orden (1)')).toBeNull())
  })
})

describe('FormularioOrdenEstudios · avisos junto al campo', () => {
  it('sin indicación clínica no se manda nada y el aviso sale junto al campo', async () => {
    const user = userEvent.setup()
    renderForm()
    await escribirEstudioAMano(user, 'Perfil tiroideo')

    await user.click(screen.getByRole('button', { name: 'Crear orden' }))

    expect(await screen.findByText('Escribe la indicación clínica.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Indicación clínica')).toHaveAttribute('aria-invalid', 'true')

    // El aviso se retira en cuanto se corrige el campo.
    await user.type(screen.getByLabelText('Indicación clínica'), 'Control')
    expect(screen.queryByText('Escribe la indicación clínica.')).toBeNull()

    post.mockResolvedValue({ data: { id: 57, study_name: 'Perfil tiroideo', status: 'ordered' } })
    await user.click(screen.getByRole('button', { name: 'Crear orden' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  })

  it('la selección a medias del selector dice qué falta y no se ignora en silencio', async () => {
    const user = userEvent.setup()
    renderForm()
    await escribirEstudioAMano(user, 'Perfil tiroideo')
    await user.click(screen.getByRole('button', { name: 'Agregar otro estudio' }))
    await user.type(screen.getByLabelText('Indicación clínica'), 'Control de tiroides')

    // Se abrió la captura a mano y se quedó vacía: antes el globo del navegador
    // bloqueaba el envío sin decir qué campo lo causaba.
    await user.click(
      screen.getByRole('button', { name: 'El estudio no está en el catálogo: escribirlo a mano' }),
    )
    await user.click(screen.getByRole('button', { name: 'Crear orden' }))

    expect(await screen.findByText('Escribe el estudio que necesitas.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    await user.type(screen.getByPlaceholderText('Ej. Perfil tiroideo'), 'Biometría hemática')
    expect(screen.queryByText('Escribe el estudio que necesitas.')).toBeNull()
  })

  it('la región que exige el estudio del catálogo se avisa junto al campo', async () => {
    get.mockImplementation((url: string) =>
      url === '/catalogo-estudios'
        ? Promise.resolve({
            data: {
              fuente: 'prueba',
              grupos: [
                {
                  clave: 'rx-rodilla',
                  nombre: 'Rayos X - Rodilla',
                  modalidad: 'RX',
                  estudios: ['Rodilla'],
                  requiere_region: true,
                  destacado: true,
                },
              ],
            },
          })
        : Promise.resolve({ data: { fuente: 'prueba', grupos: [] } }),
    )
    const user = userEvent.setup()
    renderForm()
    await escribirEstudioAMano(user, 'Perfil tiroideo')
    await user.click(screen.getByRole('button', { name: 'Agregar otro estudio' }))
    await user.type(screen.getByLabelText('Indicación clínica'), 'Control')

    // Elige un estudio que pide región y la deja vacía: antes bloqueaba el
    // envío (abajo hay una pista suave, pero el aviso no estaba junto al campo).
    await user.click(await screen.findByRole('button', { name: 'Rodilla' }))
    await user.click(screen.getByRole('button', { name: 'Crear orden' }))

    expect(
      await screen.findByText('Indica la región a estudiar.', { selector: '#error-selector-region' }),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    await user.type(screen.getByPlaceholderText('Ej. Pélvico, miembro inferior'), 'Miembro inferior')
    expect(
      screen.queryByText('Indica la región a estudiar.', { selector: '#error-selector-region' }),
    ).toBeNull()
  })
})
