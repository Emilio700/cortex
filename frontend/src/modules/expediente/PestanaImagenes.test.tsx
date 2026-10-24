/** La galería combinada (plan 32, punto 6): una sola lista con filtros. */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const rol = vi.hoisted(() => ({ actual: 'doctor' }))
vi.mock('../../shared/services/api', () => ({ apiClient: { get }, default: { get } }))
vi.mock('../../shared/context/AuthContext', () => ({ useAuth: () => ({ user: { role: rol.actual }, can: () => true }) }))
vi.mock('../doctor/components/ClinicalImagesPanel', () => ({ default: () => <div>Agregar imagen clínica</div> }))

import PestanaImagenes from './PestanaImagenes'

const ITEMS = [
  { origen: 'resultado', id: 5, categoria: 'mastografia', categoria_texto: 'Mastografía', fecha: '2026-09-25T17:00:00',
    titulo: 'Mastografía bilateral', file_name: 'm.pdf', descarga: '/documents/5/download', order_id: 9, subido_por: 'Jhoany' },
  { origen: 'consulta', id: 2, categoria: 'foto_clinica', categoria_texto: 'Foto clínica', fecha: '2026-09-01T17:00:00',
    titulo: 'Lesión', file_name: 'f.jpg', descarga: '/clinical-images/2/download' },
]

describe('PestanaImagenes', () => {
  beforeEach(() => {
    get.mockReset()
    rol.actual = 'doctor'
    get.mockResolvedValue({ data: ITEMS, headers: { 'x-total-count': '2' } })
  })

  it('muestra las dos fuentes en una lista, con su categoría y origen', async () => {
    render(<PestanaImagenes patientId={7} />)
    expect(await screen.findByText('Mastografía bilateral')).toBeInTheDocument()
    expect(screen.getByText(/Resultado de orden · Jhoany/)).toBeInTheDocument()
    expect(screen.getByText(/De la consulta/)).toBeInTheDocument()
    expect(screen.getByText('Agregar imagen clínica')).toBeInTheDocument()
  })

  it('los filtros los aplica el servidor', async () => {
    const user = userEvent.setup()
    render(<PestanaImagenes patientId={7} />)
    await screen.findByText('Lesión')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'ultrasonido')
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/patients/7/imagenes', {
        params: expect.objectContaining({ categoria: 'ultrasonido', skip: 0 }),
      }),
    )
  })

  it('recepción no tiene el formulario de fotos clínicas', async () => {
    rol.actual = 'secretaria'
    render(<PestanaImagenes patientId={7} />)
    await screen.findByText('Lesión')
    expect(screen.queryByText('Agregar imagen clínica')).toBeNull()
  })

  it('si no se pudo leer, lo dice', async () => {
    get.mockRejectedValueOnce({ message: 'Network Error', request: {} })
    render(<PestanaImagenes patientId={7} />)
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
