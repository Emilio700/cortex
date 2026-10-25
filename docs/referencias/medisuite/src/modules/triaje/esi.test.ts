import { demoTriaje } from './demo'
import { describe, expect, it } from 'vitest'
import { clasificarESI, contarRecursos, espera, fiebrePediatrica, ordenarCola, zonaPeligro, type EntradaESI } from './esi'

const adulto = (p: Partial<EntradaESI> = {}): EntradaESI => ({
  edadMeses: 40 * 12, salvavidas: false, altoRiesgo: false, confusion: false, dolorIntenso: false, recursos: 0, vitales: {}, ...p,
})

// Casos tipo de los capítulos 3–6 del ESI Implementation Handbook v4 (AHRQ 2012).
describe('ESI — puntos de decisión A–D', () => {
  it('A: paciente que requiere intervención salvavidas (p. ej., dolor torácico, diaforético, TA 70/palp) → ESI 1', () => {
    const r = clasificarESI(adulto({ salvavidas: true, recursos: 3 }))
    expect(r.nivel).toBe(1)
    expect(r.punto).toBe('A')
  })
  it('B: dolor torácico sugestivo de SCA en paciente estable (alto riesgo) → ESI 2', () => {
    expect(clasificarESI(adulto({ altoRiesgo: true, recursos: 3 })).nivel).toBe(2)
  })
  it('B: confusión de inicio reciente → ESI 2', () => {
    expect(clasificarESI(adulto({ confusion: true })).nivel).toBe(2)
  })
  it('B: dolor intenso (≥ 7/10) a criterio de la enfermera → ESI 2', () => {
    expect(clasificarESI(adulto({ dolorIntenso: true, recursos: 2 })).punto).toBe('B')
  })
  it('C: resurtido de receta, sin recursos → ESI 5', () => {
    expect(clasificarESI(adulto({ recursos: 0 })).nivel).toBe(5)
  })
  it('C: esguince de tobillo que requiere radiografía (un recurso) → ESI 4', () => {
    expect(clasificarESI(adulto({ recursos: contarRecursos(['ecg-rx']) })).nivel).toBe(4)
  })
  it('C: laceración simple que requiere sutura (procedimiento simple, 1 recurso) → ESI 4', () => {
    expect(clasificarESI(adulto({ recursos: contarRecursos(['proc-simple']) })).nivel).toBe(4)
  })
  it('D: dolor abdominal con laboratorios, TAC y líquidos IV y signos vitales normales → ESI 3', () => {
    const r = clasificarESI(adulto({ recursos: contarRecursos(['lab', 'imagen', 'liquidos']), vitales: { fc: 88, fr: 18, spo2: 98 } }))
    expect(r.nivel).toBe(3)
    expect(r.punto).toBe('D')
  })
  it('D: mismos recursos con FC 112 en adulto → considerar ESI 2', () => {
    expect(clasificarESI(adulto({ recursos: 3, vitales: { fc: 112 } })).nivel).toBe(2)
  })
  it('D: la enfermera puede decidir no subir el nivel', () => {
    expect(clasificarESI(adulto({ recursos: 3, vitales: { fc: 112 }, aceptarSubirPorVitales: false })).nivel).toBe(3)
  })
  it('Los signos de zona de peligro no aplican a ESI 4/5 (el punto D solo se evalúa con ≥ 2 recursos)', () => {
    expect(clasificarESI(adulto({ recursos: 1, vitales: { fc: 120 } })).nivel).toBe(4)
  })
})

describe('Zona de peligro por edad', () => {
  it('umbrales exactos (estrictamente mayor)', () => {
    expect(zonaPeligro({ fc: 100, fr: 20, spo2: 92 }, 30 * 12)).toEqual([])
    expect(zonaPeligro({ fc: 101, fr: 21, spo2: 91 }, 30 * 12)).toHaveLength(3)
    expect(zonaPeligro({ fc: 180 }, 1)).toEqual([])
    expect(zonaPeligro({ fc: 181 }, 1)).toHaveLength(1)
    expect(zonaPeligro({ fc: 161, fr: 41 }, 12)).toHaveLength(2)
    expect(zonaPeligro({ fc: 141, fr: 31 }, 5 * 12)).toHaveLength(2)
    expect(zonaPeligro({ fc: 141, fr: 31 }, 10 * 12)).toHaveLength(2) // > 8 años usa 100/20
    expect(zonaPeligro({ fc: 150, fr: 35 }, 2 * 12)).toEqual([]) // 3 m – 3 a: 160/40
  })
})

describe('Fiebre pediátrica', () => {
  it('neonato de 2 semanas con 38.3 °C → al menos ESI 2', () => {
    expect(fiebrePediatrica(0.5, 38.3)?.nivelMinimo).toBe(2)
    expect(clasificarESI({ ...adulto(), edadMeses: 0.5, vitales: { temp: 38.3 }, recursos: 0 }).nivel).toBe(2)
  })
  it('lactante de 2 meses con 38.5 °C → considerar ESI 2', () => {
    expect(clasificarESI({ ...adulto(), edadMeses: 2, vitales: { temp: 38.5 }, recursos: 1 }).nivel).toBe(2)
  })
  it('niño de 18 meses con 39.5 °C y un recurso → considerar ESI 3', () => {
    expect(clasificarESI({ ...adulto(), edadMeses: 18, vitales: { temp: 39.5 }, recursos: 1 }).nivel).toBe(3)
  })
  it('niño de 18 meses con 38.5 °C, vacunas completas y foco evidente → sin ajuste', () => {
    expect(fiebrePediatrica(18, 38.5)).toBeUndefined()
    expect(fiebrePediatrica(18, 38.5, true)?.considerar).toBe(3)
  })
  it('mayores de 3 años no tienen ajuste por fiebre', () => {
    expect(fiebrePediatrica(48, 40)).toBeUndefined()
  })
})

describe('Recursos', () => {
  it('varios estudios del mismo tipo cuentan una vez; procedimiento complejo cuenta 2', () => {
    expect(contarRecursos(['lab', 'lab'])).toBe(1)
    expect(contarRecursos(['proc-complejo'])).toBe(2)
    expect(contarRecursos([])).toBe(0)
  })
})

describe('Tablero', () => {
  it('ordena por ESI y luego por llegada', () => {
    const c = ordenarCola([
      { id: 'a', nivel: 3, llegada: '2026-01-01T10:00:00Z' },
      { id: 'b', nivel: 2, llegada: '2026-01-01T10:30:00Z' },
      { id: 'c', nivel: 3, llegada: '2026-01-01T09:00:00Z' },
    ] as const)
    expect(c.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
  it('calcula espera y vencimiento', () => {
    const e = espera('2026-01-01T10:00:00Z', 2, Date.parse('2026-01-01T10:15:00Z'))
    expect(e).toMatchObject({ min: 15, meta: 10, vencido: true })
  })
})

describe('Demo', () => {
  it('tres pacientes en espera con niveles 4, 2 y 5', () => {
    const d = demoTriaje(Date.parse('2026-10-24T12:00:00Z'))
    expect(d.map((r) => (r.datos as { nivel: number }).nivel)).toEqual([4, 2, 5])
  })
})
