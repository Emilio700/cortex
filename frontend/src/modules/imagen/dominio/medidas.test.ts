import { describe, expect, it } from 'vitest'

import {
  claveDeMedida,
  evolucionDeMedida,
  formatearMedida,
  resumirEvolucion,
  ultimasPorEtiqueta,
} from './medidas'
import type { AnotacionDicom } from './tipos'

const medida = (parcial: Partial<AnotacionDicom> = {}): AnotacionDicom => ({
  id: 1,
  kind: 'length',
  series_id: 1,
  value: 18,
  unit: 'mm',
  label: 'Lesión frontal',
  notes: null,
  is_confirmed: false,
  created_at: '2026-09-14T10:00:00',
  created_by: 'Dra. Prueba',
  ...parcial,
})

describe('formatearMedida', () => {
  it('redondea a un decimal y conserva la unidad', () => {
    expect(formatearMedida(18.44, 'mm')).toBe('18.4 mm')
  })

  it('no inventa un cero cuando no hay valor', () => {
    expect(formatearMedida(null, 'mm')).toBe('—')
  })
})

describe('claveDeMedida', () => {
  it('distingue por tipo y etiqueta, sin importar mayúsculas', () => {
    expect(claveDeMedida(medida({ label: ' LESIÓN frontal ' }))).toBe('length:lesión frontal')
    expect(claveDeMedida(medida({ label: null }))).toBe('length:sin-etiqueta')
  })
})

describe('ultimasPorEtiqueta', () => {
  it('se queda con la más reciente de cada etiqueta', () => {
    const mapa = ultimasPorEtiqueta([
      medida({ id: 1, created_at: '2026-01-10T10:00:00', value: 12 }),
      medida({ id: 2, created_at: '2026-09-10T10:00:00', value: 18 }),
      medida({ id: 3, label: 'Otra', value: 3 }),
    ])

    expect(mapa.get('length:lesión frontal')?.id).toBe(2)
    expect(mapa.get('length:otra')?.id).toBe(3)
  })
})

describe('evolucionDeMedida', () => {
  it('calcula diferencia y porcentaje contra el estudio previo', () => {
    const evolucion = evolucionDeMedida(
      medida({ value: 21.3 }),
      [medida({ id: 9, value: 18, created_at: '2026-06-02T10:00:00' })]
    )

    expect(evolucion?.delta).toBeCloseTo(3.3, 5)
    expect(evolucion?.porcentaje).toBeCloseTo(18.3, 1)
    expect(evolucion?.fechaPrevia).toBe('2026-06-02T10:00:00')
  })

  it('devuelve null cuando no hay medición equivalente', () => {
    expect(evolucionDeMedida(medida({ label: 'Nueva' }), [medida()])).toBeNull()
  })

  it('no compara unidades distintas', () => {
    expect(
      evolucionDeMedida(medida({ unit: 'mm2' }), [medida({ unit: 'mm' })])
    ).toBeNull()
  })

  it('no divide entre cero', () => {
    const evolucion = evolucionDeMedida(medida({ value: 4 }), [medida({ value: 0 })])
    expect(evolucion?.porcentaje).toBe(0)
  })
})

describe('resumirEvolucion', () => {
  it('muestra el signo en la diferencia y en el porcentaje', () => {
    expect(
      resumirEvolucion({ delta: 3.3, porcentaje: 18.3, fechaPrevia: '2026-06-02T10:00:00' })
    ).toBe('+3.3 (+18.3 %)')
  })

  it('una reducción lleva signo negativo', () => {
    expect(
      resumirEvolucion({ delta: -2, porcentaje: -12.5, fechaPrevia: '2026-06-02T10:00:00' })
    ).toBe('-2 (-12.5 %)')
  })

  it('sin evolución no escribe nada', () => {
    expect(resumirEvolucion(null)).toBeNull()
  })
})
