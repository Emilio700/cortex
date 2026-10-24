/**
 * Varios avisos del mismo tipo se agrupan en un emergente («Tienes 3
 * pacientes en sala») en vez de apilar tres tarjetas (plan 27, §3.2).
 */
import { describe, expect, it } from 'vitest'
import type { Notification } from '../types/notification'
import type { Emergente } from './AvisosContext'
import { agrupar } from './EmergentesDeAvisos'

const suelto = (id: number, type = 'patient_arrived'): Emergente => ({
  clave: `aviso-${id}`,
  avisos: [{ id, type } as Notification],
  resumen: false,
})

describe('agrupar', () => {
  it('junta los del mismo tipo y deja solo al que no tiene pareja', () => {
    const grupos = agrupar([suelto(3), suelto(2), suelto(9, 'consultation_completed'), suelto(1)])

    expect(grupos).toHaveLength(2)
    expect(grupos[0].resumen).toBe(true)
    expect(grupos[0].avisos.map((a) => a.id)).toEqual([3, 2, 1])
    expect(grupos[1]).toEqual(suelto(9, 'consultation_completed'))
  })
})
