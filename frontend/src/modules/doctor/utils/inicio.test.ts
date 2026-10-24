import { describe, expect, it } from 'vitest'

import type { Appointment } from '../../secretaria/types'
import {
  contarDelDia,
  conteoPorDia,
  etiquetaSemanas,
  filtrarPorPestana,
  haceCuanto,
  horaEnConsultorio,
  iniciales,
  numeroDePestana,
  recientesDistintas,
  saludoPorHora,
  siguientePaciente,
} from './inicio'

let siguienteId = 1
const cita = (status: string, hora: string, extra: Partial<Appointment> = {}): Appointment =>
  ({
    id: siguienteId++,
    patient_id: siguienteId,
    doctor_id: 3,
    tenant_id: 2,
    scheduled_at: `2026-10-04T${hora}:00`,
    duration_minutes: 30,
    status,
    created_at: '',
    updated_at: '',
    has_triage: false,
    ...extra,
  }) as Appointment

describe('contarDelDia', () => {
  it('las canceladas no cuentan en el total ni en el porcentaje', () => {
    const conteo = contarDelDia([
      cita('atendida', '08:00'),
      cita('cancelada', '08:30'),
      cita('agendada', '09:00'),
      cita('en_sala', '09:30', { has_triage: true }),
    ])

    expect(conteo.total).toBe(3)
    expect(conteo.canceladas).toBe(1)
    expect(conteo.atendidas).toBe(1)
    expect(conteo.porcentajeAtendidas).toBe(33)
  })

  it('con cero citas no divide entre cero: el porcentaje es null, no 0', () => {
    expect(contarDelDia([]).porcentajeAtendidas).toBeNull()
    expect(contarDelDia([cita('cancelada', '08:00')]).porcentajeAtendidas).toBeNull()
  })

  it('por atender = agendadas, confirmadas y en sala; cuenta las que están en sala sin signos', () => {
    const conteo = contarDelDia([
      cita('agendada', '08:00'),
      cita('confirmada', '08:30'),
      cita('en_sala', '09:00', { has_triage: false }),
      cita('en_sala', '09:30', { has_triage: true }),
      cita('en_consulta', '10:00'),
    ])

    expect(conteo.porAtender).toBe(4)
    expect(conteo.enSala).toBe(2)
    expect(conteo.enSalaSinSignos).toBe(1)
    expect(conteo.enConsulta).toBe(1)
  })

  it('las pestañas cuadran con los indicadores', () => {
    const citas = [cita('agendada', '08:00'), cita('en_sala', '08:30'), cita('cancelada', '09:00')]
    const conteo = contarDelDia(citas)

    expect(numeroDePestana(conteo, 'todas')).toBe(2)
    expect(filtrarPorPestana(citas, 'por_atender')).toHaveLength(numeroDePestana(conteo, 'por_atender'))
    expect(filtrarPorPestana(citas, 'en_sala')).toHaveLength(numeroDePestana(conteo, 'en_sala'))
  })
})

describe('filtrarPorPestana', () => {
  it('las canceladas solo salen en «Todas», y todo va por hora', () => {
    const citas = [cita('agendada', '10:00'), cita('cancelada', '09:00'), cita('atendida', '08:00')]

    expect(filtrarPorPestana(citas, 'todas').map((c) => c.scheduled_at.slice(11, 16))).toEqual([
      '08:00',
      '09:00',
      '10:00',
    ])
    expect(filtrarPorPestana(citas, 'por_atender').map((c) => c.status)).toEqual(['agendada'])
    expect(filtrarPorPestana(citas, 'atendidas').map((c) => c.status)).toEqual(['atendida'])
  })
})

describe('siguientePaciente', () => {
  it('prefiere a quien espera en sala aunque haya una agendada más temprano', () => {
    const enSala = cita('en_sala', '10:00')
    expect(siguientePaciente([cita('agendada', '08:00'), enSala])).toEqual({ cita: enSala, motivo: 'en_sala' })
  })

  it('si dejó una consulta abierta, la continúa', () => {
    const abierta = cita('en_consulta', '09:00')
    expect(siguientePaciente([cita('en_sala', '08:00'), abierta])?.motivo).toBe('en_consulta')
  })

  it('si nadie llegó, la siguiente por hora; si no queda nadie, null', () => {
    const primera = cita('confirmada', '09:00')
    expect(siguientePaciente([cita('agendada', '11:00'), primera])?.cita).toBe(primera)
    expect(siguientePaciente([cita('atendida', '08:00'), cita('cancelada', '09:00')])).toBeNull()
  })
})

describe('recientesDistintas', () => {
  it('no repite pacientes y va de la más reciente a la más antigua', () => {
    const a1 = cita('atendida', '08:00', { patient_id: 1, scheduled_at: '2026-10-01T08:00:00' })
    const b = cita('atendida', '08:00', { patient_id: 2, scheduled_at: '2026-10-02T08:00:00' })
    const a2 = cita('atendida', '08:00', { patient_id: 1, scheduled_at: '2026-10-03T08:00:00' })

    expect(recientesDistintas([a1, b, a2])).toEqual([a2, b])
  })

  it('corta en n', () => {
    const muchas = Array.from({ length: 8 }, (_, i) =>
      cita('atendida', '08:00', { patient_id: 100 + i, scheduled_at: `2026-09-0${i + 1}T08:00:00` }),
    )
    expect(recientesDistintas(muchas, 5)).toHaveLength(5)
  })
})

describe('saludoPorHora', () => {
  it.each([
    [6, 'Buenos días'],
    [11, 'Buenos días'],
    [12, 'Buenas tardes'],
    [13, 'Buenas tardes'],
    [19, 'Buenas noches'],
    [20, 'Buenas noches'],
    [2, 'Buenas noches'],
  ])('a las %i h dice «%s»', (hora, saludo) => {
    expect(saludoPorHora(hora)).toBe(saludo)
  })

  it('la hora es la de Mazatlán, no la del navegador', () => {
    // 03:30 UTC del 5 de octubre = 20:30 del 4 en Mazatlán (UTC−7).
    expect(horaEnConsultorio(new Date('2026-10-05T03:30:00Z'))).toBe(20)
    // 13:00 UTC = 06:00 en Mazatlán.
    expect(horaEnConsultorio(new Date('2026-10-04T13:00:00Z'))).toBe(6)
  })
})

describe('textos cortos', () => {
  it('iniciales de primer nombre y primer apellido', () => {
    expect(iniciales('María Fernanda', 'López Ruiz')).toBe('ML')
    expect(iniciales('', '')).toBe('?')
  })

  it('semanas de gestación solo si el servidor las mandó', () => {
    expect(etiquetaSemanas({ semanas_gestacion: 28, dias_gestacion: 3 })).toBe('28.3 SDG')
    expect(etiquetaSemanas({ semanas_gestacion: null, dias_gestacion: null })).toBeNull()
    expect(etiquetaSemanas({})).toBeNull()
  })

  it('hace cuánto', () => {
    const ahora = new Date('2026-10-04T12:00:00Z')
    expect(haceCuanto(new Date('2026-10-04T11:59:40Z'), ahora)).toBe('hace un momento')
    expect(haceCuanto(new Date('2026-10-04T11:57:00Z'), ahora)).toBe('hace 3 min')
    expect(haceCuanto(new Date('2026-10-04T09:00:00Z'), ahora)).toBe('hace 3 h')
  })

  it('conteo por día sin canceladas, con la fecha local de la cita', () => {
    const mapa = conteoPorDia([
      cita('agendada', '23:30', { scheduled_at: '2026-10-08T23:30:00' }),
      cita('cancelada', '09:00', { scheduled_at: '2026-10-08T09:00:00' }),
      cita('atendida', '00:15', { scheduled_at: '2026-10-09T00:15:00' }),
    ])
    expect(mapa.get('2026-10-08')).toBe(1)
    expect(mapa.get('2026-10-09')).toBe(1)
  })
})
