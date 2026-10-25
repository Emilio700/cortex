/**
 * «3D del estudio» sin GPU: se simula el servicio del volumen para probar los
 * estados de la pantalla (revisando, cargando con progreso, listo, falla con
 * «Reducir resolución», serie no apta, sin WebGL). Lo que pinta la tarjeta se
 * revisó en el navegador.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const servicio = vi.hoisted(() => ({
  crear: vi.fn(),
  webgl: true,
  float: true,
}))

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get, post: vi.fn(), delete: vi.fn(), defaults: { baseURL: '/api' } },
  default: { get },
}))

vi.mock('../servicios/cornerstone', () => ({ prepararVisor: () => Promise.resolve() }))

vi.mock('../servicios/volumen3d', async () => {
  class FalloDeVolumen extends Error {
    constructor(
      mensaje: string,
      readonly sugerirReducir: boolean
    ) {
      super(mensaje)
    }
  }
  return {
    FalloDeVolumen,
    crearVolumen3D: servicio.crear,
    hayWebGL2: () => servicio.webgl,
    soportaTexturasFloat: () => servicio.float,
    explicarFallo: (f: unknown) =>
      f instanceof FalloDeVolumen ? f : new FalloDeVolumen(`No se pudo armar el volumen: ${String(f)}.`, true),
  }
})

import Volumen3DPage from './Volumen3DPage'
import { FalloDeVolumen } from '../servicios/volumen3d'

const SERIE = {
  id: 9,
  series_instance_uid: '1',
  series_number: 2,
  modality: 'CT',
  series_description: 'Angio cráneo',
  sequence_label: null,
  sequence_detected_by: null,
  instance_count: 30,
  rows: 256,
  columns: 256,
  pixel_spacing_x: 1,
  pixel_spacing_y: 1,
  slice_thickness: 1,
  has_geometry: true,
  is_derived: false,
  total_bytes: 1,
}

const ESTUDIO = {
  id: 3,
  patient_id: 5,
  study_instance_uid: '9',
  modality: 'CT',
  study_date: '2026-10-01',
  study_description: 'Angio-TC de cráneo',
  body_part: null,
  institution_name: null,
  status: 'ready',
  status_detail: null,
  series_count: 1,
  instance_count: 30,
  total_bytes: 1,
  has_contrast: true,
  created_at: '2026-10-01',
  series: [SERIE],
}

const MANIFIESTO = {
  series_instance_uid: '1',
  series_number: 2,
  modality: 'CT',
  series_description: null,
  sequence_label: null,
  sequence_detected_by: null,
  ordered_by: 'position',
  instances: Array.from({ length: 30 }, (_, i) => ({
    sop_instance_uid: String(i),
    instance_number: i,
    position: [0, 0, i],
    orientation: [1, 0, 0, 0, 1, 0],
    rows: 256,
    columns: 256,
    path: '',
    bytes: 1,
    url: `/imaging/series/9/instances/${i}`,
  })),
}

const volumenSimulado = () => ({
  aplicarPreajuste: vi.fn(),
  ajustarOpacidad: vi.fn(),
  recortar: vi.fn(),
  aplicarHerramienta: vi.fn(),
  fijarCinematica: vi.fn(),
  restablecer: vi.fn(),
  lienzo: () => null,
  destruir: vi.fn(),
})

function responder(estudio = ESTUDIO, manifiesto = MANIFIESTO) {
  get.mockImplementation((url: string) => {
    if (url.startsWith('/imaging/studies/')) return Promise.resolve({ data: estudio })
    if (url.endsWith('/manifest')) return Promise.resolve({ data: manifiesto })
    return Promise.resolve({ data: [] })
  })
}

const abrir = () =>
  render(
    <MemoryRouter initialEntries={['/pacientes/5/estudios/3/3d/9']}>
      <Routes>
        <Route path="/pacientes/:patientId/estudios/:studyId/3d/:serieId" element={<Volumen3DPage />} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  get.mockReset()
  servicio.crear.mockReset()
  servicio.webgl = true
  servicio.float = true
})

describe('Volumen3DPage', () => {
  it('muestra el aviso fijo y el progreso de la carga, y al terminar habilita los controles', async () => {
    responder()
    let terminar: (v: unknown) => void = () => undefined
    let avisar: (p: unknown) => void = () => undefined
    servicio.crear.mockImplementation((opciones: { alProgreso: (p: unknown) => void }) => {
      avisar = opciones.alProgreso
      return new Promise((r) => (terminar = r))
    })
    abrir()
    expect(screen.getByRole('note')).toHaveTextContent('para medir y decidir, usa los cortes')
    await waitFor(() => expect(servicio.crear).toHaveBeenCalled())
    expect(servicio.crear.mock.calls[0][0]).toMatchObject({ decimado: 1, preajuste: 'hueso' })

    act(() => avisar({ fase: 'descargando', hechos: 12, total: 30 }))
    expect(screen.getByText('Descargando cortes 12 / 30')).toBeInTheDocument()
    expect(screen.getByLabelText('Preajuste')).toBeDisabled()

    const volumen = volumenSimulado()
    await act(async () => terminar(volumen))
    await waitFor(() => expect(screen.getByLabelText('Preajuste')).not.toBeDisabled())
    expect(screen.queryByText(/Descargando cortes/)).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Angio-TC (vasos con contraste)' })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Preajuste'), 'angio-tc')
    expect(volumen.aplicarPreajuste).toHaveBeenCalledWith('angio-tc')
    // No hay mediciones en esta vista.
    expect(screen.queryByRole('button', { name: /medir|distancia/i })).not.toBeInTheDocument()
  })

  it('si falla, lo dice y «Reducir resolución» vuelve a cargar con un corte de cada dos', async () => {
    responder()
    servicio.crear.mockRejectedValueOnce(new FalloDeVolumen('Se agotó la memoria para el volumen.', true))
    servicio.crear.mockImplementation(() => new Promise(() => undefined))
    abrir()
    expect(await screen.findByText('No se pudo mostrar el volumen')).toBeInTheDocument()
    expect(screen.getByText('Se agotó la memoria para el volumen.')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Reducir resolución' })[0])
    await waitFor(() => expect(servicio.crear).toHaveBeenCalledTimes(2))
    expect(servicio.crear.mock.calls[1][0]).toMatchObject({ decimado: 2 })
    expect(await screen.findByText(/Se carga un corte de cada 2/)).toBeInTheDocument()
  })

  it('si la tarjeta pierde el contexto, suelta el volumen y ofrece recargar', async () => {
    responder()
    let perder: () => void = () => undefined
    const volumen = volumenSimulado()
    servicio.crear.mockImplementation((opciones: { alPerderContexto: () => void }) => {
      perder = opciones.alPerderContexto
      return Promise.resolve(volumen)
    })
    abrir()
    await waitFor(() => expect(screen.getByLabelText('Preajuste')).not.toBeDisabled())
    act(() => perder())
    expect(await screen.findByText(/perdió el contexto/)).toBeInTheDocument()
    expect(volumen.destruir).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument()
  })

  it('una serie que no es volumétrica no carga nada y dice por qué', async () => {
    responder({ ...ESTUDIO, series: [{ ...SERIE, instance_count: 5 }] })
    abrir()
    expect(await screen.findByText('Esta serie no se puede ver en 3D')).toBeInTheDocument()
    expect(screen.getByText(/Tiene 5 cortes/)).toBeInTheDocument()
    expect(servicio.crear).not.toHaveBeenCalled()
  })

  it('sin WebGL 2 lo dice y no intenta cargar', async () => {
    responder()
    servicio.webgl = false
    abrir()
    expect(await screen.findByText('Este equipo no puede pintar el volumen')).toBeInTheDocument()
    expect(servicio.crear).not.toHaveBeenCalled()
  })

  it('avisa si la tarjeta no pinta texturas de punto flotante', async () => {
    responder()
    servicio.float = false
    servicio.crear.mockImplementation(() => new Promise(() => undefined))
    abrir()
    expect(await screen.findByText(/no pinta texturas de punto flotante/)).toBeInTheDocument()
  })

  it('al salir suelta el volumen', async () => {
    responder()
    const volumen = volumenSimulado()
    servicio.crear.mockResolvedValue(volumen)
    const { unmount } = abrir()
    await waitFor(() => expect(screen.getByLabelText('Preajuste')).not.toBeDisabled())
    unmount()
    expect(volumen.destruir).toHaveBeenCalled()
  })
})
