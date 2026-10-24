import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ClinicalConsentCard from './ClinicalConsentCard'

const get = vi.fn()
const post = vi.fn()

vi.mock('../../../shared/services/api', () => ({ apiClient: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }))
vi.mock('./SignatureCanvas', () => ({ default: () => <div data-testid="firma" /> }))
const visor = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('../../../shared/components/VisorDocumentos', () => ({
  default: (props: Record<string, unknown>) => {
    visor.props = props
    return null
  },
}))

const PLANTILLA = {
  consent_type: 'cervical_biopsy',
  title: 'Consentimiento para biopsia cervical',
  summary: 'Biopsia cervical y/o legrado endocervical para estudio diagnóstico o terapéutico.',
  acknowledgements: ['Recibí explicación clara.'],
  allows_photos: false,
  requires_pregnancy_test: false,
  allows_transfusion_choice: false,
}

const FIRMADO = {
  id: 7,
  patient_id: 1,
  consent_type: 'cervical_biopsy',
  template_version: '2026.08.07.1',
  status: 'signed' as const,
  title: PLANTILLA.title,
  rendered_body: 'Texto firmado',
  field_values: {},
  acknowledgements: PLANTILLA.acknowledgements,
  patient_signed_at: '2026-09-18T10:00:00',
  created_at: '2026-09-18T10:00:00',
}

const responder = (consents: unknown[] = []) => {
  get.mockImplementation((url: string) =>
    url.includes('/templates')
      ? Promise.resolve({ data: [PLANTILLA] })
      : Promise.resolve({ data: { items: consents, total: consents.length } }),
  )
}

const renderCard = () => render(<ClinicalConsentCard patientId={1} appointmentId={2} patientName="Ana López" />)
const interruptor = () => screen.getByRole('switch')
const areaTexto = () => screen.getByPlaceholderText(/Escribe aquí el texto|Selecciona un formato/)

describe('ClinicalConsentCard', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('carga el texto precargado al elegir el formato y lo deja editar', async () => {
    const user = userEvent.setup()
    responder()
    renderCard()

    await waitFor(() => expect(interruptor()).toBeChecked())
    await user.selectOptions(screen.getByRole('combobox'), 'cervical_biopsy')
    await waitFor(() => expect((areaTexto() as HTMLTextAreaElement).value).toContain('Biopsia cervical'))
    expect(screen.getByText('Usando texto precargado')).toBeInTheDocument()

    await user.type(areaTexto(), ' Aclaración del médico.')
    expect(screen.getByText(/ajustado por ti/)).toBeInTheDocument()
  })

  it('apagado el interruptor el área queda vacía para escribir', async () => {
    const user = userEvent.setup()
    responder()
    renderCard()

    await waitFor(() => expect(interruptor()).toBeChecked())
    await user.selectOptions(screen.getByRole('combobox'), 'cervical_biopsy')
    await user.click(interruptor())

    expect(interruptor()).not.toBeChecked()
    expect(areaTexto()).toHaveValue('')
    expect(screen.getByText('Texto libre')).toBeInTheDocument()
  })

  it('con texto libre envía lo que escribió el médico', async () => {
    const user = userEvent.setup()
    responder()
    post.mockResolvedValue({ data: { ...FIRMADO, status: 'draft', rendered_body: 'Mi propio texto' } })
    renderCard()

    await waitFor(() => expect(interruptor()).toBeChecked())
    await user.selectOptions(screen.getByRole('combobox'), 'cervical_biopsy')
    await user.click(interruptor())
    await user.type(areaTexto(), 'Mi propio texto')
    await user.click(screen.getByRole('button', { name: /Preparar para firma/ }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).toEqual(
      expect.objectContaining({ custom_body: 'Mi propio texto', use_template_body: false }),
    )
  })

  it('no deja cancelar un consentimiento firmado sin motivo', async () => {
    const user = userEvent.setup()
    responder([FIRMADO])
    renderCard()

    await waitFor(() => expect(screen.getByText('Firmado')).toBeInTheDocument())
    await user.click(screen.getByTitle('Cancelar con motivo'))

    const confirmar = screen.getByRole('button', { name: /Confirmar cancelación/ })
    expect(confirmar).toBeDisabled()
    await user.type(screen.getByPlaceholderText(/formato equivocado/), 'Se firmó el formato equivocado')
    expect(confirmar).toBeEnabled()

    post.mockResolvedValue({ data: {} })
    await user.click(confirmar)
    await waitFor(() => expect(post).toHaveBeenCalledWith('/clinical-consents/7/cancel', { reason: 'Se firmó el formato equivocado' }))
  })

  it('muestra el consentimiento cancelado en el historial con su motivo', async () => {
    responder([
      {
        ...FIRMADO,
        status: 'cancelled' as const,
        cancelled_reason: 'Se emitió al paciente equivocada',
        cancelled_at: '2026-09-19T09:00:00',
        cancelled_by_name: 'Médico de prueba',
      },
    ])
    renderCard()

    await waitFor(() => expect(screen.getByText('Cancelado')).toBeInTheDocument())
    expect(screen.getByText(/Se emitió al paciente equivocada/)).toBeInTheDocument()
    expect(screen.getByText(/Médico de prueba/)).toBeInTheDocument()
  })
})

describe('ClinicalConsentCard · ver el firmado (plan 29, lote 6)', () => {
  it('el consentimiento firmado se abre en el visor, que en el teléfono deja abrirlo o compartirlo', async () => {
    const user = userEvent.setup()
    responder([FIRMADO])
    renderCard()

    await user.click(await screen.findByRole('button', { name: 'Ver el consentimiento firmado' }))

    expect(visor.props?.visible).toBe(true)
    const [archivo] = visor.props?.archivos as { nombre: string; cargar: () => Promise<Blob> }[]
    expect(archivo.nombre).toBe('consentimiento-7.pdf')
    get.mockResolvedValueOnce({ data: new Blob(['%PDF']) })
    await archivo.cargar()
    expect(get).toHaveBeenLastCalledWith('/clinical-consents/7/download', { responseType: 'blob' })
  })
})
