/**
 * Neuro 3D con el origen «radiografía», sin GPU (la escena se sustituye).
 *
 * Lo que no puede fallar: el aviso dice siempre de dónde sale el modelo, la
 * columna sólo se dobla con un ajuste vigente del servidor, y sin él la opción
 * queda deshabilitada diciendo por qué.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AVISO_ORIGEN } from '../dominio/origenModelo'
import { calcularRx } from '../dominio/ajusteRadiografico'
import { lateralSintetica } from '../dominio/radiografiaSintetica'

const permisos = vi.hoisted(() => ({ actual: [] as string[] }))
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
  liberar: vi.fn(),
}))

vi.mock('three', () => {
  throw new Error('three no debe cargarse en las pruebas de la pantalla')
})
vi.mock('../servicios/webgl', () => ({ hayWebGL: () => true }))
vi.mock('../servicios/escena', () => ({ crearEscena }))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'doctor' }, can: (a: string) => permisos.actual.includes(a) }),
}))

import AtlasNeuroPage from './AtlasNeuroPage'

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

const responder = (ajustes: unknown[]) =>
  get.mockImplementation((url: string) => {
    if (url.endsWith('/columna-rx')) return Promise.resolve({ data: ajustes })
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

beforeEach(() => {
  permisos.actual = ['neuro3d.read', 'spine_rx.read', 'spine_rx.write']
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
    await userEvent.click(screen.getByRole('button', { name: 'Esquemático' }))
    expect(screen.getByText(AVISO_ORIGEN.esquematico)).toBeInTheDocument()
    await waitFor(() => expect(crearEscena).toHaveBeenLastCalledWith(expect.objectContaining({ ajusteColumna: null })))
    expect(escena.liberar).toHaveBeenCalled()
  })

  it('sin radiografías marcadas, la opción queda deshabilitada y dice por qué', async () => {
    responder([])
    abrir('/pacientes/5/neuro-3d?origen=radiografia')
    expect(await screen.findByText('Este paciente no tiene radiografías marcadas.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desde radiografía' })).toBeDisabled()
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

  it('sin paciente en contexto no aparece el origen', async () => {
    abrir('/imagen/neuro-3d')
    await waitFor(() => expect(crearEscena).toHaveBeenCalled())
    expect(screen.queryByText('Origen del modelo')).toBeNull()
    expect(screen.getByText(AVISO_ORIGEN.esquematico)).toBeInTheDocument()
  })
})
