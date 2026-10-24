/**
 * Imágenes clínicas (plan 29, lote 6): la miniatura recortada no era la única
 * forma de ver la foto, y el campo de archivo no obliga a usar la cámara.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const visor = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))

vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post: vi.fn() } }))
vi.mock('../../../shared/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'doctor' } }) }))
vi.mock('../../../shared/components/VisorDocumentos', () => ({
  default: (props: Record<string, unknown>) => {
    visor.props = props
    return null
  },
}))

import ClinicalImagesPanel from './ClinicalImagesPanel'

const imagen = (id: number) => ({
  id,
  tenant_id: 1,
  patient_id: 4,
  uploaded_by_user_id: 1,
  category: 'clinical_photo',
  body_region: `Región ${id}`,
  taken_at: '2026-10-04T17:00:00',
  consent_obtained: true,
  is_reference: false,
  is_archived: false,
  file_name: `foto-${id}.jpg`,
  file_size: 10,
  mime_type: 'image/jpeg',
})

describe('ClinicalImagesPanel', () => {
  it('pulsar una miniatura abre el visor en esa imagen', async () => {
    get.mockImplementation((url: string) =>
      url.endsWith('/thumbnail')
        ? Promise.resolve({ data: new Blob(['x'], { type: 'image/jpeg' }) })
        : Promise.resolve({ data: [imagen(1), imagen(2)] }),
    )
    const usuario = userEvent.setup()
    render(<ClinicalImagesPanel patientId={4} appointmentId={9} />)

    await usuario.click(await screen.findByRole('button', { name: 'Ver imagen completa: Región 2' }))

    expect(visor.props?.visible).toBe(true)
    expect(visor.props?.inicial).toBe(1)
    expect((visor.props?.archivos as unknown[]).length).toBe(2)
  })

  it('el campo de archivo no obliga a usar la cámara: deja elegir de la galería', async () => {
    get.mockResolvedValue({ data: [] })
    render(<ClinicalImagesPanel patientId={4} />)

    const campo = await screen.findByLabelText('Tomar foto o seleccionar imagen')
    expect(campo).not.toHaveAttribute('capture')
  })
})
