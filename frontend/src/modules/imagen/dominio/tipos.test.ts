import { describe, expect, it } from 'vitest'

import {
  corteEquivalente,
  emparejarSerie,
  estadoDeEstudio,
  fechaCorta,
  formatearBytes,
  nombreDeSerie,
  ordenarSeries,
  serieInicial,
  type EstudioDicom,
  type SerieDicom,
} from './tipos'

const serie = (parcial: Partial<SerieDicom>): SerieDicom => ({
  id: 1,
  series_instance_uid: '1.2.3',
  series_number: 1,
  modality: 'MR',
  series_description: null,
  sequence_label: null,
  sequence_detected_by: null,
  instance_count: 20,
  rows: 512,
  columns: 512,
  pixel_spacing_x: 0.5,
  pixel_spacing_y: 0.5,
  slice_thickness: 2,
  has_geometry: true,
  is_derived: false,
  total_bytes: 10_000_000,
  ...parcial,
})

const estudio = (parcial: Partial<EstudioDicom>): EstudioDicom => ({
  id: 1,
  patient_id: 1,
  study_instance_uid: '1.2.3',
  modality: 'MR',
  study_date: '2026-09-14T00:00:00',
  study_description: null,
  body_part: null,
  institution_name: null,
  status: 'ready',
  status_detail: null,
  series_count: 1,
  instance_count: 20,
  total_bytes: 10_000_000,
  has_contrast: null,
  created_at: '2026-09-15T00:00:00',
  ...parcial,
})

describe('nombreDeSerie', () => {
  it('muestra etiqueta y descripción cuando no coinciden', () => {
    expect(nombreDeSerie(serie({ sequence_label: 'T1+C', series_description: 't1_ax_post' }))).toBe(
      'T1+C · t1_ax_post'
    )
  })

  it('no repite la misma palabra dos veces', () => {
    expect(nombreDeSerie(serie({ sequence_label: 'FLAIR', series_description: 'FLAIR' }))).toBe(
      'FLAIR'
    )
  })

  it('cae a la descripción del equipo y luego al número de serie', () => {
    expect(nombreDeSerie(serie({ series_description: 'SER0001' }))).toBe('SER0001')
    expect(nombreDeSerie(serie({ series_number: 7 }))).toBe('Serie 7')
  })
})

describe('ordenarSeries', () => {
  it('pone primero las secuencias que se leen siempre y al final lo desconocido', () => {
    const ordenadas = ordenarSeries([
      serie({ id: 1, sequence_label: null, series_number: 9 }),
      serie({ id: 2, sequence_label: 'ADC', instance_count: 1 }),
      serie({ id: 3, sequence_label: 'T2', series_number: 2 }),
      serie({ id: 4, sequence_label: 'T1', series_number: 3 }),
    ])

    expect(ordenadas.map((s) => s.id)).toEqual([4, 3, 2, 1])
  })

  it('no muta la lista original', () => {
    const original = [
      serie({ id: 1, sequence_label: 'ADC', instance_count: 1 }),
      serie({ id: 2, sequence_label: 'T1' }),
    ]
    ordenarSeries(original)
    expect(original[0].id).toBe(1)
  })
})

describe('serieInicial', () => {
  it('abre la primera secuencia con cortes', () => {
    const elegida = serieInicial([
      serie({ id: 1, sequence_label: 'T1', instance_count: 0 }),
      serie({ id: 2, sequence_label: 'T2', series_number: 2 }),
    ])
    expect(elegida?.id).toBe(2)
  })

  it('devuelve null si no hay series con cortes', () => {
    expect(serieInicial([])).toBeNull()
    expect(serieInicial([serie({ instance_count: 0 })])).toBeNull()
  })
})

describe('emparejarSerie', () => {
  const previas = [
    serie({ id: 10, sequence_label: 'T1' }),
    serie({ id: 11, sequence_label: 'FLAIR', series_description: 'flair_ax' }),
  ]

  it('empareja por secuencia', () => {
    expect(emparejarSerie(previas, serie({ sequence_label: 'T1' }))?.id).toBe(10)
  })

  it('cae a la descripción cuando la etiqueta no está', () => {
    expect(
      emparejarSerie(previas, serie({ sequence_label: 'OTRA', series_description: 'flair_ax' }))?.id
    ).toBe(11)
  })

  it('no inventa pareja', () => {
    expect(emparejarSerie(previas, serie({ sequence_label: 'ADC' }))).toBeNull()
    expect(emparejarSerie(previas, null)).toBeNull()
  })
})

describe('formatearBytes', () => {
  it('usa la unidad que corresponde', () => {
    expect(formatearBytes(0)).toBe('0 MB')
    expect(formatearBytes(512 * 1024)).toBe('512 KB')
    expect(formatearBytes(125 * 1024 * 1024)).toBe('125.0 MB')
    expect(formatearBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB')
  })
})

describe('fechaCorta', () => {
  it('recorta la fecha ISO a día', () => {
    expect(fechaCorta('2026-09-14T00:00:00')).toBe('2026-09-14')
  })

  it('no revienta cuando no hay fecha', () => {
    // Una pantalla que llama .slice() a un nulo deja el sitio en blanco.
    expect(fechaCorta(null)).toBe('Sin fecha')
    expect(fechaCorta(undefined)).toBe('Sin fecha')
    expect(fechaCorta('   ')).toBe('Sin fecha')
  })
})

describe('estadoDeEstudio', () => {
  it('no dice completo cuando faltan series', () => {
    const parcial = estadoDeEstudio(
      estudio({ status: 'partial', status_detail: 'Faltan 2 de 10 series.' })
    )
    expect(parcial.tono).toBe('aviso')
    expect(parcial.texto).toBe('Faltan 2 de 10 series.')
  })

  it('un estudio sin detalle tampoco se declara completo', () => {
    expect(estadoDeEstudio(estudio({ status: 'partial', status_detail: null })).texto).toBe(
      'El estudio llegó incompleto'
    )
  })
})

describe('corteEquivalente', () => {
  it('mantiene el índice cuando las pilas son iguales', () => {
    expect(corteEquivalente(7, 20, 20)).toBe(7)
  })

  it('mapea proporcionalmente y no se sale del rango', () => {
    expect(corteEquivalente(0, 20, 10)).toBe(0)
    expect(corteEquivalente(19, 20, 10)).toBe(9)
    expect(corteEquivalente(50, 20, 10)).toBe(9)
  })

  it('tolera pilas vacías', () => {
    expect(corteEquivalente(3, 0, 10)).toBe(0)
  })
})
