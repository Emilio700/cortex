import { describe, it, expect } from 'vitest'
import {
  agruparCitasPorDia,
  citasDeDia,
  claveDia,
  csvDeCitas,
  CSV_CABECERAS,
  esDelMes,
  etiquetaTipoCita,
  filaCsvDeCita,
  finDelMesISO,
  formatearTarjetaCita,
  horaLocal,
  inicioDelMesISO,
  mesDesplazado,
  mismoDia,
  nombreArchivoCsv,
  motivoDeCita,
  MOTIVOS_SUGERIDOS,
  nombrePaciente,
  resumenDelMes,
  semanasDelMes,
  tituloDia,
  tituloMes,
} from './tablero'
import { AppointmentStatus } from '../types'
import type { Appointment } from '../types'

/** Cita local del 2026-09-19 (o del día indicado) a la hora dada. */
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
    ...extra,
  }
}

describe('claveDia y mismoDia', () => {
  it('usa la fecha local, no la UTC', () => {
    // 2026-09-19 23:30 local: en UTC ya puede ser día 20, y aun así la cita
    // pertenece al 19 para quien la agendó.
    const tarde = new Date(2026, 8, 19, 23, 30, 0, 0)
    expect(claveDia(tarde)).toBe('2026-09-19')
  })

  it('rellena mes y día a dos dígitos', () => {
    expect(claveDia(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('reconoce dos momentos del mismo día', () => {
    expect(mismoDia(new Date(2026, 8, 19, 7, 0), new Date(2026, 8, 19, 19, 45))).toBe(true)
    expect(mismoDia(new Date(2026, 8, 19), new Date(2026, 8, 20))).toBe(false)
  })
})

describe('agruparCitasPorDia', () => {
  it('reparte por día natural y ordena cada día por hora', () => {
    const grupos = agruparCitasPorDia([
      cita(1, '16:00'),
      cita(2, '08:00'),
      cita(3, '09:30', {}, 20),
    ])
    expect([...grupos.keys()].sort()).toEqual(['2026-09-19', '2026-09-20'])
    expect(grupos.get('2026-09-19')!.map((c) => c.id)).toEqual([2, 1])
    expect(grupos.get('2026-09-20')!.map((c) => c.id)).toEqual([3])
  })

  it('devuelve un mapa vacío si no hay citas', () => {
    expect(agruparCitasPorDia([]).size).toBe(0)
  })
})

describe('citasDeDia', () => {
  it('se queda sólo con las del día pedido, en orden', () => {
    const citas = [cita(1, '16:00'), cita(2, '08:00'), cita(3, '09:30', {}, 20)]
    expect(citasDeDia(citas, new Date(2026, 8, 19)).map((c) => c.id)).toEqual([2, 1])
  })

  it('devuelve lista vacía en un día sin citas', () => {
    expect(citasDeDia([cita(1, '08:00')], new Date(2026, 8, 21))).toEqual([])
  })
})

describe('resumenDelMes', () => {
  it('cuenta programadas, pendientes, canceladas y calcula la asistencia', () => {
    const resumen = resumenDelMes([
      cita(1, '08:00'), // agendada -> pendiente
      cita(2, '09:00', { status: AppointmentStatus.CONFIRMADA }), // pendiente
      cita(3, '10:00', { status: AppointmentStatus.ATENDIDA }),
      cita(4, '11:00', { status: AppointmentStatus.ATENDIDA }),
      cita(5, '12:00', { status: AppointmentStatus.ATENDIDA }),
      cita(6, '13:00', { status: AppointmentStatus.CANCELADA }),
    ])
    expect(resumen.programadas).toBe(6)
    expect(resumen.pendientes).toBe(2)
    expect(resumen.canceladas).toBe(1)
    // 3 atendidas sobre 4 resueltas = 75 %
    expect(resumen.asistencia).toBe(75)
  })

  it('no cuenta "en sala" como pendiente ni como resuelta', () => {
    const resumen = resumenDelMes([cita(1, '08:00', { status: AppointmentStatus.EN_SALA })])
    expect(resumen.programadas).toBe(1)
    expect(resumen.pendientes).toBe(0)
    expect(resumen.asistencia).toBeNull()
  })

  it('mes sin citas: todo a cero y asistencia indeterminada', () => {
    expect(resumenDelMes([])).toEqual({
      programadas: 0,
      pendientes: 0,
      canceladas: 0,
      asistencia: null,
    })
  })

  it('mes con todas canceladas: 0 % de asistencia, no null', () => {
    const resumen = resumenDelMes([
      cita(1, '08:00', { status: AppointmentStatus.CANCELADA }),
      cita(2, '09:00', { status: AppointmentStatus.CANCELADA }),
    ])
    expect(resumen.programadas).toBe(2)
    expect(resumen.canceladas).toBe(2)
    expect(resumen.pendientes).toBe(0)
    expect(resumen.asistencia).toBe(0)
  })

  it('mes con todo aún por atender: no divide entre cero, devuelve null', () => {
    const resumen = resumenDelMes([
      cita(1, '08:00'),
      cita(2, '09:00', { status: AppointmentStatus.CONFIRMADA }),
    ])
    expect(resumen.pendientes).toBe(2)
    expect(resumen.asistencia).toBeNull()
  })

  it('redondea el porcentaje a entero', () => {
    const resumen = resumenDelMes([
      cita(1, '08:00', { status: AppointmentStatus.ATENDIDA }),
      cita(2, '09:00', { status: AppointmentStatus.ATENDIDA }),
      cita(3, '10:00', { status: AppointmentStatus.CANCELADA }),
    ])
    expect(resumen.asistencia).toBe(67)
  })
})

describe('formato de la tarjeta de cita', () => {
  it('arma hora, paciente, tipo y sala', () => {
    const tarjeta = formatearTarjetaCita(
      cita(1, '08:05', {
        patient: { id: 1, first_name: 'ANA', last_name: 'LÓPEZ' },
        appointment_type: 'procedimiento',
        room_name: 'Sala 2',
        status: AppointmentStatus.CONFIRMADA,
      }),
    )
    expect(tarjeta).toMatchObject({
      hora: '08:05',
      paciente: 'ANA LÓPEZ',
      tipo: 'Procedimiento',
      sala: 'Sala 2',
      estadoLabel: 'Confirmada',
    })
  })

  it('una cita histórica sin sala deja la sala en null, no en cadena vacía', () => {
    expect(formatearTarjetaCita(cita(1, '08:00')).sala).toBeNull()
  })

  it('sin paciente anidado, identifica por número en vez de quedarse muda', () => {
    expect(nombrePaciente(cita(3, '08:00'))).toBe('Paciente #30')
  })

  it('sin tipo, asume consulta (es el valor por defecto del backend)', () => {
    expect(etiquetaTipoCita(cita(1, '08:00'))).toBe('Consulta')
    expect(etiquetaTipoCita(cita(1, '08:00', { appointment_type: 'cirugia' }))).toBe('Cirugía')
  })

  it('formatea la hora local a 24 h con dos dígitos', () => {
    expect(horaLocal(new Date(2026, 8, 19, 9, 5))).toBe('09:05')
  })
})

describe('mini calendario', () => {
  it('arma semanas completas de lunes a domingo', () => {
    const semanas = semanasDelMes(new Date(2026, 8, 19))
    for (const semana of semanas) {
      expect(semana).toHaveLength(7)
      expect(semana[0].getDay()).toBe(1) // lunes
      expect(semana[6].getDay()).toBe(0) // domingo
    }
  })

  it('cubre el mes entero, del día 1 al último', () => {
    const referencia = new Date(2026, 8, 19)
    const dias = semanasDelMes(referencia).flat()
    const delMes = dias.filter((d) => esDelMes(d, referencia))
    expect(delMes[0].getDate()).toBe(1)
    expect(delMes[delMes.length - 1].getDate()).toBe(30) // septiembre
    expect(delMes).toHaveLength(30)
  })

  it('funciona en un mes que empieza en domingo sin dejar huecos', () => {
    // Febrero de 2026 empieza en domingo: la primera semana es casi toda relleno.
    const referencia = new Date(2026, 1, 10)
    const semanas = semanasDelMes(referencia)
    expect(semanas[0]).toHaveLength(7)
    expect(semanas[0][6].getDate()).toBe(1)
    expect(semanas.flat().filter((d) => esDelMes(d, referencia))).toHaveLength(28)
  })

  it('mesDesplazado cruza el cambio de año en ambos sentidos', () => {
    expect(mesDesplazado(new Date(2026, 11, 20), 1).getFullYear()).toBe(2027)
    expect(mesDesplazado(new Date(2026, 11, 20), 1).getMonth()).toBe(0)
    expect(mesDesplazado(new Date(2026, 0, 20), -1).getFullYear()).toBe(2025)
    expect(mesDesplazado(new Date(2026, 0, 20), -1).getMonth()).toBe(11)
  })

  it('titula el día y el mes en español', () => {
    expect(tituloDia(new Date(2026, 8, 19))).toBe('19 de septiembre')
    expect(tituloMes(new Date(2026, 8, 19))).toBe('Septiembre 2026')
  })

  it('el rango del mes va del primer instante al último', () => {
    const inicio = new Date(inicioDelMesISO(new Date(2026, 8, 19)))
    const fin = new Date(finDelMesISO(new Date(2026, 8, 19)))
    expect(claveDia(inicio)).toBe('2026-09-01')
    expect(inicio.getHours()).toBe(0)
    expect(claveDia(fin)).toBe('2026-09-30')
    expect(fin.getHours()).toBe(23)
  })
})

describe('exportación a CSV', () => {
  it('abre con la fila de cabeceras', () => {
    expect(csvDeCitas([]).split('\r\n')[0]).toBe(CSV_CABECERAS.join(','))
  })

  it('vuelca fecha, hora, paciente, doctor, tipo, motivo, sala, estado y duración', () => {
    expect(
      filaCsvDeCita(
        cita(1, '08:30', {
          patient: { id: 1, first_name: 'ANA', last_name: 'LÓPEZ' },
          doctor: { id: 7, full_name: 'Adolfo', email: 'a@b.c', tratamiento: 'Dr.' },
          appointment_type: 'consulta',
          motivo_extra: 'CONTROL',
          room_name: 'Sala 1',
          status: AppointmentStatus.ATENDIDA,
        }),
      ),
    ).toEqual([
      '2026-09-19',
      '08:30',
      'ANA LÓPEZ',
      'Dr. Adolfo',
      'Consulta',
      'CONTROL',
      'Sala 1',
      'Atendida',
      '30',
      '',
    ])
  })

  it('las cirugías se exportan con su duración real en minutos', () => {
    const fila = filaCsvDeCita(cita(1, '08:00', { duration_hours: 2.5 }))
    expect(fila[8]).toBe('150')
  })

  it('las citas sin sala se exportan como "Sin sala", no en blanco', () => {
    expect(filaCsvDeCita(cita(1, '08:00'))[6]).toBe('Sin sala')
  })

  it('una cita sin motivo deja esa columna vacía, no un texto inventado', () => {
    expect(filaCsvDeCita(cita(1, '08:00'))[5]).toBe('')
  })

  it('entrecomilla y escapa las notas con comas, comillas o saltos de línea', () => {
    const csv = csvDeCitas([cita(1, '08:00', { notes: 'Trae estudios, "urgente"\nllamar antes' })])
    expect(csv).toContain('"Trae estudios, ""urgente"" llamar antes"')
    // El salto de línea de la nota no puede partir la fila en dos.
    expect(csv.split('\r\n')).toHaveLength(2)
  })

  it('ordena las filas por fecha y hora aunque lleguen desordenadas', () => {
    const csv = csvDeCitas([cita(2, '09:00', {}, 20), cita(1, '16:00')])
    const filas = csv.split('\r\n')
    expect(filas[1]).toContain('2026-09-19')
    expect(filas[2]).toContain('2026-09-20')
  })

  it('nombra el archivo con el rango exportado', () => {
    expect(nombreArchivoCsv(new Date(2026, 8, 1), new Date(2026, 8, 30))).toBe(
      'agenda-2026-09-01-a-2026-09-30.csv',
    )
  })
})


describe('motivo extra de la cita', () => {
  it('devuelve el motivo anotado', () => {
    expect(motivoDeCita(cita(1, '08:00', { motivo_extra: 'ULTRASONIDO' }))).toBe('ULTRASONIDO')
  })

  it('sin motivo devuelve null, para que la pantalla no pinte una etiqueta vacía', () => {
    expect(motivoDeCita(cita(1, '08:00'))).toBeNull()
    expect(motivoDeCita(cita(1, '08:00', { motivo_extra: null }))).toBeNull()
    expect(motivoDeCita(cita(1, '08:00', { motivo_extra: '   ' }))).toBeNull()
  })

  it('la tarjeta del panel lo lleva ya formateado', () => {
    expect(formatearTarjetaCita(cita(1, '08:00', { motivo_extra: 'CONTROL' })).motivo).toBe(
      'CONTROL',
    )
    expect(formatearTarjetaCita(cita(1, '08:00')).motivo).toBeNull()
  })

  it('las sugerencias son las del consultorio y van en MAYÚSCULAS', () => {
    expect(MOTIVOS_SUGERIDOS).toContain('CONTROL')
    expect(MOTIVOS_SUGERIDOS).toContain('PRIMERA VEZ')
    expect(MOTIVOS_SUGERIDOS).toContain('ULTRASONIDO')
    for (const sugerencia of MOTIVOS_SUGERIDOS) {
      expect(sugerencia).toBe(sugerencia.toUpperCase())
    }
  })

  it('el motivo NO es un tipo de cita: los tipos siguen siendo tres', () => {
    const conMotivo = cita(1, '08:00', { motivo_extra: 'ULTRASONIDO' })
    expect(etiquetaTipoCita(conMotivo)).toBe('Consulta')
  })
})
