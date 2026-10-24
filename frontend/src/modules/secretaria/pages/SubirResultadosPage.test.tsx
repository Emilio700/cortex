/**
 * Recepción sube el resultado de una orden de estudio (O-04).
 *
 * Lo que no puede pasar: decir «resultado adjuntado» cuando el servidor no lo
 * recibió, o mostrarle a recepción la indicación o la interpretación (aquí sólo
 * llega paciente, estudio, fecha, folio y estado).
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
const auth = vi.hoisted(() => ({
  permissions: undefined as string[] | undefined,
  permitidas: new Set<string>(),
}))

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({
    permissions: auth.permissions,
    can: (accion: string) => auth.permitidas.has(accion),
    user: { role: 'secretaria' },
  }),
}))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))

import SubirResultadosPage from './SubirResultadosPage'

const unaOrden = () => ({
  data: {
    items: [
      {
        order_id: 57,
        order_group_id: null,
        patient_id: 12,
        patient_name: 'María López Pérez',
        study_name: 'Biometría hemática',
        requested_on: '2026-09-29',
        status: 'ordered',
        attachments: 0,
      },
    ],
    total: 1,
    skip: 0,
    limit: 25,
  },
})

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  // Sesión normal: el perfil trae los permisos del mostrador, incluido el de
  // imprimir, que BotonVistaPreviaOrden consulta para existir.
  auth.permissions = [
    'clinical_tracking.deliver_order',
    'clinical_tracking.attach_result',
    'clinical_tracking.print_order',
  ]
  auth.permitidas = new Set(auth.permissions)
})

// La página abre en «Por entregar» (O-09); esta suite prueba «Subir resultado».
const irAResultado = (user: ReturnType<typeof userEvent.setup>, vista: ReturnType<typeof within>) =>
  user.click(vista.getByText('Subir resultado'))

describe('SubirResultadosPage · subir resultado (O-04)', () => {
  it('lista la orden con su estado en español y sin datos clínicos', async () => {
    get.mockResolvedValue(unaOrden())
    const user = userEvent.setup()
    const { container } = render(<SubirResultadosPage />)
    const vista = within(container)

    await irAResultado(user, vista)

    expect(await vista.findByText('María López Pérez')).toBeInTheDocument()
    expect(vista.getByText('Biometría hemática')).toBeInTheDocument()
    expect(vista.getAllByText('Pendiente de resultado').length).toBeGreaterThan(0)
    expect(vista.getAllByText(/Folio 57/).length).toBeGreaterThan(0)
    expect(get).toHaveBeenCalledWith(
      '/clinical-tracking/orders/awaiting-result',
      expect.objectContaining({ params: expect.objectContaining({ limit: 25 }) }),
    )
  })

  it('subir el archivo llama al endpoint multipart y avisa sólo tras el 201', async () => {
    get.mockResolvedValue(unaOrden())
    post.mockResolvedValue({
      data: { result_id: 88, order_id: 57, order_status: 'result_received', patient_document_id: 140, file_name: 'r.pdf', mime_type: 'application/pdf', file_size: 10, uploaded_at: '2026-10-02T16:00:00' },
    })
    const user = userEvent.setup()
    const { container } = render(<SubirResultadosPage />)
    const vista = within(container)

    await irAResultado(user, vista)
    await user.click(await vista.findByRole('button', { name: 'Adjuntar resultado' }))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const archivo = new File(['%PDF-1.4'], 'resultado.pdf', { type: 'application/pdf' })
    await user.upload(input, archivo)

    // Antes de subir no hay aviso de éxito.
    expect(vista.queryByText(/Se adjuntó/)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Anexar' }))

    expect(
      await vista.findByText(/Se adjuntó 1 archivo a la orden de Biometría hemática/),
    ).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
    const [ruta, cuerpo, config] = post.mock.calls[0]
    expect(ruta).toBe('/clinical-tracking/orders/57/result-attachment')
    expect(cuerpo).toBeInstanceOf(FormData)
    expect((cuerpo as FormData).get('file')).toBeInstanceOf(File)
    expect(config.headers['Content-Type']).toBe('multipart/form-data')
  })

  it('si el servidor rechaza el archivo, muestra su motivo y no dice que se adjuntó', async () => {
    get.mockResolvedValue(unaOrden())
    post.mockRejectedValue({
      response: { status: 400, data: { detail: 'El archivo no es un PDF, JPG o PNG válido.' } },
    })
    const user = userEvent.setup()
    const { container } = render(<SubirResultadosPage />)
    const vista = within(container)

    await irAResultado(user, vista)
    await user.click(await vista.findByRole('button', { name: 'Adjuntar resultado' }))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['%PDF-1.4'], 'reporte.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Anexar' }))

    expect(await screen.findByText('El archivo no es un PDF, JPG o PNG válido.')).toBeInTheDocument()
    expect(vista.queryByText(/Se adjuntó/)).toBeNull()
  })

  it('sin archivo elegido no se puede anexar', async () => {
    get.mockResolvedValue(unaOrden())
    const user = userEvent.setup()
    const { container } = render(<SubirResultadosPage />)
    const vista = within(container)

    await irAResultado(user, vista)
    await user.click(await vista.findByRole('button', { name: 'Adjuntar resultado' }))
    expect(screen.getByRole('button', { name: 'Anexar' })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })

  it('recepción ve en el visor lo que ya subió, para notar un sobre equivocado', async () => {
    const conAdjuntos = unaOrden()
    Object.assign(conAdjuntos.data.items[0], {
      attachments: 2,
      adjuntos: [
        { result_id: 1, patient_document_id: 140, file_name: 'bh.pdf', mime_type: 'application/pdf', uploaded_at: '2026-10-02T10:00:00' },
        { result_id: 2, patient_document_id: 141, file_name: 'foto.jpg', mime_type: 'image/jpeg', uploaded_at: '2026-10-02T10:01:00' },
      ],
    })
    get.mockImplementation(async (ruta: string) =>
      ruta.startsWith('/documents/') ? { data: new Blob(['x']), headers: {} } : conAdjuntos,
    )
    const user = userEvent.setup()
    const { container } = render(<SubirResultadosPage />)
    const vista = within(container)

    await irAResultado(user, vista)
    await user.click(await vista.findByRole('button', { name: 'Ver 2 archivos subidos' }))

    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/documents/140/download', { responseType: 'blob' })
  })

  it('con órdenes de dos doctoras ofrece un papel por doctora, solo con lo pendiente (M5, I3)', async () => {
    const dos = unaOrden()
    Object.assign(dos.data.items[0], { doctor_id: 4, doctor_name: 'Dra. Ana' })
    ;(dos.data.items as Array<Record<string, unknown>>).push(
      { ...dos.data.items[0], order_id: 58, study_name: 'USG', doctor_id: 5, doctor_name: 'Dra. Bea' },
      { ...dos.data.items[0], order_id: 59, study_name: 'Glucosa', status: 'result_received' },
    )
    get.mockImplementation(async (ruta: string) =>
      ruta.endsWith('/pdf')
        ? { data: new Blob(['%PDF']), headers: { 'x-order-ids': '58,61' } }
        : dos,
    )
    post.mockResolvedValue({ data: { registrado: true } })
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    const { container } = render(<SubirResultadosPage />)
    const vista = within(container)
    await irAResultado(user, vista)

    expect(
      await vista.findByRole('button', { name: 'Imprimir pendientes de Dra. Ana' }),
    ).toBeInTheDocument()
    await user.click(vista.getByRole('button', { name: 'Imprimir pendientes de Dra. Bea' }))

    // Todas las pendientes de esa doctora, no solo las de la página (M5).
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/clinical-tracking/patients/12/orders/pdf', {
        responseType: 'blob',
        params: { pendientes: 'true', doctor_id: '5' },
      }),
    )
    await waitFor(() => expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull())
    await user.click(screen.getByRole('button', { name: 'Descargar' }))
    // La bitácora anota las que el servidor dijo que imprimió.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/clinical-tracking/orders/print-record', {
        order_ids: [58, 61],
        accion: 'descargado',
      }),
    )
    clic.mockRestore()
  })
})

describe('SubirResultadosPage · pestañas accesibles (plan 29, lote 6)', () => {
  it('son pestañas que dicen cuál está elegida', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } })
    render(<SubirResultadosPage />)

    const lista = screen.getByRole('tablist', { name: 'Órdenes y resultados' })
    const [entregar, subir] = within(lista).getAllByRole('tab')
    expect(entregar).toHaveAttribute('aria-selected', 'true')
    expect(subir).toHaveAttribute('aria-selected', 'false')
  })
})

describe('SubirResultadosPage · permisos de sesiones viejas (revisión de flujos)', () => {
  it('una sesión sin permisos en el perfil conserva las pestañas: el servidor decide', () => {
    auth.permissions = undefined
    auth.permitidas = new Set()
    get.mockResolvedValue({ data: { items: [], total: 0 } })
    render(<SubirResultadosPage />)

    expect(screen.getByRole('tab', { name: 'Por entregar' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Subir resultado' })).toBeInTheDocument()
  })

  it('con permisos cargados y ninguno de los dos, no se ofrece lo que el servidor negaría', () => {
    auth.permissions = ['patients.read']
    auth.permitidas = new Set(auth.permissions)
    render(<SubirResultadosPage />)

    expect(screen.getByRole('alert')).toHaveTextContent(/No tienes permiso/)
    expect(screen.queryByRole('tab', { name: 'Subir resultado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adjuntar resultado' })).not.toBeInTheDocument()
  })
})
