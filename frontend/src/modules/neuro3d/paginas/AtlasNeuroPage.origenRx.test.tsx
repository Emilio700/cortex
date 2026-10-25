/**
 * Neuro 3D con el origen «radiografía», sin GPU (la escena se sustituye).
 *
 * Lo que no puede fallar: el aviso dice siempre de dónde sale el modelo, la
 * columna sólo se dobla con un ajuste vigente del servidor, sin él la opción
 * queda deshabilitada diciendo por qué, y al pasar entre los tres orígenes
 * la escena lleva sólo lo de ese origen (el eje ajustado o la capa de la TC).
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AVISO_ORIGEN } from '../dominio/origenModelo'
import { calcularRx } from '../dominio/ajusteRadiografico'
import { lateralSintetica } from '../dominio/radiografiaSintetica'

const permisos = vi.hoisted(() => ({ actual: [] as string[] }))
const modulos = vi.hoisted(() => ({ actual: [] as string[] }))
const capaFalsa = vi.hoisted(() => ({ id: 'paciente-tc', nombre: 'Columna del paciente (TC)', origen: 'paciente', construir: () => [] }))
const crearCapaPaciente = vi.hoisted(() => vi.fn(() => capaFalsa))
const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
const crearEscena = vi.hoisted(() => vi.fn())
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
  capturar: vi.fn(),
  fijarCapaPaciente: vi.fn(() => Promise.resolve({ piezas: 3 })),
  liberar: vi.fn(),
}))

vi.mock('three', () => {
  throw new Error('three no debe cargarse en las pruebas de la pantalla')
})
vi.mock('../servicios/webgl', () => ({ hayWebGL: () => true }))
vi.mock('../servicios/escena', () => ({ crearEscena }))
vi.mock('../servicios/anatomia/capaPaciente', () => ({ crearCapaPaciente }))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({
    user: { role: 'doctor' },
    can: (a: string) => permisos.actual.includes(a),
    tieneModulo: (m: string) => modulos.actual.includes(m),
  }),
}))

import AtlasNeuroPage from './AtlasNeuroPage'
import { pedirOrigen } from '../servicios/origenPedido'

const SIN_ESCALA = { lateral: { tipo: 'ninguna' as const }, ap: { tipo: 'ninguna' as const } }
const MEDICIONES = calcularRx(lateralSintetica({ platillos: { 'L1.superior': 4, 'S1.superior': -30 }, listesis: { 'L4-L5': 0.2 } }), SIN_ESCALA)
const AJUSTE = {
  id: 7,
  patient_id: 5,
  doctor_id: 1,
  lateral_origen: 'imagen_clinica',
  lateral_origen_id: 3,
  ap_origen: null,
  ap_origen_id: null,
  puntos: {},
  calibracion: SIN_ESCALA,
  opciones: { derechaDelPaciente: 'izquierda', cobbCoronal: null },
  mediciones: MEDICIONES,
  version_calculo: '1',
  notas: null,
  created_at: '2026-10-25T10:00:00',
  anulado_at: null,
  anulado_motivo: null,
}

const MODELO_TC = {
  id: 9, patient_id: 5, study_id: 3, series_id: 11, region: 'columna', estado: 'listo', sintetico: false,
  solicitado_en: '2026-10-25T10:00:00', estudio_fecha: '2026-09-12T00:00:00', serie_descripcion: 'columna axial',
  motor: 'TotalSegmentator', motor_version: '2.18.0', modalidad: 'CT', confirmado_en: null,
}

const responder = (ajustes: unknown[], modelos: unknown[] = []) =>
  get.mockImplementation((url: string) => {
    if (url.endsWith('/columna-rx')) return Promise.resolve({ data: ajustes })
    if (url.endsWith('/modelos-3d')) return Promise.resolve({ data: modelos })
    if (url.endsWith('/mallas')) return Promise.resolve({ data: new ArrayBuffer(8) })
    return Promise.resolve({ data: { first_name: 'Juan', last_name: 'Pérez' } })
  })

const abrir = (ruta: string) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/imagen/neuro-3d" element={<AtlasNeuroPage />} />
        <Route path="/pacientes/:patientId/neuro-3d" element={<AtlasNeuroPage />} />
      </Routes>
    </MemoryRouter>,
  )

const ultimaEscena = () => crearEscena.mock.calls[crearEscena.mock.calls.length - 1][0]

beforeEach(() => {
  sessionStorage.clear()
  permisos.actual = ['neuro3d.read', 'spine_rx.read', 'spine_rx.write']
  modulos.actual = []
  crearCapaPaciente.mockClear()
  Object.values(escena).forEach((f) => f.mockClear())
  get.mockReset()
  post.mockReset()
  crearEscena.mockReset()
  crearEscena.mockImplementation(() => Promise.resolve(escena))
})

describe('Neuro 3D desde radiografía', () => {
  it('con un ajuste vigente, la columna se dobla a las medidas y el aviso lo dice', async () => {
    responder([AJUSTE])
    abrir('/pacientes/5/neuro-3d?origen=radiografia')
    await waitFor(() => expect(screen.getByText(AVISO_ORIGEN.radiografia)).toBeInTheDocument())
    await waitFor(() => expect(crearEscena).toHaveBeenLastCalledWith(expect.objectContaining({ ajusteColumna: expect.objectContaining({ sagital: expect.any(Array) }) })))
    const ajuste = crearEscena.mock.calls[crearEscena.mock.calls.length - 1][0].ajusteColumna
    expect(ajuste.sagital).toContainEqual({ nivel: 19, platillo: 'superior', grados: 4 })
    expect(ajuste.listesis).toContainEqual({ nivel: 22, fraccion: 0.2 })
    // Pide sólo los vigentes: uno anulado no se dibuja.
    expect(get).toHaveBeenCalledWith('/patients/5/columna-rx', { params: { incluir_anulados: false } })
    // Las mediciones del servidor, junto al modelo.
    expect(screen.getByText('Calculadas por el servidor')).toBeInTheDocument()
    expect(screen.getByText('Lordosis lumbar L1–S1')).toBeInTheDocument()
  })

  it('volver al esquemático cambia el aviso y rehace la escena sin ajuste', async () => {
    responder([AJUSTE])
    abrir('/pacientes/5/neuro-3d?origen=radiografia')
    await waitFor(() => expect(screen.getByText(AVISO_ORIGEN.radiografia)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('radio', { name: 'Esquemático' }))
    expect(screen.getByText(AVISO_ORIGEN.esquematico)).toBeInTheDocument()
    await waitFor(() => expect(crearEscena).toHaveBeenLastCalledWith(expect.objectContaining({ ajusteColumna: null })))
    expect(escena.liberar).toHaveBeenCalled()
  })

  it('sin radiografías marcadas, la opción queda deshabilitada y dice por qué', async () => {
    responder([])
    abrir('/pacientes/5/neuro-3d?origen=radiografia')
    expect(await screen.findByText('Este paciente no tiene radiografías marcadas.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Radiografía' })).toBeDisabled()
    expect(screen.getByText(AVISO_ORIGEN.esquematico)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Marcar radiografías' })).toHaveAttribute('href', '/pacientes/5/neuro-3d/radiografia')
  })

  it('sin permiso de ver ajustes no los pide ni ofrece marcar', async () => {
    permisos.actual = ['neuro3d.read']
    responder([AJUSTE])
    abrir('/pacientes/5/neuro-3d?origen=radiografia')
    expect(await screen.findByText('Tu cuenta no puede ver los ajustes de radiografía.')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/patients/5/columna-rx', expect.anything())
    expect(screen.queryByRole('link', { name: 'Marcar radiografías' })).toBeNull()
  })

  it('el pedido de la herramienta de marcado llega aunque la pestaña quite el ?origen', async () => {
    responder([AJUSTE])
    pedirOrigen(5, 'radiografia')
    abrir('/pacientes/5/neuro-3d')
    await waitFor(() => expect(screen.getByText(AVISO_ORIGEN.radiografia)).toBeInTheDocument())
    // Se toma una sola vez.
    expect(sessionStorage.getItem('cortex.neuro3d.origen.5')).toBeNull()
  })

  it('un pedido para otro paciente no se toma', async () => {
    responder([AJUSTE])
    pedirOrigen(6, 'radiografia')
    abrir('/pacientes/5/neuro-3d')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Radiografía' })).toBeEnabled())
    expect(screen.getByText(AVISO_ORIGEN.esquematico)).toBeInTheDocument()
    expect(sessionStorage.getItem('cortex.neuro3d.origen.6')).not.toBeNull()
  })

  it('entre los tres orígenes, la escena lleva sólo lo de cada uno y el aviso lo sigue', async () => {
    modulos.actual = ['neuro3d_paciente']
    permisos.actual = ['neuro3d.read', 'spine_rx.read', 'clinical_images.read']
    responder([AJUSTE], [MODELO_TC])
    abrir('/pacientes/5/neuro-3d')
    const radio = (name: string) => screen.getByRole('radio', { name })
    await waitFor(() => expect(radio('Tomografía del paciente')).toBeEnabled())
    await waitFor(() => expect(radio('Radiografía')).toBeEnabled())
    expect(ultimaEscena().ajusteColumna).toBeNull()

    // Esquemático → TC: la capa del paciente sobre la columna sin ajustar.
    await userEvent.click(radio('Tomografía del paciente'))
    expect(await screen.findByText(AVISO_ORIGEN.tc)).toBeInTheDocument()
    expect(escena.fijarCapaPaciente).toHaveBeenLastCalledWith(capaFalsa)
    expect(ultimaEscena().ajusteColumna).toBeNull()
    expect(screen.queryByText('Calculadas por el servidor')).toBeNull()

    // TC → radiografía: se quita la capa y la escena se rehace con el eje ajustado.
    const creadasAntes = crearEscena.mock.calls.length
    await userEvent.click(radio('Radiografía'))
    expect(await screen.findByText(AVISO_ORIGEN.radiografia)).toBeInTheDocument()
    expect(escena.fijarCapaPaciente).toHaveBeenLastCalledWith(null)
    await waitFor(() => expect(crearEscena.mock.calls.length).toBe(creadasAntes + 1))
    expect(ultimaEscena().ajusteColumna).toEqual(expect.objectContaining({ sagital: expect.any(Array) }))
    expect(screen.getByText('Calculadas por el servidor')).toBeInTheDocument()
    await waitFor(() => expect(radio('Radiografía')).toHaveAttribute('aria-checked', 'true'))
    // La escena nueva no recibe la capa de la TC.
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(escena.fijarCapaPaciente).toHaveBeenLastCalledWith(null)

    // Radiografía → TC: la escena vuelve sin ajuste y la capa se pone de nuevo sola.
    await waitFor(() => expect(radio('Tomografía del paciente')).toBeEnabled())
    await userEvent.click(radio('Tomografía del paciente'))
    expect(await screen.findByText(AVISO_ORIGEN.tc)).toBeInTheDocument()
    await waitFor(() => expect(ultimaEscena().ajusteColumna).toBeNull())
    await waitFor(() => expect(escena.fijarCapaPaciente).toHaveBeenLastCalledWith(capaFalsa))
    expect(screen.queryByText(AVISO_ORIGEN.radiografia)).toBeNull()

    // TC → esquemático: ni capa ni ajuste.
    await waitFor(() => expect(radio('Esquemático')).toBeEnabled())
    await userEvent.click(radio('Esquemático'))
    expect(await screen.findByText(AVISO_ORIGEN.esquematico)).toBeInTheDocument()
    expect(escena.fijarCapaPaciente).toHaveBeenLastCalledWith(null)
    expect(ultimaEscena().ajusteColumna).toBeNull()
  })

  it('«Ver en Neuro 3D» desde el visor de TC abre en «tc», aunque antes se pidiera radiografía', async () => {
    modulos.actual = ['neuro3d_paciente']
    permisos.actual = ['neuro3d.read', 'spine_rx.read', 'clinical_images.read']
    responder([AJUSTE], [MODELO_TC])
    pedirOrigen(5, 'radiografia')
    pedirOrigen(5, 'tc', 9)
    abrir('/pacientes/5/neuro-3d')
    expect(await screen.findByText(AVISO_ORIGEN.tc)).toBeInTheDocument()
    expect(ultimaEscena().ajusteColumna).toBeNull()
    expect(sessionStorage.getItem('cortex.neuro3d.origen.5')).toBeNull()
  })

  it('sin paciente en contexto no aparece el origen', async () => {
    abrir('/imagen/neuro-3d')
    await waitFor(() => expect(crearEscena).toHaveBeenCalled())
    expect(screen.queryByText('Origen del modelo')).toBeNull()
    expect(screen.getByText(AVISO_ORIGEN.esquematico)).toBeInTheDocument()
  })
})
