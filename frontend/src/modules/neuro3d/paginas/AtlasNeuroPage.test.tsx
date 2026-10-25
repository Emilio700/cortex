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
const modulos = vi.hoisted(() => ({ actual: [] as string[] }))
const capaFalsa = vi.hoisted(() => ({ id: 'paciente-tc', nombre: 'Columna del paciente (TC)', origen: 'paciente', construir: () => [] }))
const crearCapaPaciente = vi.hoisted(() => vi.fn(() => capaFalsa))
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
  fijarCapaPaciente: vi.fn(() => Promise.resolve({ piezas: 3 })),
  liberar: vi.fn(),
}))
const crearEscena = vi.hoisted(() => vi.fn())

vi.mock('three', () => {
  throw new Error('three no debe cargarse en las pruebas de la pantalla')
})
vi.mock('../servicios/webgl', () => ({ hayWebGL: () => webgl.hay }))
vi.mock('../servicios/escena', () => ({ crearEscena }))
vi.mock('../servicios/anatomia/capaPaciente', () => ({ crearCapaPaciente }))
vi.mock('../servicios/captura', () => ({
  componerCaptura: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
  descargar: vi.fn(),
  nombreDeCaptura: () => 'neuro-3d-prueba.png',
}))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({
    user: { role: 'doctor' },
    can: (a: string) => permisos.actual.includes(a),
    tieneModulo: (m: string) => modulos.actual.includes(m),
  }),
}))

import AtlasNeuroPage, { AVISO_ESQUEMATICO } from './AtlasNeuroPage'
import { AVISO_ORIGEN } from '../dominio/origenModelo'
import { AVISO_SINTETICO, SIN_MODELO } from '../dominio/modeloPaciente'

const abrir = (ruta = '/imagen/neuro-3d') =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/imagen/neuro-3d" element={<AtlasNeuroPage />} />
        <Route path="/pacientes/:patientId/neuro-3d" element={<AtlasNeuroPage />} />
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
  modulos.actual = []
  crearCapaPaciente.mockClear()
  get.mockReset()
  post.mockReset()
  crearEscena.mockReset()
  crearEscena.mockImplementation(() => Promise.resolve(escena))
  Object.values(escena).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear?.())
})

describe('Neuro 3D', () => {
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
    const resaltado = escena.fijarResaltado.mock.calls[escena.fijarResaltado.mock.calls.length - 1][0]
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
    const resaltado = escena.fijarResaltado.mock.calls[escena.fijarResaltado.mock.calls.length - 1][0]
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
    abrir('/pacientes/7/neuro-3d')
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
    abrir('/pacientes/7/neuro-3d')
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await abrirGuardar()
    fireEvent.click(ventana().getByLabelText(/Confirmo que existe consentimiento/))
    fireEvent.click(ventana().getByRole('button', { name: 'Guardar en el expediente' }))
    expect(await ventana().findByRole('alert')).toHaveTextContent('No fue posible guardar la imagen clínica')
    expect(post).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Guardado en el expediente.')).not.toBeInTheDocument()
  })
})

describe('Neuro 3D · origen del modelo (TC del paciente)', () => {
  const MODELO = {
    id: 9, patient_id: 7, study_id: 3, series_id: 11, region: 'columna', estado: 'listo', sintetico: false,
    solicitado_en: '2026-10-25T10:00:00', estudio_fecha: '2026-09-12T00:00:00', serie_descripcion: 'columna axial',
    motor: 'TotalSegmentator', motor_version: '2.18.0', modalidad: 'CT', confirmado_en: null,
  }
  const GLB = new ArrayBuffer(8)

  const servidor = (modelos: unknown[] | Error, mallas: ArrayBuffer | Error = GLB) =>
    get.mockImplementation((url: string) => {
      if (url === '/patients/7') return Promise.resolve({ data: { first_name: 'JUAN', last_name: 'PÉREZ' } })
      if (url === '/patients/7/modelos-3d') return modelos instanceof Error ? Promise.reject(modelos) : Promise.resolve({ data: modelos })
      if (url === '/imaging/modelos-3d/9/mallas') return mallas instanceof Error ? Promise.reject(mallas) : Promise.resolve({ data: mallas })
      return Promise.reject(new Error(`ruta no esperada: ${url}`))
    })

  beforeEach(() => {
    modulos.actual = ['neuro3d_paciente']
    permisos.actual = ['neuro3d.read', 'clinical_images.read', 'neuro3d.generar_modelo']
  })

  it('sin paciente en contexto no hay selector de origen', async () => {
    abrir()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    expect(screen.queryByRole('radiogroup', { name: 'Origen del modelo' })).toBeNull()
  })

  it('con el módulo apagado la opción de TC no se pinta ni se consulta', async () => {
    modulos.actual = []
    servidor([MODELO])
    abrir('/pacientes/7/neuro-3d')
    await screen.findByRole('radiogroup', { name: 'Origen del modelo' })
    expect(screen.queryByRole('radio', { name: 'Tomografía del paciente' })).toBeNull()
    expect(get.mock.calls.some(([url]) => String(url).includes('modelos-3d'))).toBe(false)
  })

  it('sin modelo, la opción de TC está deshabilitada y dice cómo generarlo', async () => {
    servidor([])
    abrir('/pacientes/7/neuro-3d')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Tomografía del paciente' })).toBeDisabled())
    expect(screen.getByText(SIN_MODELO)).toBeInTheDocument()
    expect(screen.getByText(AVISO_ESQUEMATICO)).toBeInTheDocument()
  })

  it('al elegir la TC carga las mallas en la escena y sólo entonces cambia el aviso', async () => {
    servidor([MODELO])
    let terminar: (v: { piezas: number }) => void = () => undefined
    escena.fijarCapaPaciente.mockImplementationOnce(() => new Promise((r) => (terminar = r)))
    abrir('/pacientes/7/neuro-3d')
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    const tc = await screen.findByRole('radio', { name: 'Tomografía del paciente' })
    await waitFor(() => expect(tc).toBeEnabled())
    await userEvent.click(tc)

    // Mientras la escena no la tiene, el aviso sigue siendo el del esquemático.
    expect(await screen.findByText('Cargando el modelo…')).toBeInTheDocument()
    expect(screen.getByText(AVISO_ESQUEMATICO)).toBeInTheDocument()
    expect(crearCapaPaciente).toHaveBeenCalledWith(GLB)
    expect(escena.fijarCapaPaciente).toHaveBeenCalledWith(capaFalsa)

    await act(async () => terminar({ piezas: 27 }))
    expect(await screen.findByText(AVISO_ORIGEN.tc)).toBeInTheDocument()
    expect(screen.queryByText(AVISO_ESQUEMATICO)).toBeNull()
    expect(screen.getByRole('radio', { name: 'Tomografía del paciente' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/TotalSegmentator 2\.18\.0/)).toBeInTheDocument()
    expect(screen.getByText(/Sin revisar/)).toBeInTheDocument()

    // Regresar al esquemático quita la capa.
    await userEvent.click(screen.getByRole('radio', { name: 'Esquemático' }))
    await waitFor(() => expect(escena.fijarCapaPaciente).toHaveBeenLastCalledWith(null))
    expect(await screen.findByText(AVISO_ESQUEMATICO)).toBeInTheDocument()
  })

  it('si las mallas no se pueden cargar, lo dice y el aviso no cambia', async () => {
    servidor([MODELO], Object.assign(new Error('x'), { response: { status: 404, data: { detail: 'El archivo del modelo no está en el almacenamiento.' } } }))
    abrir('/pacientes/7/neuro-3d')
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    const tc = await screen.findByRole('radio', { name: 'Tomografía del paciente' })
    await waitFor(() => expect(tc).toBeEnabled())
    await userEvent.click(tc)
    expect(await screen.findByText(/No se pudo mostrar ese modelo: El archivo del modelo no está/)).toBeInTheDocument()
    expect(screen.getByText(AVISO_ESQUEMATICO)).toBeInTheDocument()
    expect(screen.queryByText(AVISO_ORIGEN.tc)).toBeNull()
    expect(escena.fijarCapaPaciente).not.toHaveBeenCalled()
  })

  it('desde el visor (?modelo=) abre ese modelo, y uno sintético lo dice', async () => {
    servidor([{ ...MODELO, sintetico: true, motor: 'sintetico' }])
    abrir('/pacientes/7/neuro-3d?modelo=9')
    expect(await screen.findByText(AVISO_ORIGEN.tc)).toBeInTheDocument()
    expect(screen.getByText(AVISO_SINTETICO)).toBeInTheDocument()
  })

  it('marcar como revisada sólo lo dice cuando el servidor lo registró', async () => {
    servidor([MODELO])
    let responder: (v: unknown) => void = () => undefined
    post.mockImplementation(() => new Promise((r) => (responder = r)))
    abrir('/pacientes/7/neuro-3d?modelo=9')
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como revisada' }))
    expect(post).toHaveBeenCalledWith('/imaging/modelos-3d/9/revisado')
    expect(screen.queryByText(/Quedó registrado/)).toBeNull()
    await act(async () => responder({ data: { ...MODELO, confirmado_en: '2026-10-25T12:00:00', confirmado_por: 'Dr. Salazar' } }))
    expect(await screen.findByText(/Quedó registrado que revisaste/)).toBeInTheDocument()
    expect(screen.getByText(/Revisada por Dr. Salazar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar como revisada' })).toBeNull()
  })
})
