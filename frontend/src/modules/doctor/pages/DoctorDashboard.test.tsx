/**
 * El inicio del médico (plan 28, Fase 2).
 *
 * Lo que no puede pasar: que una sección que falla tumbe a las demás, que un
 * error se vea como «0», que un refresco fallido borre lo que había sin avisar,
 * o que se ofrezca un botón que termina en 403.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({
  apiClient: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const permisos = vi.hoisted(() => ({ actuales: [] as string[] }))
const usuario = vi.hoisted(() => ({
  actual: { id: 3, full_name: 'Cintia Castro', tratamiento: 'Dra.', role: 'doctor', tenant_id: 2 } as Record<
    string,
    unknown
  >,
}))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({
    user: usuario.actual,
    can: (permiso: string) => permisos.actuales.includes(permiso),
    permissions: permisos.actuales,
  }),
}))
vi.mock('../../../shared/services/tenants', () => ({
  listTenants: () => Promise.resolve([{ id: 2, name: 'Sucursal Centro', is_active: true, created_at: '' }]),
  listMyClinics: () => Promise.resolve([]),
}))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

import DoctorDashboard from './DoctorDashboard'

const PERMISOS_DOCTORA = [
  'doctor.dashboard.read',
  'doctor.appointments.read',
  'appointments.read',
  'appointments.create',
  'patients.read',
  'clinical_tracking.read',
  'payments.read',
  'payments.create',
  'medical_history.read',
]

let id = 1
const cita = (status: string, hora: string, extra: Record<string, unknown> = {}) => ({
  id: id++,
  patient_id: id,
  doctor_id: 3,
  tenant_id: 2,
  scheduled_at: `2026-10-04T${hora}:00`,
  duration_minutes: 30,
  status,
  has_triage: false,
  created_at: '',
  updated_at: '',
  patient: { id, first_name: `PACIENTE${id}`, last_name: 'PRUEBA', date_of_birth: '1990-05-20' },
  ...extra,
})

type Respuesta = unknown | Error
let respuestas: Record<string, Respuesta>

/** Responde según la URL; un `Error` se rechaza. */
const responder = () =>
  get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    let clave = url
    if (url === '/appointments/my-appointments') {
      clave = params.status === 'atendida' ? 'recientes' : params.fecha_desde === params.fecha_hasta ? 'hoy' : 'mes'
    }
    const valor = respuestas[clave]
    if (valor instanceof Error) return Promise.reject(valor)
    return Promise.resolve({ data: valor ?? [] })
  })

const errorDeRed = () => Object.assign(new Error('Network Error'), { request: {} })

const CITAS_HOY = () => [
  cita('atendida', '08:00', { motivo_extra: 'CONTROL' }),
  cita('en_sala', '09:00', { has_triage: false, semanas_gestacion: 28, dias_gestacion: 3, motivo_extra: 'CONTROL PRENATAL' }),
  cita('agendada', '10:00'),
  cita('cancelada', '11:00'),
]

const montar = () =>
  render(
    <MemoryRouter>
      <DoctorDashboard />
    </MemoryRouter>,
  )

const indicador = (nombre: RegExp) => screen.getByRole('button', { name: nombre })

/** Una cita de la agenda de hoy (el botón «Siguiente paciente» también dice el nombre). */
const filaDeAgenda = async (nombre: RegExp) => {
  const agenda = await screen.findByRole('region', { name: 'Agenda de hoy' })
  return within(agenda).findByRole('button', { name: nombre })
}

beforeEach(() => {
  id = 1
  get.mockReset()
  navigate.mockReset()
  permisos.actuales = [...PERMISOS_DOCTORA]
  usuario.actual = { id: 3, full_name: 'Cintia Castro', tratamiento: 'Dra.', role: 'doctor', tenant_id: 2 }
  respuestas = {
    hoy: CITAS_HOY(),
    recientes: [],
    mes: [],
    '/clinical-tracking/orders/inbox': { items: [], total: 2 },
    '/clinical-tracking/critical-results': { items: [], total: 0 },
    '/clinical-tracking/prenatal-review-board': [],
    '/clinical-tracking/obstetric-dashboard': [],
  }
  responder()
})

describe('DoctorDashboard · cifras del día', () => {
  it('cuenta sin canceladas y dice cuántas faltan; el saludo lleva el nombre', async () => {
    montar()

    expect(await screen.findByRole('button', { name: /^3 citas hoy, 2 por atender/ })).toBeInTheDocument()
    expect(indicador(/1 en sala de espera, 1 sin signos vitales/)).toBeInTheDocument()
    expect(indicador(/1 atendidas, 33 % del día/)).toBeInTheDocument()
    expect(indicador(/^2 resultados por revisar/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/(Buenos días|Buenas tardes|Buenas noches), Dra\. Cintia Castro/)
    expect(await screen.findByText(/Sucursal Centro/)).toBeInTheDocument()
  })

  it('la barra de avance dice su valor', async () => {
    montar()
    await screen.findByRole('button', { name: /^3 citas hoy/ })

    const barra = screen.getByRole('progressbar', { name: 'Atendidas del día' })
    expect(barra).toHaveAttribute('aria-valuenow', '1')
    expect(barra).toHaveAttribute('aria-valuemax', '3')
  })

  it('la cita muestra edad, semanas de gestación y «Sin signos» si espera sin ellos', async () => {
    montar()

    const fila = await filaDeAgenda(/PACIENTE3 PRUEBA/)
    expect(fila).toHaveTextContent('CONTROL PRENATAL')
    expect(fila).toHaveTextContent('28.3 SDG')
    expect(fila).toHaveTextContent(/\d+ años/)
    expect(fila).toHaveTextContent('Sin signos')
    expect(fila).toHaveTextContent('En sala')
  })

  it('la insignia dice el estado real: una agendada es «Agendada», no «Por atender»', async () => {
    montar()

    const fila = await filaDeAgenda(/PACIENTE4 PRUEBA/)
    expect(fila).toHaveTextContent('Agendada')
    expect(fila).not.toHaveTextContent('Por atender')
  })

  it('pide el día como fecha local, no como instante UTC', async () => {
    montar()
    await screen.findByRole('button', { name: /^3 citas hoy/ })

    const llamada = get.mock.calls.find(
      ([url, config]) => url === '/appointments/my-appointments' && config?.params?.fecha_desde,
    )
    expect(llamada?.[1].params.fecha_desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(llamada?.[1].params.start_date).toBeUndefined()
  })
})

describe('DoctorDashboard · cada sección falla sola y nunca dice «0»', () => {
  it('si la bandeja falla, la agenda se ve y el indicador dice «—», no 0', async () => {
    respuestas['/clinical-tracking/orders/inbox'] = errorDeRed()
    montar()

    expect(await filaDeAgenda(/PACIENTE3 PRUEBA/)).toBeInTheDocument()
    const resultados = await screen.findByRole('button', { name: /Resultados por revisar: sin dato/ })
    expect(resultados.closest('.inicio-indicador')).toHaveTextContent('—')
    expect(resultados.closest('.inicio-indicador')).not.toHaveTextContent(/\b0\b/)
  })

  it('si la agenda falla, los indicadores dicen «—» y la agenda ofrece reintentar', async () => {
    respuestas.hoy = errorDeRed()
    montar()

    const agenda = await screen.findByRole('region', { name: 'Agenda de hoy' })
    expect(await within(agenda).findByRole('alert')).toHaveTextContent(/No se pud/)
    expect(indicador(/Citas de hoy: sin dato/).closest('.inicio-indicador')).toHaveTextContent('—')
    // Las pestañas tampoco inventan un número.
    expect(within(agenda).getByRole('tab', { name: /Todas/ })).toHaveTextContent('—')
    // Pendientes sí cargó.
    expect(screen.getByRole('region', { name: 'Pendientes y seguimiento' })).toHaveTextContent('2')

    respuestas.hoy = CITAS_HOY()
    await userEvent.click(within(agenda).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('button', { name: /^3 citas hoy/ })).toBeInTheDocument()
  })

  it('un renglón de pendientes que falla lo dice y ofrece reintentar; en cero dice «al día»', async () => {
    respuestas['/clinical-tracking/obstetric-dashboard'] = errorDeRed()
    montar()

    const pendientes = await screen.findByRole('region', { name: 'Pendientes y seguimiento' })
    await waitFor(() => expect(pendientes).toHaveTextContent('No se pudo consultar.'))
    expect(pendientes).toHaveTextContent('Al día: todas tienen su control agendado')
    expect(within(pendientes).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('los partos próximos llevan el nombre, no «Embarazo #id», y marcan la FPP vencida', async () => {
    respuestas['/clinical-tracking/obstetric-dashboard'] = [
      { pregnancy_id: 9, patient_id: 40, patient_full_name: 'ANA PAZ', estimated_delivery_date: '2026-10-01', vencida: true, dating_status: 'confirmed' },
    ]
    montar()

    const pendientes = await screen.findByRole('region', { name: 'Pendientes y seguimiento' })
    expect(await within(pendientes).findByRole('button', { name: /ANA PAZ/ })).toHaveTextContent('FPP vencida')
    expect(pendientes).not.toHaveTextContent('Embarazo #9')
  })
})

describe('DoctorDashboard · refresco', () => {
  it('al volver a la ventana vuelve a pedir; si falla, conserva los datos y lo avisa', async () => {
    montar()
    await filaDeAgenda(/PACIENTE3 PRUEBA/)
    const antes = get.mock.calls.length

    respuestas.hoy = errorDeRed()
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(antes))
    expect(await screen.findByText(/No se pudo actualizar \(datos de/)).toBeInTheDocument()
    // Lo que ya se veía sigue ahí.
    expect(await filaDeAgenda(/PACIENTE3 PRUEBA/)).toBeInTheDocument()
    expect(indicador(/^3 citas hoy/)).toBeInTheDocument()
  })

  it('con la pestaña oculta no sondea; al volver a ella sí', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      montar()
      await filaDeAgenda(/PACIENTE3 PRUEBA/)
      const visibilidad = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      const antes = get.mock.calls.length

      await act(async () => {
        vi.advanceTimersByTime(61_000)
      })
      expect(get.mock.calls.length).toBe(antes)

      visibilidad.mockReturnValue('visible')
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(antes))
      visibilidad.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('DoctorDashboard · agenda y pestañas', () => {
  it('las pestañas filtran, dicen su número y se mueven con las flechas', async () => {
    montar()
    const agenda = await screen.findByRole('region', { name: 'Agenda de hoy' })
    await within(agenda).findByRole('button', { name: /PACIENTE3 PRUEBA/ })

    const enSala = within(agenda).getByRole('tab', { name: /En sala/ })
    expect(enSala).toHaveTextContent('1')
    await userEvent.click(enSala)
    expect(enSala).toHaveAttribute('aria-selected', 'true')
    expect(within(agenda).getAllByRole('button', { name: /Abrir la consulta/ })).toHaveLength(1)

    fireEvent.keyDown(enSala, { key: 'ArrowRight' })
    expect(within(agenda).getByRole('tab', { name: /En consulta/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(agenda).getByText(/Nadie en consulta ahora/)).toBeInTheDocument()
  })

  it('la cancelada solo sale en «Todas» y no se abre', async () => {
    montar()
    const agenda = await screen.findByRole('region', { name: 'Agenda de hoy' })
    expect(await within(agenda).findByText('PACIENTE5 PRUEBA')).toBeInTheDocument()
    expect(within(agenda).queryByRole('button', { name: /PACIENTE5 PRUEBA/ })).toBeNull()

    await userEvent.click(within(agenda).getByRole('tab', { name: /Por atender/ }))
    expect(within(agenda).queryByText('PACIENTE5 PRUEBA')).toBeNull()
  })

  it('tocar una cita abre su consulta', async () => {
    montar()
    await userEvent.click(await filaDeAgenda(/PACIENTE3 PRUEBA/))
    expect(navigate).toHaveBeenCalledWith('/doctor/consultation/2')
  })

  it('MASTER lee que ve las citas de todas los médicos', async () => {
    usuario.actual = { ...usuario.actual, role: 'master' }
    montar()
    expect(await screen.findByText(/Viendo las citas de todas los médicos/)).toBeInTheDocument()
  })
})

describe('DoctorDashboard · acciones rápidas', () => {
  const acciones = async () => screen.findByRole('region', { name: 'Acciones rápidas' })

  it('«Siguiente paciente» abre a quien espera en sala', async () => {
    montar()
    const zona = await acciones()
    const boton = await within(zona).findByRole('button', { name: /Siguiente paciente.*PACIENTE3 PRUEBA · en sala/ })
    await userEvent.click(boton)
    expect(navigate).toHaveBeenCalledWith('/doctor/consultation/2')
  })

  it('sin nadie por atender, «Siguiente paciente» está deshabilitado y lo dice', async () => {
    respuestas.hoy = [cita('atendida', '08:00')]
    montar()
    const zona = await acciones()
    expect(await within(zona).findByRole('button', { name: /No hay pacientes por atender/ })).toBeDisabled()
  })

  it('sin el permiso no se dibuja «Nuevo paciente»; con él, sí', async () => {
    const { unmount } = montar()
    let zona = await acciones()
    expect(within(zona).queryByRole('button', { name: /Nuevo paciente/ })).toBeNull()
    expect(within(zona).getByRole('button', { name: /Registrar cobro/ })).toBeInTheDocument()
    expect(within(zona).queryByRole('button', { name: /Factura/ })).toBeNull()
    unmount()

    permisos.actuales = [...PERMISOS_DOCTORA, 'patients.create']
    montar()
    zona = await acciones()
    expect(within(zona).getByRole('button', { name: /Nuevo paciente/ })).toBeInTheDocument()
  })

  it('sin cobros ni seguimiento clínico no aparecen sus acciones ni la bandeja', async () => {
    permisos.actuales = ['doctor.dashboard.read', 'doctor.appointments.read']
    montar()
    const zona = await acciones()
    expect(within(zona).queryByRole('button', { name: /Registrar cobro/ })).toBeNull()
    expect(within(zona).queryByRole('button', { name: /Órdenes y resultados/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Pendientes y seguimiento' })).toBeNull()
    expect(get.mock.calls.some(([url]) => String(url).includes('/clinical-tracking'))).toBe(false)
  })

  it('«Agendar cita» abre la Agenda en hoy con «Nueva cita»', async () => {
    montar()
    const zona = await acciones()
    await userEvent.click(within(zona).getByRole('button', { name: /Agendar cita/ }))
    expect(navigate).toHaveBeenCalledWith('/secretaria/agenda')
  })
})

describe('DoctorDashboard · pacientes recientes', () => {
  it('sin repetir y con su expediente a un toque', async () => {
    respuestas.recientes = [
      cita('atendida', '08:00', { patient_id: 70, scheduled_at: '2026-10-03T08:00:00', patient: { id: 70, first_name: 'LUZ', last_name: 'MORA' } }),
      cita('atendida', '08:00', { patient_id: 70, scheduled_at: '2026-09-01T08:00:00', patient: { id: 70, first_name: 'LUZ', last_name: 'MORA' } }),
      cita('atendida', '08:00', { patient_id: 71, scheduled_at: '2026-10-02T08:00:00', patient: { id: 71, first_name: 'EVA', last_name: 'RUIZ' } }),
    ]
    montar()

    const zona = await screen.findByRole('region', { name: 'Pacientes recientes' })
    const filas = await within(zona).findAllByRole('button', { name: /Abrir expediente/ })
    expect(filas).toHaveLength(2)
    await userEvent.click(filas[0])
    expect(navigate).toHaveBeenCalledWith('/pacientes/70/expediente')
  })
})
