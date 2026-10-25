import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { crearPerfilAjustado, inclinacionEn, TRANSICION_DEL_AJUSTE, trazarEje } from './ejeColumna'
import { construirColumna, crearModeloColumna, type ModeloColumna } from './columna3d'
import { AJUSTE_VACIO, type AjusteDelEje } from '../../dominio/ajusteRadiografico'

const esquematico = crearModeloColumna()
const centro = (m: ModeloColumna, i: number) => i + m.fraccionDeCuerpo(i) * 0.5

/** Inclinación sagital del eje (convención de `PERFIL_SAGITAL`). */
const sagital = (m: ModeloColumna, v: number) => {
  const t = m.marco(v).tangente
  return THREE.MathUtils.radToDeg(Math.atan2(t.z, -t.y))
}
/** Inclinación coronal del eje: + = al bajar va hacia la izquierda del paciente (+x). */
const coronal = (m: ModeloColumna, v: number) => {
  const t = m.marco(v).tangente
  return THREE.MathUtils.radToDeg(Math.atan2(t.x, -t.y))
}

const ajuste = (parcial: Partial<AjusteDelEje>): AjusteDelEje => ({ ...AJUSTE_VACIO, ...parcial })

describe('sin datos del paciente, el modelo no cambia', () => {
  it('un ajuste vacío da exactamente la columna esquemática', () => {
    const vacio = crearModeloColumna(AJUSTE_VACIO)
    for (let v = -0.4; v <= 25.5; v += 0.37) {
      expect(vacio.marco(v).centro.equals(esquematico.marco(v).centro)).toBe(true)
      expect(vacio.marco(v).tangente.equals(esquematico.marco(v).tangente)).toBe(true)
    }
    expect(crearModeloColumna(null).punto(20).equals(esquematico.punto(20))).toBe(true)
  })

  it('un perfil sin puntos es el perfil base', () => {
    expect(crearPerfilAjustado(inclinacionEn, [])).toBe(inclinacionEn)
  })
})

describe('perfil corregido', () => {
  const perfil = crearPerfilAjustado(inclinacionEn, [
    { v: 19, grados: 5 },
    { v: 24, grados: -30 },
  ])

  it('pasa por los puntos medidos', () => {
    expect(perfil(19)).toBeCloseTo(5, 9)
    expect(perfil(24)).toBeCloseTo(-30, 9)
  })

  it('fuera de lo medido vuelve al esquemático', () => {
    expect(perfil(19 - TRANSICION_DEL_AJUSTE - 0.1)).toBe(inclinacionEn(19 - TRANSICION_DEL_AJUSTE - 0.1))
    expect(perfil(5)).toBe(inclinacionEn(5))
  })

  it('no salta: cambia poco a poco', () => {
    for (let v = 15; v < 26; v += 0.01) expect(Math.abs(perfil(v + 0.01) - perfil(v))).toBeLessThan(1)
  })
})

describe('columna con curvas del paciente', () => {
  const m = crearModeloColumna(
    ajuste({
      sagital: [
        { nivel: 19, platillo: 'superior', grados: 5 },
        { nivel: 24, platillo: 'superior', grados: -30 },
      ],
    }),
  )

  // Menos de 1°: el eje se integra cada medio centímetro y la curva lo suaviza.
  it('la lordosis L1–S1 del modelo es la medida (35°)', () => {
    expect(Math.abs(sagital(m, 19) - sagital(m, 24) - 35)).toBeLessThan(1)
  })

  it('la columna cervical sigue siendo la esquemática', () => {
    expect(Math.abs(sagital(m, 3) - sagital(esquematico, 3))).toBeLessThan(0.5)
    expect(m.punto(3).distanceTo(esquematico.punto(3))).toBeLessThan(0.01)
  })

  it('sin escoliosis no se mueve de lado', () => {
    for (let v = 0; v <= 25; v += 0.5) expect(Math.abs(m.marco(v).centro.x)).toBeLessThan(1e-9)
  })
})

describe('escoliosis', () => {
  // Curva convexa a la izquierda del paciente: platillo superior de T6 alto a su
  // izquierda (+12°) e inferior de L1 alto a su derecha (−20°): Cobb 32°.
  const m = crearModeloColumna(
    ajuste({
      coronal: [
        { nivel: 12, platillo: 'superior', grados: 12 },
        { nivel: 15, platillo: 'superior', grados: 3 },
        { nivel: 19, platillo: 'inferior', grados: -20 },
      ],
    }),
  )
  const iL1 = 19

  it('el ángulo de Cobb del modelo es el medido', () => {
    const fin = iL1 + m.fraccionDeCuerpo(iL1)
    expect(Math.abs(coronal(m, 12) - coronal(m, fin) - 32)).toBeLessThan(1)
  })

  it('el vértice se va hacia la convexidad (izquierda del paciente, +x)', () => {
    const arriba = m.punto(12).x
    const abajo = m.punto(iL1 + 1).x
    const apice = m.punto(15.5).x
    expect(apice - (arriba + abajo) / 2).toBeGreaterThan(0.5)
  })

  it('con la convexidad al otro lado, se va al otro lado', () => {
    const espejo = crearModeloColumna(
      ajuste({
        coronal: [
          { nivel: 12, platillo: 'superior', grados: -12 },
          { nivel: 15, platillo: 'superior', grados: -3 },
          { nivel: 19, platillo: 'inferior', grados: 20 },
        ],
      }),
    )
    expect(espejo.punto(15.5).x).toBeCloseTo(-m.punto(15.5).x, 6)
  })

  it('es continua y cada vértebra conserva un marco ortonormal', () => {
    let anterior = m.marco(-0.4)
    for (let v = -0.38; v <= 25.5; v += 0.02) {
      const k = m.marco(v)
      expect(k.centro.distanceTo(anterior.centro)).toBeLessThan(0.3)
      expect(THREE.MathUtils.radToDeg(k.tangente.angleTo(anterior.tangente))).toBeLessThan(2)
      expect(Math.abs(k.lateral.dot(k.tangente))).toBeLessThan(1e-9)
      expect(Math.abs(k.adelante.dot(k.tangente))).toBeLessThan(1e-9)
      expect(Math.abs(k.lateral.dot(k.adelante))).toBeLessThan(1e-9)
      anterior = k
    }
  })

  it('las piezas siguen armándose', () => {
    expect(construirColumna(m).length).toBe(construirColumna(esquematico).length)
  })
})

describe('listesis', () => {
  const iL5 = 23
  const iS = 24
  const m = crearModeloColumna(ajuste({ listesis: [{ nivel: iL5, fraccion: 0.3 }] }))
  const fondoL5 = m.medidas[iL5].fondo

  /** Cuánto queda L5 por delante del platillo de S1, en el marco del sacro. */
  const avance = (x: ModeloColumna) => x.punto(centro(x, iL5)).sub(x.punto(iS)).dot(x.marco(iS).adelante)

  it('L5 queda por delante de S1 lo que se midió (30 % del platillo)', () => {
    expect(avance(m) - avance(esquematico)).toBeCloseTo(0.3 * fondoL5, 2)
    // Y no gira: el sacro conserva su inclinación.
    expect(sagital(m, iS)).toBeCloseTo(sagital(esquematico, iS), 6)
  })

  it('una retrolistesis va hacia atrás', () => {
    const retro = crearModeloColumna(ajuste({ listesis: [{ nivel: iL5, fraccion: -0.15 }] }))
    expect(avance(retro) - avance(esquematico)).toBeCloseTo(-0.15 * fondoL5, 2)
  })

  it('lo de arriba del disco no se mueve; el eje no se rompe', () => {
    for (let v = 0; v <= 23.5; v += 0.5) expect(m.punto(v).distanceTo(esquematico.punto(v))).toBeLessThan(0.02)
    let anterior = m.punto(22)
    for (let v = 22.02; v <= 25; v += 0.02) {
      const p = m.punto(v)
      expect(p.distanceTo(anterior)).toBeLessThan(0.3)
      anterior = p
    }
  })

  it('el cuerpo de cada vértebra no se estira con el desplazamiento', () => {
    const fc = m.fraccionDeCuerpo(iL5)
    const alto = (x: ModeloColumna) => x.punto(iL5).distanceTo(x.punto(iL5 + fc))
    expect(alto(m)).toBeCloseTo(alto(esquematico), 1)
  })
})

describe('altura de disco', () => {
  it('el disco medido toma la proporción del paciente y los demás quedan igual', () => {
    const m = crearModeloColumna(ajuste({ discos: [{ nivel: 22, indice: 0.12 }] }))
    expect(m.medidas[22].disco).toBeCloseTo(0.12 * m.medidas[22].cuerpo, 9)
    expect(m.medidas[21].disco).toBe(esquematico.medidas[21].disco)
  })

  it('un índice absurdo se acota', () => {
    const m = crearModeloColumna(ajuste({ discos: [{ nivel: 22, indice: 40 }] }))
    expect(m.medidas[22].disco).toBeLessThanOrEqual(3 * m.medidas[22].cuerpo)
  })
})

describe('trazado con ajuste', () => {
  it('sin desviación ni listesis, el ajuste integra igual que el esquemático', () => {
    const m = esquematico.medidas
    const base = trazarEje(m)
    const igual = trazarEje(m, 0.5, { sagital: inclinacionEn, coronal: () => 0 })
    base.forEach((p, k) => expect(p.distanceTo(igual[k])).toBeLessThan(1e-9))
  })
})
