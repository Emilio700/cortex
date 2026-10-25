/**
 * Neuro 3D con el atlas detallado (BodyParts3D), sin GPU ni red: la escena,
 * la consulta y la descarga del atlas se simulan.
 *
 * Lo que no puede fallar: sin atlas instalado la opción se ve deshabilitada y
 * dice por qué (nunca una pantalla en blanco); con atlas, el aviso y los
 * créditos cambian sólo cuando la escena ya lo muestra; y no se mezcla con la
 * TC del paciente.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const permisos = vi.hoisted(() => ({ actual: ['neuro3d.read'] as string[] }))
const modulos = vi.hoisted(() => ({ actual: [] as string[] }))
const get = vi.hoisted(() => vi.fn())
const capaAtlasFalsa = vi.hoisted(() => ({ id: 'atlas-bodyparts3d', nombre: 'Atlas', origen: 'referencia', construir: () => [] }))
const capaPacienteFalsa = vi.hoisted(() => ({ id: 'paciente-tc', nombre: 'TC', origen: 'paciente', construir: () => [] }))
const crearCapaAtlas = vi.hoisted(() => vi.fn(() => capaAtlasFalsa))
const consultarAtlas = vi.hoisted(() => vi.fn())
const descargarAtlas = vi.hoisted(() => vi.fn())

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
  fijarCapaAtlas: vi.fn(() => Promise.resolve({ piezas: 130 })),
  liberar: vi.fn(),
}))
const crearEscena = vi.hoisted(() => vi.fn())

vi.mock('three', () => {
  throw new Error('three no debe cargarse en las pruebas de la pantalla')
})
vi.mock('../servicios/webgl', () => ({ hayWebGL: () => true }))
vi.mock('../servicios/escena', () => ({ crearEscena }))
vi.mock('../servicios/anatomia/capaPaciente', () => ({ crearCapaPaciente: () => capaPacienteFalsa }))
vi.mock('../servicios/anatomia/capaAtlas', () => ({ crearCapaAtlas }))
vi.mock('../servicios/atlasDetallado', () => ({ consultarAtlas, descargarAtlas }))
vi.mock('../servicios/captura', () => ({
  componerCaptura: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
  descargar: vi.fn(),
  nombreDeCaptura: () => 'neuro-3d-prueba.png',
}))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post: vi.fn() }, default: { get, post: vi.fn() } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({
    user: { role: 'doctor' },
    can: (a: string) => permisos.actual.includes(a),
    tieneModulo: (m: string) => modulos.actual.includes(m),
  }),
}))

import AtlasNeuroPage from './AtlasNeuroPage'
import { AVISO_ATLAS, COMO_INSTALAR_ATLAS, MOTIVO_SIN_ATLAS, MOTIVO_SOLO_ESQUEMATICO } from '../dominio/atlasDetallado'
import { AVISO_ORIGEN } from '../dominio/origenModelo'

const CREDITOS = {
  id: 'bodyparts3d',
  titulo: 'BodyParts3D',
  autor: 'DBCLS',
  licencia: 'CC BY 4.0',
  texto: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
}
const MANIFIESTO = { version: 1, archivos: [], estructuras: [] }
const INSTALADO = { instalado: true, manifiesto: MANIFIESTO, creditos: CREDITOS }
const DATOS = [new ArrayBuffer(4)]

const abrir = (ruta = '/imagen/neuro-3d') =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/imagen/neuro-3d" element={<AtlasNeuroPage />} />
        <Route path="/pacientes/:patientId/neuro-3d" element={<AtlasNeuroPage />} />
      </Routes>
    </MemoryRouter>,
  )

const atlas = () => screen.getByRole('radio', { name: 'Atlas detallado' })

beforeEach(() => {
  permisos.actual = ['neuro3d.read']
  modulos.actual = []
  get.mockReset()
  get.mockResolvedValue({ data: {} })
  crearEscena.mockReset()
  crearEscena.mockImplementation(() => Promise.resolve(escena))
  consultarAtlas.mockReset()
  descargarAtlas.mockReset()
  crearCapaAtlas.mockClear()
  Object.values(escena).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear?.())
})

describe('Neuro 3D · atlas detallado', () => {
  it('sin el atlas instalado la opción sale deshabilitada, dice por qué y cómo instalarlo; la escena sigue', async () => {
    consultarAtlas.mockResolvedValue({ instalado: false, motivo: MOTIVO_SIN_ATLAS })
    abrir()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await waitFor(() => expect(screen.getByText(MOTIVO_SIN_ATLAS)).toBeInTheDocument())
    expect(atlas()).toBeDisabled()
    expect(screen.getByText(COMO_INSTALAR_ATLAS)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Simplificado' })).toHaveAttribute('aria-checked', 'true')
    expect(crearEscena).toHaveBeenCalled()
    // Los créditos fijos se ven igual; BodyParts3D no, porque no está a la vista.
    expect(screen.getByRole('button', { name: /Créditos/ })).toHaveTextContent('three.js (MIT)')
    expect(screen.getByRole('button', { name: /Créditos/ })).not.toHaveTextContent('BodyParts3D')
  })

  it('al elegirlo se descarga, la escena lo pone y sólo entonces cambian el aviso y los créditos', async () => {
    consultarAtlas.mockResolvedValue(INSTALADO)
    let avanzar: (f: number) => void = () => undefined
    let terminar: (d: ArrayBuffer[]) => void = () => undefined
    descargarAtlas.mockImplementation((_m: unknown, alProgreso: (f: number) => void) => {
      avanzar = alProgreso
      return new Promise((r) => (terminar = r))
    })
    abrir()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await waitFor(() => expect(atlas()).toBeEnabled())
    await userEvent.click(atlas())

    await act(async () => avanzar(0.5))
    expect(screen.getByText(/Descargando el atlas detallado… 50 %/)).toBeInTheDocument()
    expect(screen.queryByText(AVISO_ATLAS)).toBeNull()
    expect(atlas()).toHaveAttribute('aria-checked', 'false')

    await act(async () => terminar(DATOS))
    await waitFor(() => expect(atlas()).toHaveAttribute('aria-checked', 'true'))
    expect(crearCapaAtlas).toHaveBeenCalledWith(MANIFIESTO, DATOS)
    expect(escena.fijarCapaAtlas).toHaveBeenCalledWith(capaAtlasFalsa)
    expect(screen.getByText(AVISO_ATLAS)).toBeInTheDocument()
    // El aviso del origen no cambia: el atlas sigue siendo «esquemático».
    expect(screen.getByText(AVISO_ORIGEN.esquematico)).toBeInTheDocument()
    expect(screen.queryByText(/Descargando el atlas/)).toBeNull()
    const pie = screen.getByRole('button', { name: /Créditos/ })
    expect(pie).toHaveTextContent('BodyParts3D (CC BY 4.0)')
    await userEvent.click(pie)
    expect(screen.getByText(CREDITOS.texto)).toBeInTheDocument()

    // Volver al simplificado quita la capa, el aviso y el crédito.
    await userEvent.click(screen.getByRole('radio', { name: 'Simplificado' }))
    await waitFor(() => expect(escena.fijarCapaAtlas).toHaveBeenLastCalledWith(null))
    await waitFor(() => expect(screen.queryByText(AVISO_ATLAS)).toBeNull())
    expect(screen.queryByText(CREDITOS.texto)).toBeNull()
  })

  it('si la descarga falla, lo dice y no afirma que se ve el atlas', async () => {
    consultarAtlas.mockResolvedValue(INSTALADO)
    descargarAtlas.mockRejectedValue(new Error('cabeza.glb llegó incompleto (3 de 6 bytes).'))
    abrir()
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await waitFor(() => expect(atlas()).toBeEnabled())
    await userEvent.click(atlas())
    expect(
      await screen.findByText(
        'No se pudo mostrar el atlas detallado: cabeza.glb llegó incompleto (3 de 6 bytes). Se sigue viendo el modelo simplificado.',
      ),
    ).toBeInTheDocument()
    expect(atlas()).toHaveAttribute('aria-checked', 'false')
    expect(escena.fijarCapaAtlas).not.toHaveBeenCalled()
    expect(screen.queryByText(AVISO_ATLAS)).toBeNull()
  })

  it('con la TC del paciente el atlas se quita y la opción queda sólo para el esquemático', async () => {
    modulos.actual = ['neuro3d_paciente']
    permisos.actual = ['neuro3d.read', 'clinical_images.read']
    consultarAtlas.mockResolvedValue(INSTALADO)
    descargarAtlas.mockResolvedValue(DATOS)
    const MODELO = {
      id: 9, patient_id: 7, study_id: 3, series_id: 11, region: 'columna', estado: 'listo', sintetico: false,
      solicitado_en: '2026-10-25T10:00:00', estudio_fecha: '2026-09-12T00:00:00', serie_descripcion: 'columna axial',
      motor: 'TotalSegmentator', motor_version: '2.18.0', modalidad: 'CT', confirmado_en: null,
    }
    get.mockImplementation((url: string) => {
      if (url === '/patients/7') return Promise.resolve({ data: { first_name: 'JUAN', last_name: 'PÉREZ' } })
      if (url === '/patients/7/modelos-3d') return Promise.resolve({ data: [MODELO] })
      if (url === '/imaging/modelos-3d/9/mallas') return Promise.resolve({ data: new ArrayBuffer(8) })
      return Promise.resolve({ data: [] })
    })
    abrir('/pacientes/7/neuro-3d')
    await screen.findByRole('toolbar', { name: /Vistas predefinidas/ })
    await waitFor(() => expect(atlas()).toBeEnabled())
    await userEvent.click(atlas())
    await waitFor(() => expect(atlas()).toHaveAttribute('aria-checked', 'true'))

    const tc = screen.getByRole('radio', { name: 'Tomografía del paciente' })
    await waitFor(() => expect(tc).toBeEnabled())
    await userEvent.click(tc)
    await waitFor(() => expect(screen.getByText(AVISO_ORIGEN.tc)).toBeInTheDocument())
    expect(escena.fijarCapaPaciente).toHaveBeenCalledWith(capaPacienteFalsa)
    expect(escena.fijarCapaAtlas).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText(AVISO_ATLAS)).toBeNull()
    expect(atlas()).toBeDisabled()
    expect(screen.getByText(MOTIVO_SOLO_ESQUEMATICO)).toBeInTheDocument()
  })
})
