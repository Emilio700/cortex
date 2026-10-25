import { describe, expect, it } from 'vitest'
import {
  ajusteDelEje,
  calcularRx,
  cobbCoronalDe,
  escalaDe,
  gradoDeMeyerding,
  indiceDeVertebra,
  redondear,
  textoDeEscala,
  textoDeListesis,
  type CalibracionesRx,
  type MarcasRx,
  type Punto,
} from './ajusteRadiografico'
import { NIVELES_VERTEBRALES } from './columna'
import { apSintetica, lateralSintetica, platilloAP, platilloLateral } from './radiografiaSintetica'

const SIN_ESCALA: CalibracionesRx = { lateral: { tipo: 'ninguna' }, ap: { tipo: 'ninguna' } }
const vacia = (): MarcasRx => ({ lateral: { vertebras: {}, caderas: [] }, ap: { vertebras: {} } })

describe('índices de vértebra', () => {
  it('coinciden con los niveles de Neuro 3D', () => {
    for (const id of ['C2', 'C7', 'T1', 'T4', 'T12', 'L1', 'L5']) {
      expect(NIVELES_VERTEBRALES[indiceDeVertebra(id)].id).toBe(id)
    }
    expect(NIVELES_VERTEBRALES[indiceDeVertebra('S1')].id).toBe('S')
  })
})

describe('redondeo (el mismo que el servidor)', () => {
  it('la mitad va hacia arriba, también en negativos', () => {
    expect(redondear(0.25)).toBe(0.3)
    expect(redondear(-0.25)).toBe(-0.3)
    expect(redondear(52.04)).toBe(52)
    expect(redondear(0.425, 2)).toBe(0.43)
    expect(Object.is(redondear(-0.01), 0)).toBe(true)
  })
})

describe('Cobb sagital (Cobb 1948)', () => {
  it.each([1, -1] as const)('lordosis L1–S1 de 50° con el paciente mirando a %s', (sentido) => {
    const m = lateralSintetica({ sentido, platillos: { 'L1.superior': 10, 'S1.superior': -40 } })
    const r = calcularRx(m, SIN_ESCALA)
    expect(r.lordosisLumbar).toEqual({ grados: 50, superior: 'L1', inferior: 'S1' })
  })

  it('cifosis T4–T12 de 40°', () => {
    const m = lateralSintetica({ platillos: { 'T4.superior': -20, 'T12.inferior': 20 } })
    expect(calcularRx(m, SIN_ESCALA).cifosisToracica?.grados).toBe(40)
  })

  it('una columna lumbar recta (cifosis lumbar) da lordosis negativa', () => {
    const m = lateralSintetica({ platillos: { 'L1.superior': -15, 'S1.superior': -5 } })
    expect(calcularRx(m, SIN_ESCALA).lordosisLumbar?.grados).toBe(-10)
  })

  it('con píxel no cuadrado (DICOM) mide sobre milímetros', () => {
    // La imagen se estiró al doble en vertical: 0.1 mm por píxel en x, 0.2 en y.
    const m = lateralSintetica({ platillos: { 'L1.superior': 10, 'S1.superior': -40 }, mmPorPx: { x: 0.1, y: 0.2 } })
    const conEscala = calcularRx(m, { lateral: { tipo: 'dicom', mmPorPxX: 0.1, mmPorPxY: 0.2 }, ap: { tipo: 'ninguna' } })
    expect(conEscala.lordosisLumbar?.grados).toBe(50)
    // Sin la escala, los píxeles estirados mienten: por eso se usa cuando existe.
    expect(calcularRx(m, SIN_ESCALA).lordosisLumbar?.grados).not.toBe(50)
  })

  it('lo que no está marcado se dice, no se inventa', () => {
    const r = calcularRx(vacia(), SIN_ESCALA)
    expect(r.lordosisLumbar).toBeNull()
    expect(r.cifosisToracica).toBeNull()
    expect(r.pelvis).toBeNull()
    expect(r.cobbCoronal).toBeNull()
    expect(r.faltan).toHaveLength(4)
    expect(r.faltan[0]).toMatch(/L1.*S1/)
  })
})

describe('listesis (Meyerding 1932; % de Taillard)', () => {
  it.each([
    [0, null],
    [10, 1],
    [25, 1],
    [30, 2],
    [50, 2],
    [60, 3],
    [80, 4],
    [110, 5],
    [-10, null],
  ])('%s %% → grado %s', (pct, grado) => {
    expect(gradoDeMeyerding(pct)).toBe(grado)
  })

  it('L5 un 30 % por delante de S1: grado II', () => {
    const m = lateralSintetica({ listesis: { 'L5-S1': 0.3 } })
    const l = calcularRx(m, SIN_ESCALA).listesis.find((x) => x.nivel === 'L5-S1')!
    expect(l.porcentaje).toBe(30)
    expect(l.grado).toBe(2)
    expect(l.apreciable).toBe(true)
    expect(l.mm).toBeNull()
    expect(textoDeListesis(l)).toBe('L5-S1: anterolistesis de 30 % (grado II de Meyerding)')
  })

  it.each([1, -1] as const)('el sentido no depende de hacia dónde mira el paciente (%s)', (sentido) => {
    const m = lateralSintetica({ sentido, listesis: { 'L4-L5': -0.12 } })
    const l = calcularRx(m, SIN_ESCALA).listesis.find((x) => x.nivel === 'L4-L5')!
    expect(l.porcentaje).toBe(-12)
    expect(l.grado).toBeNull()
    expect(textoDeListesis(l)).toMatch(/retrolistesis de 12 %/)
  })

  it('un 2 % no es apreciable a mano', () => {
    const m = lateralSintetica({ listesis: { 'L3-L4': 0.02 } })
    const l = calcularRx(m, SIN_ESCALA).listesis.find((x) => x.nivel === 'L3-L4')!
    expect(l.apreciable).toBe(false)
    expect(textoDeListesis(l)).toMatch(/sin desplazamiento apreciable/)
  })

  it('con una referencia marcada da milímetros', () => {
    // 1 px = 0.25 mm; el platillo de S1 mide 40 mm.
    const m = lateralSintetica({ listesis: { 'L5-S1': 0.3 }, mmPorPx: { x: 0.25, y: 0.25 } })
    const cal: CalibracionesRx = {
      lateral: { tipo: 'referencia', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, mm: 100 },
      ap: { tipo: 'ninguna' },
    }
    const l = calcularRx(m, cal).listesis.find((x) => x.nivel === 'L5-S1')!
    expect(l.mm).toBe(12)
  })
})

describe('altura discal relativa', () => {
  it('disco de 10 mm bajo un cuerpo de 25 mm: 0.40', () => {
    const m = lateralSintetica({ alturaCuerpo: 25, alturaDisco: 10 })
    const d = calcularRx(m, SIN_ESCALA).discos.find((x) => x.nivel === 'L4-L5')!
    expect(d.indice).toBe(0.4)
    expect(d.mm).toBeNull()
  })

  it('un disco colapsado se nota contra sus vecinos', () => {
    const m = lateralSintetica({ alturaCuerpo: 25, alturaDisco: 10, discos: { 'L4-L5': 3 } })
    const r = calcularRx(m, SIN_ESCALA)
    expect(r.discos.find((x) => x.nivel === 'L4-L5')!.indice).toBe(0.12)
    expect(r.discos.find((x) => x.nivel === 'L3-L4')!.indice).toBe(0.4)
  })

  it('en mm sólo con escala', () => {
    const m = lateralSintetica({ alturaCuerpo: 25, alturaDisco: 10, mmPorPx: { x: 0.5, y: 0.5 } })
    const r = calcularRx(m, { lateral: { tipo: 'dicom', mmPorPxX: 0.5, mmPorPxY: 0.5 }, ap: { tipo: 'ninguna' } })
    expect(r.discos.find((x) => x.nivel === 'L4-L5')!.mm).toBe(10)
  })
})

describe('parámetros pélvicos (Legaye, Duval-Beaupère 1998)', () => {
  it('valores medios de un adulto: PT 12°, SS 41° → PI 53° (verificar contra el artículo)', () => {
    const m = lateralSintetica({ platillos: { 'S1.superior': -41 }, pelvis: { inclinacion: 12 } })
    expect(calcularRx(m, SIN_ESCALA).pelvis).toEqual({ incidencia: 53, inclinacion: 12, pendienteSacra: 41 })
  })

  it.each([
    [-5, 30],
    [0, 45],
    [25, 20],
    [35, 50],
  ])('PI = PT + SS con PT %s° y SS %s°', (pt, ss) => {
    for (const sentido of [1, -1] as const) {
      const m = lateralSintetica({ sentido, platillos: { 'S1.superior': -ss }, pelvis: { inclinacion: pt } })
      const p = calcularRx(m, SIN_ESCALA).pelvis!
      expect(p.inclinacion).toBe(pt)
      expect(p.pendienteSacra).toBe(ss)
      expect(p.incidencia).toBeCloseTo(p.inclinacion + p.pendienteSacra, 5)
    }
  })

  it('con las dos cabezas femorales usa su punto medio', () => {
    const m = lateralSintetica({ platillos: { 'S1.superior': -40 }, pelvis: { inclinacion: 10, dosCaderas: true } })
    expect(calcularRx(m, SIN_ESCALA).pelvis?.inclinacion).toBe(10)
  })
})

describe('Cobb coronal (Cobb 1948)', () => {
  const curva = { T5: [0, 0], T6: [12, 10], T8: [5, 3], T10: [-5, -8], L1: [-15, -20], L2: [-8, -5] } as Record<string, [number, number]>

  it('busca las vértebras límite: el par de platillos más inclinados', () => {
    const r = calcularRx(apSintetica({ platillos: curva }), SIN_ESCALA)
    expect(r.cobbCoronal).toMatchObject({ grados: 32, superior: 'T6', inferior: 'L1', automatico: true, escoliosis: true })
  })

  it('el médico puede cambiar las vértebras límite', () => {
    const r = calcularRx(apSintetica({ platillos: curva }), SIN_ESCALA, {
      derechaDelPaciente: 'izquierda',
      cobbCoronal: { superior: 'T8', inferior: 'T10' },
    })
    expect(r.cobbCoronal).toMatchObject({ grados: 13, superior: 'T8', inferior: 'T10', automatico: false })
  })

  it('una elección imposible no inventa un ángulo', () => {
    const r = calcularRx(apSintetica({ platillos: curva }), SIN_ESCALA, {
      derechaDelPaciente: 'izquierda',
      cobbCoronal: { superior: 'L1', inferior: 'T6' },
    })
    expect(r.cobbCoronal).toBeNull()
    expect(r.faltan.some((f) => f.startsWith('Cobb coronal'))).toBe(true)
  })

  it('la convexidad sale del lado del paciente, no de la imagen', () => {
    // Platillos de arriba con su lado derecho de la imagen alto: con la derecha del
    // paciente a la izquierda de la imagen, ese lado es su izquierda.
    const m = apSintetica({ platillos: curva })
    expect(calcularRx(m, SIN_ESCALA).cobbCoronal?.convexidad).toBe('izquierda')
    expect(calcularRx(m, SIN_ESCALA, { derechaDelPaciente: 'derecha' }).cobbCoronal?.convexidad).toBe('derecha')
  })

  it('menos de 10° no es escoliosis', () => {
    const r = calcularRx(apSintetica({ platillos: { L1: [4, 3], L4: [-2, -4] } }), SIN_ESCALA)
    expect(r.cobbCoronal).toMatchObject({ grados: 8, escoliosis: false })
  })

  it('sin pares posibles no hay Cobb', () => {
    expect(cobbCoronalDe([{ vertebra: 'L1', platillo: 'superior', grados: 3 }], null)).toBeNull()
  })

  it('los extremos de un platillo pueden marcarse en cualquier orden', () => {
    const m = apSintetica({ platillos: curva })
    const t6 = m.ap.vertebras.T6
    m.ap.vertebras.T6 = { ...t6, si: t6.sd, sd: t6.si }
    expect(calcularRx(m, SIN_ESCALA).cobbCoronal?.grados).toBe(32)
  })
})

describe('calibración', () => {
  it('una foto no tiene escala; DICOM y referencia sí', () => {
    expect(escalaDe({ tipo: 'ninguna' })).toBeNull()
    expect(escalaDe({ tipo: 'dicom', mmPorPxX: 0.14, mmPorPxY: 0.14 })).toEqual({ x: 0.14, y: 0.14 })
    expect(escalaDe({ tipo: 'referencia', a: { x: 0, y: 0 }, b: { x: 30, y: 40 }, mm: 100 })).toEqual({ x: 2, y: 2 })
    expect(escalaDe({ tipo: 'dicom', mmPorPxX: 0, mmPorPxY: 0.1 })).toBeNull()
  })

  it('la interfaz dice de dónde salen los milímetros', () => {
    expect(textoDeEscala({ tipo: 'ninguna' })).toMatch(/Sin escala/)
    expect(textoDeEscala({ tipo: 'dicom', mmPorPxX: 0.1, mmPorPxY: 0.1 })).toMatch(/DICOM/)
    expect(textoDeEscala({ tipo: 'referencia', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, mm: 50 })).toMatch(/referencia de 50 mm/)
  })

  it('sin escala nunca hay milímetros', () => {
    const r = calcularRx(lateralSintetica({ listesis: { 'L5-S1': 0.2 } }), SIN_ESCALA)
    expect(r.listesis.every((l) => l.mm === null)).toBe(true)
    expect(r.discos.every((d) => d.mm === null)).toBe(true)
  })
})

describe('hacia el eje de Neuro 3D', () => {
  it('pasa cada platillo a su nivel y sólo las listesis apreciables', () => {
    const curva = ajusteDelEje(calcularRx(lateralSintetica({ platillos: { 'L1.superior': 10, 'S1.superior': -40 } }), SIN_ESCALA))
    expect(curva.sagital).toContainEqual({ nivel: 19, platillo: 'superior', grados: 10 })
    expect(curva.sagital).toContainEqual({ nivel: 24, platillo: 'superior', grados: -40 })
    // Platillos planos: el desplazamiento marcado es el que se mide.
    const a = ajusteDelEje(calcularRx(lateralSintetica({ listesis: { 'L5-S1': 0.3, 'L3-L4': 0.02 } }), SIN_ESCALA))
    expect(a.listesis).toEqual([{ nivel: 23, fraccion: 0.3 }])
    expect(a.discos.length).toBeGreaterThan(0)
  })

  it('las inclinaciones coronales van del lado del paciente', () => {
    const a = ajusteDelEje(calcularRx(apSintetica({ platillos: { T6: [12, 10] } }), SIN_ESCALA))
    expect(a.coronal).toContainEqual({ nivel: 12, platillo: 'superior', grados: 12 })
  })
})

describe('marcas sintéticas', () => {
  it('los platillos sintéticos tienen la inclinación pedida', () => {
    const [a, p]: Punto[] = platilloLateral({ x: 100, y: 100 }, 30, 20, 1)
    expect(Math.atan2(-(a.y - p.y), a.x - p.x) * (180 / Math.PI)).toBeCloseTo(30, 9)
    const [i, d] = platilloAP({ x: 0, y: 0 }, 10, 20)
    expect(Math.atan2(-(d.y - i.y), d.x - i.x) * (180 / Math.PI)).toBeCloseTo(10, 9)
  })
})
