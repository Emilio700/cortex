import { describe, expect, it } from 'vitest'
import { resumenDeAvisos } from './resumen'

describe('resumenDeAvisos', () => {
  it('cuenta por tipo, en singular y plural', () => {
    expect(
      resumenDeAvisos([{ type: 'patient_arrived' }, { type: 'patient_arrived' }, { type: 'consultation_completed' }]),
    ).toBe('Tienes 2 pacientes en sala y 1 consulta finalizada.')
  })

  it('un tipo sin frase propia se cuenta como aviso por atender', () => {
    expect(resumenDeAvisos([{ type: 'otra_cosa' }])).toBe('Tienes 1 aviso por atender.')
  })
})
