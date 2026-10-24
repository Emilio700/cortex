import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgendaLista } from './AgendaLista'
import { AgendaLeyenda } from './AgendaLeyenda'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'
import type { Sala } from '../../../shared/services/salas'

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

const sala = (id: number, name: string): Sala => ({
  id,
  tenant_id: 2,
  name,
  is_active: true,
  display_order: id,
})

describe('AgendaLista', () => {
  it('agrupa por día y ordena cada día por hora', () => {
    render(
      <AgendaLista
        citas={[cita(3, '09:00', {}, 20), cita(2, '16:00'), cita(1, '08:00')]}
        onCitaClick={vi.fn()}
      />,
    )
    const titulos = screen.getAllByRole('heading', { level: 6 }).map((h) => h.textContent)
    expect(titulos[0]).toContain('19 de septiembre')
    expect(titulos[1]).toContain('20 de septiembre')

    const tablas = screen.getAllByRole('table')
    const horasDel19 = within(tablas[0])
      .getAllByRole('row')
      .slice(1)
      .map((fila) => fila.firstElementChild?.textContent)
    expect(horasDel19).toEqual(['08:00', '16:00'])
  })

  it('cuenta las citas de cada día en el encabezado', () => {
    render(<AgendaLista citas={[cita(1, '08:00'), cita(2, '09:00')]} onCitaClick={vi.fn()} />)
    expect(screen.getByText('2 citas')).toBeInTheDocument()
  })

  it('singulariza cuando sólo hay una cita', () => {
    render(<AgendaLista citas={[cita(1, '08:00')]} onCitaClick={vi.fn()} />)
    expect(screen.getByText('1 cita')).toBeInTheDocument()
  })

  it('muestra paciente, doctor, tipo, sala y estado', () => {
    render(
      <AgendaLista
        citas={[
          cita(1, '08:00', {
            doctor: { id: 7, full_name: 'Adolfo', email: 'a@b.c', tratamiento: 'Dr.' },
            appointment_type: 'cirugia',
            room_name: 'Sala 1',
            status: AppointmentStatus.CONFIRMADA,
          }),
        ]}
        onCitaClick={vi.fn()}
      />,
    )
    expect(screen.getByText('ANA PACIENTE 1')).toBeInTheDocument()
    expect(screen.getByText('Dr. Adolfo')).toBeInTheDocument()
    expect(screen.getByText('Cirugía')).toBeInTheDocument()
    expect(screen.getByText('Sala 1')).toBeInTheDocument()
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
  })

  it('pinchar una fila abre esa cita', async () => {
    const user = userEvent.setup()
    const onCitaClick = vi.fn()
    render(<AgendaLista citas={[cita(4, '08:00')]} onCitaClick={onCitaClick} />)
    await user.click(screen.getByRole('button', { name: 'Abrir la cita de ANA PACIENTE 4' }))
    expect(onCitaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
  })

  it('la fila también se abre con el teclado', async () => {
    const user = userEvent.setup()
    const onCitaClick = vi.fn()
    render(<AgendaLista citas={[cita(4, '08:00')]} onCitaClick={onCitaClick} />)
    screen.getByRole('button', { name: /Abrir la cita/ }).focus()
    await user.keyboard('{Enter}')
    expect(onCitaClick).toHaveBeenCalledTimes(1)
  })

  it('sin citas explica qué hacer, no dice "No data"', () => {
    render(<AgendaLista citas={[]} onCitaClick={vi.fn()} />)
    expect(screen.getByText(/No hay ninguna cita en el periodo/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('AgendaLeyenda', () => {
  it('explica los cinco estados que colorean las citas', () => {
    render(<AgendaLeyenda />)
    for (const estado of ['Agendada', 'Confirmada', 'En sala', 'Atendida', 'Cancelada']) {
      expect(screen.getByText(estado)).toBeInTheDocument()
    }
  })

  it('explica el punto de color de cada sala', () => {
    render(<AgendaLeyenda salas={[sala(1, 'Sala 1'), sala(2, 'Sala 2')]} />)
    expect(screen.getByText('Punto de color: sala')).toBeInTheDocument()
    expect(screen.getByText('Sala 1')).toBeInTheDocument()
    expect(screen.getByText('Sala 2')).toBeInTheDocument()
  })

  it('sin salas configuradas no promete un código de color que no existe', () => {
    render(<AgendaLeyenda salas={[]} />)
    expect(screen.queryByText('Punto de color: sala')).not.toBeInTheDocument()
  })

  it('sólo explica "Sin sala" si de verdad hay citas sin sala a la vista', () => {
    const { rerender } = render(<AgendaLeyenda salas={[sala(1, 'Sala 1')]} mostrarSinSala={false} />)
    expect(screen.queryByText('Sin sala')).not.toBeInTheDocument()
    rerender(<AgendaLeyenda salas={[sala(1, 'Sala 1')]} mostrarSinSala />)
    expect(screen.getByText('Sin sala')).toBeInTheDocument()
  })
})

describe('AgendaLista · motivo extra', () => {
  it('muestra el motivo anotado en su columna', () => {
    render(
      <AgendaLista
        citas={[cita(1, '08:00', { motivo_extra: 'ULTRASONIDO' })]}
        onCitaClick={vi.fn()}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'Motivo' })).toBeInTheDocument()
    expect(screen.getByText('ULTRASONIDO')).toBeInTheDocument()
  })

  it('una cita sin motivo pinta una raya, no un hueco en blanco', () => {
    render(<AgendaLista citas={[cita(1, '08:00')]} onCitaClick={vi.fn()} />)
    const raya = screen.getByTitle('Esta cita no tiene ningún motivo anotado.')
    expect(raya).toHaveTextContent('—')
  })
})
