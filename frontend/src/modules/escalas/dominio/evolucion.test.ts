import { describe, expect, it } from 'vitest'
import { escalaPorId } from './catalogo'
import { escalasConRegistro, evolucionDe, type Aplicacion } from './evolucion'

const oswestry = escalaPorId('oswestry')!
const glasgow = escalaPorId('glasgow')!

const a = (id: number, escala: string, puntaje: number | null, fecha: string, anulada = false): Aplicacion => ({
  id,
  escala,
  puntaje,
  aplicada_en: fecha,
  anulado_at: anulada ? '2026-10-20T10:00:00' : null,
})

describe('evolución de una escala', () => {
  it('ODI antes y después: bajar es mejorar', () => {
    const e = evolucionDe(oswestry, [
      a(2, 'oswestry', 24, '2026-09-01T10:00:00'),
      a(1, 'oswestry', 52, '2026-06-01T10:00:00'),
    ])
    expect(e.puntos.map((p) => p.puntaje)).toEqual([52, 24])
    expect(e.cambio).toEqual({
      texto: '−28 puntos porcentuales desde la primera aplicación (52 % → 24 %).',
      tono: 'ok',
    })
  })

  it('Glasgow: bajar es empeorar y se pinta como aviso, no como alarma', () => {
    const e = evolucionDe(glasgow, [a(1, 'glasgow', 14, '2026-10-01T08:00:00'), a(2, 'glasgow', 10, '2026-10-01T12:00:00')])
    expect(e.cambio?.tono).toBe('aviso')
    expect(e.cambio?.texto).toMatch(/^−4 desde/)
  })

  it('las anuladas no cuentan y las que no tienen total no se pintan como cero', () => {
    const e = evolucionDe(glasgow, [
      a(1, 'glasgow', 9, '2026-10-01T08:00:00'),
      a(2, 'glasgow', null, '2026-10-01T09:00:00'),
      a(3, 'glasgow', 3, '2026-10-01T10:00:00', true),
      a(4, 'oswestry', 40, '2026-10-01T10:00:00'),
    ])
    expect(e.puntos.map((p) => p.id)).toEqual([1])
    expect(e.sinTotal).toBe(1)
    expect(e.cambio).toBeNull()
  })

  it('lista las escalas con registro vigente, la más reciente primero', () => {
    expect(
      escalasConRegistro([
        a(1, 'glasgow', 9, '2026-10-01T08:00:00'),
        a(2, 'oswestry', 40, '2026-10-02T08:00:00'),
        a(3, 'nihss', 4, '2026-10-03T08:00:00', true),
      ]),
    ).toEqual(['oswestry', 'glasgow'])
  })
})
