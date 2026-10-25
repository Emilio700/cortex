/**
 * La pantalla del enlace compartido, sin GPU y sin sesión.
 *
 * Lo que no puede fallar: que un enlace que no sirve no diga por qué, que lo que
 * se muestra no traiga datos del paciente ni botones para guardar o compartir, y
 * que se avise de que es material de apoyo y cuándo vence.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get, post: vi.fn(), delete: vi.fn(), defaults: { baseURL: '/api/v1' } },
  default: { get },
}))

vi.mock('../servicios/cornerstone', () => ({
  prepararVisor: () => Promise.resolve(),
  HERRAMIENTAS: {
    ventana: 'WindowLevel',
    desplazar: 'Pan',
    zoom: 'Zoom',
    recorrer: 'StackScroll',
    medir: 'Length',
    area: 'EllipticalROI',
    angulo: 'Angle',
  },
}))

vi.mock('@cornerstonejs/core', () => ({
  Enums: { ViewportType: { STACK: 'stack' } },
  eventTarget: { addEventListener: () => undefined, removeEventListener: () => undefined },
  RenderingEngine: class {
    enableElement() {}
    destroy() {}
    getViewport() {
      return {
        setStack: () => Promise.resolve(),
        render: () => undefined,
        getImageIds: () => [],
        getCurrentImageIdIndex: () => 0,
        setImageIdIndex: () => undefined,
      }
    }
  },
}))

vi.mock('@cornerstonejs/tools', () => ({
  ToolGroupManager: {
    createToolGroup: () => ({
      addViewport: () => undefined,
      addTool: () => undefined,
      setToolActive: () => undefined,
      setToolPassive: () => undefined,
    }),
    destroyToolGroup: () => undefined,
    getToolGroup: () => undefined,
  },
  Enums: { Events: { ANNOTATION_COMPLETED: 'annotation-completed' }, MouseBindings: {} },
}))

import VisorCompartidoPage, { nombreDeSerieCompartida } from './VisorCompartidoPage'

const RESUMEN = {
  modality: 'MR',
  study_date: '2026-09-14T00:00:00',
  study_description: 'RM de encéfalo',
  body_part: 'HEAD',
  expires_at: '2099-01-01T00:00:00',
  aviso: 'Material compartido temporalmente por el consultorio. No incluye datos del paciente y no es un informe radiológico.',
  series: [
    { id: 11, series_number: 3, series_description: 't1_ax_post', sequence_label: 'T1+C', modality: 'MR', instance_count: 24 },
    { id: 12, series_number: 2, series_description: 't2_tse_ax', sequence_label: 'T2', modality: 'MR', instance_count: 24 },
  ],
}

const montar = (token = 'abc123') =>
  render(
    <MemoryRouter initialEntries={[`/compartido/${token}`]}>
      <Routes>
        <Route path="/compartido/:token" element={<VisorCompartidoPage />} />
      </Routes>
    </MemoryRouter>
  )

describe('VisorCompartidoPage', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockImplementation((url: string) => {
      if (url.includes('/manifest')) return Promise.resolve({ data: { instances: [] } })
      return Promise.resolve({ data: RESUMEN })
    })
  })

  it('muestra el estudio con su aviso de material de apoyo y su vencimiento', async () => {
    montar()

    expect(await screen.findByText('RM de encéfalo')).toBeInTheDocument()
    expect(screen.getByText(/no es un informe radiológico/)).toBeInTheDocument()
    expect(screen.getByText(/vence en/)).toBeInTheDocument()
    expect(screen.getByText('CORTEX')).toBeInTheDocument()
  })

  it('pide el estudio con el token del enlace, sin sesión', async () => {
    montar('token-del-enlace')
    await screen.findByText('RM de encéfalo')
    expect(get).toHaveBeenCalledWith('/public/imaging/shared/token-del-enlace')
  })

  it('lista las series y no trae paciente, institución ni botones de guardar', async () => {
    montar()
    await screen.findByText('RM de encéfalo')

    expect(screen.getByRole('button', { name: /T1\+C · t1_ax_post/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /T2 · t2_tse_ax/ })).toBeInTheDocument()
    // Quien abre un enlace mira y mide: no escribe en el expediente de nadie.
    expect(screen.queryByRole('button', { name: /Capturar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /corte como clave/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Compartir/ })).toBeNull()
    expect(screen.queryByText(/Volver al expediente/)).toBeNull()
  })

  it('un enlace que no sirve dice siempre lo mismo, sea por lo que sea', async () => {
    get.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 404, data: { detail: 'Este enlace no existe o ya no está disponible.' } } }))
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent(/no existe o ya no está disponible/)

    get.mockRejectedValue(Object.assign(new Error('y'), { response: { status: 500, data: {} } }))
    montar('otro')
    const alertas = await screen.findAllByRole('alert')
    expect(alertas[alertas.length - 1]).toHaveTextContent(/no existe o ya no está disponible/)
  })

  it('un estudio sin series no rompe la pantalla', async () => {
    get.mockResolvedValue({ data: { ...RESUMEN, series: [] } })
    montar()
    expect(await screen.findByText('RM de encéfalo')).toBeInTheDocument()
    expect(screen.getByText('Series (0)')).toBeInTheDocument()
  })
})

describe('nombreDeSerieCompartida', () => {
  const base = { id: 1, series_number: 4, modality: 'MR', instance_count: 10 }

  it('junta la etiqueta deducida con lo que escribió el equipo cuando no coinciden', () => {
    expect(nombreDeSerieCompartida({ ...base, sequence_label: 'T2', series_description: 't2_tse_ax' })).toBe('T2 · t2_tse_ax')
  })

  it('no repite lo que es igual', () => {
    expect(nombreDeSerieCompartida({ ...base, sequence_label: 'FLAIR', series_description: 'flair' })).toBe('FLAIR')
  })

  it('sin nombre dice el número de serie', () => {
    expect(nombreDeSerieCompartida({ ...base, sequence_label: null, series_description: null })).toBe('Serie 4')
  })
})
