/** La galería combinada (plan 32, punto 6): una sola lista con filtros. */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const rol = vi.hoisted(() => ({ actual: 'doctor' }))
vi.mock('../../shared/services/api', () => ({ apiClient: { get }, default: { get } }))
vi.mock('../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { role: rol.actual }, can: () => true }),
}))
vi.mock('../doctor/components/ClinicalImagesPanel', () => ({
  default: () => <div>Agregar imagen clínica</div>,
}))

import PestanaImagenes from './PestanaImagenes'

const ITEMS = [
  {
    origen: 'resultado',
    id: 5,
    categoria: 'mastografia',
    categoria_texto: 'Mastografía',
    fecha: '2026-09-25T17:00:00',
    titulo: 'Mastografía bilateral',
    file_name: 'm.pdf',
    descarga: '/documents/5/download',
    order_id: 9,
    subido_por: 'Jhoany',
  },
  {
    origen: 'consulta',
    id: 2,
    categoria: 'foto_clinica',
    categoria_texto: 'Foto clínica',
    fecha: '2026-09-01T17:00:00',
    titulo: 'Lesión',
    file_name: 'f.jpg',
    descarga: '/clinical-images/2/download',
  },
]

const ESTUDIO = {
  id: 3,
  patient_id: 7,
  study_instance_uid: '1.2.3',
  modality: 'MR',
  study_date: '2026-09-14T00:00:00',
  study_description: 'RM encefálico',
  body_part: 'HEAD',
  institution_name: null,
  status: 'ready',
  status_detail: null,
  series_count: 4,
  instance_count: 96,
  total_bytes: 104857600,
  has_contrast: true,
  created_at: '2026-09-15T00:00:00',
}

// La pestaña ahora enlaza al visor de estudios, así que necesita un enrutador
// como en la aplicación.
const montar = () =>
  render(
    <MemoryRouter>
      <PestanaImagenes patientId={7} />
    </MemoryRouter>
  )

describe('PestanaImagenes', () => {
  beforeEach(() => {
    get.mockReset()
    rol.actual = 'doctor'
    // La pestaña hace dos lecturas: la galería de siempre y los estudios DICOM
    // que ahora viven arriba. Se responde a cada una con lo suyo; si las dos
    // devolvieran la misma lista, la prueba mentiría.
    get.mockImplementation((url: string) =>
      url.includes('/imaging/studies')
        ? Promise.resolve({ data: [], headers: {} })
        : Promise.resolve({ data: ITEMS, headers: { 'x-total-count': '2' } })
    )
  })

  it('muestra las dos fuentes en una lista, con su categoría y origen', async () => {
    montar()
    expect(await screen.findByText('Mastografía bilateral')).toBeInTheDocument()
    expect(screen.getByText(/Resultado de orden · Jhoany/)).toBeInTheDocument()
    expect(screen.getByText(/De la consulta/)).toBeInTheDocument()
    expect(screen.getByText('Agregar imagen clínica')).toBeInTheDocument()
  })

  it('los filtros los aplica el servidor', async () => {
    const user = userEvent.setup()
    montar()
    await screen.findByText('Lesión')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'ultrasonido')
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/patients/7/imagenes', {
        params: expect.objectContaining({ categoria: 'ultrasonido', skip: 0 }),
      })
    )
  })

  it('los estudios DICOM se ofrecen aparte de la galería', async () => {
    get.mockImplementation((url: string) =>
      url.includes('/imaging/studies')
        ? Promise.resolve({ data: [ESTUDIO], headers: {} })
        : Promise.resolve({ data: ITEMS, headers: { 'x-total-count': '2' } })
    )

    montar()

    expect(await screen.findByText('RM encefálico')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir visor' })).toBeInTheDocument()
    expect(screen.getByText('Estudios de imagen (DICOM)')).toBeInTheDocument()
  })

  it('recepción no tiene el formulario de fotos clínicas', async () => {
    rol.actual = 'secretaria'
    montar()
    await screen.findByText('Lesión')
    expect(screen.queryByText('Agregar imagen clínica')).toBeNull()
  })

  it('si no se pudo leer, lo dice', async () => {
    // Falla la galería, no los estudios DICOM: es la que tiene botón de reintentar.
    get.mockImplementation((url: string) =>
      url.includes('/imaging/studies')
        ? Promise.resolve({ data: [], headers: {} })
        : Promise.reject({ message: 'Network Error', request: {} })
    )
    montar()
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
