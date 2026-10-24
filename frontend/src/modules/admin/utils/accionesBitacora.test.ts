import { describe, expect, it } from 'vitest'

import { etiquetaDeAccion } from './accionesBitacora'

describe('etiquetaDeAccion', () => {
  it('usa la frase de la acción si la hay', () => {
    expect(etiquetaDeAccion('medical_history.read')).toBe('Consultó el expediente')
    expect(etiquetaDeAccion('auth.session_created')).toBe('Inició sesión')
  })

  it('arma la frase con entidad y verbo', () => {
    expect(etiquetaDeAccion('soap_note.created')).toBe('Creó la nota de consulta')
    expect(etiquetaDeAccion('payment.voided')).toBe('Anuló el pago')
  })

  it('si no sabe decirlo, deja el código', () => {
    expect(etiquetaDeAccion('algo.nuevo_raro')).toBe('algo.nuevo_raro')
    expect(etiquetaDeAccion('sinpunto')).toBe('sinpunto')
  })
})
