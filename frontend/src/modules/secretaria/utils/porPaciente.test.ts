import { describe, expect, it } from 'vitest'
import { agruparPorPaciente } from './porPaciente'

describe('agruparPorPaciente', () => {
  it('junta las órdenes de la misma paciente y respeta el orden de llegada', () => {
    const grupos = agruparPorPaciente([
      { patient_id: 2, patient_name: 'BEA', order_id: 10 },
      { patient_id: 1, patient_name: 'ANA', order_id: 11 },
      { patient_id: 2, patient_name: 'BEA', order_id: 12 },
    ])
    expect(grupos.map((g) => g.patient_name)).toEqual(['BEA', 'ANA'])
    expect(grupos[0].ordenes.map((o) => o.order_id)).toEqual([10, 12])
  })
})
