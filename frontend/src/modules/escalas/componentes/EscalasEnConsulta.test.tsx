/**
 * La sección de escalas en la consulta.
 *
 * Lo que se comprueba es la regla del sistema: la pantalla sugiere, el
 * servidor decide, y nada dice «guardada» sin su respuesta.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
const permisos = vi.hoisted(() => ({ actual: ['clinical_scales.read', 'clinical_scales.write'] }))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, role: 'doctor' },
    can: (accion: string) => permisos.actual.includes(accion),
  }),
}))

import EscalasEnConsulta from './EscalasEnConsulta'

const guardada = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  patient_id: 3,
  appointment_id: 9,
  doctor_id: 7,
  escala: 'glasgow',
  version_escala: '1',
  respuestas: { ocular: '3', verbal: '4', motora: '5' },
  puntaje: 12,
  interpretacion: 'Moderado (9–12)',
  detalle: 'O3 V4 M5',
  notas: null,
  aplicada_en: '2026-10-24T18:00:00',
  created_by_user_id: 7,
  created_at: '2026-10-24T18:00:00',
  anulado_at: null,
  anulado_por_user_id: null,
  anulado_motivo: null,
  tono: 'aviso',
  avisos: [],
  ...extra,
})

const elegirGlasgow = async () => {
  const usuario = userEvent.setup()
  await waitFor(() => expect(get).toHaveBeenCalled())
  await usuario.selectOptions(screen.getByLabelText('¿Qué escala vas a aplicar?'), 'glasgow')
  return usuario
}

const responder = async (usuario: ReturnType<typeof userEvent.setup>) => {
  const grupo = (nombre: string) => screen.getByRole('radiogroup', { name: nombre })
  await usuario.click(within(grupo('Respuesta verbal (V)')).getByRole('radio', { name: /Confusa/ }))
  await usuario.click(within(grupo('Apertura ocular (O)')).getByRole('radio', { name: /Al sonido/ }))
  await usuario.click(within(grupo('Respuesta motora (M)')).getByRole('radio', { name: 'Localiza' }))
}

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: [] })
  post.mockReset()
  permisos.actual = ['clinical_scales.read', 'clinical_scales.write']
})

describe('Escalas neurológicas en la consulta', () => {
  it('sugiere el puntaje mientras se llena y no deja guardar incompleta', async () => {
    render(<EscalasEnConsulta patientId={3} appointmentId={9} />)
    const usuario = await elegirGlasgow()
    expect(screen.getByText('Faltan 3 ítems por responder.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar escala' })).toBeDisabled()
    await responder(usuario)
    const sugerido = screen.getByText('Puntaje sugerido').parentElement!
    expect(within(sugerido).getByText('12')).toBeInTheDocument()
    expect(within(sugerido).getByText('Moderado (9–12)')).toBeInTheDocument()
    expect(within(sugerido).getByText(/Teasdale G, Jennett B/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar escala' })).toBeEnabled()
  })

  it('manda respuestas y versión, nunca el puntaje, y anuncia lo que guardó el servidor', async () => {
    post.mockResolvedValue({ data: guardada() })
    const resumen = vi.fn()
    render(<EscalasEnConsulta patientId={3} appointmentId={9} onSummaryChange={resumen} />)
    const usuario = await elegirGlasgow()
    await responder(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Guardar escala' }))

    expect(post).toHaveBeenCalledWith('/patients/3/escalas', {
      escala: 'glasgow',
      version_escala: '1',
      respuestas: { ocular: '3', verbal: '4', motora: '5' },
      appointment_id: 9,
      notas: undefined,
    })
    expect(post.mock.calls[0][1]).not.toHaveProperty('puntaje')
    expect(await screen.findByText('Glasgow guardada: 12 · Moderado (9–12).')).toBeInTheDocument()
    // Formulario limpio para la siguiente aplicación, historial con la nueva.
    expect(screen.getByRole('button', { name: 'Guardar escala' })).toBeDisabled()
    expect(within(screen.getByRole('table')).getByText('O3 V4 M5')).toBeInTheDocument()
    expect(resumen).toHaveBeenLastCalledWith({ enConsulta: 1, total: 1 })
  })

  it('si el servidor calcula otro puntaje, lo dice en vez de esconderlo', async () => {
    post.mockResolvedValue({ data: guardada({ puntaje: 11, interpretacion: 'Moderado (9–12)' }) })
    render(<EscalasEnConsulta patientId={3} appointmentId={9} />)
    const usuario = await elegirGlasgow()
    await responder(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Guardar escala' }))
    expect(
      await screen.findByText(/El servidor calculó 11; la sugerencia de la pantalla era 12\./),
    ).toBeInTheDocument()
  })

  it('si falla el guardado no dice «guardada» y conserva las respuestas', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { detail: 'La escala Glasgow se actualizó mientras la llenabas.' } } })
    render(<EscalasEnConsulta patientId={3} appointmentId={9} />)
    const usuario = await elegirGlasgow()
    await responder(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Guardar escala' }))

    expect(await screen.findByText('La escala Glasgow se actualizó mientras la llenabas.')).toBeInTheDocument()
    expect(screen.queryByText(/guardada:/)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Confusa/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Guardar escala' })).toBeEnabled()
  })

  it('con la consulta cerrada solo enseña el historial', async () => {
    get.mockResolvedValue({ data: [guardada()] })
    render(<EscalasEnConsulta patientId={3} appointmentId={9} readOnly />)
    await elegirGlasgow()
    expect(screen.queryByRole('button', { name: 'Guardar escala' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
    expect(screen.getByText(/La consulta está cerrada/)).toBeInTheDocument()
    expect(screen.getByText('O3 V4 M5')).toBeInTheDocument()
  })

  it('anular pide motivo y solo marca anulada cuando el servidor confirma', async () => {
    get.mockResolvedValue({ data: [guardada()] })
    post.mockResolvedValue({
      data: guardada({ anulado_at: '2026-10-24T19:00:00', anulado_motivo: 'PACIENTE EQUIVOCADO' }),
    })
    render(<EscalasEnConsulta patientId={3} appointmentId={9} />)
    const usuario = await elegirGlasgow()
    await usuario.click(screen.getByRole('button', { name: 'Anular' }))
    // CModal toma el foco al terminar de abrir; se espera a eso antes de escribir.
    await waitFor(() => expect(document.activeElement).toHaveClass('modal'))
    const confirmar = screen.getByRole('button', { name: 'Anular escala' })
    expect(confirmar).toBeDisabled()
    await usuario.type(screen.getByLabelText('¿Por qué se anula?'), 'paciente equivocado')
    expect(screen.getByLabelText('¿Por qué se anula?')).toHaveValue('PACIENTE EQUIVOCADO')
    await usuario.click(confirmar)
    expect(post).toHaveBeenCalledWith('/patients/3/escalas/1/anular', { motivo: 'PACIENTE EQUIVOCADO' })
    expect(await screen.findByText('Anulada: PACIENTE EQUIVOCADO')).toBeInTheDocument()
  })

  it('un ítem por verificar se marca en pantalla', async () => {
    render(<EscalasEnConsulta patientId={3} />)
    const usuario = userEvent.setup()
    await waitFor(() => expect(get).toHaveBeenCalled())
    await usuario.selectOptions(screen.getByLabelText('¿Qué escala vas a aplicar?'), 'nihss')
    expect(screen.getAllByText('(verificar)').length).toBeGreaterThan(10)
  })
})
