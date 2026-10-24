/**
 * «Estudios de esta consulta» (plan 26, fase 2).
 *
 * Lo que no puede pasar: que el conteo diga una cosa y la lista otra (C-1),
 * que se recorte en silencio a 3 estudios, que imprimir todo dé diez hojas o
 * que el resultado se abra en otra pestaña.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
const patch = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({
  apiClient: { get, post, patch },
  default: { get, post, patch },
}))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ can: () => true, user: { role: 'doctor' } }),
}))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))

import EstudiosDeLaConsulta from './EstudiosDeLaConsulta'
import HistorialEstudios from './HistorialEstudios'
import { olvidarModoImpresion } from '../hooks/useModoImpresionPredeterminado'
import { olvidarOrdenesDePaciente } from '../hooks/useFuenteDeOrdenes'

const orden = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  patient_id: 12,
  appointment_id: 345,
  order_group_id: 9,
  category: 'laboratory',
  study_name: `Estudio ${id}`,
  clinical_indication: 'Perfil prenatal',
  priority: 'routine',
  requested_on: '2026-10-03',
  status: 'ordered',
  estado_visible: 'pendiente',
  acciones_de_estado: ['cancelled', 'rejected'],
  created_at: '2026-10-03T10:00:00',
  results: [],
  ...extra,
})

const DIEZ = [
  ...Array.from({ length: 8 }, (_, i) => orden(i + 1)),
  orden(9, {
    category: 'obstetric',
    study_name: 'Ultrasonido obstétrico',
    status: 'result_received',
    estado_visible: 'resultado_recibido',
    results: [
      {
        id: 70,
        review_status: 'received',
        is_critical: true,
        patient_document_id: 140,
        document_file_name: 'us.pdf',
        document_mime_type: 'application/pdf',
        created_at: '2026-10-03T12:00:00',
      },
      {
        id: 71,
        review_status: 'received',
        is_critical: false,
        patient_document_id: 141,
        document_file_name: 'foto.jpg',
        document_mime_type: 'image/jpeg',
        created_at: '2026-10-03T12:05:00',
      },
    ],
  }),
  orden(10, { category: 'referral', study_name: 'Interconsulta a nutrición' }),
]

const responder = () =>
  get.mockImplementation(async (ruta: string, config?: { params?: Record<string, unknown> }) => {
    if (ruta === '/clinical-tracking/patient/12/orders') {
      // El filtro de «por atender» es del servidor y conserva su petición.
      if (config?.params?.por_atender) return { data: [], headers: { 'x-total-count': '0' } }
      // La página 0 sin filtros sirve la lista de la consulta (se filtra por
      // cita en el cliente) y el total del expediente para «Ver historial».
      return { data: DIEZ, headers: { 'x-total-count': '23' } }
    }
    if (ruta === '/doctor-profile/me')
      return { data: { order_settings: { modo_impresion: 'separado' } } }
    if (ruta.startsWith('/documents/')) return { data: new Blob(['x']), headers: {} }
    if (ruta.endsWith('/pdf')) return { data: new Blob(['%PDF']) }
    throw new Error(`ruta inesperada ${ruta}`)
  })

/** Forma de una llamada al endpoint de órdenes en el mock. */
type LlamadaDeOrdenes = [ruta: string, config?: { params?: Record<string, unknown> }]

/** Sólo las llamadas al endpoint de órdenes del paciente. */
const llamadasDeOrdenes = () =>
  (get.mock.calls as LlamadaDeOrdenes[]).filter(
    ([ruta]) => ruta === '/clinical-tracking/patient/12/orders',
  )

/** Los parámetros con que se pidió cada llamada al endpoint de órdenes. */
const parametrosDeOrdenes = () => llamadasDeOrdenes().map(([, config]) => config?.params)

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  olvidarModoImpresion()
  olvidarOrdenesDePaciente()
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  responder()
})

const montar = (props: Partial<Parameters<typeof EstudiosDeLaConsulta>[0]> = {}) =>
  render(
    <EstudiosDeLaConsulta
      patientId={12}
      appointmentId={345}
      canWrite
      pregnancyContext={{}}
      {...props}
    />,
  )

describe('EstudiosDeLaConsulta', () => {
  it('enseña los 10 estudios de la consulta y el título cuenta los mismos 10', async () => {
    const onConteo = vi.fn()
    montar({ onConteo })

    expect(await screen.findByText('Estudios de esta consulta (10)')).toBeInTheDocument()
    expect(screen.getAllByText(/^Orden n\.º/)).toHaveLength(10)
    expect(get).toHaveBeenCalledWith('/clinical-tracking/patient/12/orders', {
      params: { skip: 0, limit: 100 },
    })
    await waitFor(() => expect(onConteo).toHaveBeenCalledWith({ consulta: 10, expediente: 23 }))
  })

  it('una sola fuente: la consulta pide la página 0 y «por atender», nada más', async () => {
    montar()
    await screen.findByText('Estudios de esta consulta (10)')

    // Antes eran cuatro llamadas (la cita, el total con limit:1, por atender
    // y la página del historial); ahora son dos: el filtro por cita se aplica
    // en el cliente sobre la página compartida y el total sale de la misma.
    expect(parametrosDeOrdenes()).toHaveLength(2)
    expect(parametrosDeOrdenes()).toEqual(
      expect.arrayContaining([
        { skip: 0, limit: 100 },
        { por_atender: true, skip: 0, limit: 50 },
      ]),
    )
    expect(parametrosDeOrdenes()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ limit: 1 })]),
    )
    expect(parametrosDeOrdenes()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ appointment_id: 345 })]),
    )
  })

  it('visitar la pestaña Estudios no pide otra vez lo que ya pidió la consulta', async () => {
    montar()
    await screen.findByText('Estudios de esta consulta (10)')

    render(<HistorialEstudios patientId={12} />)
    // El historial enseña la página 0 que ya trajo la consulta.
    expect(await screen.findAllByText(/^Estudio 1$/)).toHaveLength(2)
    expect(parametrosDeOrdenes()).toHaveLength(2)
  })

  it('con un expediente mayor a una página pide la cita exacta para no perder órdenes', async () => {
    const deOtraCita = Array.from({ length: 100 }, (_, i) => orden(i + 1, { appointment_id: 999 }))
    get.mockImplementation(async (ruta: string, config?: { params?: Record<string, unknown> }) => {
      if (ruta === '/clinical-tracking/patient/12/orders') {
        if (config?.params?.por_atender) return { data: [], headers: { 'x-total-count': '0' } }
        if (config?.params?.appointment_id === 345)
          return { data: DIEZ, headers: { 'x-total-count': '10' } }
        return { data: deOtraCita, headers: { 'x-total-count': '150' } }
      }
      if (ruta === '/doctor-profile/me')
        return { data: { order_settings: { modo_impresion: 'separado' } } }
      if (ruta.endsWith('/pdf')) return { data: new Blob(['%PDF']) }
      throw new Error(`ruta inesperada ${ruta}`)
    })
    montar()

    // Derivar de la página 0 daría cero órdenes de esta cita; la petición
    // exacta por cita las trae todas, como antes.
    expect(await screen.findByText('Estudios de esta consulta (10)')).toBeInTheDocument()
    expect(parametrosDeOrdenes()).toHaveLength(3)
    expect(parametrosDeOrdenes()).toEqual(
      expect.arrayContaining([
        { skip: 0, limit: 100 },
        { por_atender: true, skip: 0, limit: 50 },
        { appointment_id: 345, skip: 0, limit: 100 },
      ]),
    )
  })

  it('agrupa por destino físico, como el papel', async () => {
    montar()
    expect(await screen.findByText('Laboratorio (8)')).toBeInTheDocument()
    expect(screen.getByText('Imagen y gabinete (1)')).toBeInTheDocument()
    expect(screen.getByText('Otros (1)')).toBeInTheDocument()
  })

  it('el estado se lee en español y el resultado crítico se marca', async () => {
    montar()
    await screen.findByText('Ultrasonido obstétrico')
    expect(screen.getAllByText('Pendiente de resultado')).toHaveLength(9)
    expect(screen.getByText('Resultado recibido')).toBeInTheDocument()
    expect(screen.getByText('1 con resultado crítico')).toBeInTheDocument()
    expect(screen.getByText('Crítico sin cerrar')).toBeInTheDocument()
  })

  it('«Imprimir todo» abre la vista previa del papel consolidado de la cita', async () => {
    const user = userEvent.setup()
    montar()
    await user.click(await screen.findByRole('button', { name: 'Imprimir todo' }))

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/clinical-tracking/appointments/345/orders/pdf', {
        responseType: 'blob',
        params: { modo: 'separado' },
      }),
    )
    expect(screen.getByLabelText('Cómo se imprime')).toHaveValue('separado')
    // Ninguna fila trae su propio «Imprimir orden»: la hoja suelta va en el menú.
    expect(screen.queryByRole('button', { name: 'Imprimir orden' })).toBeNull()
  })

  it('«Ver resultado» muestra los archivos de la orden en el visor, no en otra pestaña', async () => {
    const user = userEvent.setup()
    montar()
    await user.click(await screen.findByRole('button', { name: 'Ver resultado' }))

    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/documents/140/download', { responseType: 'blob' })
    expect(get).toHaveBeenCalledWith('/documents/141/download', { responseType: 'blob' })
  })

  it('una orden pendiente sin archivo ofrece anexar el resultado', async () => {
    const user = userEvent.setup()
    montar()
    const botones = await screen.findAllByRole('button', { name: 'Anexar resultado' })
    expect(botones).toHaveLength(9)
    await user.click(botones[0])
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Estudio 1')).toBeInTheDocument()
  })

  it('«Reimprimir solo este estudio» está en el menú de la fila', async () => {
    const user = userEvent.setup()
    montar()
    await user.click(await screen.findByRole('button', { name: 'Más acciones de Estudio 1' }))
    await user.click(screen.getAllByRole('button', { name: 'Reimprimir solo este estudio' })[0])
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/clinical-tracking/orders/1/pdf', { responseType: 'blob' }),
    )
  })

  it('en una consulta cerrada no se crean órdenes ni se anexa', async () => {
    montar({ canWrite: false })
    await screen.findByText('Estudios de esta consulta (10)')
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anexar resultado' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ver resultado' })).toBeInTheDocument()
  })

  it('si no carga lo dice, en vez de enseñar una consulta sin estudios', async () => {
    get.mockRejectedValue({ message: 'Network Error', request: {} })
    montar()
    expect((await screen.findAllByRole('button', { name: 'Reintentar' })).length).toBeGreaterThan(0)
    expect(screen.queryByText(/todavía no se piden estudios/)).toBeNull()
  })

  it('el enlace al historial lleva a la pestaña de estudios con el total del expediente', async () => {
    const onVerHistorial = vi.fn()
    const user = userEvent.setup()
    montar({ onVerHistorial })
    await user.click(
      await screen.findByRole('button', {
        name: 'Ver historial de estudios del paciente (23) →',
      }),
    )
    expect(onVerHistorial).toHaveBeenCalled()
  })

  it('un resultado recibido se revisa desde la consulta, con la cita (D-8)', async () => {
    const user = userEvent.setup()
    montar({ patientName: 'ANA PRUEBA LÓPEZ' })
    await user.click(await screen.findByRole('button', { name: 'Revisar resultado' }))
    expect(await screen.findByText(/Lo estás revisando dentro de la consulta/)).toBeInTheDocument()
    expect(screen.getByText('ANA PRUEBA LÓPEZ')).toBeInTheDocument()
  })

  it('muestra los resultados pendientes de consultas anteriores y los revisa con la cita de hoy (N3)', async () => {
    const anterior = {
      ...orden(70, {
        appointment_id: 200,
        study_name: 'Potasio sérico',
        status: 'result_received',
        estado_visible: 'resultado_recibido',
        comunicada: false,
        critico_sin_comunicar: true,
        incidencia_abierta: true,
      }),
      results: [
        {
          id: 700,
          review_status: 'received',
          is_critical: true,
          valoracion: 'critico',
          incidencia_abierta: true,
          created_at: '2026-09-20T10:00:00',
        },
      ],
    }
    get.mockImplementation(async (_ruta: string, config?: { params?: Record<string, unknown> }) => {
      if (config?.params?.por_atender)
        return { data: [anterior, DIEZ[0]], headers: { 'x-total-count': '2' } }
      // Página compartida: las 10 de la cita sirven para la lista y el total.
      return { data: DIEZ, headers: { 'x-total-count': '23' } }
    })
    patch.mockResolvedValue({
      data: {
        id: 700,
        review_status: 'reviewed',
        is_critical: true,
        valoracion: 'critico',
        created_at: '',
        order_status: 'reviewed',
        incidencia_abierta: false,
        incidencia_cerrada_por: 'consulta',
      },
    })
    const user = userEvent.setup()
    montar({ patientName: 'ANA PRUEBA' })

    expect(await screen.findByText('Resultados pendientes del paciente (1)')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/clinical-tracking/patient/12/orders', {
      params: { por_atender: true, skip: 0, limit: 50 },
    })
    await user.click(screen.getByRole('button', { name: 'Revisar' }))
    await user.click(await screen.findByRole('button', { name: 'Marcar revisada' }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/clinical-tracking/results/700',
        expect.objectContaining({ review_status: 'reviewed', appointment_id: 345 }),
      ),
    )
    expect(
      await screen.findByText(/cerrada porque lo revisaste en la consulta/),
    ).toBeInTheDocument()
    // La revisión recarga la rebanada compartida de «por atender».
    await waitFor(() =>
      expect(
        (get.mock.calls as LlamadaDeOrdenes[]).filter(([, config]) => config?.params?.por_atender),
      ).toHaveLength(2),
    )
  })
})
