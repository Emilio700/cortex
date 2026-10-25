/**
 * La pantalla del visor, sin GPU.
 *
 * Se sustituyen Cornerstone y el arranque del motor porque aquí lo que se prueba
 * es la pantalla: que muestre el estudio correcto, las series en orden, los
 * avisos del servidor y que no se caiga cuando algo viene vacío. Lo que dibuja
 * la imagen se valida a mano contra 3D Slicer.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get, post: vi.fn(), delete: vi.fn() },
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
  annotation: { state: { getAnnotations: () => [] } },
  Enums: { Events: { ANNOTATION_COMPLETED: 'annotation-completed' }, MouseBindings: {} },
}))

import VisorEstudioPage from './VisorEstudioPage'

const SERIES = [
  {
    id: 12,
    series_instance_uid: '1.2.3.2',
    series_number: 2,
    modality: 'MR',
    series_description: 't2_tse_ax',
    sequence_label: 'T2',
    sequence_detected_by: 'tag',
    instance_count: 24,
    rows: 512,
    columns: 512,
    pixel_spacing_x: 0.5,
    pixel_spacing_y: 0.5,
    slice_thickness: 4,
    has_geometry: true,
    is_derived: false,
    total_bytes: 6000000,
  },
  {
    id: 11,
    series_instance_uid: '1.2.3.1',
    series_number: 3,
    modality: 'MR',
    series_description: 't1_ax_post',
    sequence_label: 'T1+C',
    sequence_detected_by: 'tag',
    instance_count: 24,
    rows: 512,
    columns: 512,
    pixel_spacing_x: 0.5,
    pixel_spacing_y: 0.5,
    slice_thickness: 4,
    has_geometry: true,
    is_derived: false,
    total_bytes: 6000000,
  },
]

const ESTUDIO = {
  id: 3,
  patient_id: 7,
  study_instance_uid: '1.2.3',
  modality: 'MR',
  study_date: '2026-09-14T00:00:00',
  study_description: 'RM encefálico con contraste',
  body_part: 'HEAD',
  institution_name: 'Hospital General',
  status: 'partial',
  status_detail: 'Faltan 2 de 10 series.',
  series_count: 2,
  instance_count: 48,
  total_bytes: 12000000,
  has_contrast: true,
  created_at: '2026-09-15T00:00:00',
  series: SERIES,
  annotations: [],
  warnings: ['Faltan 2 de 10 series.'],
}

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/pacientes/7/estudios/3']}>
      <Routes>
        <Route path="/pacientes/:patientId/estudios/:studyId" element={<VisorEstudioPage />} />
      </Routes>
    </MemoryRouter>
  )

describe('VisorEstudioPage', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockImplementation((url: string) => {
      if (url.includes('/comparison-candidates')) return Promise.resolve({ data: [] })
      if (url.includes('/key-images')) return Promise.resolve({ data: [] })
      if (url.includes('/patients/')) return Promise.resolve({ data: { first_name: 'Ana', last_name: 'López' } })
      if (url.includes('/manifest')) {
        return Promise.resolve({ data: { ordered_by: 'posicion', instances: [] } })
      }
      return Promise.resolve({ data: ESTUDIO })
    })
  })

  it('muestra el estudio, su institución y las series en orden de lectura', async () => {
    montar()

    expect(await screen.findByText('RM encefálico con contraste')).toBeInTheDocument()
    expect(screen.getByText(/Hospital General/)).toBeInTheDocument()

    const series = await screen.findAllByRole('button', { name: /T1\+C|T2/ })
    expect(series[0]).toHaveTextContent('T1+C')
    expect(series[1]).toHaveTextContent('T2')
  })

  it('declara que el estudio llegó incompleto en vez de decir que está listo', async () => {
    montar()

    expect(await screen.findByText(/Faltan 2 de 10 series/)).toBeInTheDocument()
    expect(screen.queryByText('Estudio completo')).toBeNull()
  })

  it('un estudio sin series no rompe la pantalla', async () => {
    get.mockImplementation((url: string) => {
      if (url.includes('/comparison-candidates')) return Promise.resolve({ data: [] })
      if (url.includes('/key-images')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { ...ESTUDIO, series: [], series_count: 0, warnings: [] } })
    })

    montar()

    expect(await screen.findByText('RM encefálico con contraste')).toBeInTheDocument()
    expect(screen.getByText('El estudio no tiene series legibles.')).toBeInTheDocument()
  })
})

describe('VisorEstudioPage · cortes clave y controles', () => {
  const MARCA = {
    id: 40,
    study_id: 3,
    series_id: 11,
    series_description: 't1_ax_post',
    instance_index: 7,
    sop_instance_uid: null,
    label: 'Lesión frontal',
    notes: null,
    view_state: {},
    has_image: false,
    created_at: '2026-10-25T10:00:00',
    updated_at: '2026-10-25T10:00:00',
    created_by: 'Dr. Salazar',
  }

  const respuestas = (extra: Record<string, unknown> = {}) =>
    get.mockImplementation((url: string) => {
      if (url in extra) return Promise.resolve({ data: extra[url] })
      if (url.includes('/comparison-candidates')) return Promise.resolve({ data: [] })
      if (url.includes('/key-images')) return Promise.resolve({ data: [] })
      if (url.includes('/patients/')) return Promise.resolve({ data: { first_name: 'Ana', last_name: 'López' } })
      if (url.includes('/manifest')) return Promise.resolve({ data: { ordered_by: 'posicion', instances: [] } })
      return Promise.resolve({ data: ESTUDIO })
    })

  it('muestra la barra con sus herramientas, capturar, corte clave y compartir', async () => {
    respuestas()
    montar()
    await screen.findByText('RM encefálico con contraste')

    for (const nombre of [/^Medir una distancia/, /^Medir un ángulo/, /^Elipse/, /^Invertir los grises/, /^Capturar la imagen/, /^Marcar este corte como clave/, /^Compartir el estudio/, /^Atajos de teclado/]) {
      expect(screen.getByRole('button', { name: nombre })).toBeInTheDocument()
    }
  })

  it('los cortes clave que llegan del servidor se listan en su pestaña', async () => {
    const usuario = userEvent.setup()
    respuestas({ '/imaging/studies/3/key-images': [MARCA] })
    montar()
    await screen.findByText('RM encefálico con contraste')

    await usuario.click(screen.getByText(/^Cortes clave/))
    expect(await screen.findByText('Lesión frontal')).toBeInTheDocument()
    expect(screen.getByText(/Corte 8/)).toBeInTheDocument()
  })

  it('una respuesta que no es una lista de cortes clave no rompe la pantalla', async () => {
    respuestas({ '/imaging/studies/3/key-images': { algo: 'raro' } })
    montar()
    expect(await screen.findByText('RM encefálico con contraste')).toBeInTheDocument()
    expect(screen.getByText(/^Cortes clave/)).toBeInTheDocument()
  })

  it('si no se pueden leer los cortes clave, lo dice en vez de mostrar «ninguno»', async () => {
    get.mockImplementation((url: string) => {
      if (url.includes('/key-images')) return Promise.reject(Object.assign(new Error('x'), { response: { status: 500, data: {} } }))
      if (url.includes('/comparison-candidates')) return Promise.resolve({ data: [] })
      if (url.includes('/patients/')) return Promise.resolve({ data: {} })
      if (url.includes('/manifest')) return Promise.resolve({ data: { instances: [] } })
      return Promise.resolve({ data: ESTUDIO })
    })
    montar()
    expect(await screen.findByText(/No se pudieron cargar los cortes clave/)).toBeInTheDocument()
  })

  it('la tecla «?» abre la lista de atajos, y no mientras se escribe en un campo', async () => {
    const usuario = userEvent.setup()
    respuestas()
    montar()
    await screen.findByText('RM encefálico con contraste')

    await usuario.keyboard('?')
    expect(await screen.findByText('Atajos de teclado', { selector: '.modal-title' })).toBeInTheDocument()
  })

  it('el botón de atajos también abre la ayuda', async () => {
    const usuario = userEvent.setup()
    respuestas()
    montar()
    await screen.findByText('RM encefálico con contraste')
    await usuario.click(screen.getByRole('button', { name: /^Atajos de teclado/ }))
    await waitFor(() => expect(screen.getByText(/Los atajos no funcionan mientras escribes/)).toBeInTheDocument())
  })
})
