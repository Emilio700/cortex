import { describe, it, expect } from 'vitest'
import {
  agruparCitasPorSala,
  colorDeSala,
  COLOR_SIN_SALA,
  duracionEnMinutos,
  esMismoDia,
  formatearMinutos,
  formatearResumenCita,
  formatearTramo,
  huecosLibres,
  minutosDelDia,
  nombreSalaDeCita,
  repartirEnCarriles,
  salaEsObligatoria,
  salaPorDefecto,
  salasActivas,
  SIN_SALA_LABEL,
  tramoDeCita,
  tramosOcupados,
} from './salas'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'
import type { Sala } from '../../../shared/services/salas'

const sala = (id: number, name: string, display_order = id, is_active = true): Sala => ({
  id,
  tenant_id: 1,
  name,
  is_active,
  display_order,
})

const SALA_1 = sala(1, 'Sala 1', 1)
const SALA_2 = sala(2, 'Sala 2', 2)

/** Cita local del día 2026-09-20 a la hora indicada ("08:00"). */
const cita = (
  id: number,
  hora: string,
  duracion = 30,
  extra: Partial<Appointment> = {},
): Appointment => {
  const [h, m] = hora.split(':').map(Number)
  const fecha = new Date(2026, 8, 20, h, m, 0, 0)
  return {
    id,
    patient_id: id * 10,
    doctor_id: 7,
    tenant_id: 1,
    scheduled_at: fecha.toISOString(),
    duration_minutes: duracion,
    status: AppointmentStatus.AGENDADA,
    created_at: fecha.toISOString(),
    updated_at: fecha.toISOString(),
    has_triage: false,
    ...extra,
  }
}

describe('minutosDelDia / formatearMinutos', () => {
  it('cuenta los minutos desde la medianoche en hora local', () => {
    expect(minutosDelDia(new Date(2026, 8, 20, 8, 15))).toBe(495)
  })

  it('formatea con dos dígitos y no se sale de rango', () => {
    expect(formatearMinutos(495)).toBe('08:15')
    expect(formatearMinutos(0)).toBe('00:00')
    expect(formatearMinutos(-10)).toBe('00:00')
  })

  it('reconoce si una cita cae en el día mostrado', () => {
    const dia = new Date(2026, 8, 20, 0, 0)
    expect(esMismoDia(cita(1, '08:00').scheduled_at, dia)).toBe(true)
    expect(esMismoDia(new Date(2026, 8, 21, 8, 0), dia)).toBe(false)
  })
})

describe('duracionEnMinutos / tramoDeCita', () => {
  it('usa los minutos de una consulta normal', () => {
    expect(duracionEnMinutos(cita(1, '08:00', 45))).toBe(45)
  })

  it('convierte a minutos la duración en horas de una cirugía', () => {
    expect(duracionEnMinutos(cita(1, '08:00', 30, { duration_hours: 2.5 }))).toBe(150)
  })

  it('cae a 30 minutos si la duración viene vacía', () => {
    expect(duracionEnMinutos(cita(1, '08:00', 0))).toBe(30)
  })

  it('devuelve el tramo de inicio y fin de la cita', () => {
    expect(tramoDeCita(cita(1, '09:00', 60))).toEqual({ inicio: 540, fin: 600 })
  })
})

describe('agruparCitasPorSala', () => {
  it('reparte cada cita en la columna de su sala, en el orden configurado', () => {
    const columnas = agruparCitasPorSala(
      [
        cita(1, '09:00', 30, { room_id: 2 }),
        cita(2, '08:00', 30, { room_id: 1 }),
        cita(3, '10:00', 30, { room_id: 1 }),
      ],
      [SALA_2, SALA_1],
    )
    expect(columnas.map((c) => c.nombre)).toEqual(['Sala 1', 'Sala 2'])
    expect(columnas[0].citas.map((c) => c.id)).toEqual([2, 3])
    expect(columnas[1].citas.map((c) => c.id)).toEqual([1])
  })

  it('no añade la columna "Sin sala" cuando todas las citas la tienen', () => {
    const columnas = agruparCitasPorSala([cita(1, '08:00', 30, { room_id: 1 })], [SALA_1, SALA_2])
    expect(columnas.some((c) => c.salaId === null)).toBe(false)
  })

  it('agrupa en "Sin sala" las citas históricas y las de una sala desactivada', () => {
    const columnas = agruparCitasPorSala(
      [cita(1, '08:00'), cita(2, '09:00', 30, { room_id: 99 })],
      [SALA_1, sala(99, 'Sala vieja', 3, false)],
    )
    const sinSala = columnas.find((c) => c.salaId === null)
    expect(sinSala?.nombre).toBe(SIN_SALA_LABEL)
    expect(sinSala?.citas.map((c) => c.id)).toEqual([1, 2])
    expect(columnas[columnas.length - 1].salaId).toBeNull()
  })

  it('ignora las salas desactivadas al montar las columnas', () => {
    const columnas = agruparCitasPorSala([], [SALA_1, sala(3, 'Sala 3', 3, false)])
    expect(columnas.map((c) => c.nombre)).toEqual(['Sala 1'])
  })
})

describe('tramosOcupados', () => {
  it('fusiona los solapes en un solo tramo', () => {
    expect(tramosOcupados([cita(1, '08:00', 60), cita(2, '08:30', 60)])).toEqual([
      { inicio: 480, fin: 570 },
    ])
  })

  it('no deja que una cita cancelada retenga la sala', () => {
    expect(
      tramosOcupados([cita(1, '08:00', 60, { status: AppointmentStatus.CANCELADA })]),
    ).toEqual([])
  })

  it('mantiene separados los tramos que no se tocan', () => {
    expect(tramosOcupados([cita(1, '08:00', 30), cita(2, '10:00', 30)])).toEqual([
      { inicio: 480, fin: 510 },
      { inicio: 600, fin: 630 },
    ])
  })
})

describe('huecosLibres', () => {
  it('con la sala vacía, toda la jornada está libre', () => {
    expect(huecosLibres([])).toEqual([{ inicio: 420, fin: 1200 }])
  })

  it('devuelve el hueco entre dos citas y el de antes y después', () => {
    const huecos = huecosLibres([cita(1, '08:00', 60), cita(2, '10:00', 30)])
    expect(huecos.map(formatearTramo)).toEqual(['07:00 a 08:00', '09:00 a 10:00', '10:30 a 20:00'])
  })

  it('descarta los huecos más cortos que el mínimo', () => {
    const huecos = huecosLibres([cita(1, '07:00', 60), cita(2, '08:10', 60)], 420, 1200, 15)
    expect(huecos.map(formatearTramo)).toEqual(['09:10 a 20:00'])
  })

  it('no inventa hueco cuando la jornada está llena', () => {
    expect(huecosLibres([cita(1, '07:00', 780)])).toEqual([])
  })

  it('recorta las citas que se salen de la jornada visible', () => {
    const huecos = huecosLibres([cita(1, '06:00', 120), cita(2, '19:30', 120)])
    expect(huecos.map(formatearTramo)).toEqual(['08:00 a 19:30'])
  })
})

describe('nombreSalaDeCita y formatearResumenCita', () => {
  it('usa el nombre que ya resolvió el backend', () => {
    expect(nombreSalaDeCita(cita(1, '08:00', 30, { room_id: 1, room_name: 'Sala 1' }))).toBe(
      'Sala 1',
    )
  })

  it('no inventa nombre si el backend no lo mandó, aunque venga el id', () => {
    expect(nombreSalaDeCita(cita(1, '08:00', 30, { room_id: 2 }))).toBeNull()
  })

  it('devuelve null para una cita histórica sin sala', () => {
    expect(nombreSalaDeCita(cita(1, '08:00'))).toBeNull()
  })

  it('arma el resumen con hora, paciente, doctor y sala', () => {
    const conDatos = cita(1, '08:00', 30, {
      room_id: 1,
      room_name: 'Sala 1',
      patient: { id: 3, first_name: 'ANA', last_name: 'LÓPEZ' },
      doctor: { id: 7, full_name: 'Pérez', email: 'p@x.com', tratamiento: 'Dr.' },
    })
    expect(formatearResumenCita(conDatos)).toBe('08:00 a 08:30 · ANA LÓPEZ · Dr. Pérez · Sala 1')
    // Sin tratamiento capturado va el nombre solo: nada de un "Dr." supuesto.
    expect(
      formatearResumenCita({ ...conDatos, doctor: { ...conDatos.doctor!, tratamiento: null } }),
    ).toBe('08:00 a 08:30 · ANA LÓPEZ · Pérez · Sala 1')
  })

  it('dice "Sin sala" en el resumen de una cita histórica', () => {
    expect(formatearResumenCita(cita(1, '08:00'))).toContain(SIN_SALA_LABEL)
  })
})

describe('repartirEnCarriles', () => {
  it('deja en un solo carril las citas que no se pisan', () => {
    const colocadas = repartirEnCarriles([cita(1, '08:00', 30), cita(2, '09:00', 30)])
    expect(colocadas.map((c) => [c.carril, c.carriles])).toEqual([
      [0, 1],
      [0, 1],
    ])
  })

  it('pone una al lado de otra las citas solapadas', () => {
    const colocadas = repartirEnCarriles([cita(1, '08:00', 60), cita(2, '08:30', 60)])
    expect(colocadas.map((c) => c.carril)).toEqual([0, 1])
    expect(colocadas.every((c) => c.carriles === 2)).toBe(true)
  })

  it('reparte el ancho por grupo de solape, no por toda la columna', () => {
    const colocadas = repartirEnCarriles([
      cita(1, '08:00', 60),
      cita(2, '08:30', 60),
      cita(3, '12:00', 30),
    ])
    const porId = new Map(colocadas.map((c) => [c.cita.id, c.carriles]))
    expect(porId.get(1)).toBe(2)
    expect(porId.get(2)).toBe(2)
    expect(porId.get(3)).toBe(1)
  })

  it('reutiliza el carril que quedó libre', () => {
    const colocadas = repartirEnCarriles([
      cita(1, '08:00', 120),
      cita(2, '08:00', 30),
      cita(3, '09:00', 30),
    ])
    const porId = new Map(colocadas.map((c) => [c.cita.id, c.carril]))
    expect(porId.get(1)).toBe(0)
    expect(porId.get(2)).toBe(1)
    expect(porId.get(3)).toBe(1)
  })

  it('devuelve las citas ordenadas por hora aunque lleguen desordenadas', () => {
    const colocadas = repartirEnCarriles([cita(3, '10:00'), cita(1, '08:00'), cita(2, '09:00')])
    expect(colocadas.map((c) => c.cita.id)).toEqual([1, 2, 3])
  })
})

describe('colorDeSala', () => {
  it('da un color estable por posición, no por id', () => {
    const primero = colorDeSala(1, [SALA_1, SALA_2])
    const segundo = colorDeSala(2, [SALA_1, SALA_2])
    expect(primero).not.toBe(segundo)
    expect(colorDeSala(1, [SALA_2, SALA_1])).toBe(primero)
  })

  it('pinta de gris lo que no tiene sala o ya no existe', () => {
    expect(colorDeSala(null, [SALA_1])).toBe(COLOR_SIN_SALA)
    expect(colorDeSala(404, [SALA_1])).toBe(COLOR_SIN_SALA)
  })
})

describe('reglas de obligatoriedad de sala', () => {
  it('ordena y filtra las salas activas', () => {
    expect(salasActivas([SALA_2, sala(3, 'Sala 3', 3, false), SALA_1]).map((s) => s.id)).toEqual([
      1, 2,
    ])
    // San Ignacio tiene una sola sala y se llama "Consultorio"
    expect(salasActivas([sala(9, 'Consultorio', 1)]).map((s) => s.name)).toEqual(['Consultorio'])
  })

  it('es obligatoria donde hay más de una sala activa (G & G)', () => {
    expect(salaEsObligatoria([SALA_1, SALA_2])).toBe(true)
  })

  it('no es obligatoria donde sólo hay una (San Ignacio)', () => {
    expect(salaEsObligatoria([SALA_1])).toBe(false)
    expect(salaEsObligatoria([SALA_1, sala(2, 'Sala 2', 2, false)])).toBe(false)
  })

  it('preselecciona la única sala disponible', () => {
    expect(salaPorDefecto([SALA_1])).toBe(1)
  })

  it('no preselecciona nada cuando hay varias', () => {
    expect(salaPorDefecto([SALA_1, SALA_2])).toBeNull()
  })

  it('respeta la sala que ya tiene la cita al reagendar', () => {
    expect(salaPorDefecto([SALA_1, SALA_2], 2)).toBe(2)
  })
})
