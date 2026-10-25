import { describe, expect, it } from 'vitest'

import { AVISO_ORIGEN } from './origenModelo'
import { describirModelo, EN_CURSO, NO_SE_CONSULTO, opcionDeTc, SIN_MODELO, textoDeRevision, type Modelo3D } from './modeloPaciente'

const m = (cambios: Partial<Modelo3D>): Modelo3D => ({
  id: 1, patient_id: 7, study_id: 3, series_id: 11, region: 'columna', estado: 'listo',
  sintetico: false, solicitado_en: '2026-10-25T10:00:00', ...cambios,
})

describe('opción «Tomografía del paciente»', () => {
  it('sólo se ofrece un modelo que el servidor dio por listo', () => {
    expect(opcionDeTc([m({ id: 2, estado: 'procesando' }), m({ id: 1, estado: 'listo' })])).toEqual({
      opcion: { disponible: true },
      modelo: expect.objectContaining({ id: 1 }),
    })
  })

  it('con el preferido del visor, se usa ése si está listo', () => {
    const lista = [m({ id: 3 }), m({ id: 2 })]
    expect(opcionDeTc(lista, 2).modelo?.id).toBe(2)
    expect(opcionDeTc(lista, 99).modelo?.id).toBe(3)
  })

  it('sin modelos, dice cómo generarlo', () => {
    expect(opcionDeTc([]).opcion).toEqual({ disponible: false, motivo: SIN_MODELO })
  })

  it('en curso, dice que se está armando', () => {
    expect(opcionDeTc([m({ estado: 'pendiente' })]).opcion).toEqual({ disponible: false, motivo: EN_CURSO })
  })

  it('si el último falló, dice el motivo', () => {
    expect(opcionDeTc([m({ estado: 'fallo', motivo_fallo: 'No se encontró columna.' })]).opcion.motivo).toBe(
      'El último intento no se pudo: No se encontró columna.',
    )
  })

  it('si no se pudo consultar, lo dice', () => {
    expect(opcionDeTc(null).opcion).toEqual({ disponible: false, motivo: NO_SE_CONSULTO })
  })
})

describe('descripción del modelo', () => {
  it('dice de qué estudio salió y con qué motor', () => {
    const texto = describirModelo(m({ estudio_fecha: '2026-09-12T00:00:00', serie_descripcion: 'columna axial', motor: 'TotalSegmentator', motor_version: '2.18.0', modalidad: 'CT' }))
    expect(texto).toMatch(/^TC del /)
    expect(texto).toContain('columna axial')
    expect(texto).toContain('TotalSegmentator 2.18.0')
  })

  it('sin revisar lo dice; revisada dice quién', () => {
    expect(textoDeRevision(m({}))).toMatch(/^Sin revisar/)
    expect(textoDeRevision(m({ confirmado_en: '2026-10-25T12:00:00', confirmado_por: 'Dr. Salazar' }))).toMatch(/^Revisada por Dr. Salazar/)
  })

  it('el aviso del origen tc pide revisarla contra las imágenes', () => {
    expect(AVISO_ORIGEN.tc).toMatch(/Revísala contra las imágenes originales/)
  })
})
