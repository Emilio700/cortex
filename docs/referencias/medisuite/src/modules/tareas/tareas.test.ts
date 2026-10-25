import { describe, expect, it } from 'vitest'
import type { Registro } from '../../lib/types'
import { aTarea, contarVencidas, diasSemana, esMia, filtrar, inicioSemana, ordenar, siguienteRecurrente, siguienteVence, sumarDias, vencida, datosLimpios } from './tareas'

// sábado 24 de octubre de 2026, 10:00 hora local
const NOW = new Date(2026, 9, 24, 10, 0).getTime()

const reg = (id: string, estado: string, datos: Record<string, unknown>, extra: Partial<Registro> = {}): Registro => ({
  id,
  fecha: '2026-10-01T10:00:00.000Z',
  tipo: 'tarea',
  estado,
  titulo: 'Tarea ' + id,
  datos,
  ...extra,
})

describe('tareas', () => {
  it('normaliza datos incompletos', () => {
    const t = aTarea({
      id: 'x',
      fecha: '2026-10-01',
      tipo: 'tarea',
      datos: {},
    })
    expect(t.estado).toBe('abierta')
    expect(t.datos.prioridad).toBe('media')
    expect(t.datos.etiquetas).toEqual([])
    expect(t.datos.comentarios).toEqual([])
    expect(t.titulo).toBe('Tarea sin título')
  })

  it('detecta vencidas solo si siguen activas y la fecha es anterior a hoy', () => {
    const ts = [
      aTarea(reg('a', 'abierta', { vence: '2026-10-23' })),
      aTarea(reg('b', 'en-curso', { vence: '2026-10-20' })),
      aTarea(reg('c', 'hecha', { vence: '2026-10-20' })),
      aTarea(reg('d', 'abierta', { vence: '2026-10-24' })), // hoy: no vencida
      aTarea(reg('e', 'cancelada', { vence: '2026-01-01' })),
      aTarea(reg('f', 'abierta', {})),
    ]
    expect(ts.map((t) => vencida(t, NOW))).toEqual([true, true, false, false, false, false])
    expect(contarVencidas(ts, NOW)).toBe(2)
  })

  it('«mis tareas» por id o por nombre sin acentos', () => {
    const t1 = aTarea(reg('a', 'abierta', { asignadoA: 'u1', asignadoNombre: 'Ana' }))
    const t2 = aTarea(reg('b', 'abierta', { asignadoNombre: 'Dra. Andrea Morales Peña' }))
    expect(esMia(t1, { id: 'u1', nombre: 'Otra' })).toBe(true)
    expect(esMia(t1, { id: 'u2', nombre: 'Ana' })).toBe(false)
    expect(esMia(t2, { nombre: 'dra. andrea morales pena' })).toBe(true)
    expect(esMia(t2, null)).toBe(false)
  })

  it('filtra por paciente, etiqueta, texto y vista', () => {
    const ts = [
      aTarea(reg('a', 'abierta', { etiquetas: ['cobro'], vence: '2026-10-01' }, { patientId: 'p1' })),
      aTarea(
        reg('b', 'abierta', {
          etiquetas: ['insumos'],
          descripcion: 'Pedir guantes',
        }),
      ),
      aTarea(reg('c', 'hecha', { etiquetas: ['cobro'] }, { patientId: 'p1' })),
    ]
    expect(filtrar(ts, { patientId: 'p1' }, null, NOW).map((t) => t.id)).toEqual(['a', 'c'])
    expect(filtrar(ts, { etiqueta: 'cobro', vista: 'activas' }, null, NOW).map((t) => t.id)).toEqual(['a'])
    expect(filtrar(ts, { texto: 'GUANTES' }, null, NOW).map((t) => t.id)).toEqual(['b'])
    expect(filtrar(ts, { vista: 'vencidas' }, null, NOW).map((t) => t.id)).toEqual(['a'])
  })

  it('ordena: vencidas, fecha, prioridad', () => {
    const ts = [
      aTarea(reg('sin-fecha', 'abierta', { prioridad: 'urgente' })),
      aTarea(
        reg('manana-baja', 'abierta', {
          vence: '2026-10-25',
          prioridad: 'baja',
        }),
      ),
      aTarea(
        reg('manana-alta', 'abierta', {
          vence: '2026-10-25',
          prioridad: 'alta',
        }),
      ),
      aTarea(reg('vencida', 'abierta', { vence: '2026-10-22' })),
    ]
    expect(ordenar(ts, NOW).map((t) => t.id)).toEqual(['vencida', 'manana-alta', 'manana-baja', 'sin-fecha'])
  })

  it('semana de lunes a domingo', () => {
    expect(inicioSemana('2026-10-24')).toBe('2026-10-19') // sábado → lunes 19
    expect(inicioSemana('2026-10-25')).toBe('2026-10-19') // domingo → mismo lunes
    expect(inicioSemana('2026-10-26')).toBe('2026-10-26')
    expect(diasSemana('2026-10-24')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('recurrencia', () => {
    expect(siguienteVence('2026-10-24', 'diaria', '2026-10-24')).toBe('2026-10-25')
    expect(siguienteVence('2026-10-24', 'semanal', '2026-10-24')).toBe('2026-10-31')
    expect(siguienteVence('2026-01-31', 'mensual', '2026-01-31')).toBe('2026-02-28')
    expect(siguienteVence(undefined, 'semanal', '2026-10-24')).toBe('2026-10-31')
    const t = aTarea(
      reg('r', 'hecha', {
        vence: '2026-10-01',
        recurrencia: 'semanal',
        comentarios: [{ fecha: 'x', autor: 'y', texto: 'z' }],
        etiquetas: ['insumos'],
      }),
    )
    const sig = siguienteRecurrente(t, '2026-10-24')!
    expect(sig.estado).toBe('abierta')
    expect((sig.datos as { vence: string }).vence).toBe('2026-10-29') // no nace vencida
    expect((sig.datos as { comentarios: unknown[] }).comentarios).toEqual([])
    expect(siguienteRecurrente(aTarea(reg('n', 'hecha', {})), '2026-10-24')).toBeNull()
  })

  it('datosLimpios quita vacíos', () => {
    expect(
      datosLimpios({
        descripcion: '',
        prioridad: 'alta',
        etiquetas: [],
        comentarios: [],
        asignadoNombre: undefined,
      }),
    ).toEqual({ prioridad: 'alta', etiquetas: [], comentarios: [] })
  })
})
