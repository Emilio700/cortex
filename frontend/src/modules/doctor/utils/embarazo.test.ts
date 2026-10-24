import { describe, expect, it } from 'vitest'

import {
  UMBRAL_QUINCENAL_SEM,
  UMBRAL_SEMANAL_SEM,
  calcularEdadGestacional,
  calcularFurDesdeFpp,
  formatoCortoSemanas,
  proximaRevisionSugerida,
  resumirEmbarazo,
} from './embarazo'

describe('calcularEdadGestacional', () => {
  it('cuenta semanas y días completos desde la FUR', () => {
    // 2026-01-01 + 171 días = 24 semanas 3 días.
    const edad = calcularEdadGestacional('2026-01-01', '2026-06-21')
    expect(edad).not.toBeNull()
    expect(edad?.semanas).toBe(24)
    expect(edad?.diasSueltos).toBe(3)
    expect(edad?.dias).toBe(171)
    expect(edad?.etiquetaCorta).toBe('24.3 sem')
    expect(edad?.etiqueta).toBe('24 semanas 3 días')
  })

  it('omite los días sueltos cuando la semana está justa', () => {
    const edad = calcularEdadGestacional('2026-01-01', '2026-01-15')
    expect(edad?.etiqueta).toBe('2 semanas')
    expect(edad?.etiquetaCorta).toBe('2.0 sem')
  })

  it('usa el singular en la primera semana y el primer día', () => {
    const edad = calcularEdadGestacional('2026-01-01', '2026-01-09')
    expect(edad?.etiqueta).toBe('1 semana 1 día')
  })

  it('cruza el cambio de año sin perder días', () => {
    // 2025-12-20 -> 2026-01-10 son 21 días exactos.
    const edad = calcularEdadGestacional('2025-12-20', '2026-01-10')
    expect(edad?.dias).toBe(21)
    expect(edad?.semanas).toBe(3)
    expect(edad?.diasSueltos).toBe(0)
  })

  it('cuenta el 29 de febrero de un año bisiesto', () => {
    // 2024 es bisiesto: del 2024-02-01 al 2024-03-01 hay 29 días.
    const edad = calcularEdadGestacional('2024-02-01', '2024-03-01')
    expect(edad?.dias).toBe(29)
    expect(edad?.semanas).toBe(4)
    expect(edad?.diasSueltos).toBe(1)
  })

  it('devuelve el día cero cuando la referencia es la propia FUR', () => {
    const edad = calcularEdadGestacional('2026-03-10', '2026-03-10')
    expect(edad?.dias).toBe(0)
    expect(edad?.etiqueta).toBe('0 semanas')
  })

  it('no inventa edad gestacional con una FUR futura', () => {
    expect(calcularEdadGestacional('2026-06-01', '2026-05-31')).toBeNull()
  })

  it('no inventa edad gestacional con fechas inválidas o vacías', () => {
    expect(calcularEdadGestacional('2026-02-30', '2026-06-21')).toBeNull()
    expect(calcularEdadGestacional('no-es-fecha', '2026-06-21')).toBeNull()
    expect(calcularEdadGestacional('', '2026-06-21')).toBeNull()
    expect(calcularEdadGestacional(null, '2026-06-21')).toBeNull()
    expect(calcularEdadGestacional('2026-01-01', '2026-13-01')).toBeNull()
  })

  it('marca como fuera de rango una FUR demasiado antigua para un embarazo', () => {
    const edad = calcularEdadGestacional('2024-01-01', '2026-01-01')
    expect(edad?.fueraDeRango).toBe(true)
    const vigente = calcularEdadGestacional('2026-01-01', '2026-06-21')
    expect(vigente?.fueraDeRango).toBe(false)
  })
})

describe('formatoCortoSemanas', () => {
  it('escribe semanas.días como lo lee el médico', () => {
    expect(formatoCortoSemanas(0, 0)).toBe('0.0 sem')
    expect(formatoCortoSemanas(37, 6)).toBe('37.6 sem')
  })
})

describe('proximaRevisionSugerida', () => {
  it('sugiere control mensual antes de la semana 28', () => {
    // 2026-01-01 + 70 días = semana 10 exacta.
    const sugerencia = proximaRevisionSugerida('2026-01-01', '2026-03-12')
    expect(sugerencia?.semanas).toBe(10)
    expect(sugerencia?.intervaloDias).toBe(28)
    expect(sugerencia?.fecha).toBe('2026-04-09')
    expect(sugerencia?.recortada).toBe(false)
  })

  it('sugiere control quincenal en la semana 30', () => {
    // 2026-01-01 + 210 días = semana 30 exacta.
    const sugerencia = proximaRevisionSugerida('2026-01-01', '2026-07-30')
    expect(sugerencia?.semanas).toBe(30)
    expect(sugerencia?.intervaloDias).toBe(14)
    expect(sugerencia?.fecha).toBe('2026-08-13')
  })

  it('sugiere control semanal desde la semana 37', () => {
    // 2026-01-01 + 259 días = semana 37 exacta.
    const sugerencia = proximaRevisionSugerida('2026-01-01', '2026-09-17')
    expect(sugerencia?.semanas).toBe(37)
    expect(sugerencia?.intervaloDias).toBe(7)
    expect(sugerencia?.fecha).toBe('2026-09-24')
  })

  it('recorta el intervalo para no saltarse el cambio de frecuencia', () => {
    // Semana 26: un mes más caería en la 30, así que se recorta a la 28.
    const aQuincenal = proximaRevisionSugerida('2026-01-01', '2026-07-02')
    expect(aQuincenal?.semanas).toBe(26)
    expect(aQuincenal?.recortada).toBe(true)
    expect(calcularEdadGestacional('2026-01-01', aQuincenal?.fecha)?.semanas).toBe(
      UMBRAL_QUINCENAL_SEM,
    )
    // Semana 35: quince días más caerían en la 37, así que se recorta a la 36.
    const aSemanal = proximaRevisionSugerida('2026-01-01', '2026-09-03')
    expect(aSemanal?.semanas).toBe(35)
    expect(aSemanal?.recortada).toBe(true)
    expect(calcularEdadGestacional('2026-01-01', aSemanal?.fecha)?.semanas).toBe(UMBRAL_SEMANAL_SEM)
  })

  it('cruza el cambio de año al sumar el intervalo', () => {
    // Semana 12 el 26 de diciembre: el control mensual cae ya en enero.
    const sugerencia = proximaRevisionSugerida('2025-10-03', '2025-12-26')
    expect(sugerencia?.semanas).toBe(12)
    expect(sugerencia?.fecha).toBe('2026-01-23')
  })

  it('cruza el 29 de febrero del año bisiesto al sumar el intervalo', () => {
    // 2024-02-10 + 28 días = 2024-03-09 porque febrero tiene 29 días.
    const sugerencia = proximaRevisionSugerida('2023-12-19', '2024-02-10')
    expect(sugerencia?.semanas).toBe(7)
    expect(sugerencia?.fecha).toBe('2024-03-09')
  })

  it('no sugiere nada con una FUR futura, vacía o inválida', () => {
    expect(proximaRevisionSugerida('2026-06-01', '2026-05-31')).toBeNull()
    expect(proximaRevisionSugerida('2026-02-30', '2026-06-21')).toBeNull()
    expect(proximaRevisionSugerida('', '2026-06-21')).toBeNull()
    expect(proximaRevisionSugerida(undefined, '2026-06-21')).toBeNull()
  })

  it('deja de sugerir cuando la datación ya no es plausible', () => {
    expect(proximaRevisionSugerida('2024-01-01', '2026-01-01')).toBeNull()
  })
})

describe('calcularFurDesdeFpp', () => {
  it('recupera la FUR restando los 280 días de Naegele', () => {
    expect(calcularFurDesdeFpp('2026-10-08')).toBe('2026-01-01')
  })

  it('devuelve cadena vacía si la FPP no es válida', () => {
    expect(calcularFurDesdeFpp('2026-02-30')).toBe('')
    expect(calcularFurDesdeFpp(null)).toBe('')
  })
})

describe('resumirEmbarazo', () => {
  it('prefiere la FUR registrada y añade la sugerencia de control', () => {
    const resumen = resumirEmbarazo(
      { last_menstrual_period: '2026-01-01', estimated_delivery_date: '2026-10-08' },
      '2026-03-12',
    )
    expect(resumen?.fur).toBe('2026-01-01')
    expect(resumen?.furDerivada).toBe(false)
    expect(resumen?.edad.semanas).toBe(10)
    expect(resumen?.proxima?.fecha).toBe('2026-04-09')
  })

  it('deduce la FUR de la FPP cuando no hay FUR registrada', () => {
    const resumen = resumirEmbarazo({ estimated_delivery_date: '2026-10-08' }, '2026-03-12')
    expect(resumen?.fur).toBe('2026-01-01')
    expect(resumen?.furDerivada).toBe(true)
    expect(resumen?.edad.semanas).toBe(10)
  })

  it('tolera las fechas con hora que devuelve la API', () => {
    const resumen = resumirEmbarazo(
      { last_menstrual_period: '2026-01-01T00:00:00Z' },
      '2026-03-12',
    )
    expect(resumen?.edad.semanas).toBe(10)
  })

  it('devuelve null sin datación utilizable', () => {
    expect(resumirEmbarazo(null, '2026-03-12')).toBeNull()
    expect(resumirEmbarazo({}, '2026-03-12')).toBeNull()
    expect(
      resumirEmbarazo({ last_menstrual_period: '2026-06-01' }, '2026-03-12'),
    ).toBeNull()
  })
})
