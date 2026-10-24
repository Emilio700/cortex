/**
 * Bandeja de resultados por paciente (plan 26, fase 3).
 *
 * Lo que no puede pasar: confundir «no pude cargar» con «no hay nada» (una
 * doctora podía dar por cerrado un estudio que nunca vio), partir a una
 * paciente en varias tarjetas, que la fila cambie sin que el servidor lo
 * confirme, o que al guardar la bandeja salte de página.
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
const obtenerResumen = vi.hoisted(() => vi.fn())
vi.mock('../utils/resumenBandeja', () => ({ obtenerResumenBandeja: obtenerResumen }))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))

import ResultsInboxPage from './ResultsInboxPage'
import { act } from '@testing-library/react'
import { pedirFiltroBandeja } from '../utils/filtroBandeja'

const orden = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  patient_id: 1,
  appointment_id: 300,
  order_group_id: null,
  category: 'laboratory',
  study_name: `Estudio ${id}`,
  clinical_indication: 'Control prenatal',
  priority: 'routine',
  requested_on: '2026-09-30',
  status: 'ordered',
  estado_visible: 'pendiente',
  acciones_de_estado: ['cancelled', 'rejected'],
  comunicada: false,
  critico_sin_comunicar: false,
  created_at: '2026-09-30T10:00:00',
  results: [],
  ...extra,
})

const RECIBIDO = {
  id: 90,
  review_status: 'received',
  is_critical: false,
  report_text: null,
  patient_document_id: 140,
  document_file_name: 'hbsag.pdf',
  document_mime_type: 'application/pdf',
  created_at: '2026-10-02T10:00:00',
}

const KENIA = {
  patient_id: 1,
  patient_name: 'KENIA XIMENA PERAZA DURAN',
  total_ordenes: 3,
  por_revisar: 1,
  tiene_criticos: false,
  prioridad_maxima: 'routine',
  solicitada_mas_antigua: '2026-09-30',
  orders: [
    orden(1, { study_name: 'VDRL / RPR' }),
    orden(2, {
      study_name: 'HBsAg',
      status: 'result_received',
      estado_visible: 'resultado_recibido',
      results: [RECIBIDO],
    }),
    orden(3, {
      study_name: 'Hepatitis C',
      status: 'reviewed',
      estado_visible: 'revisada',
      acciones_de_estado: [],
      results: [{ ...RECIBIDO, id: 91, review_status: 'reviewed', patient_document_id: null }],
    }),
  ],
}

const bandeja = (items: unknown[], total = items.length) => ({
  data: { items, total, skip: 0, limit: 20 },
})

// Sin respuesta del servidor: así llega a axios una caída de red.
const errorDeRed = () => ({ message: 'Network Error', request: {} })

beforeEach(() => {
  get.mockReset()
  obtenerResumen.mockReset()
  obtenerResumen.mockResolvedValue({
    pendientes: 30, por_revisar: 4, sin_comunicar: 1, criticos: 2, atrasados: 5, urgentes: 6, activas: 37,
  })
  post.mockReset()
  patch.mockReset()
  window.location.hash = ''
  window.localStorage.clear()
  // Plegadas por omisión: las pruebas de las filas trabajan con Kenia abierta,
  // como la dejaría la doctora al tocar su renglón.
  window.localStorage.setItem('gems.bandeja.plegado', JSON.stringify({ 1: true }))
  URL.createObjectURL = vi.fn(() => 'blob:doc')
  URL.revokeObjectURL = vi.fn()
})

const filaDe = (nombre: string) =>
  screen.getByText(nombre).closest('[data-tour="bandeja-orden"]') as HTMLElement

describe('ResultsInboxPage', () => {
  it('si la red falla muestra «Reintentar», no «no hay pendientes»', async () => {
    get.mockRejectedValue(errorDeRed())
    render(<ResultsInboxPage />)

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.getByText(/No se pudo conectar con el sistema/)).toBeInTheDocument()
    expect(screen.queryByText(/No tienes estudios pendientes/)).toBeNull()
  })

  it('«Reintentar» vuelve a pedir la bandeja y muestra lo que llegó', async () => {
    get.mockRejectedValueOnce(errorDeRed())
    get.mockResolvedValue(bandeja([KENIA]))
    render(<ResultsInboxPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('KENIA XIMENA PERAZA DURAN')).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it('con la bandeja vacía de verdad lo dice según el filtro', async () => {
    get.mockResolvedValue(bandeja([]))
    render(<ResultsInboxPage />)
    expect(await screen.findByText('No tienes estudios pendientes.')).toBeInTheDocument()
  })

  it('una paciente con tres estudios es una sola tarjeta, pedida por paciente', async () => {
    get.mockResolvedValue(bandeja([KENIA]))
    render(<ResultsInboxPage />)

    const tarjeta = (await screen.findByText('KENIA XIMENA PERAZA DURAN')).closest(
      '[data-tour="bandeja-paciente"]',
    ) as HTMLElement
    expect(within(tarjeta).getAllByText(/^Orden n\.º/)).toHaveLength(3)
    expect(screen.getAllByText('KENIA XIMENA PERAZA DURAN')).toHaveLength(1)
    expect(within(tarjeta).getByText(/3 estudios · 1 pendiente · 1 por revisar/)).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/clinical-tracking/orders/inbox-by-patient', {
      params: { filtro: 'activas', search: undefined, skip: 0, limit: 20 },
    })
    expect(screen.getByText('1 paciente')).toBeInTheDocument()
  })

  it('cada fila tiene una sola acción principal según su estado', async () => {
    get.mockResolvedValue(bandeja([KENIA]))
    render(<ResultsInboxPage />)
    await screen.findByText('VDRL / RPR')

    expect(
      within(filaDe('VDRL / RPR')).getByRole('button', { name: 'Registrar resultado' }),
    ).toBeInTheDocument()
    expect(
      within(filaDe('HBsAg')).getByRole('button', { name: 'Revisar resultado' }),
    ).toBeInTheDocument()
    expect(
      within(filaDe('Hepatitis C')).getByRole('button', { name: 'Documentar comunicación' }),
    ).toBeInTheDocument()
    // Ya no hay botones de estados del laboratorio ni un PDF por fila a la vista.
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Imprimir orden' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Imprimir pendientes de la paciente' }),
    ).toBeInTheDocument()
  })

  it('el estado y la prioridad se leen en español', async () => {
    get.mockResolvedValue(bandeja([KENIA]))
    render(<ResultsInboxPage />)
    await screen.findByText('VDRL / RPR')
    expect(screen.getByText('Pendiente de resultado')).toBeInTheDocument()
    expect(screen.getByText('Resultado recibido')).toBeInTheDocument()
    expect(screen.getByText('Revisada')).toBeInTheDocument()
    expect(screen.getAllByText('Rutinaria')).toHaveLength(3)
  })

  it('el resultado crítico se marca en rojo en la tarjeta y en la fila', async () => {
    const conCritico = {
      ...KENIA,
      tiene_criticos: true,
      orders: [{ ...KENIA.orders[1], critico_sin_comunicar: true }],
    }
    get.mockResolvedValue(bandeja([conCritico]))
    render(<ResultsInboxPage />)
    expect(await screen.findByText('Crítico')).toBeInTheDocument()
    expect(screen.getByText('Crítico sin cerrar')).toBeInTheDocument()
  })

  it('revisar abre el panel con el archivo y el formulario; al guardar la fila cambia en su lugar', async () => {
    get.mockImplementation(async (ruta: string) =>
      ruta.startsWith('/documents/')
        ? { data: new Blob(['%PDF']), headers: { 'content-type': 'application/pdf' } }
        : bandeja([KENIA], 7),
    )
    patch.mockResolvedValue({
      data: {
        ...RECIBIDO,
        review_status: 'reviewed',
        clinician_interpretation: 'Negativo',
        order_status: 'reviewed',
      },
    })
    const user = userEvent.setup()
    render(<ResultsInboxPage />)
    await user.click(await screen.findByRole('button', { name: 'Revisar resultado' }))

    // El archivo se ve dentro del panel, sin abrir otra pestaña.
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    expect(screen.getByText('Control prenatal')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Interpretación clínica')).toHaveFocus())

    await user.type(screen.getByLabelText('Interpretación clínica'), 'Negativo')
    await user.click(screen.getByRole('button', { name: 'Marcar revisada' }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/clinical-tracking/results/90',
        expect.objectContaining({ review_status: 'reviewed', clinician_interpretation: 'Negativo' }),
      ),
    )
    expect(await screen.findByText(/HBsAg: marcada como revisada/)).toBeInTheDocument()
    expect(within(filaDe('HBsAg')).getByText('Revisada')).toBeInTheDocument()
    expect(
      within(filaDe('HBsAg')).getByRole('button', { name: 'Documentar comunicación' }),
    ).toBeInTheDocument()
    // No se recargó la bandeja: la paciente sigue donde estaba.
    expect(
      get.mock.calls.filter(([r]) => r === '/clinical-tracking/orders/inbox-by-patient'),
    ).toHaveLength(1)
  })

  it('si el servidor rechaza, el panel muestra su motivo y la fila no cambia', async () => {
    get.mockResolvedValue(bandeja([KENIA]))
    post.mockRejectedValue({
      response: { status: 403, data: { detail: 'Esta orden es de otra doctora.' } },
    })
    const user = userEvent.setup()
    render(<ResultsInboxPage />)
    await user.click(await screen.findByRole('button', { name: 'Registrar resultado' }))

    await user.type(await screen.findByLabelText(/Resumen del resultado/), 'No reactivo')
    await user.click(screen.getByRole('button', { name: 'Guardar como recibido' }))

    expect(await screen.findByText('Esta orden es de otra doctora.')).toBeInTheDocument()
    expect(within(filaDe('VDRL / RPR')).getByText('Pendiente de resultado')).toBeInTheDocument()
  })

  it('el enlace del inicio abre la bandeja en «Resultado por revisar»', async () => {
    window.location.hash = '#/doctor/results?filtro=por_revisar'
    get.mockResolvedValue(bandeja([]))
    render(<ResultsInboxPage />)

    expect(await screen.findByText('No hay resultados por revisar.')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(
      '/clinical-tracking/orders/inbox-by-patient',
      expect.objectContaining({ params: expect.objectContaining({ filtro: 'por_revisar' }) }),
    )
  })

  it('el enlace viejo con ?estado=result_received también se entiende', async () => {
    window.location.hash = '#/doctor/results?estado=result_received'
    get.mockResolvedValue(bandeja([]))
    render(<ResultsInboxPage />)
    expect(await screen.findByText('No hay resultados por revisar.')).toBeInTheDocument()
  })

  it('«Imprimir pendientes de la paciente» lleva solo los estudios sin resultado (I3)', async () => {
    get.mockImplementation(async (ruta: string) => {
      if (ruta === '/doctor-profile/me') {
        return { data: { order_settings: { modo_impresion: 'una_hoja' } } }
      }
      if (ruta.endsWith('/pdf')) return { data: new Blob(['%PDF']) }
      return bandeja([KENIA])
    })
    const user = userEvent.setup()
    render(<ResultsInboxPage />)
    await user.click(
      await screen.findByRole('button', { name: 'Imprimir pendientes de la paciente' }),
    )

    // HBsAg (resultado recibido) y Hepatitis C (revisada) no se vuelven a mandar.
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/clinical-tracking/patients/1/orders/pdf', {
        responseType: 'blob',
        params: { order_ids: '1', modo: 'una_hoja' },
      }),
    )
  })

  it('«Revisarlos en la bandeja» aplica el filtro aunque la bandeja ya esté abierta en otro (I2)', async () => {
    get.mockResolvedValue(bandeja([]))
    render(<ResultsInboxPage />)
    expect(await screen.findByText('No tienes estudios pendientes.')).toBeInTheDocument()

    act(() => pedirFiltroBandeja('criticos'))

    expect(await screen.findByText('No hay incidencias críticas abiertas.')).toBeInTheDocument()
    expect(screen.getByLabelText('Qué mostrar')).toHaveValue('criticos')
  })

  it('si la bandeja no estaba abierta, toma el filtro pedido al montarse (I2)', async () => {
    get.mockResolvedValue(bandeja([]))
    pedirFiltroBandeja('por_revisar')
    render(<ResultsInboxPage />)
    expect(await screen.findByText('No hay resultados por revisar.')).toBeInTheDocument()
  })

  it('una orden ya revisada todavía acepta anexar un archivo (M8)', async () => {
    get.mockResolvedValue(bandeja([KENIA]))
    const user = userEvent.setup()
    render(<ResultsInboxPage />)
    await user.click(await screen.findByRole('button', { name: 'Más acciones de Hepatitis C' }))
    expect(screen.getAllByRole('button', { name: 'Anexar archivo' }).length).toBeGreaterThan(0)
  })

  describe('plegada por paciente (plan 32, punto 3)', () => {
    beforeEach(() => window.localStorage.clear())

    const otra = (id: number, extra: Record<string, unknown> = {}) => ({
      ...KENIA,
      patient_id: id,
      patient_name: `PACIENTE ${id}`,
      orders: [orden(100 + id, { patient_id: id, study_name: `Estudio de ${id}` })],
      ...extra,
    })

    it('todas empiezan plegadas en un renglón', async () => {
      get.mockResolvedValue(bandeja([otra(11), otra(12)]))
      render(<ResultsInboxPage />)
      expect(await screen.findByRole('button', { name: /PACIENTE 11/ })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('Estudio de 11')).toBeNull()
      expect(screen.queryByText('Estudio de 12')).toBeNull()
    })

    it('con el recorrido guiado en pantalla se abre la primera, para que sus pasos la señalen', async () => {
      get.mockResolvedValue(bandeja([otra(11), otra(12)]))
      render(<ResultsInboxPage />)
      await screen.findByRole('button', { name: /PACIENTE 11/ })
      act(() => document.body.classList.add('driver-active'))
      expect(await screen.findByText('Estudio de 11')).toBeInTheDocument()
      expect(screen.queryByText('Estudio de 12')).toBeNull()
      act(() => document.body.classList.remove('driver-active'))
      await waitFor(() => expect(screen.queryByText('Estudio de 11')).toBeNull())
    })

    it('una con crítico abierto se abre sola, aunque no sea la primera', async () => {
      get.mockResolvedValue(bandeja([otra(11), otra(12, { tiene_criticos: true })]))
      render(<ResultsInboxPage />)
      expect(await screen.findByText('Estudio de 12')).toBeInTheDocument()
    })

    it('abrir, «Contraer todo» y «Expandir todo», y lo recuerda al volver', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(bandeja([otra(11), otra(12)]))
      const { unmount } = render(<ResultsInboxPage />)
      await user.click(await screen.findByRole('button', { name: /PACIENTE 12/ }))
      expect(screen.getByText('Estudio de 12')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Contraer todo' }))
      expect(screen.queryByText('Estudio de 11')).toBeNull()
      expect(screen.queryByText('Estudio de 12')).toBeNull()

      unmount()
      render(<ResultsInboxPage />)
      await screen.findByRole('button', { name: /PACIENTE 11/ })
      expect(screen.queryByText('Estudio de 11')).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Expandir todo' }))
      expect(screen.getByText('Estudio de 11')).toBeInTheDocument()
      expect(screen.getByText('Estudio de 12')).toBeInTheDocument()
    })

    it('cada grupo dice de qué consulta, lote y fecha viene, y deja ver la consulta atendida', async () => {
      const ana = otra(15, {
        orders: [
          orden(1, { order_group_id: 3, cita_fecha: '2026-10-01T09:30:00', cita_estado: 'atendida' }),
          orden(2, { order_group_id: 3, cita_fecha: '2026-10-01T09:30:00', cita_estado: 'atendida' }),
          orden(3, { appointment_id: 301, cita_fecha: '2026-10-08T10:00:00', cita_estado: 'en_consulta' }),
          orden(4, { appointment_id: null, requested_on: '2026-09-15', desired_on: '2026-09-20' }),
        ],
      })
      get.mockResolvedValue(bandeja([ana]))
      render(<ResultsInboxPage />)
      await userEvent.setup().click(await screen.findByRole('button', { name: /PACIENTE 15/ }))

      expect(await screen.findByText(/^Consulta del 1 oct 2026.* · Lote G-3 · 2 estudios$/)).toBeInTheDocument()
      expect(screen.getByText(/^Consulta del 8 oct 2026.* · 1 estudio$/)).toBeInTheDocument()
      expect(screen.getByText(/^Pedido el 15 sept?.? 2026, sin consulta · 1 estudio$/)).toBeInTheDocument()
      // Solo la atendida: abrir una consulta en curso no es releerla.
      const enlaces = screen.getAllByRole('link', { name: 'Ver la consulta' })
      expect(enlaces).toHaveLength(1)
      expect(enlaces[0]).toHaveAttribute('href', '#/doctor/consultation/300')
      expect(screen.getByText(/realizar a más tardar el 20\/09\/26/)).toBeInTheDocument()
    })
  })

  describe('franja de estado (plan 32, punto 3)', () => {
    it('muestra los conteos del servidor, no los de la página', async () => {
      get.mockResolvedValue(bandeja([KENIA]))
      render(<ResultsInboxPage />)
      const franja = await screen.findByRole('group', { name: /Resumen de la bandeja/ })
      const seg = (n: RegExp) => within(franja).getByRole('button', { name: n })
      await waitFor(() => expect(seg(/Pendientes de resultado/)).toHaveTextContent(/^30Pendientes/))
      // El número cuenta hasta su valor en menos de 200 ms.
      await waitFor(() => expect(seg(/Críticos abiertos/)).toHaveTextContent(/^2Críticos/))
      await waitFor(() => expect(seg(/Atrasados/)).toHaveTextContent(/^5Atrasados/))
    })

    it('tocar un segmento filtra la lista y tocarlo otra vez la regresa', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(bandeja([KENIA]))
      render(<ResultsInboxPage />)
      const atrasados = await screen.findByRole('button', { name: /Atrasados/ })
      await user.click(atrasados)
      expect(atrasados).toHaveAttribute('aria-pressed', 'true')
      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/clinical-tracking/orders/inbox-by-patient', {
          params: expect.objectContaining({ filtro: 'atrasados', skip: 0 }),
        }),
      )
      await user.click(atrasados)
      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/clinical-tracking/orders/inbox-by-patient', {
          params: expect.objectContaining({ filtro: 'activas' }),
        }),
      )
    })

    it('si el conteo falla lo dice, sin ceros falsos, y la lista sigue', async () => {
      obtenerResumen.mockRejectedValue(errorDeRed())
      get.mockResolvedValue(bandeja([KENIA]))
      render(<ResultsInboxPage />)
      expect(await screen.findByText(/No se pudieron contar los pendientes/)).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: /Resumen de la bandeja/ })).toBeNull()
      expect(await screen.findByText('KENIA XIMENA PERAZA DURAN')).toBeInTheDocument()
    })
  })

  it('plegada, la tarjeta dice cuántos atrasados tiene; abierta, cada fila dice cuántos días', async () => {
    window.localStorage.clear()
    const conAtraso = {
      ...KENIA,
      patient_id: 77,
      orders: [
        orden(1, { patient_id: 77, atrasada: true, dias_sin_resultado: 49, study_name: 'Perfil tiroideo' }),
        orden(2, { patient_id: 77, atrasada: true, dias_sin_resultado: 35 }),
        orden(3, { patient_id: 77 }),
      ],
    }
    get.mockResolvedValue(bandeja([conAtraso]))
    const user = userEvent.setup()
    render(<ResultsInboxPage />)
    const cabecera = await screen.findByRole('button', { name: /KENIA/ })
    expect(within(cabecera).getByText('2 atrasados')).toBeInTheDocument()
    await user.click(cabecera)
    expect(screen.getByText('Atrasado · 49 días sin resultado')).toBeInTheDocument()
    expect(screen.getByText('Atrasado · 35 días sin resultado')).toBeInTheDocument()
  })
})
