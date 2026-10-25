import { describe, expect, it } from 'vitest'
import type { Registro } from '../../lib/types'
import {
  PLANTILLA_BASE,
  agruparComentarios,
  aRespuesta,
  calcularNps,
  clasificarNps,
  comentarios,
  faltante,
  filtrarRespuestas,
  normalizarPlantilla,
  promediosPorPregunta,
  temasDe,
  tendenciaMensual,
} from './nps'
import { demoEncuestas } from './demo'

const resp = (id: string, fecha: string, respuestas: Record<string, number | string>, medico?: string) =>
  aRespuesta({
    id,
    fecha,
    tipo: 'encuesta',
    datos: { respuestas, canal: 'kiosco', medico },
  } as Registro)

describe('NPS', () => {
  it('clasifica según Reichheld/Bain: 9–10 promotor, 7–8 pasivo, 0–6 detractor', () => {
    expect([0, 6, 7, 8, 9, 10].map(clasificarNps)).toEqual(['detractor', 'detractor', 'pasivo', 'pasivo', 'promotor', 'promotor'])
    expect(() => clasificarNps(11)).toThrow()
  })

  it('ejemplo publicado: 100 respuestas con 70 promotores, 20 pasivos y 10 detractores → NPS 60', () => {
    // Ejemplo de cálculo de Bain & Company / Qualtrics: 70 % − 10 % = 60
    const vs = [...Array(70).fill(10), ...Array(20).fill(8), ...Array(10).fill(3)]
    const r = calcularNps(vs)
    expect(r.n).toBe(100)
    expect(r.pctPromotores).toBe(70)
    expect(r.pctDetractores).toBe(10)
    expect(r.nps).toBe(60)
  })

  it('rango −100 a +100 y sin datos → null', () => {
    expect(calcularNps([0, 1, 2]).nps).toBe(-100)
    expect(calcularNps([9, 10]).nps).toBe(100)
    expect(calcularNps([7, 8]).nps).toBe(0)
    expect(calcularNps([]).nps).toBeNull()
    expect(calcularNps([10, NaN, 12, -1]).n).toBe(1)
  })

  it('redondea: 1 promotor, 1 pasivo, 1 detractor → 0; 2 prom 1 det → 33', () => {
    expect(calcularNps([10, 8, 2]).nps).toBe(0)
    expect(calcularNps([10, 9, 2]).nps).toBe(33)
  })

  it('tendencia mensual ordenada', () => {
    const rs = [
      resp('a', '2026-09-10T15:00:00', { nps: 10 }),
      resp('b', '2026-08-10T15:00:00', { nps: 3 }),
      resp('c', '2026-09-20T15:00:00', { nps: 5 }),
      resp('d', '2026-09-20T15:00:00', {}),
    ]
    const t = tendenciaMensual(rs)
    expect(t.map((x) => [x.mes, x.n, x.nps])).toEqual([
      ['2026-08', 1, -100],
      ['2026-09', 2, 0],
    ])
  })

  it('promedios por pregunta y filtros', () => {
    const rs = [resp('a', '2026-09-10T12:00:00', { nps: 10, atencion: 5, espera: 2 }, 'Dra. A'), resp('b', '2026-10-01T12:00:00', { nps: 6, atencion: 4 }, 'Dr. B')]
    const p = promediosPorPregunta(rs, PLANTILLA_BASE.preguntas)
    expect(p.find((x) => x.id === 'atencion')!.promedio).toBe(4.5)
    expect(p.find((x) => x.id === 'espera')!.n).toBe(1)
    expect(p.find((x) => x.id === 'nps')!.promedio).toBe(8)
    expect(p.some((x) => x.id === 'comentarios')).toBe(false)
    expect(filtrarRespuestas(rs, { medico: 'Dr. B' }).map((r) => r.id)).toEqual(['b'])
    expect(filtrarRespuestas(rs, { desde: '2026-09-15' }).map((r) => r.id)).toEqual(['b'])
    expect(filtrarRespuestas(rs, { hasta: '2026-09-10' }).map((r) => r.id)).toEqual(['a'])
  })
})

describe('comentarios', () => {
  it('detecta temas sin importar acentos ni mayúsculas', () => {
    expect(temasDe('Esperé MUCHO tiempo, pero la doctora explicó todo')).toEqual(expect.arrayContaining(['espera', 'medico']))
    expect(temasDe('El baño estaba sucio')).toEqual(['limpieza'])
    expect(temasDe('Todo bien')).toEqual([])
  })
  it('agrupa e incluye «Otros»', () => {
    const rs = [resp('a', '2026-09-01', { comentarios: 'Muy caro' }), resp('b', '2026-09-02', { comentarios: 'Gracias' }), resp('c', '2026-09-03', { comentarios: '  ' })]
    const cs = comentarios(rs)
    expect(cs).toHaveLength(2)
    expect(agruparComentarios(cs)).toEqual([
      { id: 'costo', label: 'Costos y pagos', n: 1 },
      { id: 'otros', label: 'Otros', n: 1 },
    ])
  })
})

describe('plantilla', () => {
  it('normaliza: una sola NPS, ids únicos, vuelve a la base si está vacía', () => {
    expect(normalizarPlantilla(null)).toBe(PLANTILLA_BASE)
    const p = normalizarPlantilla({
      titulo: 'X',
      preguntas: [
        { id: 'nps', tipo: 'nps', texto: 'a' },
        { id: 'nps2', tipo: 'nps', texto: 'b' },
        { id: 'q', tipo: 'escala5', texto: 'c' },
        { id: 'q', tipo: 'texto', texto: 'd' },
        { id: 'z', tipo: 'raro', texto: 'e' },
      ],
    })
    expect(p.preguntas.map((q) => q.id)).toEqual(['nps', 'q'])
  })
  it('faltante ignora opcionales', () => {
    expect(faltante(PLANTILLA_BASE, { nps: 9, atencion: 5, espera: 4, trato: 5 })).toBe('limpieza')
    expect(
      faltante(PLANTILLA_BASE, {
        nps: 9,
        atencion: 5,
        espera: 4,
        trato: 5,
        limpieza: 5,
      }),
    ).toBeNull()
  })
})

describe('demo', () => {
  it('~40 respuestas en los últimos 3 meses, válidas', () => {
    const now = Date.parse('2026-10-24T12:00:00Z')
    const d = demoEncuestas(now)
    expect(d.length).toBeGreaterThanOrEqual(36)
    expect(d.length).toBeLessThanOrEqual(44)
    for (const r of d) {
      expect(r.tipo).toBe('encuesta')
      expect(now - Date.parse(r.fecha)).toBeLessThanOrEqual(92 * 864e5)
      expect(faltante(PLANTILLA_BASE, (r.datos as { respuestas: Record<string, number> }).respuestas)).toBeNull()
    }
    expect(new Set(d.map((r) => r.id)).size).toBe(d.length)
  })
})
