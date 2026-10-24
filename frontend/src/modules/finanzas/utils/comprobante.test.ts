/**
 * El comprobante de pago dice lo que es y sólo lo que el sistema sabe.
 *
 * Decisión de Emilio: comprobante simple, sin datos fiscales ni clínicos, y
 * que el papel diga que no es factura.
 */
import { describe, expect, it } from 'vitest'

import { htmlDelComprobante, pagoConComprobante } from './comprobante'
import { PaymentMethod, type Payment } from '../types'

const PAGO: Payment = {
  id: 812,
  tenant_id: 1,
  patient_id: 101,
  patient_name: 'ANA LÓPEZ',
  received_by_user_id: 20,
  received_by_name: 'LUPITA',
  doctor_id: 7,
  doctor_name: 'Dra. CINTIA MORALES',
  service_name: 'CONSULTA GINECOLÓGICA',
  amount: '800.00',
  method: PaymentMethod.CARD,
  referencia: 'AUT-4411',
  status: 'vigente',
  paid_at: '2026-09-29T17:05:00',
  created_at: '2026-09-29T17:05:00',
}

const CLINICA = { name: 'GEMS Centro', address: 'Av. Siempre Viva 12', phone: '6691234567', email: null }

const texto = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent?.replace(/\s+/g, ' ') ?? ''
}

describe('comprobante de pago', () => {
  it('lleva clínica, folio, fecha, concepto, monto y método', () => {
    const hoja = texto(htmlDelComprobante(PAGO, CLINICA))

    expect(hoja).toContain('GEMS Centro')
    expect(hoja).toContain('Av. Siempre Viva 12')
    expect(hoja).toContain('Tel. 6691234567')
    expect(hoja).toContain('COMPROBANTE DE PAGO')
    expect(hoja).toContain('Folio del pago: 812')
    expect(hoja).toContain('$800.00 MXN')
    expect(hoja).toContain('CONSULTA GINECOLÓGICA')
    expect(hoja).toContain('Tarjeta')
    expect(hoja).toContain('AUT-4411')
    expect(hoja).toContain('ANA LÓPEZ')
    expect(hoja).toMatch(/29 de septiembre de 2026/)
  })

  it('dice en el papel que no es factura', () => {
    expect(texto(htmlDelComprobante(PAGO, CLINICA))).toContain(
      'Este comprobante no es una factura ni tiene validez fiscal.',
    )
  })

  it('no inventa lo que la sucursal no tiene capturado', () => {
    const html = htmlDelComprobante(PAGO, { name: 'GEMS Centro', address: null, phone: null, email: null })

    expect(texto(html)).not.toContain('Tel.')
    expect(texto(html)).not.toContain('null')
    expect(texto(htmlDelComprobante({ ...PAGO, referencia: null }, CLINICA))).not.toContain('Referencia')
  })

  it('escapa lo que viene del servidor', () => {
    const html = htmlDelComprobante({ ...PAGO, description: '<img src=x onerror=alert(1)>' }, CLINICA)

    expect(html).not.toContain('<img')
    expect(texto(html)).toContain('<img src=x onerror=alert(1)>')
  })

  it('un pago anulado no lleva comprobante', () => {
    expect(pagoConComprobante({ ...PAGO, status: 'anulado' })).toBe(false)
    expect(pagoConComprobante(PAGO)).toBe(true)
  })
})
