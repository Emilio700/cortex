/**
 * Plantillas que precargan estudios en la orden agrupada (O-03).
 *
 * Lo que importa: la plantilla sólo precarga (no crea nada), los estudios
 * quedan editables y, al confirmar, viajan con su código y su muestra.
 */
import { render, screen, waitFor } from '@testing-library/react'
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

const DETALLE = {
  clave: 'papanicolau_hpv',
  nombre: 'Papanicolau / HPV',
  descripcion: 'Citología cervical y HPV.',
  indicacion_sugerida: 'Tamizaje de cáncer cervicouterino.',
  estudios: [
    { category: 'gynecology', study_name: 'Citología cervicovaginal (Papanicolau)', catalog_code: null, specimen_or_body_site: 'Cérvix', preparation_instructions: 'No en menstruación' },
    { category: 'gynecology', study_name: 'Prueba de HPV', catalog_code: 'HPV', specimen_or_body_site: 'Cérvix', preparation_instructions: null },
  ],
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/clinical-tracking/order-templates') {
      return Promise.resolve({
        data: { version: 1, plantillas: [{ clave: 'papanicolau_hpv', nombre: 'Papanicolau / HPV', descripcion: '', num_estudios: 2 }] },
      })
    }
    if (url === '/clinical-tracking/order-templates/papanicolau_hpv') {
      return Promise.resolve({ data: DETALLE })
    }
    return Promise.resolve({ data: { fuente: 'x', grupos: [] } })
  })
})

describe('FormularioOrdenEstudios · plantillas (O-03)', () => {
  it('elegir una plantilla precarga sus estudios y la indicación, sin crear nada', async () => {
    const user = userEvent.setup()
    render(
      <FormularioOrdenEstudios patientId={12} appointmentId={345} pregnancyContext={{}} onCreated={vi.fn()} />,
    )

    await user.selectOptions(await screen.findByLabelText('Usar una plantilla (opcional)'), 'papanicolau_hpv')

    expect(await screen.findByText('Citología cervicovaginal (Papanicolau)')).toBeInTheDocument()
    expect(screen.getByText('Prueba de HPV')).toBeInTheDocument()
    expect(screen.getByText('Estudios en esta orden (2)')).toBeInTheDocument()
    // La indicación sugerida se copió; nada se creó todavía.
    expect(screen.getByLabelText('Indicación clínica')).toHaveValue('Tamizaje de cáncer cervicouterino.')
    expect(post).not.toHaveBeenCalled()
  })

  it('al confirmar, los estudios de la plantilla viajan con su código y muestra', async () => {
    post.mockResolvedValue({ data: { id: 9, orders: [{ id: 1, study_name: 'a', status: 'ordered' }, { id: 2, study_name: 'b', status: 'ordered' }] } })
    const user = userEvent.setup()
    render(
      <FormularioOrdenEstudios patientId={12} appointmentId={345} pregnancyContext={{}} onCreated={vi.fn()} />,
    )

    await user.selectOptions(await screen.findByLabelText('Usar una plantilla (opcional)'), 'papanicolau_hpv')
    await user.click(await screen.findByRole('button', { name: 'Crear orden con 2 estudios' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/clinical-tracking/order-groups', expect.anything()))
    const cuerpo = post.mock.calls[0][1]
    expect(cuerpo.studies).toHaveLength(2)
    expect(cuerpo.studies[1]).toMatchObject({ study_name: 'Prueba de HPV', catalog_code: 'HPV', specimen_or_body_site: 'Cérvix' })
    expect(cuerpo.clinical_indication).toBe('Tamizaje de cáncer cervicouterino.')
  })
})
