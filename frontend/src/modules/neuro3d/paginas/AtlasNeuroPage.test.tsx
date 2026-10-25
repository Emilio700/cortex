/**
 * La pantalla del atlas, sin GPU.
 *
 * three.js y la escena se sustituyen: aquí se prueba la pantalla (el aviso,
 * el mensaje sin WebGL, la ficha y la conexión que se pide a la escena, las
 * marcas y la regla de «guardado»). Lo que se dibuja se revisa a mano en el
 * navegador.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const webgl = vi.hoisted(() => ({ hay: true }))
const permisos = vi.hoisted(() => ({ actual: ['neuro3d.read'] as string[] }))
const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())

const escena = vi.hoisted(() => ({
  aplicarCapas: vi.fn(),
  fijarCorte: vi.fn(),
  fijarDespiece: vi.fn(),
  irAVista: vi.fn(),
  enfocar: vi.fn(),
  fijarResaltado: vi.fn(),
  fijarHernias: vi.fn(),
  fijarFlujo: vi.fn(),
  fijarRotacion: vi.fn(),
  fijarReducirMovimiento: vi.fn(),
  capturar: vi.fn(() => ({ dataUrl: 'data:image/png;base64,AAAA', ancho: 10, alto: 10 })),
  liberar: vi.fn(),
}))
const crearEscena = vi.hoisted(() => vi.fn())

vi.mock('three', () => {
  throw new Error('three no debe cargarse en las pruebas de la pantalla')
})
vi.mock('../servicios/webgl', () => ({ hayWebGL: () => webgl.hay }))
vi.mock('../servicios/escena', () => ({ crearEscena }))
vi.mock('../servicios/captura', () => ({
  componerCaptura: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
  descargar: vi.fn(),
  nombreDeCaptura: () => 'atlas-neuro-3d-prueba.png',
}))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'doctor' }, can: (a: string) => permisos.actual.includes(a) }),
}))

import AtlasNeuroPage, { AVISO_ESQUEMATICO } from './AtlasNeuroPage'

const abrir = (ruta = '/imagen/atlas-neuro') =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/imagen/atlas-neuro" element={<AtlasNeuroPage />} />
        <Route path="/pacientes/:patientId/atlas-neuro" element={<AtlasNeuroPage />} />
      </Routes>
    </MemoryRouter>,
  )

/**
 * Abre la ventana de guardar y espera a que termine su animación: CModal vuelve
 * a montar el contenido al terminarla, y un nodo tomado antes ya no está en el
 * documento (un clic ahí no hace nada).
 */
const abrirGuardar = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Guardar en el expediente' }))
  await act(() => new Promise((r) => setTimeout(r, 400)))
}
const ventana = () => {
  const ventanas = screen.getAllByRole('dialog')
  return within(ventanas[ventanas.length - 1])
}

beforeEach(() => {
  // jsdom no trae URL de objetos: la vista previa de la captura la necesita.
  URL.createObjectURL = vi.fn(() => 'blob:prueba')
  URL.revokeObjectURL = vi.fn()
  webgl.hay = true
  permisos.actual = ['neuro3d.read']
  get.mockReset()
  post.mockReset()
  crearEscena.mockReset()
  crearEscena.mockImplementation(() => Promise.resolve(escena))
  Object.values(escena).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear?.())
})

describe('Atlas Neuro 3D', () => {
  it('siempre dice que es un modelo esquemático', async () => {
    abrir()
    expect(screen.getByText(AVISO_ESQUEMATICO)).toBeInTheDocument()
    expect(AVISO_ESQUEMATICO).toBe(
      'Modelo esquemático con fines educativos; no representa la anatomía de este paciente ni sustituye su estudio de imagen.',
    )
    await waitFor(() => expect(crearEscena).toHaveBeenCalled())
  })

  it('sin WebGL muestra un mensaje claro y no intenta crear la escena', async () => {
    webgl.hay = false
    abrir()
    expect(await screen.findByText('Este equipo no puede mostrar el modelo 3D')).toBeInTheDocument()
    expect(crearEscena).not.toHaveBeenCalled()
    expect(screen.queryByRole('toolbar', { name: /Vistas predefinidas/ })).not.toBeInTheDocument()
  })

  it('si la escena falla al prepararse, lo dice en vez de quedar en blanco', async () => {
    crearEscena.mockImplementation(() => Promise.reject(new Error('boom')))
    abrir()
    expect(await screen.findByText(/No se pudo preparar el modelo 3D/)).toBeInTheDocument()
  })

  it('libera la escena al salir', async () => {
    const { unmount } = abrir()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    unmount()
    expect(escena.liberar).toHaveBeenCalled()
  })

  it('las vistas se cambian con botones y con el teclado', async () => {
    abrir()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await userEvent.click(screen.getByRole('button', { name: /Lateral/ }))
    expect(escena.irAVista).toHaveBeenLastCalledWith('lateral')
    await userEvent.keyboard('5')
    expect(escena.irAVista).toHaveBeenLastCalledWith('columna')
    expect(screen.getByRole('button', { name: /Columna completa/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('al elegir la raíz L5 se encienden su segmento, su disco y su dermatoma', async () => {
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Ver la raíz L5 derecha' }))
    expect(screen.getByRole('heading', { name: 'Raíz L5 derecha' })).toBeInTheDocument()
    const resaltado = escena.fijarResaltado.mock.calls.at(-1)![0]
    expect(resaltado.seleccion).toEqual(['raiz-L5-der'])
    expect(resaltado.conexion.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(['segmento-L5', 'disco-L4-L5', 'vertebra-L5', 'sacro']),
    )
    expect(resaltado.atenuarColumna).toBe(true)
    expect(escena.enfocar).toHaveBeenCalled()
    expect(screen.getByRole('img', { name: /L5 derecho/ })).toBeInTheDocument()
    expect(screen.getByText(/tercera articulación metatarsofalángica/)).toBeInTheDocument()
  })

  it('el modo explicar marca la hernia y enciende la raíz comprimida', async () => {
    abrir()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await userEvent.click(screen.getByRole('button', { name: 'Explicar al paciente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Marcar nivel' }))
    expect(screen.getByText('Hernia L4-L5 paracentral derecha · raíz L5')).toBeInTheDocument()
    expect(escena.fijarHernias).toHaveBeenLastCalledWith([{ disco: 'L4-L5', posicion: 'paracentral', lado: 'derecho' }])
    const resaltado = escena.fijarResaltado.mock.calls.at(-1)![0]
    expect(resaltado.afectados).toEqual(['disco-L4-L5', 'raiz-L5-der'])
  })

  it('sin paciente en contexto no ofrece guardar en el expediente', async () => {
    permisos.actual = ['neuro3d.read', 'clinical_images.upload']
    abrir()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    expect(screen.queryByRole('button', { name: 'Guardar en el expediente' })).not.toBeInTheDocument()
  })

  it('con paciente, sólo dice «guardado» cuando el servidor lo confirma', async () => {
    permisos.actual = ['neuro3d.read', 'clinical_images.upload']
    get.mockResolvedValue({ data: { first_name: 'JUAN', last_name: 'PÉREZ' } })
    let responder: (v: unknown) => void = () => undefined
    post.mockImplementation(() => new Promise((r) => (responder = r)))
    abrir('/pacientes/7/atlas-neuro')
    expect(await screen.findByText('Paciente: JUAN PÉREZ')).toBeInTheDocument()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await abrirGuardar()
    fireEvent.click(ventana().getByLabelText(/Confirmo que existe consentimiento/))
    fireEvent.click(ventana().getByRole('button', { name: 'Guardar en el expediente' }))
    expect(await ventana().findByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(screen.queryByText('Guardado en el expediente.')).not.toBeInTheDocument()
    const form = post.mock.calls[0][1] as FormData
    expect(post.mock.calls[0][0]).toBe('/clinical-images/upload')
    expect(form.get('patient_id')).toBe('7')
    expect(form.get('consent_obtained')).toBe('true')
    expect(form.get('category')).toBe('reference')
    await act(async () => responder({ data: { id: 1, patient_id: 7 } }))
    expect(await screen.findByText('Guardado en el expediente.')).toBeInTheDocument()
  })

  it('si el servidor rechaza la imagen, lo dice y no afirma que se guardó', async () => {
    permisos.actual = ['neuro3d.read', 'clinical_images.upload']
    get.mockResolvedValue({ data: {} })
    post.mockRejectedValue({ response: { status: 500, data: { detail: 'No fue posible guardar la imagen clínica' } } })
    abrir('/pacientes/7/atlas-neuro')
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await abrirGuardar()
    fireEvent.click(ventana().getByLabelText(/Confirmo que existe consentimiento/))
    fireEvent.click(ventana().getByRole('button', { name: 'Guardar en el expediente' }))
    expect(await ventana().findByRole('alert')).toHaveTextContent('No fue posible guardar la imagen clínica')
    expect(post).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Guardado en el expediente.')).not.toBeInTheDocument()
  })
})
