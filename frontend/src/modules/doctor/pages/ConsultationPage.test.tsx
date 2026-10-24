import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ConsultationPage from './ConsultationPage'

/**
 * Cerrar una consulta es el momento en el que se pierde el trabajo: la nota vive
 * en el estado del formulario y el PATCH de estado no la lleva consigo. Estas
 * pruebas fijan el orden (primero la nota, luego el estado) y que nada se
 * anuncie como hecho si no ocurrió.
 */
const getAppointment = vi.fn()
const getTriageByAppointment = vi.fn()
const getSOAPNoteByAppointment = vi.fn()
const createSOAPNote = vi.fn()
const updateSOAPNote = vi.fn()
const getPatient = vi.fn()
const getAppointmentCertificates = vi.fn()
const getAppointmentPrescriptions = vi.fn()
// `patch`, `put` y `get` se usan dentro del factory del módulo de api, que corre
// al importarlo: necesitan existir antes, de ahí `vi.hoisted`.
const { patch, put, get, post } = vi.hoisted(() => ({
  patch: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}))
const permisos = { actuales: ['triage.create'] as string[] }
const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ appointmentId: '10' }) }
})

vi.mock('../hooks/useDoctorAppointments', () => ({
  useDoctorAppointments: () => ({ getAppointment }),
}))

vi.mock('../hooks/useTriage', () => ({
  useTriage: () => ({ getTriageByAppointment }),
}))

vi.mock('../hooks/useSOAPNotes', () => ({
  useSOAPNotes: () => ({
    loading: false,
    error: null,
    getSOAPNoteByAppointment,
    createSOAPNote,
    updateSOAPNote,
    // Lectura del historial completo del paciente (pestaña Historial).
    getPatientSOAPNotes: vi.fn().mockResolvedValue([]),
  }),
}))

vi.mock('../hooks/useCertificates', () => ({
  useCertificates: () => ({
    loading: false,
    error: null,
    getAppointmentCertificates,
    createCertificate: vi.fn(),
    updateCertificate: vi.fn(),
    downloadCertificatePDF: vi.fn(),
    sendCertificateEmail: vi.fn(),
    getPatientCertificates: vi.fn().mockResolvedValue([]),
  }),
}))

vi.mock('../hooks/usePrescriptions', () => ({
  usePrescriptions: () => ({
    loading: false,
    error: null,
    getAppointmentPrescriptions,
    createPrescription: vi.fn(),
    updatePrescription: vi.fn(),
    downloadPrescriptionPDF: vi.fn(),
    printPrescription: vi.fn(),
    previewPrescription: vi.fn(),
    sendPrescriptionEmail: vi.fn(),
    getPatientPrescriptions: vi.fn().mockResolvedValue([]),
  }),
}))

vi.mock('../hooks/useMedicamentosFrecuentes', () => ({
  useMedicamentosFrecuentes: () => ({ medicamentos: [], cargando: false }),
}))

const embarazo = vi.hoisted(() => ({ error: null as string | null, recargar: vi.fn() }))
vi.mock('../hooks/useEmbarazoActivo', () => ({
  useEmbarazoActivo: () => ({ resumen: null, error: embarazo.error, recargar: embarazo.recargar }),
}))

vi.mock('../../secretaria/hooks/usePatients', () => ({
  usePatients: () => ({ getPatient }),
}))

vi.mock('../../../shared/services/api', () => {
  const cliente = { patch, put, get, post, delete: vi.fn() }
  return { apiClient: cliente, default: cliente }
})

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ can: (accion: string) => permisos.actuales.includes(accion) }),
}))

// El visor del historial avisa por toast; sin proveedor, useToast lanza al
// renderizar.
vi.mock('../../../shared/components/ToastProvider', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

// Los paneles pesados de la consulta piden sus propios datos y no son el objeto
// de estas pruebas. El visor del historial médico sí se renderiza real (con sus
// lecturas simuladas arriba), porque la pestaña Historial se prueba con los dos
// paneles juntos.
vi.mock('../components/ClinicalPlanPanel', () => ({ default: () => null }))
vi.mock('../components/ClinicalConsentCard', () => ({ default: () => null }))
vi.mock('../components/ClinicalRecordPanel', () => ({ default: () => null }))
vi.mock('../components/ClinicalImagesPanel', () => ({ default: () => null }))
vi.mock('../components/PatientDocuments', () => ({ default: () => null }))

const cita = (status = 'programada') => ({
  id: 10,
  patient_id: 4,
  status,
  scheduled_at: '2026-09-23T10:00:00',
  patient: { first_name: 'Paola', last_name: 'Lizeth' },
})

// `getAppointment` ya no devuelve `Appointment | null`: clasifica el fallo para
// que la pantalla pueda decir cuál de las tres cosas pasó.
const citaCargada = (status = 'programada') => ({ estado: 'ok', dato: cita(status) })

const triageDePrueba = () => ({
  id: 3,
  appointment_id: 10,
  blood_pressure_systolic: 118,
  blood_pressure_diastolic: 76,
  temperature_celsius: 36.7,
  weight_kg: 64,
  bmi: 24.1,
  chief_complaint: 'DOLOR DE CABEZA',
})

const recetaDePrueba = (id: number, created_at: string) => ({
  id,
  appointment_id: 10,
  patient_id: 4,
  doctor_id: 3,
  tenant_id: 2,
  folio_number: `REC-2-2026-000${id}`,
  medications: [
    { name: `MEDICAMENTO ${id}`, dosage: '1 tableta', frequency: 'Cada 8 h', duration: '3 dias' },
  ],
  instructions: '',
  created_at,
  updated_at: created_at,
})

const notaDePrueba = () => ({
  id: 7,
  appointment_id: 10,
  subjective: 'DOLOR ABDOMINAL DE TRES DIAS',
  objective: 'ABDOMEN BLANDO',
  assessment: 'GASTRITIS',
  plan: 'DIETA Y CONTROL',
  diagnosis: 'GASTRITIS',
  updated_at: '2026-09-23T10:10:00',
})

const abrirConsulta = async () => {
  render(<ConsultationPage />)
  await screen.findByText('Notas de Consulta')
}

const finalizar = async (usuario: ReturnType<typeof userEvent.setup>) => {
  await usuario.click(screen.getByRole('button', { name: /Finalizar Consulta/ }))
  await usuario.click(await screen.findByRole('button', { name: /Confirmar y Finalizar/ }))
}

beforeEach(() => {
  getAppointment.mockReset().mockResolvedValue(citaCargada())
  // Cita sin signos vitales capturados: el endpoint contesta 204, que es
  // distinto de no haber podido leerlos.
  getTriageByAppointment.mockReset().mockResolvedValue({ estado: 'sin-registro' })
  // Consulta nueva: el servidor contesta 204 y los hooks lo traducen a
  // `sin-registro`, el único caso en que el formulario puede salir en blanco.
  getSOAPNoteByAppointment.mockReset().mockResolvedValue({ estado: 'sin-registro' })
  createSOAPNote.mockReset()
  updateSOAPNote.mockReset()
  getPatient.mockReset().mockResolvedValue(null)
  getAppointmentCertificates.mockReset().mockResolvedValue({ estado: 'ok', dato: [] })
  getAppointmentPrescriptions.mockReset().mockResolvedValue({ estado: 'ok', dato: [] })
  patch.mockReset().mockResolvedValue({ data: {} })
  put.mockReset()
  get.mockReset()
  post.mockReset()
  permisos.actuales = ['triage.create']
  navigate.mockReset()
})

describe('ConsultationPage · el botón de finalizar queda a la vista (U-07)', () => {
  it('la barra de «Finalizar Consulta» es sticky', async () => {
    await abrirConsulta()

    const boton = screen.getByRole('button', { name: /Finalizar Consulta/ })
    const tarjeta = boton.closest('[data-tour="consulta-finalizar"]') as HTMLElement
    expect(tarjeta).toHaveClass('position-sticky')
  })
})

describe('ConsultationPage · finalizar sin perder la nota', () => {
  it('guarda la nota ANTES de marcar la cita como atendida', async () => {
    const usuario = userEvent.setup()
    createSOAPNote.mockResolvedValue({ id: 1, appointment_id: 10 })
    await abrirConsulta()

    await usuario.type(screen.getByLabelText(/Síntomas \/ Motivo de consulta/), 'dolor')
    await finalizar(usuario)

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(createSOAPNote).toHaveBeenCalledTimes(1)
    expect(createSOAPNote.mock.invocationCallOrder[0]).toBeLessThan(
      patch.mock.invocationCallOrder[0],
    )
  })

  it('si la nota no se pudo guardar, NO cierra la consulta y lo dice', async () => {
    const usuario = userEvent.setup()
    createSOAPNote.mockResolvedValue(null)
    await abrirConsulta()

    await usuario.type(screen.getByLabelText(/Síntomas \/ Motivo de consulta/), 'dolor')
    await finalizar(usuario)

    expect(await screen.findByText(/No se pudo guardar la nota de consulta/)).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
    expect(screen.queryByText(/Consulta finalizada/)).not.toBeInTheDocument()
  })

  it('no inventa una nota vacia cuando no hay nada capturado', async () => {
    const usuario = userEvent.setup()
    await abrirConsulta()

    await finalizar(usuario)

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(createSOAPNote).not.toHaveBeenCalled()
  })
})

describe('ConsultationPage · el error de finalizar se ve', () => {
  it('muestra el error del PATCH y deja la consulta abierta', async () => {
    const usuario = userEvent.setup()
    patch.mockRejectedValue({ response: { data: { detail: 'La cita ya fue cobrada' } } })
    await abrirConsulta()

    await finalizar(usuario)

    expect(await screen.findByText('La cita ya fue cobrada')).toBeInTheDocument()
    expect(screen.queryByText(/Consulta finalizada/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar y Finalizar/ })).toBeInTheDocument()
  })
})

/**
 * Plan 23. El médico cobra muchas veces ella misma y recepción, sin saberlo,
 * volvía a cobrar. Al cerrar dice quién cobra, y eso viaja en el MISMO PATCH
 * que cierra la cita: el servidor aplica las dos cosas o ninguna.
 */
describe('ConsultationPage · quién cobra la consulta al finalizar', () => {
  const SERVICIOS = [
    { id: 3, name: 'CONSULTA GINECOLÓGICA', price: '800.00', is_active: true },
    { id: 4, name: 'ULTRASONIDO', price: '1200.00', is_active: true },
  ]

  const abrirModal = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.click(screen.getByRole('button', { name: /Finalizar Consulta/ }))
    await screen.findByRole('button', { name: /Confirmar y Finalizar/ })
  }

  const confirmar = (usuario: ReturnType<typeof userEvent.setup>) =>
    usuario.click(screen.getByRole('button', { name: /Confirmar y Finalizar/ }))

  const bloqueEnviado = (llamada = 0) => patch.mock.calls[llamada][1].cobro

  const capturarCobroConTarjeta = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.click(screen.getByRole('radio', { name: /Lo cobré yo/ }))
    await screen.findByRole('option', { name: /CONSULTA GINECOLÓGICA/ })
    await usuario.selectOptions(screen.getByLabelText('Servicio'), '3')
    await usuario.selectOptions(screen.getByLabelText('Método'), 'card')
    await usuario.type(screen.getByLabelText(/Referencia/), '4821')
  }

  beforeEach(() => {
    permisos.actuales = ['triage.create', 'payments.create']
    get.mockImplementation((url: string) =>
      url === '/services' ? Promise.resolve({ data: SERVICIOS }) : Promise.resolve({ data: [] }),
    )
  })

  it('por defecto lo cobra recepción, y así viaja en el PATCH', async () => {
    const usuario = userEvent.setup()
    patch.mockResolvedValue({ data: { status: 'atendida', estado_cobro: 'pendiente', cobro_resumen: [] } })
    await abrirConsulta()
    await abrirModal(usuario)

    expect(screen.getByRole('radio', { name: /Lo cobra recepción/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await confirmar(usuario)

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0][0]).toBe('/appointments/10/status')
    expect(patch.mock.calls[0][1]).toMatchObject({ status: 'atendida', cobro: { modo: 'recepcion' } })
    expect(await screen.findByText(/Queda pendiente de cobro en recepción/)).toBeInTheDocument()
  })

  it('"Lo cobré yo" precarga el precio del servicio y manda el cobro completo en el mismo PATCH', async () => {
    const usuario = userEvent.setup()
    patch.mockResolvedValue({
      data: {
        status: 'atendida',
        estado_cobro: 'cobrada',
        cobro_resumen: [
          { id: 50, amount: '800.00', method: 'card', received_by_name: 'CINTIA', paid_at: '2026-09-28T11:05:00' },
        ],
      },
    })
    await abrirConsulta()
    await abrirModal(usuario)

    await capturarCobroConTarjeta(usuario)
    expect(screen.getByLabelText('Monto cobrado')).toHaveValue(800)
    await confirmar(usuario)

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(bloqueEnviado()).toEqual({
      modo: 'cobrado',
      amount: '800.00',
      method: 'card',
      service_id: 3,
      referencia: '4821',
      client_request_id: expect.any(String),
    })
    expect(await screen.findByText(/Cobro registrado: \$800\.00 con tarjeta/)).toBeInTheDocument()
  })

  it('el precio precargado se puede corregir antes de cobrar', async () => {
    const usuario = userEvent.setup()
    await abrirConsulta()
    await abrirModal(usuario)

    await capturarCobroConTarjeta(usuario)
    await usuario.clear(screen.getByLabelText('Monto cobrado'))
    await usuario.type(screen.getByLabelText('Monto cobrado'), '650')
    await confirmar(usuario)

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(bloqueEnviado()).toMatchObject({ modo: 'cobrado', amount: '650.00' })
  })

  it('"Sin cargo" exige el motivo y lo manda en mayúsculas', async () => {
    const usuario = userEvent.setup()
    await abrirConsulta()
    await abrirModal(usuario)

    await usuario.click(screen.getByRole('radio', { name: /Sin cargo/ }))
    await confirmar(usuario)
    expect(await screen.findByText(/Escribe el motivo/)).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()

    await usuario.type(screen.getByLabelText(/Motivo de que no tenga cargo/), 'revisión incluida')
    await confirmar(usuario)

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(bloqueEnviado()).toEqual({ modo: 'sin_cargo', motivo: 'REVISIÓN INCLUIDA' })
  })

  it('"Lo cobré yo" sin monto no llega al servidor', async () => {
    const usuario = userEvent.setup()
    await abrirConsulta()
    await abrirModal(usuario)

    await usuario.click(screen.getByRole('radio', { name: /Lo cobré yo/ }))
    await confirmar(usuario)

    expect(await screen.findByText(/Escribe cuánto cobraste/)).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('si el servidor rechaza, la pantalla no dice ni "cobrado" ni "finalizada"', async () => {
    const usuario = userEvent.setup()
    patch.mockRejectedValue({ response: { status: 500, data: {} } })
    await abrirConsulta()
    await abrirModal(usuario)

    await capturarCobroConTarjeta(usuario)
    await confirmar(usuario)

    expect(await screen.findByText(/no se registró ningún cobro/)).toBeInTheDocument()
    expect(screen.queryByText(/Consulta finalizada/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cobro registrado/)).not.toBeInTheDocument()
    // Sigue abierta: se puede reintentar sin volver a capturar.
    expect(screen.getByLabelText('Monto cobrado')).toHaveValue(800)
  })

  it('el reintento reutiliza el mismo client_request_id', async () => {
    const usuario = userEvent.setup()
    // La primera respuesta se pierde en la red: el servidor pudo haber cobrado.
    patch
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ data: { status: 'atendida', estado_cobro: 'cobrada', cobro_resumen: [] } })
    await abrirConsulta()
    await abrirModal(usuario)

    await capturarCobroConTarjeta(usuario)
    await confirmar(usuario)
    await screen.findByText(/No se pudo finalizar la consulta/)
    await confirmar(usuario)

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2))
    const primero = bloqueEnviado(0).client_request_id
    expect(primero).toEqual(expect.any(String))
    expect(bloqueEnviado(1).client_request_id).toBe(primero)
  })

  it('si el servidor cierra sin confirmar el cobro, no se anuncia como cobrado', async () => {
    const usuario = userEvent.setup()
    // Un backend que ignora el bloque `cobro` contesta 200 sin estado de cobro.
    patch.mockResolvedValue({ data: { status: 'atendida' } })
    await abrirConsulta()
    await abrirModal(usuario)

    await capturarCobroConTarjeta(usuario)
    await confirmar(usuario)

    expect(await screen.findByText(/Consulta finalizada/)).toBeInTheDocument()
    expect(screen.queryByText(/Cobro registrado/)).not.toBeInTheDocument()
    expect(screen.getByText(/El sistema no confirmó el cobro/)).toBeInTheDocument()
  })

  it('el 409 de cobro doble se ve y la cita pasa a mostrarse cobrada', async () => {
    const usuario = userEvent.setup()
    patch.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          detail: 'Ya la cobró el Dr. Cintia a las 11:05: $800.00 con tarjeta.',
          cobro_existente: {
            id: 77,
            amount: '800.00',
            method: 'card',
            received_by_name: 'CINTIA',
            paid_at: '2026-09-28T11:05:00',
          },
        },
      },
    })
    await abrirConsulta()
    await abrirModal(usuario)
    await capturarCobroConTarjeta(usuario)
    await confirmar(usuario)

    expect(
      await screen.findByText('Ya la cobró el Dr. Cintia a las 11:05: $800.00 con tarjeta.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Consulta finalizada/)).not.toBeInTheDocument()
    // Ya no se le ofrece cobrar: cerrar ahora no cobra otra vez.
    expect(screen.getByText(/Esta consulta ya está cobrada/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Lo cobré yo/ })).not.toBeInTheDocument()

    patch.mockResolvedValueOnce({ data: { status: 'atendida', estado_cobro: 'cobrada' } })
    await confirmar(usuario)
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2))
    expect(patch.mock.calls[1][1]).not.toHaveProperty('cobro')
  })

  it('si eligió recepción pero recepción ya la cobró, dice que ya está cobrada y no "pendiente"', async () => {
    const usuario = userEvent.setup()
    patch.mockResolvedValue({
      data: {
        status: 'atendida',
        estado_cobro: 'cobrada',
        cobro_resumen: [
          { id: 60, amount: '800.00', method: 'cash', received_by_name: 'LUPITA', paid_at: '2026-09-28T11:05:00' },
        ],
      },
    })
    await abrirConsulta()
    await abrirModal(usuario)
    await confirmar(usuario)

    expect(await screen.findByText(/Ya la cobró LUPITA/)).toBeInTheDocument()
    expect(screen.getByText(/No hay que cobrarla otra vez/)).toBeInTheDocument()
    expect(screen.queryByText(/pendiente de cobro/)).not.toBeInTheDocument()
  })

  it('si el servidor no dice el estado del cobro, "Lo cobra recepción" tampoco se anuncia como pendiente', async () => {
    const usuario = userEvent.setup()
    patch.mockResolvedValue({ data: { status: 'atendida' } })
    await abrirConsulta()
    await abrirModal(usuario)
    await confirmar(usuario)

    expect(await screen.findByText(/El sistema no confirmó el cobro/)).toBeInTheDocument()
    expect(screen.queryByText(/pendiente de cobro/)).not.toBeInTheDocument()
  })

  it('al reabrir se relee el cobro: si recepción cobró entretanto, volver a cerrar ya no ofrece cobrar', async () => {
    const usuario = userEvent.setup()
    patch
      .mockResolvedValueOnce({ data: { status: 'atendida', estado_cobro: 'pendiente', cobro_resumen: [] } })
      .mockResolvedValueOnce({
        data: {
          status: 'en_sala',
          estado_cobro: 'cobrada',
          cobro_resumen: [
            { id: 61, amount: '800.00', method: 'cash', received_by_name: 'LUPITA', paid_at: '2026-09-28T11:05:00' },
          ],
        },
      })
    await abrirConsulta()
    await abrirModal(usuario)
    await confirmar(usuario)
    await screen.findByText(/Queda pendiente de cobro en recepción/)

    await usuario.click(await screen.findByRole('button', { name: 'Reabrir consulta' }))
    await usuario.click(await screen.findByRole('button', { name: /Confirmar y Reabrir/ }))
    await waitFor(() => expect(screen.queryByText(/Consulta finalizada/)).not.toBeInTheDocument())
    await abrirModal(usuario)

    expect(screen.getByText(/Esta consulta ya está cobrada/)).toBeInTheDocument()
    expect(screen.getByText(/Ya la cobró LUPITA/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Lo cobré yo/ })).not.toBeInTheDocument()
  })

  it('con "Lo cobré yo" no se pide nota para secretaría ni se manda', async () => {
    const usuario = userEvent.setup()
    patch.mockResolvedValue({ data: { status: 'atendida', estado_cobro: 'cobrada', cobro_resumen: [] } })
    await abrirConsulta()
    await abrirModal(usuario)
    await usuario.type(screen.getByLabelText(/Nota para secretaría/), 'cobrar solo 500')

    await capturarCobroConTarjeta(usuario)

    expect(screen.queryByLabelText(/Nota para secretaría/)).not.toBeInTheDocument()
    await confirmar(usuario)
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0][1].notes).toBeUndefined()
  })

  it('una cita ya cobrada (reapertura) no ofrece cobrar: muestra el cobro existente', async () => {
    const usuario = userEvent.setup()
    getAppointment.mockResolvedValue({
      estado: 'ok',
      dato: {
        ...cita('en_sala'),
        estado_cobro: 'cobrada',
        total_cobrado: '800.00',
        cobro_resumen: [
          { id: 50, amount: '800.00', method: 'cash', received_by_name: 'LUPITA', paid_at: '2026-09-28T11:05:00' },
        ],
      },
    })
    await abrirConsulta()
    await abrirModal(usuario)

    expect(screen.getByText(/Esta consulta ya está cobrada/)).toBeInTheDocument()
    expect(screen.getByText(/Ya la cobró LUPITA/)).toBeInTheDocument()
    // Dentro del cierre: el tipo de certificado, abajo en la consulta, también
    // es un grupo de radios.
    const cierre = screen.getByText(/Esta consulta ya está cobrada/).closest('.modal') as HTMLElement
    expect(within(cierre).queryByRole('radio')).not.toBeInTheDocument()

    await confirmar(usuario)
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0][1]).not.toHaveProperty('cobro')
  })

  it('sin el permiso payments.create no se ofrece "Lo cobré yo"', async () => {
    const usuario = userEvent.setup()
    permisos.actuales = ['triage.create']
    await abrirConsulta()
    await abrirModal(usuario)

    expect(screen.queryByRole('radio', { name: /Lo cobré yo/ })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Lo cobra recepción/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Sin cargo/ })).toBeInTheDocument()
  })
})

describe('ConsultationPage · recetas de la cita', () => {
  it('numera las recetas por orden de creacion aunque el endpoint las mande al reves', async () => {
    // El endpoint ordena created_at DESC: la más reciente llega primero.
    getAppointment.mockResolvedValue(citaCargada('atendida'))
    getAppointmentPrescriptions.mockResolvedValue({
      estado: 'ok',
      dato: [recetaDePrueba(2, '2026-09-23T10:05:00'), recetaDePrueba(1, '2026-09-23T10:00:00')],
    })
    await abrirConsulta()

    expect(await screen.findByText('Receta 1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Receta 2 de 2')).toBeInTheDocument()
    expect(screen.getByText(/REC-2-2026-0001/)).toBeInTheDocument()
    // Consulta cerrada: sólo lectura, sin editor de receta.
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })
})

/**
 * El caso que salió de producción: una lectura que falla se dibujaba igual que
 * una consulta nueva. El formulario en blanco invitaba a capturar de nuevo
 * encima de información que sí existía en la base.
 */
describe('ConsultationPage · una lectura fallida no se dibuja como formulario vacío', () => {
  it('sin registro (204): la nota sale en blanco y se puede capturar', async () => {
    await abrirConsulta()

    const sintomas = screen.getByLabelText(/Síntomas \/ Motivo de consulta/)
    expect(sintomas).toHaveValue('')
    expect(sintomas).toBeEnabled()
    expect(screen.queryByText('No se pudo cargar esta sección.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar Notas/ })).toBeInTheDocument()
  })

  it('error del servidor al leer la nota: banner visible y formulario bloqueado', async () => {
    getSOAPNoteByAppointment.mockResolvedValue({
      estado: 'error',
      mensaje: 'Ocurrió un error en el sistema. Si continúa, avisa al equipo de soporte.',
    })
    await abrirConsulta()

    expect(await screen.findByText('No se pudo cargar esta sección.')).toBeInTheDocument()
    expect(screen.getByText(/avisa al equipo de soporte/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Síntomas \/ Motivo de consulta/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Guardar Notas/ })).not.toBeInTheDocument()
    // Sin dato no hay nada que presumir de guardado.
    expect(screen.queryByText(/Guardada/)).not.toBeInTheDocument()
  })

  it('si el hook rechaza la promesa en vez de clasificarla, tampoco queda editable', async () => {
    getSOAPNoteByAppointment.mockRejectedValue({ response: { status: 500 } })
    await abrirConsulta()

    expect(await screen.findByText('No se pudo cargar esta sección.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Síntomas \/ Motivo de consulta/)).toBeDisabled()
  })

  it('si falla el triage, la nota de la consulta se sigue mostrando', async () => {
    getTriageByAppointment.mockRejectedValue(new Error('se cayó la red'))
    getSOAPNoteByAppointment.mockResolvedValue({ estado: 'ok', dato: notaDePrueba() })
    await abrirConsulta()

    await waitFor(() =>
      expect(screen.getByLabelText(/Síntomas \/ Motivo de consulta/)).toHaveValue(
        'DOLOR ABDOMINAL DE TRES DIAS',
      ),
    )
    expect(screen.getByText(/Guardada/)).toBeInTheDocument()
    expect(screen.queryByText('No se pudo cargar esta sección.')).not.toBeInTheDocument()
  })

  it('si falla la carga de recetas se ve el aviso, no una sección vacía', async () => {
    getAppointmentPrescriptions.mockResolvedValue({
      estado: 'error',
      mensaje: 'No tienes permiso para realizar esta acción.',
    })
    await abrirConsulta()

    expect(await screen.findByText('No se pudo cargar esta sección.')).toBeInTheDocument()
    expect(screen.getByText(/No tienes permiso/)).toBeInTheDocument()
    // Decir "no se emitió receta" cuando no pudimos leerlas sería mentir.
    expect(screen.queryByText(/No se emitio receta en esta consulta/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    // La receta caída no arrastra a la nota: esa sigue capturable.
    expect(screen.getByLabelText(/Síntomas \/ Motivo de consulta/)).toBeEnabled()
  })

  it('si fallan los certificados, la sección plegada lo avisa desde afuera', async () => {
    getAppointmentCertificates.mockResolvedValue({
      estado: 'error',
      mensaje: 'El sistema no está respondiendo. Intenta de nuevo en un momento.',
    })
    await abrirConsulta()

    // La sección arranca cerrada: el aviso tiene que verse sin abrirla.
    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument()
    expect(screen.queryByText(/emitido\(s\)/)).not.toBeInTheDocument()
  })
})

/**
 * A17. Los signos vitales no se capturan desde esta pantalla, así que una
 * lectura fallida no hace perder nada — pero se dibujaba idéntica a una cita a
 * la que nadie le tomó la presión, y esa es la misma mentira que costó una nota
 * de consulta en producción.
 */
describe('ConsultationPage · signos vitales que no se pudieron leer', () => {
  it('los pinta cuando sí llegaron', async () => {
    getTriageByAppointment.mockResolvedValue({ estado: 'ok', dato: triageDePrueba() })
    await abrirConsulta()

    expect(await screen.findByText(/118\/76/)).toBeInTheDocument()
    expect(screen.getByText(/36\.7/)).toBeInTheDocument()
    expect(
      screen.queryByText('No se pudieron cargar los signos vitales'),
    ).not.toBeInTheDocument()
  })

  it('si la lectura falla lo avisa, en vez de callar como si no hubiera triage', async () => {
    getTriageByAppointment.mockResolvedValue({
      estado: 'error',
      mensaje: 'Ocurrió un error en el sistema. Si continúa, avisa al equipo de soporte.',
    })
    await abrirConsulta()

    expect(
      await screen.findByText('No se pudieron cargar los signos vitales'),
    ).toBeInTheDocument()
    expect(screen.getByText(/avisa al equipo de soporte/)).toBeInTheDocument()
    // Ni números inventados ni números viejos: si no se leyeron, no se pintan.
    expect(screen.queryByText(/°C/)).not.toBeInTheDocument()
    expect(screen.queryByText(/kg/)).not.toBeInTheDocument()
  })

  it('sin registro (cita sin triage) no inventa un fallo que no hubo', async () => {
    await abrirConsulta()

    expect(
      screen.queryByText('No se pudieron cargar los signos vitales'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/°C/)).not.toBeInTheDocument()
  })
})

/**
 * A18. "No se encontró la cita o no tienes permisos" mezclaba tres cosas: que
 * la cita no existe, que es de otro médico y que no se pudo leer. Ante un 500
 * mandaba a buscar en la agenda una cita que está ahí.
 */
describe('ConsultationPage · por qué no se abrió la cita', () => {
  const abrirSinCita = async () => {
    render(<ConsultationPage />)
    await screen.findByRole('button', { name: /Volver al Dashboard/ })
  }

  it('un 500 dice que no se pudo cargar, no que la cita no existe', async () => {
    getAppointment.mockResolvedValue({
      estado: 'error',
      mensaje: 'Ocurrió un error en el sistema. Si continúa, avisa al equipo de soporte.',
    })
    await abrirSinCita()

    expect(screen.getByText(/No se pudo cargar la cita/)).toBeInTheDocument()
    expect(screen.getByText(/vuelve a intentarlo/)).toBeInTheDocument()
    expect(screen.queryByText(/No se encontró la cita/)).not.toBeInTheDocument()
    expect(screen.queryByText(/no tienes permisos/i)).not.toBeInTheDocument()
  })

  it('un 404 real sigue diciendo que no se encontró', async () => {
    getAppointment.mockResolvedValue({ estado: 'no-encontrada' })
    await abrirSinCita()

    expect(screen.getByText(/No se encontró la cita solicitada/)).toBeInTheDocument()
    expect(screen.queryByText(/No se pudo cargar la cita/)).not.toBeInTheDocument()
  })

  it('un 403 habla de permisos y de nada más', async () => {
    getAppointment.mockResolvedValue({
      estado: 'sin-permiso',
      mensaje: 'No tienes permiso para realizar esta acción.',
    })
    await abrirSinCita()

    expect(screen.getByText(/No tienes permiso/)).toBeInTheDocument()
    expect(screen.queryByText(/No se encontró la cita/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No se pudo cargar la cita/)).not.toBeInTheDocument()
  })

  it('si el hook revienta en vez de clasificar, tampoco afirma que no existe', async () => {
    getAppointment.mockRejectedValue({ response: { status: 500 } })
    await abrirSinCita()

    expect(screen.getByText(/No se pudo cargar la cita/)).toBeInTheDocument()
    expect(screen.queryByText(/No se encontró la cita/)).not.toBeInTheDocument()
  })
})

/**
 * Completar el expediente sin salir de la consulta.
 *
 * El caso que lo motivó: el médico abre la consulta, ve la edad en guion y
 * para capturar la fecha de nacimiento tenía que irse al perfil del paciente
 * —perdiendo la nota que llevaba escrita en esta pestaña—. Ahora se hace desde
 * el encabezado, y lo que se ve arriba tiene que quedar al día: mostrar el dato
 * viejo después de haberlo guardado es la misma mentira de siempre.
 */
describe('ConsultationPage · completar el expediente desde el encabezado', () => {
  const pacienteDePrueba = (extra: Record<string, unknown> = {}) => ({
    id: 4,
    tenant_id: 2,
    first_name: 'PAOLA',
    last_name: 'LIZETH',
    date_of_birth: null,
    phone: '',
    cell_phone: '',
    allergies: null,
    patient_type: 'OBSTETRICA',
    is_active: true,
    created_at: '2026-09-19T10:00:00',
    updated_at: '2026-09-19T10:00:00',
    ...extra,
  })

  /** Fecha de nacimiento de alguien que ya cumplió `anios`, calculada contra
   *  hoy para que la prueba no caduque el día del cumpleaños. */
  const naceHace = (anios: number) => {
    const hoy = new Date()
    const fecha = new Date(hoy.getFullYear() - anios, hoy.getMonth(), hoy.getDate() - 1)
    const mes = String(fecha.getMonth() + 1).padStart(2, '0')
    const dia = String(fecha.getDate()).padStart(2, '0')
    return {
      iso: `${fecha.getFullYear()}-${mes}-${dia}`,
      tecleada: `${dia}${mes}${fecha.getFullYear()}`,
    }
  }

  const abrirEditorDeDatos = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.click(
      await screen.findByRole('button', { name: 'Completar datos del paciente' }),
    )
    await screen.findByLabelText('Fecha de nacimiento')
    // CoreUI activa la trampa de foco al terminar la animación del modal y ahí
    // mueve el foco; teclear antes pierde caracteres.
    await waitFor(() => expect(document.querySelector('.modal.show')).not.toBeNull())
  }

  it('capturar la fecha de nacimiento hace que la edad deje de salir en guion', async () => {
    const usuario = userEvent.setup()
    const nacimiento = naceHace(30)
    getPatient.mockResolvedValue(pacienteDePrueba())
    put.mockResolvedValue({ data: pacienteDePrueba({ date_of_birth: nacimiento.iso }) })
    await abrirConsulta()

    // El hueco se ve: es lo que manda al médico a salirse de la consulta.
    expect(await screen.findByText('—')).toBeInTheDocument()

    await abrirEditorDeDatos(usuario)
    await usuario.type(screen.getByLabelText('Fecha de nacimiento'), nacimiento.tecleada)
    await usuario.click(screen.getByRole('button', { name: 'Guardar datos' }))

    expect(await screen.findByText('30 años')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(put).toHaveBeenCalledWith('/patients/4', { date_of_birth: nacimiento.iso })
  })

  it('tras guardar, el encabezado muestra el dato nuevo y no el viejo', async () => {
    const usuario = userEvent.setup()
    getPatient.mockResolvedValue(pacienteDePrueba({ allergies: 'NINGUNA CONOCIDA' }))
    put.mockResolvedValue({
      data: pacienteDePrueba({ allergies: 'PENICILINA', cell_phone: '5512345678' }),
    })
    await abrirConsulta()

    // Sale en el encabezado y, desde C-3, también junto a la receta.
    expect((await screen.findAllByText(/Alergias: NINGUNA CONOCIDA/)).length).toBeGreaterThan(0)

    await abrirEditorDeDatos(usuario)
    await usuario.clear(screen.getByLabelText('Alergias'))
    await usuario.type(screen.getByLabelText('Alergias'), 'penicilina')
    await usuario.type(screen.getByLabelText('Celular'), '5512345678')
    await usuario.click(screen.getByRole('button', { name: 'Guardar datos' }))

    expect((await screen.findAllByText(/Alergias: PENICILINA/)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/NINGUNA CONOCIDA/)).not.toBeInTheDocument()
    expect(screen.getByText('5512345678')).toBeInTheDocument()
  })

  it('si el guardado falla, el encabezado NO cambia y el error se ve', async () => {
    const usuario = userEvent.setup()
    getPatient.mockResolvedValue(pacienteDePrueba())
    put.mockRejectedValue({
      response: { status: 403, data: { detail: 'No tienes permiso para editar pacientes' } },
    })
    await abrirConsulta()
    await abrirEditorDeDatos(usuario)

    await usuario.type(screen.getByLabelText('Celular'), '5512345678')
    await usuario.click(screen.getByRole('button', { name: 'Guardar datos' }))

    expect(await screen.findByText(/No tienes permiso para editar pacientes/)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/Datos actualizados en el expediente/)).not.toBeInTheDocument()
  })

  it('la consulta cerrada no ofrece editar el expediente', async () => {
    getAppointment.mockResolvedValue(citaCargada('atendida'))
    getPatient.mockResolvedValue(pacienteDePrueba())
    await abrirConsulta()

    expect(
      screen.queryByRole('button', { name: 'Completar datos del paciente' }),
    ).not.toBeInTheDocument()
  })
})

/**
 * A14. Finalizar ahora guarda la nota solo, así que cerrar de más cuesta un
 * clic — y hasta hoy no había vuelta atrás: la consulta quedaba en sólo lectura
 * para siempre y la única salida era pedirle a soporte que moviera el estado en
 * la base. Reabrir es un acto, no un botón: se confirma, se ve si falla y la
 * pantalla refleja lo que de verdad quedó en el servidor.
 */
describe('ConsultationPage · reabrir una consulta cerrada por error', () => {
  const reabrir = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.click(await screen.findByRole('button', { name: 'Reabrir consulta' }))
    await usuario.click(await screen.findByRole('button', { name: /Confirmar y Reabrir/ }))
  }

  it('la consulta cerrada vuelve a ser editable sin recargar la página', async () => {
    const usuario = userEvent.setup()
    getAppointment.mockResolvedValue(citaCargada('atendida'))
    patch.mockResolvedValue({ data: { ...cita('en_sala') } })
    await abrirConsulta()

    expect(screen.getByLabelText(/Síntomas \/ Motivo de consulta/)).toBeDisabled()

    await reabrir(usuario)

    await waitFor(() =>
      expect(screen.getByLabelText(/Síntomas \/ Motivo de consulta/)).toBeEnabled(),
    )
    expect(patch).toHaveBeenCalledWith('/appointments/10/status', { status: 'en_sala' })
    expect(screen.queryByText(/vista de solo lectura/)).not.toBeInTheDocument()
    // Vuelve a haber por dónde cerrarla: si no, reabrir sería un callejón.
    expect(screen.getByRole('button', { name: /Finalizar Consulta/ })).toBeInTheDocument()
  })

  it('si el PATCH falla, se ve el error y la consulta NO se marca como reabierta', async () => {
    const usuario = userEvent.setup()
    getAppointment.mockResolvedValue(citaCargada('atendida'))
    patch.mockRejectedValue({
      response: { data: { detail: 'No tienes una relación asistencial activa con este paciente' } },
    })
    await abrirConsulta()

    await reabrir(usuario)

    expect(
      await screen.findByText('No tienes una relación asistencial activa con este paciente'),
    ).toBeInTheDocument()
    // Lo que no ocurrió no se dibuja: sigue cerrada y sin poder capturar.
    expect(screen.getByLabelText(/Síntomas \/ Motivo de consulta/)).toBeDisabled()
    expect(screen.getByText(/vista de solo lectura/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar y Reabrir/ })).toBeInTheDocument()
  })

  it('reabre la que se acaba de cerrar en esta misma pantalla', async () => {
    const usuario = userEvent.setup()
    await abrirConsulta()
    await finalizar(usuario)
    await screen.findByText(/Consulta finalizada/)

    await reabrir(usuario)

    await waitFor(() =>
      expect(screen.getByLabelText(/Síntomas \/ Motivo de consulta/)).toBeEnabled(),
    )
    // El anuncio de cierre tiene que irse con el cierre: dejarlo sería la
    // pantalla afirmando dos cosas contrarias a la vez.
    expect(screen.queryByText(/Consulta finalizada/)).not.toBeInTheDocument()
  })

  it('una cita cancelada no ofrece reabrirse: ésa se reagenda', async () => {
    getAppointment.mockResolvedValue(citaCargada('cancelada'))
    await abrirConsulta()

    expect(screen.queryByRole('button', { name: 'Reabrir consulta' })).not.toBeInTheDocument()
  })
})

/**
 * El 404 de triage se traducía a 204 dentro del hook: el navegador tapando una
 * inconsistencia del servidor. Ahora el contrato lo fija `triage.py` como el
 * resto del expediente, y estas pruebas usan el hook de verdad —no el doble de
 * las pruebas de arriba— para que quitar la traducción no se pueda deshacer sin
 * que algo se ponga rojo.
 */
/**
 * Muchas veces no hay asistente que pase al paciente por triage en la sala de
 * espera. El médico toma los signos al empezar la consulta, desde la consulta,
 * para que no se cierre sin presión ni peso en el expediente.
 */
describe('ConsultationPage · el médico registra los signos que no se tomaron', () => {
  const capturarPresion = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.click(await screen.findByRole('button', { name: 'Registrar signos vitales' }))
    await screen.findByPlaceholderText('Sistólica')
    // CoreUI mueve el foco al terminar la animación del modal; con la máquina
    // cargada (toda la suite a la vez) teclear antes perdía la diastólica.
    await waitFor(() => expect(document.querySelector('.modal.show')).not.toBeNull())
    await usuario.type(screen.getByPlaceholderText('Sistólica'), '118')
    await usuario.type(screen.getByPlaceholderText('Diastólica'), '76')
    await usuario.click(screen.getByRole('button', { name: 'Guardar Triage' }))
  }

  it('sin triage ofrece registrarlos y, al guardar, muestra lo que quedó en la base', async () => {
    const usuario = userEvent.setup()
    post.mockResolvedValue({ data: triageDePrueba() })
    await abrirConsulta()
    expect(screen.getByText('Sin signos vitales')).toBeInTheDocument()

    // Tras guardar se relee: lo que se pinta es lo que devolvió el servidor.
    getTriageByAppointment.mockResolvedValue({ estado: 'ok', dato: triageDePrueba() })
    await capturarPresion(usuario)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][0]).toBe('/triage')
    expect(post.mock.calls[0][1]).toMatchObject({
      appointment_id: 10,
      blood_pressure_systolic: 118,
      blood_pressure_diastolic: 76,
    })
    expect(await screen.findByText(/118\/76/)).toBeInTheDocument()
    expect(screen.queryByText('Sin signos vitales')).not.toBeInTheDocument()
  })

  it('si el guardado falla, el error se ve y la cita sigue sin signos', async () => {
    const usuario = userEvent.setup()
    post.mockRejectedValue({ response: { data: { detail: 'No se pudo guardar el triage.' } } })
    await abrirConsulta()

    await capturarPresion(usuario)

    expect(await screen.findByText('No se pudo guardar el triage.')).toBeInTheDocument()
    expect(getTriageByAppointment).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sin signos vitales')).toBeInTheDocument()
    expect(screen.queryByText(/118\/76/)).not.toBeInTheDocument()
  })

  it('si la relectura falla lo dice, en vez de volver a ofrecer capturarlos', async () => {
    const usuario = userEvent.setup()
    post.mockResolvedValue({ data: triageDePrueba() })
    await abrirConsulta()

    getTriageByAppointment.mockResolvedValue({ estado: 'error', mensaje: 'Sin conexión.' })
    await capturarPresion(usuario)

    expect(
      await screen.findByText('No se pudieron cargar los signos vitales'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Registrar signos vitales' }),
    ).not.toBeInTheDocument()
  })

  it('con signos ya tomados ofrece corregirlos sobre el mismo registro', async () => {
    const usuario = userEvent.setup()
    getTriageByAppointment.mockResolvedValue({ estado: 'ok', dato: triageDePrueba() })
    put.mockResolvedValue({ data: triageDePrueba() })
    await abrirConsulta()

    await usuario.click(await screen.findByRole('button', { name: 'Corregir signos vitales' }))
    expect(await screen.findByDisplayValue('118')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Guardar Triage' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0][0]).toBe('/triage/3')
    // Corregir no crea un segundo registro de la misma cita.
    expect(post).not.toHaveBeenCalled()
  })

  it('si la lectura falló no ofrece capturar: podrían ya existir', async () => {
    getTriageByAppointment.mockResolvedValue({ estado: 'error', mensaje: 'Sin conexión.' })
    await abrirConsulta()

    await screen.findByText('No se pudieron cargar los signos vitales')
    expect(
      screen.queryByRole('button', { name: 'Registrar signos vitales' }),
    ).not.toBeInTheDocument()
  })

  it('la consulta cerrada no ofrece capturar signos', async () => {
    getAppointment.mockResolvedValue(citaCargada('atendida'))
    await abrirConsulta()

    expect(
      screen.queryByRole('button', { name: 'Registrar signos vitales' }),
    ).not.toBeInTheDocument()
  })

  it('sin el permiso triage.create no aparece el botón', async () => {
    permisos.actuales = []
    await abrirConsulta()

    expect(
      screen.queryByRole('button', { name: 'Registrar signos vitales' }),
    ).not.toBeInTheDocument()
  })
})

describe('useTriage · el contrato lo fija el servidor, no el hook', () => {
  const hookReal = async () => {
    const modulo = await vi.importActual<typeof import('../hooks/useTriage')>('../hooks/useTriage')
    return renderHook(() => modulo.useTriage()).result
  }

  const leer = async (appointmentId = 10) => {
    const resultado = await hookReal()
    let cargado: unknown
    await act(async () => {
      cargado = await resultado.current.getTriageByAppointment(appointmentId)
    })
    return cargado
  }

  it('204 es "todavía no le toman los signos", no un fallo', async () => {
    get.mockResolvedValue({ status: 204, data: '' })

    expect(await leer()).toEqual({ estado: 'sin-registro' })
  })

  it('200 trae los signos vitales', async () => {
    get.mockResolvedValue({ status: 200, data: triageDePrueba() })

    expect(await leer()).toEqual({ estado: 'ok', dato: triageDePrueba() })
  })

  it('un 404 ya no se disfraza de "sin registro": esa cita no existe', async () => {
    get.mockRejectedValue({
      response: { status: 404, data: { detail: 'No se encontró la cita.' } },
    })

    expect(await leer()).toEqual({ estado: 'error', mensaje: 'No se encontró la cita.' })
  })

  it('un 403 tampoco: no tener acceso no es no tener triage', async () => {
    get.mockRejectedValue({ response: { status: 403, data: {} } })

    expect(await leer()).toEqual({
      estado: 'error',
      mensaje: 'No tienes permiso para realizar esta acción.',
    })
  })
})

describe('ConsultationPage · «En consulta» automático (plan 28, D-3)', () => {
  it('al abrir la consulta de una cita en sala avisa al servidor y pinta el estado que él contesta', async () => {
    getAppointment.mockResolvedValue(citaCargada('en_sala'))
    post.mockResolvedValue({ data: { appointment_id: 10, status: 'en_consulta', cambio: true, motivo: null } })

    await abrirConsulta()

    await waitFor(() => expect(post).toHaveBeenCalledWith('/appointments/10/iniciar-consulta'))
    expect(await screen.findByText('En Consulta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regresar a sala' })).toBeInTheDocument()
  })

  it('si el servidor no la cambió, no se anuncia «En consulta»', async () => {
    getAppointment.mockResolvedValue(citaCargada('en_sala'))
    // MASTER mirando, o una cita de otro día: el servidor la deja como estaba.
    post.mockResolvedValue({ data: { appointment_id: 10, status: 'en_sala', cambio: false, motivo: 'no_es_su_cita' } })

    await abrirConsulta()

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(screen.getByText('En Sala')).toBeInTheDocument()
    expect(screen.queryByText('En Consulta')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Regresar a sala' })).not.toBeInTheDocument()
  })

  it('si la llamada falla, la consulta se usa igual y el estado no cambia', async () => {
    getAppointment.mockResolvedValue(citaCargada('confirmada'))
    post.mockRejectedValue({ response: { status: 500, data: {} } })

    await abrirConsulta()

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Finalizar Consulta/ })).toBeEnabled()
  })

  it('una consulta ya atendida se relee sin tocar su estado', async () => {
    getAppointment.mockResolvedValue(citaCargada('atendida'))

    await abrirConsulta()

    expect(post).not.toHaveBeenCalled()
  })

  it('«Regresar a sala» la regresa con el estado que confirma el servidor', async () => {
    const usuario = userEvent.setup()
    getAppointment.mockResolvedValue(citaCargada('en_consulta'))
    patch.mockResolvedValue({ data: { status: 'en_sala' } })

    await abrirConsulta()
    await usuario.click(screen.getByRole('button', { name: 'Regresar a sala' }))

    expect(patch).toHaveBeenCalledWith('/appointments/10/status', { status: 'en_sala' })
    expect(await screen.findByText('En Sala')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Regresar a sala' })).not.toBeInTheDocument()
  })

  it('si «Regresar a sala» falla lo dice y la cita sigue en consulta', async () => {
    const usuario = userEvent.setup()
    getAppointment.mockResolvedValue(citaCargada('en_consulta'))
    patch.mockRejectedValue({ response: { status: 400, data: { detail: 'No se pudo.' } } })

    await abrirConsulta()
    await usuario.click(screen.getByRole('button', { name: 'Regresar a sala' }))

    expect(await screen.findByText('No se pudo.')).toBeInTheDocument()
    expect(screen.getByText('En Consulta')).toBeInTheDocument()
  })

  it('al reabrir una consulta cerrada vuelve a pedir «en consulta»', async () => {
    const usuario = userEvent.setup()
    getAppointment.mockResolvedValue(citaCargada('atendida'))
    patch.mockResolvedValue({ data: { status: 'en_sala' } })
    post.mockResolvedValue({ data: { appointment_id: 10, status: 'en_consulta', cambio: true, motivo: null } })

    render(<ConsultationPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Reabrir consulta' }))
    await usuario.click(await screen.findByRole('button', { name: /Confirmar y Reabrir/ }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/appointments/10/iniciar-consulta'))
    expect(await screen.findByText('En Consulta')).toBeInTheDocument()
  })
})

describe('ConsultationPage · salir sin atender una cita que no había llegado (plan 28, D-3)', () => {
  it('abierta desde «agendada», el botón dice «Salir sin atender» y la regresa a agendada', async () => {
    const usuario = userEvent.setup()
    getAppointment.mockResolvedValue(citaCargada('agendada'))
    post.mockResolvedValue({
      data: { appointment_id: 10, status: 'en_consulta', cambio: true, motivo: null, estado_antes_de_consulta: 'agendada' },
    })
    patch.mockResolvedValue({ data: { status: 'agendada', estado_antes_de_consulta: null } })

    await abrirConsulta()
    await usuario.click(await screen.findByRole('button', { name: 'Salir sin atender' }))

    expect(patch).toHaveBeenCalledWith('/appointments/10/status', { status: 'agendada' })
    expect(screen.queryByRole('button', { name: 'Regresar a sala' })).not.toBeInTheDocument()
    expect(await screen.findByText('Agendada')).toBeInTheDocument()
  })
})

describe('ConsultationPage · alergias (plan 29, C-1)', () => {
  const conAlergias = (allergies: string | null) => ({
    id: 4,
    first_name: 'PAOLA',
    last_name: 'LIZETH',
    date_of_birth: null,
    allergies,
  })

  it('si la ficha no se pudo leer lo dice, en vez de callar como si no hubiera alergias', async () => {
    getPatient.mockRejectedValue(new Error('El sistema no está respondiendo.'))
    await abrirConsulta()

    expect(await screen.findAllByText('No se pudieron leer las alergias del paciente.')).not.toHaveLength(0)
  })

  it('«Reintentar» vuelve a leer la ficha y, si sale, muestra las alergias', async () => {
    const usuario = userEvent.setup()
    getPatient.mockRejectedValueOnce(new Error('sin red')).mockResolvedValue(conAlergias('PENICILINA'))
    await abrirConsulta()

    const [reintentar] = await screen.findAllByRole('button', { name: 'Reintentar' })
    await usuario.click(reintentar)

    expect((await screen.findAllByText(/Alergias: PENICILINA/)).length).toBeGreaterThan(0)
    expect(screen.queryByText('No se pudieron leer las alergias del paciente.')).not.toBeInTheDocument()
  })

  it('con la ficha leída y alergias registradas, las muestra', async () => {
    getPatient.mockResolvedValue(conAlergias('SULFAS'))
    await abrirConsulta()

    expect((await screen.findAllByText(/Alergias: SULFAS/)).length).toBeGreaterThan(0)
  })
})

describe('ConsultationPage · alergias junto a la receta (plan 29, C-3)', () => {
  const receta = () => screen.getByText('Receta Médica').closest('[data-tour="consulta-receta"]') as HTMLElement

  it('la sección Receta repite las alergias registradas', async () => {
    getPatient.mockResolvedValue({ id: 4, first_name: 'PAOLA', last_name: 'LIZETH', allergies: 'PENICILINA' })
    await abrirConsulta()

    await waitFor(() => expect(receta()).toHaveTextContent('Alergias: PENICILINA'))
  })

  it('si no se pudo leer la ficha, la receta también lo dice', async () => {
    getPatient.mockRejectedValue(new Error('sin red'))
    await abrirConsulta()

    await waitFor(() => expect(receta()).toHaveTextContent('No se pudieron leer las alergias del paciente.'))
  })

  it('sin nada registrado dice eso, no que no tenga alergias', async () => {
    getPatient.mockResolvedValue({ id: 4, first_name: 'PAOLA', last_name: 'LIZETH', allergies: null })
    await abrirConsulta()

    await waitFor(() => expect(receta()).toHaveTextContent('Sin alergias registradas en el expediente.'))
  })
})

describe('ConsultationPage · embarazo que no se pudo consultar (plan 29, C-2)', () => {
  it('lo dice y deja reintentar, en vez de verse como un paciente sin embarazo', async () => {
    const usuario = userEvent.setup()
    embarazo.error = 'No se pudo consultar si el paciente tiene un embarazo activo.'
    try {
      await abrirConsulta()
      await usuario.click(await screen.findByRole('button', { name: /No se pudo consultar el embarazo/ }))
      expect(embarazo.recargar).toHaveBeenCalled()
    } finally {
      embarazo.error = null
    }
  })
})

describe('ConsultationPage · cambiar de pestaña no borra lo escrito (plan 29, lote 6)', () => {
  it('lo escrito en la nota sigue ahí al volver de otra pestaña', async () => {
    const usuario = userEvent.setup()
    await abrirConsulta()

    const sintomas = screen.getByLabelText(/Síntomas/) as HTMLTextAreaElement
    await usuario.type(sintomas, 'dolor de prueba')
    await usuario.click(screen.getByRole('tab', { name: /Expediente/ }))
    expect(screen.getByRole('tab', { name: /Expediente/ })).toHaveAttribute('aria-selected', 'true')
    await usuario.click(screen.getByRole('tab', { name: /Consulta/ }))

    expect((screen.getByLabelText(/Síntomas/) as HTMLTextAreaElement).value).toBe('DOLOR DE PRUEBA')
  })

  it('las pestañas son pestañas para el lector de pantalla y dicen su nombre', async () => {
    await abrirConsulta()

    expect(screen.getByRole('tablist', { name: 'Secciones de la consulta' })).toBeInTheDocument()
    // Estudios, Imágenes e Historial viven ahora dentro del expediente único,
    // que la consulta reutiliza (plan 32, punto 6).
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Consulta', 'Expediente'])
  })
})

describe('ConsultationPage · una sola historia en Expediente › Consultas (plan 29 y 32)', () => {
  it('con citas y sin notas, recetas ni certificados no dice que no haya registros', async () => {
    const usuario = userEvent.setup()
    permisos.actuales = ['soap_notes.read']
    // La cronología (PatientHistory) lee estas rutas del historial y la
    // ficha; el panel de documentos (MedicalHistoryViewer), el directorio.
    get.mockImplementation((url: string) => {
      if (url.endsWith('/history')) {
        return Promise.resolve({
          data: {
            patient_id: 4,
            patient_name: 'Paola Lizeth',
            history: [
              { appointment_id: 12, scheduled_at: '2026-09-01T10:00:00', status: 'atendida', prescriptions: [] },
            ],
          },
        })
      }
      if (url === '/patients/4/expediente') {
        return Promise.resolve({
          data: {
            patient_id: 4, nombre: 'Paola Lizeth', first_name: 'Paola', last_name: 'Lizeth',
            pestanas: ['resumen', 'consultas'], vista_clinica: true,
          },
        })
      }
      if (url === '/patients/4') {
        return Promise.resolve({
          data: { id: 4, first_name: 'Paola', last_name: 'Lizeth', date_of_birth: '1990-01-01' },
        })
      }
      return Promise.resolve({ data: [] })
    })
    await abrirConsulta()

    await usuario.click(screen.getByRole('tab', { name: /Expediente/ }))
    await usuario.click(await screen.findByRole('tab', { name: /Consultas/ }))

    // La cita existe y se ve en la misma pestaña…
    expect(await screen.findByText('Historial de Paola Lizeth')).toBeInTheDocument()
    expect(screen.getByText('1 cita(s)')).toBeInTheDocument()

    // …y el panel de abajo habla solo de notas, recetas y certificados: no
    // puede negar un historial que la cronología de arriba sí muestra (era el
    // defecto que motivó este lote).
    expect(screen.getByText('Notas, recetas y certificados')).toBeInTheDocument()
    expect(
      await screen.findByText('Este paciente no tiene notas, recetas ni certificados registrados.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No hay registros médicos previos/)).not.toBeInTheDocument()
  })
})
