/**
 * Reglas del motor que valen para cualquier escala: qué falta, cuándo no hay
 * total, cómo se redondea y qué errores ve quien captura.
 */
import { describe, expect, it } from 'vitest'
import { escalaPorId } from './catalogo'
import { calcular, formatearPuntaje, redondear, validar } from './motor'

const glasgow = escalaPorId('glasgow')!
const oswestry = escalaPorId('oswestry')!

describe('calcular', () => {
  it('mientras falte un ítem obligatorio no sugiere puntaje y dice cuál falta', () => {
    const r = calcular(glasgow, { ocular: '4', verbal: '5' })
    expect(r.completo).toBe(false)
    expect(r.puntaje).toBeNull()
    expect(r.faltantes).toEqual(['motora'])
  })

  it('un código que no existe cuenta como sin responder', () => {
    expect(calcular(glasgow, { ocular: '4', verbal: '9', motora: '6' }).faltantes).toEqual(['verbal'])
  })

  it('sin ninguna sección respondida no hay resultado, aunque todas sean opcionales', () => {
    expect(calcular(oswestry, {}).completo).toBe(false)
  })
})

describe('redondear', () => {
  it('a un decimal, la mitad hacia arriba (igual que el servidor)', () => {
    expect(redondear((16 / 45) * 100)).toBe(35.6)
    expect(redondear(0.25)).toBe(0.3)
    expect(redondear(13.333)).toBe(13.3)
  })
})

describe('validar', () => {
  it('nombra el ítem como se ve en pantalla', () => {
    expect(validar(glasgow, { ocular: '4', verbal: '5' })).toEqual(['Falta responder «Respuesta motora (M)».'])
  })
  it('rechaza una respuesta que no es del catálogo y un ítem ajeno', () => {
    expect(validar(glasgow, { ocular: '4', verbal: '9', motora: '6', extra: '1' })).toEqual([
      'La respuesta «extra» no pertenece a Glasgow.',
      'La respuesta de «Respuesta verbal (V)» no es una opción de Glasgow.',
    ])
  })
  it('una escala con secciones opcionales pide al menos una', () => {
    expect(validar(oswestry, {})).toEqual(['Responde al menos una sección.'])
  })
})

describe('formatearPuntaje', () => {
  it('raya cuando no hay total', () => {
    expect(formatearPuntaje(glasgow, null)).toBe('—')
  })
})
