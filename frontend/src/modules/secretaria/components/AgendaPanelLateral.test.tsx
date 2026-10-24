import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgendaPanelLateral } from './AgendaPanelLateral'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'

const DIA = new Date(2026, 8, 19)

const cita = (
  id: number,
  hora: string,
  extra: Partial<Appointment> = {},
  dia = 19,
): Appointment => {
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
    patient: { id: id * 10, first_name: 'ANA', last_name: `PACIENTE ${id}` },
    ...extra,
  }
}

const renderPanel = (props: Partial<React.ComponentProps<typeof AgendaPanelLateral>> = {}) => {
  const fns = {
    onSeleccionarDia: vi.fn(),
    onCambiarMes: vi.fn(),
    onAbrirCita: vi.fn(),
    onNuevaCitaEnDia: vi.fn(),
    onVerHistorial: vi.fn(),
    onVerCitasDePaciente: vi.fn(),
  }
  render(
    <AgendaPanelLateral
      mes={new Date(2026, 8, 1)}
      diaSeleccionado={DIA}
      citasDelMes={[]}
      {...fns}
      {...props}
    />,
  )
  return fns
}

describe('AgendaPanelLateral — citas del día', () => {
  it('titula el bloque con el día elegido y su total', () => {
    renderPanel({ citasDelMes: [cita(1, '08:00'), cita(2, '09:30'), cita(3, '10:00', {}, 20)] })
    const cabecera = screen.getByText('Citas del 19 de septiembre').closest('div')!
    // Dos del día 19; la del 20 no cuenta.
    expect(within(cabecera).getByText('2')).toBeInTheDocument()
  })

  it('pinta hora, paciente, tipo y sala en la tarjeta', () => {
    renderPanel({
      citasDelMes: [
        cita(1, '08:15', { appointment_type: 'procedimiento', room_name: 'Sala 2' }),
      ],
    })
    expect(screen.getByText('08:15')).toBeInTheDocument()
    expect(screen.getByText('ANA PACIENTE 1')).toBeInTheDocument()
    expect(screen.getByText('Procedimiento')).toBeInTheDocument()
    expect(screen.getByText('Sala 2')).toBeInTheDocument()
  })

  it('dice el estado en palabras, no solo con la barra de color (plan 29, A-2)', () => {
    renderPanel({ citasDelMes: [cita(1, '08:15', { status: 'en_sala' } as never)] })
    expect(screen.getByText('En sala')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abrir la cita: 08:15.*ANA PACIENTE 1.*En sala/ })).toBeInTheDocument()
  })

  it('una cita histórica sin sala dice "Sin sala" en vez de dejar el hueco', () => {
    renderPanel({ citasDelMes: [cita(1, '08:15')] })
    expect(screen.getByText('Sin sala')).toBeInTheDocument()
  })

  it('abrir la tarjeta lleva la cita al modal', async () => {
    const user = userEvent.setup()
    const fns = renderPanel({ citasDelMes: [cita(1, '08:15')] })
    await user.click(screen.getByRole('button', { name: /Abrir la cita: .*ANA PACIENTE 1/ }))
    expect(fns.onAbrirCita).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('el menú de tres puntos ofrece historial y citas de la paciente', async () => {
    const user = userEvent.setup()
    const fns = renderPanel({ citasDelMes: [cita(1, '08:15')] })
    await user.click(screen.getByRole('button', { name: /Acciones de la cita/ }))
    await user.click(screen.getByText('Ver el historial de la paciente'))
    expect(fns.onVerHistorial).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('un día sin citas lo explica en español, no con un "0 resultados"', () => {
    renderPanel({ citasDelMes: [cita(1, '08:00', {}, 20)] })
    expect(
      screen.getByText('No hay ninguna cita agendada el 19 de septiembre.'),
    ).toBeInTheDocument()
  })

  it('el pie propone agendar en ese mismo día', async () => {
    const user = userEvent.setup()
    const fns = renderPanel()
    await user.click(screen.getByRole('button', { name: /Agregar cita para este día/ }))
    expect(fns.onNuevaCitaEnDia).toHaveBeenCalledWith(DIA)
  })
})

describe('AgendaPanelLateral — mini calendario', () => {
  it('resalta el día seleccionado', () => {
    renderPanel()
    const dia = screen.getByRole('gridcell', { name: /^19 de septiembre/ })
    // `gridcell` no admite `aria-pressed`; el estado va en `aria-selected`.
    expect(dia).toHaveAttribute('aria-selected', 'true')
  })

  it('pinchar otro día lo comunica hacia arriba', async () => {
    const user = userEvent.setup()
    const fns = renderPanel()
    await user.click(screen.getByRole('gridcell', { name: /^23 de septiembre/ }))
    expect(fns.onSeleccionarDia).toHaveBeenCalled()
    const elegido: Date = fns.onSeleccionarDia.mock.calls[0][0]
    expect(elegido.getDate()).toBe(23)
    expect(elegido.getMonth()).toBe(8)
  })

  it('las flechas piden mes anterior y siguiente', async () => {
    const user = userEvent.setup()
    const fns = renderPanel()
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(fns.onCambiarMes.mock.calls.map((c) => c[0])).toEqual([-1, 1])
  })

  it('dice en la etiqueta cuántas citas tiene cada día', () => {
    renderPanel({ citasDelMes: [cita(1, '08:00'), cita(2, '09:00')] })
    expect(screen.getByRole('gridcell', { name: '19 de septiembre, 2 citas' })).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: '20 de septiembre, sin citas' })).toBeInTheDocument()
  })
})

describe('AgendaPanelLateral — resumen del mes', () => {
  it('muestra las cuatro cifras cuando se pueden calcular', () => {
    renderPanel({
      citasDelMes: [
        cita(1, '08:00'),
        cita(2, '09:00', { status: AppointmentStatus.ATENDIDA }),
        cita(3, '10:00', { status: AppointmentStatus.ATENDIDA }),
        cita(4, '11:00', { status: AppointmentStatus.CANCELADA }),
      ],
    })
    const resumen = screen.getByText('Resumen del mes').closest('.card') as HTMLElement
    expect(within(resumen).getByText('4')).toBeInTheDocument() // programadas
    expect(within(resumen).getByText('67%')).toBeInTheDocument() // 2 de 3 resueltas
    expect(within(resumen).getByText('Pendientes')).toBeInTheDocument()
    expect(within(resumen).getByText('Canceladas')).toBeInTheDocument()
  })

  it('sin citas resueltas no inventa un 0 %: deja la asistencia sin cifra', () => {
    renderPanel({ citasDelMes: [cita(1, '08:00')] })
    const resumen = screen.getByText('Resumen del mes').closest('.card') as HTMLElement
    expect(within(resumen).queryByText('0%')).not.toBeInTheDocument()
    expect(within(resumen).getByText('—')).toBeInTheDocument()
  })

  it('un mes vacío enseña ceros, no se rompe', () => {
    renderPanel({ citasDelMes: [] })
    const resumen = screen.getByText('Resumen del mes').closest('.card') as HTMLElement
    expect(within(resumen).getAllByText('0')).toHaveLength(3)
    expect(within(resumen).getByText('—')).toBeInTheDocument()
  })

  it('mientras carga el mes no afirma nada sobre el día', () => {
    renderPanel({ cargando: true, citasDelMes: [] })
    expect(screen.getByText('Cargando las citas del mes...')).toBeInTheDocument()
  })
})

describe('AgendaPanelLateral · motivo extra', () => {
  it('la tarjeta de la cita enseña el motivo anotado para el doctor', () => {
    renderPanel({ citasDelMes: [cita(1, '08:00', { motivo_extra: 'PRIMERA VEZ' })] })
    expect(screen.getByText('PRIMERA VEZ')).toBeInTheDocument()
  })

  it('sin motivo no se pinta nada: es opcional y el panel es estrecho', () => {
    renderPanel({ citasDelMes: [cita(1, '08:00')] })
    expect(
      screen.queryByTitle('Motivo anotado para el doctor'),
    ).not.toBeInTheDocument()
  })
})
