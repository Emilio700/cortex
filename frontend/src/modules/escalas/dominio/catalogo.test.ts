/**
 * Cada escala contra su definición publicada: extremos, ejemplos y cortes.
 *
 * Los extremos (todo al mínimo, todo al máximo) vienen de la autoprueba de
 * MediSuite; los ejemplos, de la fuente que cita cada escala.
 */
import { describe, expect, it } from 'vitest'
import { ESCALAS, escalaPorId } from './catalogo'
import { calcular, formatearPuntaje } from './motor'
import type { Escala, Respuestas } from './tipos'

const E = (id: string): Escala => escalaPorId(id)!

/** Todas las preguntas con su opción de menos o más puntos (sin «no valorable»). */
const extremo = (escala: Escala, cual: 'min' | 'max'): Respuestas =>
  Object.fromEntries(
    escala.items.map((i) => {
      const validas = i.opciones.filter((o) => o.puntos !== null)
      const p = (cual === 'max' ? Math.max : Math.min)(...validas.map((o) => o.puntos as number))
      return [i.id, validas.find((o) => o.puntos === p)!.codigo]
    }),
  )

const puntaje = (id: string, r: Respuestas) => calcular(E(id), r).puntaje
const interpretacion = (id: string, r: Respuestas) => calcular(E(id), r).interpretacion

describe('el catálogo', () => {
  it('trae las catorce escalas pedidas, sin repetir id', () => {
    expect(ESCALAS.map((e) => e.id)).toEqual([
      'glasgow', 'nihss', 'hunt_hess', 'wfns', 'fisher_modificada', 'spetzler_martin',
      'rankin', 'asia', 'karnofsky', 'mjoa', 'oswestry', 'ndi', 'ena_dolor', 'barthel',
    ])
  })

  it('cada escala cita su fuente con año', () => {
    for (const e of ESCALAS) expect(e.fuente, e.id).toMatch(/(19|20)\d\d/)
  })

  it('las bandas cubren del mínimo al máximo, en orden', () => {
    for (const e of ESCALAS) {
      const hastas = e.bandas.map((b) => b.hasta)
      expect([...hastas].sort((a, b) => a - b), e.id).toEqual(hastas)
      expect(hastas[hastas.length - 1], e.id).toBe(e.max)
      expect(hastas[0], e.id).toBeGreaterThanOrEqual(e.min)
    }
  })

  it('los códigos de opción no se repiten dentro de un ítem', () => {
    for (const e of ESCALAS) {
      for (const i of e.items) {
        const codigos = i.opciones.map((o) => o.codigo)
        expect(new Set(codigos).size, `${e.id}.${i.id}`).toBe(codigos.length)
      }
    }
  })

  for (const e of ESCALAS) {
    it(`${e.nombre}: todo al mínimo da ${e.min} y todo al máximo da ${e.max}`, () => {
      expect(calcular(e, extremo(e, 'min')).puntaje).toBe(e.min)
      expect(calcular(e, extremo(e, 'max')).puntaje).toBe(e.max)
    })
  }
})

describe('Glasgow (Teasdale 1974, 2014)', () => {
  it('O3 V4 M5 = 12, moderado', () => {
    const r = calcular(E('glasgow'), { ocular: '3', verbal: '4', motora: '5' })
    expect(r.puntaje).toBe(12)
    expect(r.interpretacion).toBe('Moderado (9–12)')
    expect(r.detalle).toBe('O3 V4 M5')
  })
  it('8 o menos es grave; 13 es leve', () => {
    expect(interpretacion('glasgow', { ocular: '2', verbal: '2', motora: '4' })).toBe('Grave (3–8)')
    expect(interpretacion('glasgow', { ocular: '3', verbal: '4', motora: '6' })).toBe('Leve (13–15)')
  })
  it('intubado: no se suma, se registra «O3 VT M5»', () => {
    const r = calcular(E('glasgow'), { ocular: '3', verbal: 'T', motora: '5' })
    expect(r.completo).toBe(true)
    expect(r.puntaje).toBeNull()
    expect(r.detalle).toBe('O3 VT M5')
    expect(r.interpretacion).toMatch(/^Sin total/)
  })
})

describe('NIHSS (Brott 1989)', () => {
  it('suma de 0 a 42 en sus 15 ítems', () => {
    expect(E('nihss').items).toHaveLength(15)
  })
  it('un ítem «UN» cuenta 0, se anota y no impide el total', () => {
    const base = extremo(E('nihss'), 'min')
    const r = calcular(E('nihss'), { ...base, '5a': 'UN', '5b': '4' })
    expect(r.puntaje).toBe(4)
    expect(r.detalle).toBe('No valorable: 5a')
    expect(r.avisos[0]).toMatch(/cuenta 0/)
  })
  it('rangos: 4 menor, 5 moderado, 21 grave', () => {
    const conPuntos = (n: number): Respuestas => {
      // 1a llega a 3, los brazos y piernas a 4: se reparte hasta llegar a n.
      const r = { ...extremo(E('nihss'), 'min') }
      let falta = n
      for (const id of ['5a', '5b', '6a', '6b', '1a', '3', '4', '9']) {
        const max = Math.max(...E('nihss').items.find((i) => i.id === id)!.opciones.map((o) => o.puntos ?? 0))
        const dar = Math.min(max, falta)
        r[id] = String(dar)
        falta -= dar
      }
      return r
    }
    expect(interpretacion('nihss', conPuntos(4))).toBe('Déficit menor (1–4)')
    expect(interpretacion('nihss', conPuntos(5))).toBe('Déficit moderado (5–15)')
    expect(interpretacion('nihss', conPuntos(21))).toBe('Déficit grave (21–42)')
  })
})

describe('Rankin modificada (van Swieten 1988)', () => {
  it('el grado es el puntaje', () => {
    expect(puntaje('rankin', { grado: '3' })).toBe(3)
    expect(interpretacion('rankin', { grado: '3' })).toBe('Discapacidad moderada')
  })
})

describe('ASIA / AIS (Kirshblum 2011)', () => {
  it('se lee como letra, de A a E', () => {
    expect(formatearPuntaje(E('asia'), puntaje('asia', { grado: 'A' }))).toBe('AIS A')
    expect(formatearPuntaje(E('asia'), puntaje('asia', { grado: 'D' }))).toBe('AIS D')
    expect(interpretacion('asia', { grado: 'E' })).toBe('AIS E: normal')
  })
  it('deja dicho que el examen ISNCSCI completo no está aquí', () => {
    expect(E('asia').instrucciones).toMatch(/ISNCSCI/)
  })
})

describe('Hunt y Hess (1968), WFNS (Drake 1988) y Fisher modificada (Frontera 2006)', () => {
  it('Hunt y Hess III se lee «Grado III»', () => {
    expect(formatearPuntaje(E('hunt_hess'), puntaje('hunt_hess', { grado: 'III' }))).toBe('Grado III')
  })
  it('WFNS IV es Glasgow 7–12', () => {
    const opcion = E('wfns').items[0].opciones.find((o) => o.codigo === 'IV')!
    expect(opcion.texto).toMatch(/7–12/)
    expect(interpretacion('wfns', { grado: 'IV' })).toBe('Grado IV')
  })
  it('Fisher modificada va de 0 a 4', () => {
    expect(puntaje('fisher_modificada', { grado: '0' })).toBe(0)
    expect(puntaje('fisher_modificada', { grado: '4' })).toBe(4)
  })
})

describe('Spetzler-Martin (1986) con clases de Spetzler-Ponce (2011)', () => {
  it('mediana (2) + elocuente (1) + profundo (1) = grado IV, clase C', () => {
    const r = calcular(E('spetzler_martin'), { tamano: '2', elocuencia: '1', drenaje: '1' })
    expect(r.puntaje).toBe(4)
    expect(r.interpretacion).toBe('Grado IV · clase C')
  })
  it('grado II es clase A y grado III, clase B', () => {
    expect(interpretacion('spetzler_martin', { tamano: '1', elocuencia: '1', drenaje: '0' })).toBe('Grado II · clase A')
    expect(interpretacion('spetzler_martin', { tamano: '3', elocuencia: '0', drenaje: '0' })).toBe('Grado III · clase B')
  })
})

describe('Karnofsky (1949)', () => {
  it('los tres grupos: 80–100, 50–70, 0–40', () => {
    expect(interpretacion('karnofsky', { kps: '80' })).toMatch(/80–100/)
    expect(interpretacion('karnofsky', { kps: '50' })).toMatch(/50–70/)
    expect(interpretacion('karnofsky', { kps: '40' })).toMatch(/0–40/)
  })
})

describe('mJOA (Benzel 1991; rangos de Tetreault 2017)', () => {
  it('máximo 18; 15–17 leve, 12–14 moderada, 0–11 grave', () => {
    const r = { motor_superior: '5', motor_inferior: '7', sensibilidad: '3', esfinter: '3' }
    expect(puntaje('mjoa', r)).toBe(18)
    expect(interpretacion('mjoa', { ...r, esfinter: '2' })).toBe('Mielopatía leve (15–17)')
    expect(interpretacion('mjoa', { ...r, motor_inferior: '3' })).toBe('Mielopatía moderada (12–14)')
    expect(interpretacion('mjoa', { ...r, motor_inferior: '1', esfinter: '2' })).toBe('Mielopatía grave (0–11)')
  })
})

describe('Oswestry (Fairbank 1980, 2000)', () => {
  const odi = (valores: (number | null)[]) =>
    Object.fromEntries(
      E('oswestry').items.flatMap((i, n) => (valores[n] === null ? [] : [[i.id, String(valores[n])]])),
    )

  it('ejemplo del autor: 16 de 50 posibles = 32 %', () => {
    expect(puntaje('oswestry', odi([2, 2, 2, 2, 2, 2, 2, 2, 0, 0]))).toBe(32)
  })
  it('ejemplo del autor con una sección omitida: 16 de 45 = 35.6 %', () => {
    const r = calcular(E('oswestry'), odi([2, 2, 2, 2, 2, 2, 2, null, 2, 0]))
    expect(r.puntaje).toBe(35.6)
    expect(r.detalle).toBe('1 sección sin responder')
    expect(r.avisos).toEqual([])
    expect(formatearPuntaje(E('oswestry'), r.puntaje)).toBe('35.6 %')
  })
  it('avisa desde tres secciones omitidas, sin impedir guardar', () => {
    const r = calcular(E('oswestry'), odi([3, 3, 3, 3, 3, 3, 3, null, null, null]))
    expect(r.completo).toBe(true)
    expect(r.puntaje).toBe(60)
    expect(r.avisos[0]).toMatch(/3 secciones sin responder.*\(verificar\)/)
  })
  it('rangos de Fairbank: 20 % mínima, 22 % moderada, 42 % grave, 62 % incapacitante', () => {
    expect(interpretacion('oswestry', odi([2, 2, 2, 2, 2, 0, 0, 0, 0, 0]))).toBe('Discapacidad mínima (0–20 %)')
    expect(interpretacion('oswestry', odi([2, 2, 2, 2, 2, 1, 0, 0, 0, 0]))).toBe('Discapacidad moderada (21–40 %)')
    expect(interpretacion('oswestry', odi([5, 5, 5, 5, 1, 0, 0, 0, 0, 0]))).toBe('Discapacidad grave (41–60 %)')
    expect(interpretacion('oswestry', odi([5, 5, 5, 5, 5, 5, 1, 0, 0, 0]))).toBe('Discapacidad incapacitante (61–80 %)')
  })
})

describe('NDI (Vernon y Mior 1991; rangos de Vernon 2008)', () => {
  it('cortes en 4, 14, 24 y 34', () => {
    const ndi = (total: number) => {
      const r: Respuestas = {}
      let falta = total
      for (const i of E('ndi').items) {
        const dar = Math.min(5, falta)
        r[i.id] = String(dar)
        falta -= dar
      }
      return r
    }
    expect(interpretacion('ndi', ndi(4))).toBe('Sin discapacidad (0–4)')
    expect(interpretacion('ndi', ndi(5))).toBe('Discapacidad leve (5–14)')
    expect(interpretacion('ndi', ndi(15))).toBe('Discapacidad moderada (15–24)')
    expect(interpretacion('ndi', ndi(25))).toBe('Discapacidad grave (25–34)')
    expect(interpretacion('ndi', ndi(35))).toBe('Discapacidad completa (35–50)')
  })
})

describe('ENA de dolor', () => {
  it('0 sin dolor, 3 leve, 4 moderado, 7 intenso; los rangos están por verificar', () => {
    expect(interpretacion('ena_dolor', { dolor: '0' })).toBe('Sin dolor')
    expect(interpretacion('ena_dolor', { dolor: '3' })).toBe('Dolor leve (1–3)')
    expect(interpretacion('ena_dolor', { dolor: '4' })).toBe('Dolor moderado (4–6)')
    expect(interpretacion('ena_dolor', { dolor: '7' })).toBe('Dolor intenso (7–10)')
    expect(E('ena_dolor').bandasPorVerificar).toBe(true)
  })
})

describe('Barthel (portado de MediSuite)', () => {
  it('conserva los diez ítems y sus puntos', () => {
    expect(E('barthel').items.map((i) => i.id)).toEqual([
      'comer', 'banarse', 'arreglo', 'vestir', 'heces', 'orina', 'retrete', 'traslado', 'deamb', 'escal',
    ])
  })
  it('100 independiente; 60 dependencia grave', () => {
    const max = extremo(E('barthel'), 'max')
    expect(interpretacion('barthel', max)).toBe('Independiente (100)')
    expect(
      interpretacion('barthel', { ...max, traslado: '5', deamb: '5', escal: '0', banarse: '0', vestir: '5' }),
    ).toBe('Dependencia grave (21–60)')
  })
})
