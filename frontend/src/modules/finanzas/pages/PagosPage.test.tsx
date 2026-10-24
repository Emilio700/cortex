/**
 * Pagos en recepción (plan 23).
 *
 * La regla que manda: la secretaria no puede volver a cobrar, sin darse
 * cuenta, una consulta que ya cobró el médico. Y ninguna pantalla afirma un
 * pago que el servidor no confirmó.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PagosPage from './PagosPage'
import { ErrorDeCobro } from '../utils/cobro'
import { Role } from '../../../shared/types'
import { diaDelConsultorio } from '../../../shared/utils/date'
import { TabsProvider, useTabs } from '../../../shared/tabs/TabsContext'
import { TabKeyContext } from '../../../shared/tabs/cambiosSinGuardar'

const fetchPayments = vi.fn()
const createPayment = vi.fn()
const createConsultaExpress = vi.fn()
const anularPago = vi.fn()
const sendReceipt = vi.fn()
const apiGet = vi.fn()
const sesion = {
  user: { id: 20, role: 'secretaria' as Role, full_name: 'LUPITA' },
  permissions: ['payments.read', 'payments.create', 'payments.send_receipt'] as string[],
}

// Los dobles se declaran fuera del `vi.mock`: una fábrica que devuelve
// `vi.fn()` crea uno nuevo en cada render y no se puede asertar sobre él.
vi.mock('../hooks/useFinanzas', () => ({
  useFinanzas: () => ({
    fetchPayments,
    createPayment,
    createConsultaExpress,
    anularPago,
    sendReceipt,
    loading: false,
  }),
}))

// El diálogo de impresión no existe en jsdom: se espía quién pidió imprimir y con qué.
const imprimirComprobante = vi.hoisted(() => vi.fn())
vi.mock('../utils/comprobante', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/comprobante')>()),
  imprimirComprobante,
}))

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get: (...args: unknown[]) => apiGet(...args) },
}))

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({
    user: sesion.user,
    permissions: sesion.permissions,
    can: (accion: string) => sesion.permissions.includes(accion),
  }),
}))

const CITAS_ATENDIDAS = [
  {
    id: 11,
    patient_id: 101,
    scheduled_at: '2026-09-24T09:00:00',
    patient: { first_name: 'ANA', last_name: 'LÓPEZ' },
    estado_cobro: 'pendiente',
  },
  {
    id: 12,
    patient_id: 102,
    scheduled_at: '2026-09-24T10:00:00',
    patient: { first_name: 'ROSA', last_name: 'DÍAZ' },
    estado_cobro: 'pendiente',
  },
  {
    id: 13,
    patient_id: 103,
    scheduled_at: '2026-09-24T11:00:00',
    patient: { first_name: 'EVA', last_name: 'RUIZ' },
    estado_cobro: 'cobrada',
    cobro_resumen: [
      { id: 90, amount: '800.00', method: 'card', received_by_name: 'DRA. CINTIA', paid_at: '2026-09-24T11:05:00' },
    ],
  },
  {
    id: 14,
    patient_id: 104,
    scheduled_at: '2026-09-24T12:00:00',
    patient: { first_name: 'LUZ', last_name: 'MORA' },
    estado_cobro: 'sin_cargo',
    cobro_sin_cargo_motivo: 'REVISIÓN INCLUIDA',
  },
]

const SERVICIOS = [{ id: 3, name: 'CONSULTA GINECOLÓGICA', price: '800.00', is_active: true }]
const MÉDICOS = [
  { id: 7, full_name: 'CINTIA MORALES', role: 'doctor' },
  { id: 8, full_name: 'KARLA PÉREZ', role: 'doctor' },
]

const pagoDePrueba = (extra: Record<string, unknown> = {}) => ({
  id: 500,
  tenant_id: 1,
  patient_id: 101,
  patient_name: 'ANA LÓPEZ',
  received_by_user_id: 20,
  received_by_name: 'LUPITA',
  doctor_id: 7,
  doctor_name: 'CINTIA MORALES',
  amount: '800.00',
  method: 'cash',
  status: 'vigente',
  referencia: null,
  paid_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  ...extra,
})

const botonDeCita = (nombre: string) =>
  screen.getByText(nombre).closest('button') as HTMLButtonElement

describe('PagosPage', () => {
  beforeEach(() => {
    sesion.user = { id: 20, role: 'secretaria' as Role, full_name: 'LUPITA' }
    sesion.permissions = ['payments.read', 'payments.create', 'payments.send_receipt']
    fetchPayments.mockReset().mockResolvedValue([])
    createPayment.mockReset().mockResolvedValue(pagoDePrueba())
    createConsultaExpress.mockReset().mockResolvedValue(pagoDePrueba({ appointment_id: 77 }))
    anularPago.mockReset()
    sendReceipt.mockReset()
    apiGet.mockReset().mockImplementation((url: string) => {
      if (url === '/appointments') return Promise.resolve({ data: CITAS_ATENDIDAS })
      if (url === '/services') return Promise.resolve({ data: SERVICIOS })
      if (url === '/users/directory') return Promise.resolve({ data: MÉDICOS })
      return Promise.resolve({ data: [] })
    })
  })

  // El encabezado y el estado vacío ofrecen ambos «Registrar pago» (U-03/U-04);
  // se abre el alta desde el botón del encabezado, identificado por su data-tour.
  const abrirAltaDesdeEncabezado = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(document.querySelector('[data-tour="pagos-registrar"]') as HTMLElement)

  const abrirModalDePago = async () => {
    const user = userEvent.setup()
    render(<PagosPage />)
    await abrirAltaDesdeEncabezado(user)
    await waitFor(() => expect(screen.getByText('ANA LÓPEZ')).toBeInTheDocument())
    // CoreUI mueve el foco al terminar la animación; teclear antes pierde letras.
    await waitFor(() => expect(document.querySelector('.modal.show')).not.toBeNull())
    return user
  }

  const registrar = (user: ReturnType<typeof userEvent.setup>) => {
    // Se acota al modal abierto: con la lista vacía, el estado vacío del
    // historial también ofrece «Registrar pago» (U-03), y sin acotar habría dos.
    const modal = document.querySelector('.modal.show') as HTMLElement
    return user.click(
      within(modal).getByRole('button', {
        name: /^Registrar (pago|cobro adicional|consulta y pago)$/,
      }),
    )
  }

  describe('elegir la cita a cobrar', () => {
    it('al abrir el alta de pago ninguna cita aparece elegida', async () => {
      await abrirModalDePago()

      expect(botonDeCita('ANA LÓPEZ')).toHaveAttribute('aria-pressed', 'false')
      expect(botonDeCita('ROSA DÍAZ')).toHaveAttribute('aria-pressed', 'false')
    })

    it('anuncia como elegida la cita a la que se le va a cobrar, y sólo esa', async () => {
      const user = await abrirModalDePago()

      await user.click(botonDeCita('ANA LÓPEZ'))

      expect(botonDeCita('ANA LÓPEZ')).toHaveAttribute('aria-pressed', 'true')
      expect(botonDeCita('ROSA DÍAZ')).toHaveAttribute('aria-pressed', 'false')
    })

    it('al cambiar de cita el elegido se mueve, no se acumula', async () => {
      const user = await abrirModalDePago()

      await user.click(botonDeCita('ANA LÓPEZ'))
      await user.click(botonDeCita('ROSA DÍAZ'))

      expect(botonDeCita('ROSA DÍAZ')).toHaveAttribute('aria-pressed', 'true')
      expect(botonDeCita('ANA LÓPEZ')).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('cobro anticipado: la cita en sala también se cobra', () => {
    const EN_SALA = {
      id: 21,
      patient_id: 121,
      scheduled_at: '2026-09-24T13:00:00',
      status: 'en_sala',
      patient: { first_name: 'SOFÍA', last_name: 'VEGA' },
      estado_cobro: 'pendiente',
    }

    const EN_CONSULTA = {
      ...EN_SALA,
      id: 22,
      patient_id: 122,
      status: 'en_consulta',
      patient: { first_name: 'INÉS', last_name: 'PAZ' },
    }
    const enConsulta = { citas: [] as (typeof EN_CONSULTA)[] }

    beforeEach(() => {
      enConsulta.citas = []
      apiGet.mockImplementation((url: string, config?: { params?: { status?: string } }) => {
        if (url === '/appointments') {
          const estado = config?.params?.status
          if (estado === 'en_consulta') return Promise.resolve({ data: enConsulta.citas })
          return Promise.resolve({ data: estado === 'en_sala' ? [EN_SALA] : CITAS_ATENDIDAS })
        }
        if (url === '/services') return Promise.resolve({ data: SERVICIOS })
        if (url === '/users/directory') return Promise.resolve({ data: MÉDICOS })
        return Promise.resolve({ data: [] })
      })
    })

    it('pide las citas en sala y las atendidas, y la de sala se puede cobrar', async () => {
      const user = await abrirModalDePago()

      const pedidos = apiGet.mock.calls
        .filter(([url]) => url === '/appointments')
        .map(([, config]) => (config as { params: { status: string } }).params.status)
      expect(pedidos.sort()).toEqual(['atendida', 'en_consulta', 'en_sala'])
      expect(screen.getByText('En sala')).toBeInTheDocument()

      await user.click(botonDeCita('SOFÍA VEGA'))
      expect(botonDeCita('SOFÍA VEGA')).toHaveAttribute('aria-pressed', 'true')
    })

    it('la cita en consulta también se cobra, y dice que todavía la atienden (plan 28)', async () => {
      enConsulta.citas = [EN_CONSULTA]
      const user = await abrirModalDePago()

      expect(screen.getByText('En consulta')).toBeInTheDocument()
      await user.click(botonDeCita('INÉS PAZ'))
      expect(botonDeCita('INÉS PAZ')).toHaveAttribute('aria-pressed', 'true')
    })

    it('lo pendiente va primero, aunque sea más tarde, y lo cobrado al fondo', async () => {
      await abrirModalDePago()

      const nombres = [...document.querySelectorAll('[data-tour="pago-citas"] button[aria-pressed] strong')].map(
        (n) => n.textContent,
      )
      expect(nombres).toEqual(['ANA LÓPEZ', 'ROSA DÍAZ', 'SOFÍA VEGA', 'LUZ MORA', 'EVA RUIZ'])
    })
  })

  describe('una cita ya cobrada no se vuelve a cobrar por descuido', () => {
    it('sale marcada con quién y cuánto, y bloqueada', async () => {
      await abrirModalDePago()

      expect(botonDeCita('EVA RUIZ')).toBeDisabled()
      expect(screen.getByText(/Ya la cobró DRA\. CINTIA a las .*: \$800\.00 con tarjeta/)).toBeInTheDocument()
    })

    it('el cobro adicional es una acción aparte que se confirma, y viaja marcado', async () => {
      const user = await abrirModalDePago()

      await user.click(screen.getByRole('button', { name: /Cobro adicional/ }))
      // Todavía no quedó elegida: falta confirmar.
      expect(botonDeCita('EVA RUIZ')).toHaveAttribute('aria-pressed', 'false')
      await user.click(screen.getByRole('button', { name: /Sí, es un cobro adicional/ }))
      await user.type(screen.getByLabelText(/Monto/), '300')
      await registrar(user)

      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1))
      expect(createPayment.mock.calls[0][0]).toMatchObject({
        appointment_id: 13,
        patient_id: 103,
        amount: '300.00',
        cobro_adicional: true,
      })
    })

    it('la que el médico marcó sin cargo también se bloquea, y cobrarla se confirma', async () => {
      const user = await abrirModalDePago()

      expect(botonDeCita('LUZ MORA')).toBeDisabled()
      expect(screen.getByText(/El médico la marcó sin cargo: REVISIÓN INCLUIDA/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Cobrar de todos modos/ }))
      await user.click(screen.getByRole('button', { name: /Sí, cobrarla/ }))
      // Es un cobro aparte de lo que decidió el médico, y el botón lo dice.
      expect(screen.getByRole('button', { name: 'Registrar cobro adicional' })).toBeInTheDocument()
      await user.type(screen.getByLabelText(/Monto/), '300')
      await registrar(user)

      // Sin la marca, el servidor la rechaza con 409 por estar exenta.
      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1))
      expect(createPayment.mock.calls[0][0]).toMatchObject({ appointment_id: 14, cobro_adicional: true })
    })

    it('un cobro normal no se manda como adicional', async () => {
      const user = await abrirModalDePago()

      await user.click(botonDeCita('ANA LÓPEZ'))
      await user.type(screen.getByLabelText(/Monto/), '800')
      await registrar(user)

      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1))
      expect(createPayment.mock.calls[0][0]).not.toHaveProperty('cobro_adicional')
    })

    it('el 409 del servidor se muestra tal cual y la cita pasa a verse cobrada', async () => {
      createPayment.mockRejectedValue(
        new ErrorDeCobro('Ya la cobró el Dr. Cintia a las 11:05: $800.00 con tarjeta.', 409, {
          ...pagoDePrueba({ id: 91, received_by_name: 'DRA. CINTIA', method: 'card', paid_at: '2026-09-24T11:05:00' }),
        } as any),
      )
      const user = await abrirModalDePago()

      await user.click(botonDeCita('ANA LÓPEZ'))
      await user.type(screen.getByLabelText(/Monto/), '800')
      await registrar(user)

      expect(
        await screen.findByText('Ya la cobró el Dr. Cintia a las 11:05: $800.00 con tarjeta.'),
      ).toBeInTheDocument()
      expect(botonDeCita('ANA LÓPEZ')).toBeDisabled()
      // Ni se cerró el modal ni se anunció un pago.
      expect(screen.queryByText(/Pago registrado/)).not.toBeInTheDocument()
    })
  })

  describe('errores junto al campo (validación local)', () => {
    it('con faltantes no se llama al API y cada aviso sale junto a su campo', async () => {
      const user = await abrirModalDePago()

      // Sin cita elegida: el aviso va bajo la lista de citas, y tampoco hay monto.
      await registrar(user)
      expect(await screen.findByText('Elige la cita que vas a cobrar.')).toBeInTheDocument()
      expect(createPayment).not.toHaveBeenCalled()

      // Al elegir la cita ese aviso se retira; el del monto sigue y el campo
      // queda marcado para quien usa lector de pantalla.
      await user.click(botonDeCita('ANA LÓPEZ'))
      expect(screen.queryByText('Elige la cita que vas a cobrar.')).not.toBeInTheDocument()
      await registrar(user)

      expect(await screen.findByText('Escribe el monto (mayor a cero).')).toBeInTheDocument()
      const monto = screen.getByLabelText(/Monto/)
      expect(monto).toHaveAttribute('aria-invalid', 'true')
      expect(monto).toHaveAttribute('aria-describedby', 'error-pago-monto')
      expect(document.getElementById('error-pago-monto')).toHaveTextContent('Escribe el monto (mayor a cero).')
      expect(createPayment).not.toHaveBeenCalled()
    })

    it('el aviso se retira al corregir el campo', async () => {
      const user = await abrirModalDePago()
      await user.click(botonDeCita('ANA LÓPEZ'))
      await registrar(user)
      expect(await screen.findByText('Escribe el monto (mayor a cero).')).toBeInTheDocument()

      await user.type(screen.getByLabelText(/Monto/), '500')

      expect(screen.queryByText('Escribe el monto (mayor a cero).')).not.toBeInTheDocument()
      expect(screen.getByLabelText(/Monto/)).not.toHaveAttribute('aria-invalid')

      await registrar(user)
      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1))
    })
  })

  describe('lo que se manda al servidor', () => {
    it('ya no manda un service_id fijo: sin servicio elegido no va ninguno', async () => {
      const user = await abrirModalDePago()

      await user.click(botonDeCita('ANA LÓPEZ'))
      await user.type(screen.getByLabelText(/Monto/), '500')
      await registrar(user)

      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1))
      expect(createPayment.mock.calls[0][0]).not.toHaveProperty('service_id')
    })

    it('elegir un servicio del catálogo precarga su precio y lo manda', async () => {
      const user = await abrirModalDePago()

      await user.click(botonDeCita('ANA LÓPEZ'))
      await screen.findByRole('option', { name: /CONSULTA GINECOLÓGICA/ })
      await user.selectOptions(screen.getByLabelText('Servicio'), '3')
      expect(screen.getByLabelText(/Monto/)).toHaveValue(800)
      await user.selectOptions(screen.getByLabelText('Método de pago'), 'card')
      await user.type(screen.getByLabelText(/Referencia/), 'a123')
      await registrar(user)

      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1))
      expect(createPayment.mock.calls[0][0]).toMatchObject({
        service_id: 3,
        amount: '800.00',
        method: 'card',
        referencia: 'A123',
      })
    })

    it('el reintento reutiliza el client_request_id; cambiar de cita estrena otro', async () => {
      createPayment
        .mockRejectedValueOnce(new ErrorDeCobro('Sin conexión.'))
        .mockRejectedValueOnce(new ErrorDeCobro('Sin conexión.'))
      const user = await abrirModalDePago()

      await user.click(botonDeCita('ANA LÓPEZ'))
      await user.type(screen.getByLabelText(/Monto/), '800')
      await registrar(user)
      await screen.findByText('Sin conexión.')
      await registrar(user)
      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(2))
      const primero = createPayment.mock.calls[0][0].client_request_id
      expect(primero).toEqual(expect.any(String))
      expect(createPayment.mock.calls[1][0].client_request_id).toBe(primero)

      await user.click(botonDeCita('ROSA DÍAZ'))
      await user.type(screen.getByLabelText(/Monto/), '800')
      await registrar(user)
      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(3))
      expect(createPayment.mock.calls[2][0].client_request_id).not.toBe(primero)
    })

    it('el aviso de éxito dice lo que devolvió el servidor', async () => {
      createPayment.mockResolvedValue(pagoDePrueba({ amount: '750.00', method: 'transfer' }))
      const user = await abrirModalDePago()

      await user.click(botonDeCita('ANA LÓPEZ'))
      await user.type(screen.getByLabelText(/Monto/), '800')
      await registrar(user)

      expect(
        await screen.findByText('Pago registrado: $750.00 con transferencia de ANA LÓPEZ.'),
      ).toBeInTheDocument()
    })
  })

  describe('cobro suelto (sin cita)', () => {
    const abrirSuelto = async (queSeCobra: 'Otro concepto' | 'Consulta sin cita (express)' | null = 'Otro concepto') => {
      const user = await abrirModalDePago()
      await user.click(screen.getByText(/Cobro suelto/))
      if (queSeCobra) await user.click(screen.getByRole('button', { name: queSeCobra }))
      apiGet.mockImplementation((url: string) =>
        url === '/patients'
          ? Promise.resolve({ data: [{ id: 300, first_name: 'SOFÍA', last_name: 'VEGA' }] })
          : Promise.resolve({ data: [] }),
      )
      await user.type(screen.getByPlaceholderText('Nombre del paciente'), 'sofia')
      await user.click(screen.getByRole('button', { name: 'Buscar' }))
      await user.click(await screen.findByRole('button', { name: 'SOFÍA VEGA' }))
      return user
    }

    it('la secretaria tiene que elegir el médico del ingreso, y se manda', async () => {
      const user = await abrirSuelto()
      await user.type(screen.getByLabelText(/Monto/), '1200')
      await user.type(screen.getByLabelText('Concepto'), 'ultrasonido')

      await registrar(user)
      expect(await screen.findByRole('alert')).toHaveTextContent(/Elige el médico/)
      expect(createPayment).not.toHaveBeenCalled()

      await user.selectOptions(screen.getByLabelText(/Médico a la que pertenece/), '8')
      await registrar(user)

      await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1))
      const enviado = createPayment.mock.calls[0][0]
      expect(enviado).toMatchObject({ patient_id: 300, doctor_id: 8, description: 'ULTRASONIDO' })
      expect(enviado).not.toHaveProperty('appointment_id')
    })

    it('la primera pregunta es qué se cobra, y sin contestarla no se registra', async () => {
      const user = await abrirSuelto(null)
      await user.selectOptions(screen.getByLabelText(/Médico a la que pertenece/), '7')
      await user.type(screen.getByLabelText(/Monto/), '500')

      await registrar(user)

      expect(await screen.findByRole('alert')).toHaveTextContent(/Contesta primero qué se cobra/)
      expect(createPayment).not.toHaveBeenCalled()
      expect(createConsultaExpress).not.toHaveBeenCalled()
    })

    it('la consulta express va a su propia operación, con el médico, y no como pago suelto', async () => {
      const user = await abrirSuelto('Consulta sin cita (express)')
      await user.selectOptions(screen.getByLabelText(/Médico a la que pertenece/), '8')
      await user.type(screen.getByLabelText(/Monto/), '500')

      await registrar(user)

      await waitFor(() => expect(createConsultaExpress).toHaveBeenCalledTimes(1))
      expect(createPayment).not.toHaveBeenCalled()
      const enviado = createConsultaExpress.mock.calls[0][0]
      expect(enviado).toMatchObject({ patient_id: 300, doctor_id: 8, amount: '500.00', description: 'CONSULTA EXPRESS' })
      expect(enviado.client_request_id).toBeTruthy()
      expect(enviado).not.toHaveProperty('confirmar_otra_consulta')
      expect(await screen.findByText(/La consulta express quedó en la agenda/)).toBeInTheDocument()
    })

    it('si el servidor no devolvió la cita, el aviso no dice que quedó en la agenda', async () => {
      createConsultaExpress.mockResolvedValue(pagoDePrueba({ appointment_id: null }))
      const user = await abrirSuelto('Consulta sin cita (express)')
      await user.selectOptions(screen.getByLabelText(/Médico a la que pertenece/), '8')
      await user.type(screen.getByLabelText(/Monto/), '500')

      await registrar(user)

      expect(await screen.findByText(/^Pago registrado/)).toBeInTheDocument()
      expect(screen.queryByText(/quedó en la agenda/)).not.toBeInTheDocument()
    })

    it('con una consulta de hoy pregunta si es otra, y sólo al confirmar la registra', async () => {
      createConsultaExpress.mockRejectedValueOnce(
        new ErrorDeCobro('Este paciente ya tiene una consulta hoy a las 10:00 con esa doctora, sin cobrar.', 409, undefined, {
          id: 55,
          scheduled_at: '2026-09-28T10:00:00',
          status: 'atendida',
          origen: 'agenda',
        }),
      )
      const user = await abrirSuelto('Consulta sin cita (express)')
      await user.selectOptions(screen.getByLabelText(/Médico a la que pertenece/), '8')
      await user.type(screen.getByLabelText(/Monto/), '500')

      await registrar(user)

      expect(await screen.findByRole('alert')).toHaveTextContent(/ya tiene una consulta hoy/)
      expect(screen.queryByText(/Pago registrado/)).not.toBeInTheDocument()
      const primerIntento = createConsultaExpress.mock.calls[0][0].client_request_id

      await user.click(screen.getByRole('button', { name: 'Sí, fue otra consulta: registrarla' }))

      await waitFor(() => expect(createConsultaExpress).toHaveBeenCalledTimes(2))
      const segundo = createConsultaExpress.mock.calls[1][0]
      expect(segundo.confirmar_otra_consulta).toBe(true)
      expect(segundo.client_request_id).toBe(primerIntento)
    })

    it('sin servicio ni concepto no se registra', async () => {
      const user = await abrirSuelto()
      await user.selectOptions(screen.getByLabelText(/Médico a la que pertenece/), '7')
      await user.type(screen.getByLabelText(/Monto/), '1200')

      await registrar(user)

      expect(await screen.findByRole('alert')).toHaveTextContent(/Elige un servicio o escribe el concepto/)
      expect(createPayment).not.toHaveBeenCalled()
    })
  })

  describe('alcance por rol', () => {
    it('la secretaria ve el selector de doctora en "Todas" y la lista no se filtra', async () => {
      render(<PagosPage />)

      const selector = await screen.findByLabelText('Médico')
      expect(selector).toHaveValue('')
      expect(within(selector).getByRole('option', { name: 'Todas los médicos' })).toBeInTheDocument()
      await waitFor(() => expect(fetchPayments).toHaveBeenCalled())
      expect(fetchPayments.mock.calls[0][0]).not.toHaveProperty('doctor_id')
    })

    it('filtrar por doctora y fechas se pide al servidor', async () => {
      const user = userEvent.setup()
      render(<PagosPage />)
      await screen.findByRole('option', { name: 'KARLA PÉREZ' })

      await user.selectOptions(screen.getByLabelText('Médico'), '8')
      await user.type(screen.getByLabelText('Desde'), '2026-09-01')

      await waitFor(() =>
        expect(fetchPayments).toHaveBeenLastCalledWith(
          expect.objectContaining({ doctor_id: 8, start_date: '2026-09-01' }),
        ),
      )
    })

    it('el médico ve "Mis cobros" y no ve selector de doctora', async () => {
      sesion.user = { id: 7, role: 'doctor' as Role, full_name: 'CINTIA MORALES' }
      sesion.permissions = ['payments.read', 'payments.create', 'payments.cashcut']
      render(<PagosPage />)

      expect(await screen.findByText('Mis cobros')).toBeInTheDocument()
      expect(screen.queryByLabelText('Médico')).not.toBeInTheDocument()
      expect(apiGet).not.toHaveBeenCalledWith('/users/directory', expect.anything())
    })

    it('en el cobro suelto el médico no elige doctora: el ingreso es suyo', async () => {
      sesion.user = { id: 7, role: Role.DOCTOR, full_name: 'CINTIA MORALES' }
      sesion.permissions = ['payments.read', 'payments.create']
      const user = userEvent.setup()
      render(<PagosPage />)
      await abrirAltaDesdeEncabezado(user)
      await user.click(await screen.findByText(/Cobro suelto/))

      expect(screen.queryByLabelText(/Médico a la que pertenece/)).not.toBeInTheDocument()
    })
  })

  describe('historial', () => {
    it('muestra doctora, quién recibió y referencia', async () => {
      fetchPayments.mockResolvedValue([pagoDePrueba({ method: 'card', referencia: '4821' })])
      render(<PagosPage />)

      expect(await screen.findByRole('cell', { name: 'CINTIA MORALES' })).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'LUPITA' })).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: '4821' })).toBeInTheDocument()
    })

    it('un pago anulado se ve tachado, con su motivo, y no se puede volver a anular', async () => {
      fetchPayments.mockResolvedValue([
        pagoDePrueba({ status: 'anulado', void_reason: 'MONTO CAPTURADO MAL' }),
      ])
      render(<PagosPage />)

      const monto = await screen.findByText('$800.00')
      expect(monto).toHaveStyle({ textDecoration: 'line-through' })
      expect(screen.getByText('Anulado')).toBeInTheDocument()
      expect(screen.getByText('MONTO CAPTURADO MAL')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Anular pago' })).not.toBeInTheDocument()
    })

    it('anular pide motivo y sólo se marca anulado cuando el servidor lo confirma', async () => {
      fetchPayments.mockResolvedValue([pagoDePrueba()])
      anularPago
        .mockRejectedValueOnce(new ErrorDeCobro('Sólo quien lo registró puede anularlo hoy.', 403))
        .mockResolvedValueOnce(pagoDePrueba({ status: 'anulado', void_reason: 'DUPLICADO' }))
      const user = userEvent.setup()
      render(<PagosPage />)

      await user.click(await screen.findByRole('button', { name: 'Anular pago' }))
      const dialogo = await screen.findByRole('dialog')
      // CoreUI mueve el foco al terminar la animación; teclear antes pierde letras.
      await waitFor(() => expect(document.querySelector('.modal.show')).not.toBeNull())
      await user.click(within(dialogo).getByRole('button', { name: 'Anular pago' }))
      expect(await within(dialogo).findByText(/Escribe el motivo/)).toBeInTheDocument()
      const motivo = within(dialogo).getByLabelText(/Motivo/)
      expect(motivo).toHaveAttribute('aria-invalid', 'true')
      expect(motivo).toHaveAttribute('aria-describedby', 'error-anular-motivo')
      expect(anularPago).not.toHaveBeenCalled()

      await user.type(motivo, 'duplicado')
      // El aviso se retira en cuanto el campo deja de estar vacío.
      expect(within(dialogo).queryByText(/Escribe el motivo/)).not.toBeInTheDocument()
      expect(motivo).not.toHaveAttribute('aria-invalid')

      await user.click(within(dialogo).getByRole('button', { name: 'Anular pago' }))
      expect(await within(dialogo).findByText('Sólo quien lo registró puede anularlo hoy.')).toBeInTheDocument()
      expect(screen.queryByText('Anulado')).not.toBeInTheDocument()

      await user.click(within(dialogo).getByRole('button', { name: 'Anular pago' }))
      expect(await screen.findByText('Anulado')).toBeInTheDocument()
      expect(anularPago).toHaveBeenLastCalledWith(500, 'DUPLICADO', { cancelarConsultaExpress: false })
    })

    const abrirAnular = async () => {
      const user = userEvent.setup()
      render(<PagosPage />)
      await user.click(await screen.findByRole('button', { name: 'Anular pago' }))
      const dialogo = await screen.findByRole('dialog')
      await waitFor(() => expect(document.querySelector('.modal.show')).not.toBeNull())
      return { user, dialogo }
    }

    it('anular una express ofrece cancelar su consulta, marcado, y lo anuncia sólo si el servidor lo hizo', async () => {
      sesion.permissions = [...sesion.permissions, 'appointments.cancel']
      fetchPayments.mockResolvedValue([pagoDePrueba({ appointment_id: 77, appointment_origen: 'express' })])
      anularPago.mockResolvedValueOnce(pagoDePrueba({ status: 'anulado', appointment_origen: 'express' }))
      const { user, dialogo } = await abrirAnular()

      const casilla = within(dialogo).getByLabelText('Cancelar también la consulta express registrada al cobrar')
      expect(casilla).toBeChecked()
      await user.type(within(dialogo).getByLabelText(/Motivo/), 'paciente equivocada')
      await user.click(within(dialogo).getByRole('button', { name: 'Anular pago' }))

      expect(await screen.findByText(/La consulta express quedó cancelada/)).toBeInTheDocument()
      expect(anularPago).toHaveBeenLastCalledWith(500, 'PACIENTE EQUIVOCADA', { cancelarConsultaExpress: true })
    })

    it('si la desmarca, sólo se anula el cobro y no se dice que se canceló nada', async () => {
      sesion.permissions = [...sesion.permissions, 'appointments.cancel']
      fetchPayments.mockResolvedValue([pagoDePrueba({ appointment_id: 77, appointment_origen: 'express' })])
      anularPago.mockResolvedValueOnce(pagoDePrueba({ status: 'anulado' }))
      const { user, dialogo } = await abrirAnular()

      await user.click(within(dialogo).getByLabelText(/Cancelar también la consulta express/))
      await user.type(within(dialogo).getByLabelText(/Motivo/), 'monto mal')
      await user.click(within(dialogo).getByRole('button', { name: 'Anular pago' }))

      expect(await screen.findByText(/^Pago anulado/)).toBeInTheDocument()
      expect(screen.queryByText(/consulta express quedó cancelada/)).not.toBeInTheDocument()
      expect(anularPago).toHaveBeenLastCalledWith(500, 'MONTO MAL', { cancelarConsultaExpress: false })
    })

    it('un cobro que no es express no ofrece cancelar nada', async () => {
      sesion.permissions = [...sesion.permissions, 'appointments.cancel']
      fetchPayments.mockResolvedValue([pagoDePrueba({ appointment_id: 12, appointment_origen: 'agenda' })])
      const { dialogo } = await abrirAnular()

      expect(within(dialogo).queryByLabelText(/Cancelar también la consulta express/)).not.toBeInTheDocument()
    })

    it('el botón del encabezado se llama «Registrar pago», igual que el alta (U-04)', async () => {
      fetchPayments.mockResolvedValue([{ ...pagoDePrueba() }])
      render(<PagosPage />)

      const encabezado = document.querySelector('[data-tour="pagos-registrar"]') as HTMLElement
      await waitFor(() => expect(encabezado).not.toBeNull())
      expect(encabezado).toHaveTextContent('Registrar pago')
      expect(encabezado).not.toHaveTextContent('Nuevo Pago')
    })

    it('con la lista vacía ofrece «Registrar pago» que abre el alta (U-03)', async () => {
      fetchPayments.mockResolvedValue([])
      const user = userEvent.setup()
      render(<PagosPage />)

      // El CTA del estado vacío, en la propia tabla (el encabezado también lo
      // ofrece; ambos abren el mismo alta).
      const celda = (await screen.findByText('No hay pagos registrados.')).closest('td') as HTMLElement
      await user.click(within(celda).getByRole('button', { name: 'Registrar pago' }))

      await waitFor(() => expect(screen.getByText('ANA LÓPEZ')).toBeInTheDocument())
    })

    it('si la lista no se pudo leer lo dice, en vez de "No hay pagos registrados"', async () => {
      fetchPayments.mockRejectedValue(new Error('No tienes permiso para realizar esta acción.'))
      render(<PagosPage />)

      expect(await screen.findByText(/No tienes permiso/)).toBeInTheDocument()
      expect(screen.queryByText('No hay pagos registrados.')).not.toBeInTheDocument()
    })
  })

  describe('comprobante imprimible', () => {
    const SUCURSAL = { id: 1, name: 'GEMS Centro', address: 'Av. Siempre Viva 12', phone: null, email: null, is_active: true, created_at: '2026-01-01' }

    beforeEach(() => {
      imprimirComprobante.mockReset()
    })

    it('«Imprimir comprobante» abre la impresión con el pago y los datos de su clínica', async () => {
      fetchPayments.mockResolvedValue([pagoDePrueba()])
      apiGet.mockImplementation((url: string) =>
        Promise.resolve({ data: url === '/tenants' ? [SUCURSAL] : [] }),
      )
      const user = userEvent.setup()
      render(<PagosPage />)

      await user.click(await screen.findByRole('button', { name: 'Imprimir comprobante' }))

      await waitFor(() => expect(imprimirComprobante).toHaveBeenCalledTimes(1))
      const [pago, clinica] = imprimirComprobante.mock.calls[0]
      expect(pago.id).toBe(500)
      expect(clinica.name).toBe('GEMS Centro')
      expect(await screen.findByText('Se abrió la impresión del comprobante.')).toBeInTheDocument()
    })

    it('si no se pueden leer los datos de la clínica no imprime ni dice que imprimió', async () => {
      fetchPayments.mockResolvedValue([pagoDePrueba()])
      apiGet.mockImplementation((url: string) =>
        url === '/tenants' ? Promise.reject(new Error('Network Error')) : Promise.resolve({ data: [] }),
      )
      const user = userEvent.setup()
      render(<PagosPage />)

      await user.click(await screen.findByRole('button', { name: 'Imprimir comprobante' }))

      expect(await screen.findByText(/No se imprimió el comprobante/)).toBeInTheDocument()
      expect(imprimirComprobante).not.toHaveBeenCalled()
      expect(screen.queryByText('Se abrió la impresión del comprobante.')).toBeNull()
    })

    it('un pago anulado no ofrece comprobante', async () => {
      fetchPayments.mockResolvedValue([pagoDePrueba({ status: 'anulado', void_reason: 'DUPLICADO' })])
      render(<PagosPage />)

      await screen.findByText('DUPLICADO')
      expect(screen.queryByRole('button', { name: 'Imprimir comprobante' })).toBeNull()
    })
  })

  describe('refresco al volver a la pestaña', () => {
    // La ruta de «Cobros» es la llave que TabsOutlet le da a la pestaña.
    const CLAVE = '/finanzas/pagos'
    let cambiarActiva: ((key: string) => void) | null = null

    /** Expone la activación de pestañas a la prueba, como hace `Espia` arriba. */
    function Mandos() {
      const tabs = useTabs()
      cambiarActiva = (key: string) => tabs.setActiveTab(key)
      return null
    }

    // Como en la app: la pestaña de pagos ya existe en la sesión (abierta en
    // otro momento) y el componente monta con la pestaña que toque al frente.
    const montarConPestanas = (activa: string) => {
      sessionStorage.setItem(
        'gems_tabs',
        JSON.stringify({
          tabs: [
            { key: CLAVE, path: CLAVE, title: 'Cobros' },
            { key: '/otra', path: '/otra', title: 'Otra' },
          ],
          activeTabKey: activa,
        }),
      )
      return render(
        <TabsProvider>
          <Mandos />
          <TabKeyContext.Provider value={CLAVE}>
            <PagosPage />
          </TabKeyContext.Provider>
        </TabsProvider>,
      )
    }

    beforeEach(() => {
      sessionStorage.clear()
      cambiarActiva = null
    })

    it('al activarse la pestaña vuelve a pedir los pagos', async () => {
      fetchPayments.mockResolvedValue([pagoDePrueba()])
      montarConPestanas('/otra')

      // Montada con otra pestaña al frente: el montaje pide los pagos una vez.
      await waitFor(() => expect(fetchPayments).toHaveBeenCalledTimes(1))

      // Volver a la pestaña es el aviso que debe refrescar la lista.
      act(() => cambiarActiva!(CLAVE))

      await waitFor(() => expect(fetchPayments).toHaveBeenCalledTimes(2))
    })

    it('mientras la pestaña está en el fondo no pide los pagos', async () => {
      fetchPayments.mockResolvedValue([])
      montarConPestanas(CLAVE)

      await waitFor(() => expect(fetchPayments).toHaveBeenCalledTimes(1))

      // Se va a otra pestaña y luego a una tercera: la de pagos sigue oculta
      // y no refresca en ningún momento.
      act(() => cambiarActiva!('/otra'))
      act(() => cambiarActiva!('/tercera'))
      await waitFor(() => expect(fetchPayments).toHaveBeenCalledTimes(1))
    })
  })

  describe('tope de la lista (revisión de flujos)', () => {
    it('al llegar al tope dice que son los más recientes del periodo, no un total', async () => {
      fetchPayments.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) => pagoDePrueba({ id: 700 + i })),
      )
      render(<PagosPage />)

      expect(await screen.findByText('Mostrando los 100 más recientes del periodo')).toBeInTheDocument()
      expect(screen.queryByText('100 pago(s)')).not.toBeInTheDocument()
      expect(fetchPayments).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
    })

    it('con búsqueda activa cuenta cuántos coinciden entre los traídos', async () => {
      fetchPayments.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) => pagoDePrueba({ id: 700 + i })),
      )
      const user = userEvent.setup()
      render(<PagosPage />)

      await screen.findByText('Mostrando los 100 más recientes del periodo')
      await user.type(screen.getByPlaceholderText('Buscar por paciente o concepto...'), 'ZZZ')

      expect(screen.getByText('0 de los 100 más recientes del periodo')).toBeInTheDocument()
    })

    it('con menos pagos el contador sigue siendo el total', async () => {
      fetchPayments.mockResolvedValue([pagoDePrueba(), pagoDePrueba({ id: 501 })])
      render(<PagosPage />)

      expect(await screen.findByText('2 pago(s)')).toBeInTheDocument()
    })
  })

  describe('anular: el día lo decide el consultorio, no el navegador (revisión de flujos)', () => {
    const ahora = Date.now()
    const hoyClinica = diaDelConsultorio(new Date(ahora))
    const ayerClinica = diaDelConsultorio(new Date(ahora - 86_400_000))

    it('un pago registrado hoy en la clínica se puede anular aunque traiga fecha de pago de ayer', async () => {
      fetchPayments.mockResolvedValue([
        pagoDePrueba({ created_at: `${hoyClinica}T12:00:00`, paid_at: `${ayerClinica}T12:00:00` }),
      ])
      render(<PagosPage />)

      expect(await screen.findByRole('button', { name: 'Anular pago' })).toBeInTheDocument()
    })

    it('un pago registrado ayer ya no se puede anular aunque su fecha de pago diga hoy', async () => {
      fetchPayments.mockResolvedValue([
        pagoDePrueba({ created_at: `${ayerClinica}T12:00:00`, paid_at: `${hoyClinica}T12:00:00` }),
      ])
      render(<PagosPage />)

      await screen.findByText('ANA LÓPEZ')
      expect(screen.queryByRole('button', { name: 'Anular pago' })).not.toBeInTheDocument()
    })
  })
})
