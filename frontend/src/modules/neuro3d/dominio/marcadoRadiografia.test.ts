import { describe, expect, it } from 'vitest'
import {
  ESTADO_INICIAL,
  avance,
  colocar,
  deshacer,
  estadoDesde,
  estaSaltado,
  marcasDe,
  pasoPendiente,
  planDeMarcado,
  puntoCercano,
  saltar,
  RANGO_AP_POR_OMISION,
  RANGO_LATERAL_POR_OMISION,
} from './marcadoRadiografia'
import { calcularRx } from './ajusteRadiografico'
import { lateralSintetica } from './radiografiaSintetica'

describe('plan de marcado', () => {
  it('lateral T4–S1: cuatro esquinas por vértebra, dos en S1 y las caderas', () => {
    const plan = planDeMarcado('lateral', RANGO_LATERAL_POR_OMISION)
    // T4–L5 son 14 vértebras.
    expect(plan).toHaveLength(14 * 4 + 2 + 2)
    expect(plan[0]).toMatchObject({ clave: 'T4.sa', titulo: 'T4 · platillo superior, esquina anterior' })
    expect(plan.at(-3)?.titulo).toMatch(/S1 · platillo de S1, esquina posterior/)
    expect(plan.at(-1)?.clave).toBe('cadera.1')
  })

  it('sin pelvis no pide caderas', () => {
    expect(planDeMarcado('lateral', { desde: 'L1', hasta: 'L2' }, false)).toHaveLength(8)
  })

  it('AP T1–L5: dos platillos por vértebra, extremos de la imagen', () => {
    const plan = planDeMarcado('ap', RANGO_AP_POR_OMISION)
    expect(plan).toHaveLength(17 * 4)
    expect(plan[1].titulo).toBe('T1 · platillo superior, extremo derecho de la imagen')
  })

  it('un rango al revés no da pasos', () => {
    expect(planDeMarcado('ap', { desde: 'L5', hasta: 'T1' })).toEqual([])
  })
})

describe('marcar, saltar y deshacer', () => {
  const plan = planDeMarcado('lateral', { desde: 'L4', hasta: 'L5' }, false)

  it('el siguiente punto es el primero que falta', () => {
    let e = colocar(ESTADO_INICIAL, 'lateral', 'L4.sa', { x: 1, y: 1 })
    expect(pasoPendiente(plan, e)?.clave).toBe('L4.sp')
    e = saltar(e, 'lateral', 'L4.sp')
    expect(pasoPendiente(plan, e)?.clave).toBe('L4.ia')
    expect(avance(plan, e)).toEqual({ hechos: 2, total: 8 })
  })

  it('deshacer quita lo último, sea un punto o un salto', () => {
    let e = colocar(ESTADO_INICIAL, 'lateral', 'L4.sa', { x: 1, y: 1 })
    e = saltar(e, 'lateral', 'L4.sp')
    e = deshacer(e)
    expect(estaSaltado(e, 'lateral', 'L4.sp')).toBe(false)
    expect(e.puntos.lateral['L4.sa']).toEqual({ x: 1, y: 1 })
    e = deshacer(e)
    expect(e.puntos.lateral).toEqual({})
    expect(deshacer(e)).toBe(e)
  })

  it('una corrección (arrastrar) se deshace volviendo al punto anterior', () => {
    let e = colocar(ESTADO_INICIAL, 'lateral', 'L4.sa', { x: 1, y: 1 })
    e = colocar(e, 'lateral', 'L4.sa', { x: 5, y: 5 })
    expect(e.puntos.lateral['L4.sa']).toEqual({ x: 5, y: 5 })
    e = deshacer(e)
    expect(e.puntos.lateral['L4.sa']).toEqual({ x: 1, y: 1 })
  })

  it('poner un punto saltado lo quita de los saltados; deshacer lo vuelve a saltar', () => {
    let e = saltar(ESTADO_INICIAL, 'ap', 'L1.si')
    e = colocar(e, 'ap', 'L1.si', { x: 2, y: 2 })
    expect(estaSaltado(e, 'ap', 'L1.si')).toBe(false)
    e = deshacer(e)
    expect(estaSaltado(e, 'ap', 'L1.si')).toBe(true)
  })

  it('no muta el estado anterior', () => {
    const antes = JSON.stringify(ESTADO_INICIAL)
    colocar(ESTADO_INICIAL, 'lateral', 'L4.sa', { x: 1, y: 1 })
    expect(JSON.stringify(ESTADO_INICIAL)).toBe(antes)
  })
})

describe('de puntos a marcas', () => {
  it('ida y vuelta conserva las mediciones', () => {
    const m = lateralSintetica({ platillos: { 'L1.superior': 8, 'S1.superior': -38 }, pelvis: { inclinacion: 14, dosCaderas: true } })
    const e = estadoDesde(m)
    const vuelta = marcasDe(e)
    const cal = { lateral: { tipo: 'ninguna' as const }, ap: { tipo: 'ninguna' as const } }
    expect(calcularRx(vuelta, cal)).toEqual(calcularRx(m, cal))
  })

  it('la segunda cadera saltada no deja hueco', () => {
    let e = colocar(ESTADO_INICIAL, 'lateral', 'cadera.1', { x: 3, y: 4 })
    e = saltar(e, 'lateral', 'cadera.0')
    expect(marcasDe(e).lateral.caderas).toEqual([{ x: 3, y: 4 }])
  })
})

describe('arrastrar para corregir', () => {
  const puntos = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }
  it('toma el punto más cercano dentro del radio', () => {
    expect(puntoCercano(puntos, { x: 7, y: 1 }, 5)).toBe('b')
    expect(puntoCercano(puntos, { x: 2, y: 0 }, 5)).toBe('a')
  })
  it('lejos de todos, ninguno: el toque pone un punto nuevo', () => {
    expect(puntoCercano(puntos, { x: 50, y: 50 }, 5)).toBeNull()
  })
})
