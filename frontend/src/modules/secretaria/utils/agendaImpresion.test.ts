/**
 * La agenda impresa lleva las columnas que decidió Emilio y nada más.
 *
 * Hora, paciente, teléfono, doctora, servicio y estado. El motivo y las notas
 * son para la doctora; la hoja se queda en el mostrador.
 */
import { describe, expect, it } from 'vitest'

import { COLUMNAS_AGENDA_IMPRESA, filaAgendaImpresa, htmlDeAgendaImpresa } from './agendaImpresion'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'

const cita = (id: number, hora: string, extra: Partial<Appointment> = {}, dia = 29): Appointment => {
  const [h, m] = hora.split(':').map(Number)
  const fecha = new Date(2026, 8, dia, h, m, 0, 0)
  return {
    id,
    patient_id: id * 10,
    doctor_id: 7,
    tenant_id: 2,
    scheduled_at: fecha.toISOString(),
    duration_minutes: 30,
    status: AppointmentStatus.AGENDADA,
    created_at: fecha.toISOString(),
    updated_at: fecha.toISOString(),
    has_triage: false,
    patient: { id: id * 10, first_name: 'ANA', last_name: 'LÓPEZ', phone: '6691234567' },
    doctor: { id: 7, full_name: 'CINTIA MORALES', email: 'c@x.mx', tratamiento: 'Dra.' },
    ...extra,
  }
}

const texto = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ') ?? ''

describe('agenda impresa', () => {
  it('tiene las columnas de la decisión, en ese orden', () => {
    expect(COLUMNAS_AGENDA_IMPRESA).toEqual(['Hora', 'Paciente', 'Teléfono', 'Doctora', 'Servicio', 'Estado'])
  })

  it('cada fila lleva hora, paciente, teléfono, doctora, servicio y el estado en español', () => {
    expect(filaAgendaImpresa(cita(1, '09:30', { status: AppointmentStatus.EN_SALA }))).toEqual([
      '09:30',
      'ANA LÓPEZ',
      '6691234567',
      'Dra. CINTIA MORALES',
      'Consulta',
      'En sala',
    ])
  })

  it('sin teléfono pone una raya, no un hueco', () => {
    const sinTelefono = cita(1, '09:30', { patient: { id: 10, first_name: 'ANA', last_name: 'LÓPEZ' } })
    expect(filaAgendaImpresa(sinTelefono)[2]).toBe('—')
  })

  it('no lleva el motivo ni las notas de la cita', () => {
    const html = htmlDeAgendaImpresa(
      [cita(1, '09:30', { motivo_extra: 'SANGRADO', notes: 'NOTA INTERNA' })],
      { inicio: new Date(2026, 8, 29), fin: new Date(2026, 8, 29), filtros: [] },
    )
    expect(texto(html)).not.toContain('SANGRADO')
    expect(texto(html)).not.toContain('NOTA INTERNA')
    expect(texto(html)).not.toContain('Motivo')
  })

  it('agrupa por día en orden y dice el periodo, los filtros y cuántas citas', () => {
    const html = htmlDeAgendaImpresa(
      [cita(2, '11:00', {}, 30), cita(1, '09:00', {}, 29), cita(3, '08:00', {}, 30)],
      {
        inicio: new Date(2026, 8, 28),
        fin: new Date(2026, 9, 4),
        filtros: ['Dra. CINTIA MORALES'],
        impresaEl: new Date(2026, 8, 29, 8, 0),
      },
    )
    const hoja = texto(html)

    expect(hoja).toContain('Agenda del 28 de septiembre de 2026 al 4 de octubre de 2026')
    expect(hoja).toContain('3 citas · Filtros: Dra. CINTIA MORALES')
    expect(hoja.indexOf('29 de septiembre')).toBeLessThan(hoja.indexOf('30 de septiembre'))
    const dia30 = hoja.slice(hoja.indexOf('30 de septiembre'))
    expect(dia30.indexOf('08:00')).toBeLessThan(dia30.indexOf('11:00'))
  })

  it('escapa lo que viene del servidor', () => {
    const html = htmlDeAgendaImpresa(
      [cita(1, '09:30', { patient: { id: 10, first_name: '<b>ANA</b>', last_name: 'X' } })],
      { inicio: new Date(2026, 8, 29), fin: new Date(2026, 8, 29), filtros: [] },
    )
    expect(html).not.toContain('<b>ANA</b>')
  })
})
