/**
 * Reglas del render volumétrico: qué serie forma un volumen, qué preajuste se
 * ofrece, cómo se mueve la curva de opacidad, dónde cortan los planos y cuánto
 * pesa. Si alguna se equivoca, el médico ve un volumen deformado sin saberlo.
 */
import { describe, expect, it } from 'vitest'
import { CONSTANTS } from '@cornerstonejs/core'

import type { CorteManifiesto, ManifiestoSerie, SerieDicom } from './tipos'
import {
  AVISO_RENDER_3D,
  MINIMO_DE_CORTES,
  PREAJUSTES_3D,
  SIN_RECORTE,
  curvaDeOpacidad,
  decimarCortes,
  elegibilidad3D,
  factorDeDecimado,
  memoriaDelVolumen,
  planosDeRecorte,
  preajusteInicial,
  preajustesParaModalidad,
  rangoDeUmbral,
} from './volumen3d'

const serie = (cambios: Partial<SerieDicom> = {}): SerieDicom => ({
  id: 7,
  series_instance_uid: '1.2.3',
  series_number: 2,
  modality: 'CT',
  series_description: 'Columna hueso',
  sequence_label: null,
  sequence_detected_by: null,
  instance_count: 60,
  rows: 512,
  columns: 512,
  pixel_spacing_x: 0.5,
  pixel_spacing_y: 0.5,
  slice_thickness: 1,
  has_geometry: true,
  is_derived: false,
  total_bytes: 1,
  ...cambios,
})

const corte = (z: number, cambios: Partial<CorteManifiesto> = {}): CorteManifiesto => ({
  sop_instance_uid: `1.2.3.${z}`,
  instance_number: Math.round(z),
  position: [0, 0, z],
  orientation: [1, 0, 0, 0, 1, 0],
  rows: 512,
  columns: 512,
  path: 'x',
  bytes: 1,
  url: `/imaging/series/7/instances/${z}`,
  ...cambios,
})

const manifiesto = (cortes: CorteManifiesto[]): ManifiestoSerie => ({
  series_instance_uid: '1.2.3',
  series_number: 2,
  modality: 'CT',
  series_description: null,
  sequence_label: null,
  sequence_detected_by: null,
  ordered_by: 'position',
  instances: cortes,
})

const uniformes = (n: number, paso = 1.25) => Array.from({ length: n }, (_, i) => corte(i * paso))

describe('elegibilidad3D', () => {
  it('acepta una TC con cortes paralelos y espaciado uniforme', () => {
    const r = elegibilidad3D(serie(), manifiesto(uniformes(60)))
    expect(r).toEqual({ apta: true, cortes: 60, espaciado: 1.25 })
  })

  it('acepta una RM y el orden del manifiesto no importa', () => {
    const cortes = uniformes(40, 3).reverse()
    expect(elegibilidad3D(serie({ modality: 'MR', instance_count: 40 }), manifiesto(cortes)).apta).toBe(true)
  })

  it('niega una radiografía (CR/DX) y dice que es una proyección', () => {
    for (const modality of ['CR', 'DX']) {
      const r = elegibilidad3D(serie({ modality, instance_count: 1 }))
      expect(r.apta).toBe(false)
      if (!r.apta) expect(r.motivo).toMatch(/radiografía/)
    }
  })

  it('niega otras modalidades', () => {
    const r = elegibilidad3D(serie({ modality: 'US' }))
    expect(r).toEqual({ apta: false, motivo: expect.stringMatching(/Sólo la TC y la RM/) })
  })

  it('niega una serie 2D de un solo corte', () => {
    const r = elegibilidad3D(serie({ instance_count: 1 }))
    expect(r).toEqual({ apta: false, motivo: expect.stringMatching(/serie 2D/) })
  })

  it('niega una serie sin posición', () => {
    const r = elegibilidad3D(serie({ has_geometry: false }))
    expect(r).toEqual({ apta: false, motivo: expect.stringMatching(/posición/) })
  })

  it('niega pocos cortes y dice cuántos hacen falta', () => {
    const r = elegibilidad3D(serie({ instance_count: 12 }))
    expect(r).toEqual({ apta: false, motivo: `Tiene 12 cortes; hacen falta al menos ${MINIMO_DE_CORTES} para un volumen.` })
  })

  it('niega cortes no paralelos (un localizador mezclado)', () => {
    const cortes = uniformes(30)
    cortes[10] = corte(12.5, { orientation: [0, 1, 0, 0, 0, -1] })
    const r = elegibilidad3D(serie({ instance_count: 30 }), manifiesto(cortes))
    expect(r).toEqual({ apta: false, motivo: expect.stringMatching(/no son paralelos/) })
  })

  it('niega un espaciado con huecos y dice el rango', () => {
    const cortes = uniformes(30)
    cortes.splice(15, 3)
    const r = elegibilidad3D(serie({ instance_count: 27 }), manifiesto(cortes))
    expect(r.apta).toBe(false)
    if (!r.apta) expect(r.motivo).toBe('El espacio entre cortes no es uniforme (de 1.25 mm a 5 mm): faltan cortes o hay huecos.')
  })

  it('tolera el redondeo del equipo en el espaciado', () => {
    const cortes = uniformes(30).map((c, i) => corte(c.position[2] + (i % 2 ? 0.02 : 0)))
    expect(elegibilidad3D(serie({ instance_count: 30 }), manifiesto(cortes)).apta).toBe(true)
  })

  it('niega cortes repetidos en la misma posición', () => {
    const cortes = [...uniformes(25), corte(5)]
    const r = elegibilidad3D(serie({ instance_count: 26 }), manifiesto(cortes))
    expect(r).toEqual({ apta: false, motivo: expect.stringMatching(/repetidos/) })
  })

  it('niega cortes de distinto tamaño o sin orientación', () => {
    const distintos = uniformes(25)
    distintos[3] = corte(3.75, { rows: 256 })
    expect(elegibilidad3D(serie({ instance_count: 25 }), manifiesto(distintos)).apta).toBe(false)
    const sinOrientacion = uniformes(25)
    sinOrientacion[0] = corte(0, { orientation: [] })
    const r = elegibilidad3D(serie({ instance_count: 25 }), manifiesto(sinOrientacion))
    expect(r).toEqual({ apta: false, motivo: expect.stringMatching(/posición u orientación/) })
  })
})

describe('preajustes', () => {
  it('cada preajuste apunta a uno que existe en Cornerstone', () => {
    const nombres = (CONSTANTS.VIEWPORT_PRESETS as Array<{ name: string }>).map((p) => p.name)
    for (const p of PREAJUSTES_3D) expect(nombres).toContain(p.preset)
  })

  it('mapea los nombres en español a los de Cornerstone', () => {
    const mapa = Object.fromEntries(PREAJUSTES_3D.map((p) => [p.nombre, p.preset]))
    expect(mapa).toMatchObject({
      Hueso: 'CT-Bone',
      'Angio-TC (vasos con contraste)': 'CT-AAA',
      Piel: 'CT-Soft-Tissue',
      'Tejidos blandos': 'CT-Muscle',
      'RM: encéfalo': 'MR-T2-Brain',
      'RM: angio (vasos)': 'MR-Angio',
    })
  })

  it('sólo ofrece los de la modalidad y abre con hueso o encéfalo', () => {
    expect(preajustesParaModalidad('CT').every((p) => p.modalidad === 'CT')).toBe(true)
    expect(preajustesParaModalidad('mr').map((p) => p.id)).toEqual(['rm-encefalo', 'rm-angio', 'rm-general'])
    expect(preajusteInicial('CT')?.id).toBe('hueso')
    expect(preajusteInicial('MR')?.id).toBe('rm-encefalo')
    expect(preajustesParaModalidad('DX')).toEqual([])
  })

  it('el umbral va en UH en TC y lo dice en RM', () => {
    expect(rangoDeUmbral('CT').unidad).toBe('UH')
    expect(rangoDeUmbral('MR').unidad).toMatch(/RM/)
  })
})

describe('curvaDeOpacidad', () => {
  const hueso = {
    colorTransfer: '16 -3024 0 0 0 -16.4458 0.729412 0.254902 0.301961 641.385 0.905882 0.815686 0.552941 3071 1 1 1',
    scalarOpacity: '8 -3024 0 -16.4458 0 641.385 0.715686 3071 0.705882',
  }

  it('sin umbral ni opacidad es la curva que pone Cornerstone (centrada en el rango del color)', () => {
    // mín −3024, máx 3071 → centro 3047.5: x' = x + 3024 − 3047.5 = x − 23.5
    const esperada = [
      [-3047.5, 0],
      [-16.4458 - 23.5, 0],
      [641.385 - 23.5, 0.715686],
      [3071 - 23.5, 0.705882],
    ]
    const curva = curvaDeOpacidad(hueso, 0, 1)
    expect(curva).toHaveLength(esperada.length)
    curva.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(esperada[i][0], 6)
      expect(y).toBeCloseTo(esperada[i][1], 6)
    })
  })

  it('el umbral mueve los puntos y la opacidad escala sin pasar de 1', () => {
    const curva = curvaDeOpacidad(hueso, 100, 2)
    expect(curva[2][0]).toBeCloseTo(641.385 - 23.5 + 100)
    expect(curva[2][1]).toBe(1)
    expect(curvaDeOpacidad(hueso, 0, 0.5)[3][1]).toBeCloseTo(0.352941)
  })
})

describe('planosDeRecorte', () => {
  const caja = [-100, 100, -50, 50, 0, 300]

  it('sin recorte no hay planos', () => {
    expect(planosDeRecorte(SIN_RECORTE, caja)).toEqual([])
  })

  it('axial quita desde arriba y conserva lo de abajo', () => {
    const [plano] = planosDeRecorte({ ...SIN_RECORTE, axial: { fraccion: 0.25, invertido: false } }, caja)
    expect(plano.origen[2]).toBe(225)
    expect(plano.normal).toEqual([0, 0, -1])
  })

  it('sagital quita desde la izquierda del paciente (x alto en LPS) y se puede invertir', () => {
    const [izq] = planosDeRecorte({ ...SIN_RECORTE, sagital: { fraccion: 0.5, invertido: false } }, caja)
    expect(izq.origen[0]).toBe(0)
    expect(izq.normal).toEqual([-1, 0, 0])
    const [der] = planosDeRecorte({ ...SIN_RECORTE, sagital: { fraccion: 0.1, invertido: true } }, caja)
    expect(der.origen[0]).toBe(-80)
    expect(der.normal).toEqual([1, 0, 0])
  })

  it('coronal quita desde delante (y bajo) y nunca quita todo', () => {
    const [plano] = planosDeRecorte({ ...SIN_RECORTE, coronal: { fraccion: 1, invertido: false } }, caja)
    expect(plano.origen[1]).toBeCloseTo(45)
    expect(plano.normal).toEqual([0, 1, 0])
  })
})

describe('memoria y decimado', () => {
  it('estima 4 bytes por vóxel y decima por encima del límite', () => {
    const bytes = memoriaDelVolumen(512, 512, 600)
    expect(bytes).toBe(512 * 512 * 600 * 4)
    expect(factorDeDecimado(bytes)).toBe(1)
    expect(factorDeDecimado(memoriaDelVolumen(512, 512, 1000))).toBe(2)
    expect(memoriaDelVolumen(null, 512, 10)).toBe(0)
  })

  it('toma un corte de cada n', () => {
    expect(decimarCortes([0, 1, 2, 3, 4], 2)).toEqual([0, 2, 4])
    expect(decimarCortes([0, 1, 2], 1)).toEqual([0, 1, 2])
  })

  it('el aviso dice que se mide en los cortes', () => {
    expect(AVISO_RENDER_3D).toMatch(/para medir y decidir, usa los cortes/)
  })
})
