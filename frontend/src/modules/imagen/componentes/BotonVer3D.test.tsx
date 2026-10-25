/**
 * «Ver en 3D»: habilitado sólo en series volumétricas y, si no, con su motivo
 * escrito a la vista.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { CorteManifiesto, ManifiestoSerie, SerieDicom } from '../dominio/tipos'
import BotonVer3D from './BotonVer3D'

const serie = (cambios: Partial<SerieDicom> = {}): SerieDicom => ({
  id: 9,
  series_instance_uid: '1',
  series_number: 1,
  modality: 'CT',
  series_description: 'Cráneo',
  sequence_label: null,
  sequence_detected_by: null,
  instance_count: 30,
  rows: 256,
  columns: 256,
  pixel_spacing_x: 1,
  pixel_spacing_y: 1,
  slice_thickness: 2,
  has_geometry: true,
  is_derived: false,
  total_bytes: 1,
  ...cambios,
})

const corte = (z: number): CorteManifiesto => ({
  sop_instance_uid: String(z),
  instance_number: z,
  position: [0, 0, z * 2],
  orientation: [1, 0, 0, 0, 1, 0],
  rows: 256,
  columns: 256,
  path: '',
  bytes: 1,
  url: '',
})

const manifiesto = (n: number): ManifiestoSerie => ({
  series_instance_uid: '1',
  series_number: 1,
  modality: 'CT',
  series_description: null,
  sequence_label: null,
  sequence_detected_by: null,
  ordered_by: 'position',
  instances: Array.from({ length: n }, (_, i) => corte(i)),
})

const pintar = (s: SerieDicom, m: ManifiestoSerie | null) =>
  render(
    <MemoryRouter>
      <BotonVer3D patientId={5} estudioId={3} serie={s} manifiesto={m} />
    </MemoryRouter>
  )

describe('BotonVer3D', () => {
  it('en una TC volumétrica es un enlace a la ruta del 3D con la serie', () => {
    pintar(serie(), manifiesto(30))
    expect(screen.getByRole('link', { name: 'Ver en 3D' })).toHaveAttribute('href', '/pacientes/5/estudios/3/3d/9')
  })

  it('mientras llega el manifiesto, deshabilitado y «Revisando la serie…»', () => {
    pintar(serie(), null)
    expect(screen.getByRole('button', { name: 'Ver en 3D' })).toBeDisabled()
    expect(screen.getByText('Revisando la serie…')).toBeInTheDocument()
  })

  it('en una radiografía, deshabilitado y dice por qué', () => {
    pintar(serie({ modality: 'DX', instance_count: 1 }), null)
    expect(screen.getByRole('button', { name: 'Ver en 3D' })).toBeDisabled()
    expect(screen.getByText(/Sin 3D: Es una radiografía \(DX\)/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ver en 3D' })).not.toBeInTheDocument()
  })

  it('con pocos cortes, dice cuántos tiene', () => {
    pintar(serie({ instance_count: 8 }), manifiesto(8))
    expect(screen.getByText(/Tiene 8 cortes/)).toBeInTheDocument()
  })

  it('con cortes no paralelos en el manifiesto, deshabilitado', () => {
    const m = manifiesto(30)
    m.instances[4] = { ...m.instances[4], orientation: [0, 1, 0, 0, 0, 1] }
    pintar(serie(), m)
    expect(screen.getByRole('button', { name: 'Ver en 3D' })).toBeDisabled()
    expect(screen.getByText(/no son paralelos/)).toBeInTheDocument()
  })
})
