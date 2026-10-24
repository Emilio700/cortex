import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgendaSalasDia } from './AgendaSalasDia'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'
import type { Sala } from '../../../shared/services/salas'

const DIA = new Date(2026, 8, 20, 0, 0, 0, 0)

const sala = (id: number, name: string, display_order = id): Sala => ({
  id,
  tenant_id: 2,
  name,
  is_active: true,
  display_order,
})

const cita = (
  id: number,
  hora: string,
  duracion: number,
  extra: Partial<Appointment> = {},
): Appointment => {
  const [h, m] = hora.split(':').map(Number)
  const fecha = new Date(2026, 8, 20, h, m, 0, 0)
  return {
    id,
    patient_id: id * 10,
    doctor_id: 7,
    tenant_id: 2,
    scheduled_at: fecha.toISOString(),
    duration_minutes: duracion,
    status: AppointmentStatus.AGENDADA,
    created_at: fecha.toISOString(),
    updated_at: fecha.toISOString(),
    has_triage: false,
    ...extra,
  }
}

const renderVista = (props: Partial<React.ComponentProps<typeof AgendaSalasDia>> = {}) => {
  const onCitaClick = vi.fn()
  const onHuecoClick = vi.fn()
  const onCambiarDia = vi.fn()
  render(
    <AgendaSalasDia
      dia={DIA}
      citas={[]}
      salas={[sala(1, 'Sala 1'), sala(2, 'Sala 2')]}
      onCitaClick={onCitaClick}
      onHuecoClick={onHuecoClick}
      onCambiarDia={onCambiarDia}
      {...props}
    />,
  )
  return { onCitaClick, onHuecoClick, onCambiarDia }
}

describe('AgendaSalasDia', () => {
  it('pinta una columna por sala activa', () => {
    renderVista()
    expect(screen.getByText('Sala 1')).toBeInTheDocument()
    expect(screen.getByText('Sala 2')).toBeInTheDocument()
  })

  it('con la sala vacía anuncia toda la jornada libre', () => {
    renderVista()
    expect(screen.getAllByText(/Libre · 07:00 a 20:00/)).toHaveLength(2)
  })

  it('muestra en cada sala el hueco que queda tras sus citas', () => {
    renderVista({
      citas: [
        cita(1, '08:00', 60, {
          room_id: 1,
          patient: { id: 3, first_name: 'ANA', last_name: 'LÓPEZ' },
        }),
      ],
    })
    // La Sala 1 queda partida en dos huecos; la Sala 2 sigue entera.
    expect(screen.getByText(/Libre · 07:00 a 08:00/)).toBeInTheDocument()
    expect(screen.getByText(/Libre · 09:00 a 20:00/)).toBeInTheDocument()
    expect(screen.getByText(/Libre · 07:00 a 20:00/)).toBeInTheDocument()
    expect(screen.getByText('ANA LÓPEZ')).toBeInTheDocument()
  })

  it('al pinchar un hueco avisa con la hora y la sala de ese hueco', async () => {
    const user = userEvent.setup()
    const { onHuecoClick } = renderVista({
      citas: [cita(1, '08:00', 60, { room_id: 1 })],
    })

    await user.click(screen.getByText(/Libre · 09:00 a 20:00/))

    expect(onHuecoClick).toHaveBeenCalledTimes(1)
    const [inicio, salaId] = onHuecoClick.mock.calls[0]
    expect(salaId).toBe(1)
    expect(inicio.getHours()).toBe(9)
    expect(inicio.getMinutes()).toBe(0)
    expect(inicio.getDate()).toBe(20)
  })

  it('avisa cuando una sala se quedó sin huecos', () => {
    renderVista({ citas: [cita(1, '07:00', 780, { room_id: 1 })] })
    expect(screen.getByText('Sin huecos libres')).toBeInTheDocument()
  })

  it('al pinchar una cita la devuelve entera', async () => {
    const user = userEvent.setup()
    const laCita = cita(1, '08:00', 30, {
      room_id: 2,
      patient: { id: 3, first_name: 'ANA', last_name: 'LÓPEZ' },
    })
    const { onCitaClick } = renderVista({ citas: [laCita] })

    await user.click(screen.getByText('ANA LÓPEZ'))

    expect(onCitaClick).toHaveBeenCalledWith(laCita)
  })

  it('separa en su propia columna las citas históricas sin sala', () => {
    renderVista({
      citas: [
        cita(1, '08:00', 30, { patient: { id: 3, first_name: 'ROSA', last_name: 'DÍAZ' } }),
      ],
    })
    expect(screen.getByText('Sin sala')).toBeInTheDocument()
    expect(screen.getByText('Citas sin sala asignada')).toBeInTheDocument()
    // Una cita sin sala no reserva ninguna: las dos salas siguen enteras.
    expect(screen.getAllByText(/Libre · 07:00 a 20:00/)).toHaveLength(2)
  })

  it('ignora las citas de otro día', () => {
    const otroDia = { ...cita(1, '08:00', 30, { room_id: 1 }) }
    otroDia.scheduled_at = new Date(2026, 8, 21, 8, 0).toISOString()
    renderVista({ citas: [otroDia] })
    expect(screen.getAllByText(/Libre · 07:00 a 20:00/)).toHaveLength(2)
  })

  it('no ofrece columnas cuando la sucursal aún no tiene salas', () => {
    renderVista({ salas: [] })
    expect(screen.getByText(/todavía no tiene salas configuradas/)).toBeInTheDocument()
  })

  it('anuncia por su nombre las flechas de cambiar de día', async () => {
    const user = userEvent.setup()
    const { onCambiarDia } = renderVista()

    // Eran dos flechas sin texto: quien no ve el icono no podía saber cuál
    // avanzaba y cuál retrocedía, ni encontrarlas con un lector de pantalla.
    await user.click(screen.getByRole('button', { name: 'Día anterior' }))
    expect(onCambiarDia.mock.calls[0][0].getDate()).toBe(19)

    await user.click(screen.getByRole('button', { name: 'Día siguiente' }))
    expect(onCambiarDia.mock.calls[1][0].getDate()).toBe(21)
  })

  it('deja avanzar y retroceder de día', async () => {
    const user = userEvent.setup()
    const { onCambiarDia } = renderVista()
    const botones = screen.getAllByRole('button')
    // El primer botón es "día anterior".
    await user.click(botones[0])
    expect(onCambiarDia).toHaveBeenCalledTimes(1)
    expect(onCambiarDia.mock.calls[0][0].getDate()).toBe(19)
  })

  it('si no se pudo leer la ocupación ajena lo dice y los huecos no se pintan como libres (revisión de flujos)', () => {
    renderVista({ ocupacionIncompleta: true })

    expect(screen.getByText(/No se pudo leer la ocupación de las demás doctoras/)).toBeInTheDocument()
    expect(screen.queryByText(/^Libre · /)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Sin confirmar · 07:00 a 20:00/)).toHaveLength(2)
  })

  it('el aviso de ocupación no leída ofrece reintentar', async () => {
    const user = userEvent.setup()
    const onReintentarOcupacion = vi.fn()
    renderVista({ ocupacionIncompleta: true, onReintentarOcupacion })

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(onReintentarOcupacion).toHaveBeenCalledTimes(1)
  })
})
