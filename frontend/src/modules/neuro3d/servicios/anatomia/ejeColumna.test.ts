import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  ORIGEN_DEL_EJE,
  crearDesplazamiento,
  crearJuntas,
  crearLongitud,
  inclinacionEn,
  trazarEje,
} from './ejeColumna'
import {
  SEPARACION_DESPIECE,
  construirColumna,
  construirMedula,
  construirRaices,
  crearModeloColumna,
} from './columna3d'
import { coordenadaDeAgujero } from '../../dominio/columna'

const modelo = crearModeloColumna()
const m = modelo.medidas
const iSacro = m.length - 1
const iL5 = m.findIndex((n) => n.id === 'L5')

/** Inclinación del eje respecto de la vertical, en grados (+ = al bajar va hacia delante). */
const inclinacion = (v: number) => {
  const t = modelo.marco(v).tangente
  return THREE.MathUtils.radToDeg(Math.atan2(t.z, -t.y))
}

/** Largo del eje entre dos coordenadas, midiendo la curva y no la tabla. */
const largoEntre = (a: number, b: number, pasos = 200) => {
  let largo = 0
  let anterior = modelo.punto(a)
  for (let k = 1; k <= pasos; k++) {
    const p = modelo.punto(a + ((b - a) * k) / pasos)
    largo += p.distanceTo(anterior)
    anterior = p
  }
  return largo
}

const centroDeVertebra = (i: number) => i + modelo.fraccionDeCuerpo(i) * 0.5
const centroDeDisco = (i: number) => {
  const fc = modelo.fraccionDeCuerpo(i)
  return i + fc + (1 - fc) / 2
}

describe('eje de la columna', () => {
  it('arranca en el agujero magno, bajo el encéfalo', () => {
    expect(modelo.punto(-10).distanceTo(ORIGEN_DEL_EJE)).toBeLessThan(0.01)
  })

  it('es continuo: sin saltos ni quiebres de punta a punta', () => {
    let anterior = modelo.marco(-0.5)
    for (let v = -0.48; v <= 26; v += 0.02) {
      const k = modelo.marco(v)
      // Un paso de 0.02 vértebras nunca mide más de 0.3 cm (el sacro entero cabe en una).
      expect(k.centro.distanceTo(anterior.centro)).toBeLessThan(0.3)
      // Y la dirección cambia poco a poco, sin esquinas.
      expect(THREE.MathUtils.radToDeg(k.tangente.angleTo(anterior.tangente))).toBeLessThan(2)
      expect(Math.abs(k.centro.x)).toBeLessThan(1e-9)
      anterior = k
    }
  })

  it('la curva que se dibuja mide lo que dice la tabla de alturas', () => {
    const puntos = trazarEje(m)
    const curva = new THREE.CatmullRomCurve3(puntos)
    expect(curva.getLength()).toBeCloseTo(crearLongitud(m).largo, 0)
  })

  it('la inclinación se interpola sin saltos', () => {
    for (let v = -1; v < 26.5; v += 0.01) {
      expect(Math.abs(inclinacionEn(v + 0.01) - inclinacionEn(v))).toBeLessThan(1)
    }
  })
})

describe('curvas fisiológicas (adulto de pie)', () => {
  it('lordosis cervical C2–C7 entre 20° y 40°', () => {
    const lordosis = inclinacion(1.5) - inclinacion(7)
    expect(lordosis).toBeGreaterThanOrEqual(20)
    expect(lordosis).toBeLessThanOrEqual(40)
  })

  it('cifosis torácica T4–T12 entre 20° y 50°', () => {
    const cifosis = inclinacion(19) - inclinacion(10)
    expect(cifosis).toBeGreaterThanOrEqual(20)
    expect(cifosis).toBeLessThanOrEqual(50)
  })

  it('lordosis lumbar L1–S1 moderada, entre 40° y 60°', () => {
    const lordosis = inclinacion(19) - inclinacion(iSacro)
    expect(lordosis).toBeGreaterThanOrEqual(40)
    expect(lordosis).toBeLessThanOrEqual(60)
  })

  it('el sacro sale hacia atrás con 30° a 40° de pendiente sacra', () => {
    const t = modelo.marco(iSacro).tangente
    // El platillo de S1 es perpendicular al eje: su pendiente es la inclinación del eje.
    const pendiente = -inclinacion(iSacro)
    expect(pendiente).toBeGreaterThanOrEqual(30)
    expect(pendiente).toBeLessThanOrEqual(40)
    expect(t.z).toBeLessThan(0)
  })

  it('el sacro se curva hacia delante en su parte baja (cifosis sacra), sin enrollarse', () => {
    const curvatura = inclinacion(iSacro + 0.97) - inclinacion(iSacro)
    expect(curvatura).toBeGreaterThan(15)
    expect(curvatura).toBeLessThan(45)
  })
})

describe('sacro y cóccix', () => {
  it('el sacro mide de 10 a 12 cm, como el de un adulto', () => {
    const largo = largoEntre(iSacro, iSacro + 1)
    expect(largo).toBeGreaterThanOrEqual(10)
    expect(largo).toBeLessThanOrEqual(12)
  })

  it('en proporción a las vértebras del modelo: unas cuatro alturas de L5', () => {
    const proporcion = largoEntre(iSacro, iSacro + 1) / m[iL5].cuerpo
    expect(proporcion).toBeGreaterThanOrEqual(3.5)
    expect(proporcion).toBeLessThanOrEqual(4.5)
  })

  it('termina en un cóccix corto', () => {
    expect(largoEntre(iSacro + 1, iSacro + 2)).toBeLessThanOrEqual(4)
    // Más allá del cóccix el eje no sigue.
    expect(modelo.punto(iSacro + 3).distanceTo(modelo.punto(iSacro + 2))).toBeLessThan(0.01)
  })

  it('el vértice del sacro queda a menos de 12 cm por debajo de S1', () => {
    const caida = modelo.punto(iSacro).y - modelo.punto(iSacro + 1).y
    expect(caida).toBeGreaterThan(6)
    expect(caida).toBeLessThan(12)
  })
})

describe('despiece a lo largo de la curva', () => {
  it('ninguna vértebra se mueve de lado', () => {
    for (let i = 0; i <= iSacro; i++) expect(Math.abs(modelo.desplazamiento(centroDeVertebra(i)).x)).toBeLessThan(1e-9)
  })

  it('cada vértebra se aparta de la de arriba sobre la tangente de su disco', () => {
    for (let i = 0; i < iSacro; i++) {
      const relativo = modelo.desplazamiento(centroDeVertebra(i + 1)).sub(modelo.desplazamiento(centroDeVertebra(i)))
      const k = modelo.marco(centroDeDisco(i))
      expect(relativo.dot(k.tangente)).toBeCloseTo(SEPARACION_DESPIECE, 6)
      // Nada sobre la normal de la curva (hacia delante) ni de lado.
      expect(Math.abs(relativo.dot(k.adelante))).toBeLessThan(1e-6)
      expect(Math.abs(relativo.dot(k.lateral))).toBeLessThan(1e-9)
    }
  })

  it('el centro de cada vértebra separada queda sobre el conducto separado', () => {
    // El conducto separado es lo que dibuja la médula: cada punto, más su desplazamiento.
    const conducto: THREE.Vector3[] = []
    for (let v = -0.4; v <= iSacro + 1; v += 0.01) conducto.push(modelo.punto(v).add(modelo.desplazamiento(v)))
    const distanciaAlConducto = (p: THREE.Vector3) => Math.min(...conducto.map((q) => q.distanceTo(p)))
    for (let i = 0; i <= iSacro; i++) {
      const c = centroDeVertebra(i)
      const separado = modelo.punto(c).add(modelo.desplazamiento(c))
      expect(distanciaAlConducto(separado)).toBeLessThan(0.02)
    }
  })

  it('las vértebras son rígidas: su cuerpo no se estira', () => {
    for (let i = 1; i < iSacro; i++) {
      const fc = modelo.fraccionDeCuerpo(i)
      const arriba = modelo.desplazamiento(i + 0.01)
      const abajo = modelo.desplazamiento(i + fc - 0.01)
      expect(arriba.distanceTo(abajo)).toBeLessThan(1e-9)
    }
  })

  it('en la lordosis lumbar la separación sigue la curva y no la vertical', () => {
    const relativo = modelo.desplazamiento(centroDeVertebra(iSacro)).sub(modelo.desplazamiento(centroDeVertebra(iL5)))
    const conLaVertical = THREE.MathUtils.radToDeg(relativo.angleTo(new THREE.Vector3(0, -1, 0)))
    expect(conLaVertical).toBeGreaterThan(15)
  })

  it('suma una junta por disco y nada en los cuerpos', () => {
    const tangentes = [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)]
    const juntas = crearJuntas([
      { cuerpo: 1, disco: 1 },
      { cuerpo: 1, disco: 1 },
      { cuerpo: 1, disco: 0 },
    ])
    const d = crearDesplazamiento(juntas, tangentes, 2)
    expect(d(0.25).toArray()).toEqual([0, 0, 0])
    expect(d(0.75).toArray()).toEqual([0, -1, 0])
    expect(d(1.25).toArray()).toEqual([0, -2, 0])
    expect(d(1.75).toArray()).toEqual([0, -2, -1])
    expect(d(2.5).toArray()).toEqual([0, -2, -2])
  })
})

describe('piezas y rótulos con el eje corregido', () => {
  const columna = construirColumna(modelo)
  const pieza = (id: string) => columna.find((p) => p.estructura === id)!
  const caja = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox()
    return g.boundingBox!.clone()
  }

  it.each(['vertebra-L5', 'disco-L4-L5', 'disco-L5-S1', 'sacro'])('el rótulo de %s queda pegado a su pieza, con y sin despiece', (id) => {
    const p = pieza(id)
    expect(caja(p.geometria).distanceToPoint(p.ancla!)).toBeLessThan(1.5)
    // Al separar, el rótulo se mueve exactamente lo que se mueve la pieza.
    const movido = p.anclaDespiece!.clone().sub(p.ancla!)
    expect(movido.distanceTo(p.desplazamientoDespiece!)).toBeLessThan(1e-9)
  })

  it('cada vértebra y cada disco se separan con el desplazamiento de su nivel', () => {
    m.forEach((n, i) => {
      const id = n.id === 'S' ? 'sacro' : `vertebra-${n.id}`
      expect(pieza(id).desplazamientoDespiece!.distanceTo(modelo.desplazamiento(centroDeVertebra(i)))).toBeLessThan(1e-9)
    })
    expect(pieza('disco-L4-L5').desplazamientoDespiece!.distanceTo(modelo.desplazamiento(centroDeDisco(iL5 - 1)))).toBeLessThan(1e-9)
  })

  it('la raíz L5 sale por el agujero L5-S1', () => {
    const vf = coordenadaDeAgujero('L5')!
    // El agujero queda a la altura del disco L5-S1, entre el cuerpo de L5 y el sacro.
    expect(vf).toBeGreaterThan(iL5 + modelo.fraccionDeCuerpo(iL5))
    expect(vf).toBeLessThan(iSacro)
    const raiz = construirRaices(modelo).find((p) => p.estructura === 'raiz-L5-izq')!
    const pos = raiz.geometria.getAttribute('position') as THREE.BufferAttribute
    const agujero = modelo.punto(vf, m[iL5].conducto + 0.4, 0.12)
    let cerca = Infinity
    const v = new THREE.Vector3()
    for (let k = 0; k < pos.count; k++) cerca = Math.min(cerca, v.fromBufferAttribute(pos, k).distanceTo(agujero))
    expect(cerca).toBeLessThan(0.3)
  })

  it('el filum terminal (el centro de la cola de caballo) sigue el conducto sacro', () => {
    const filum = construirMedula(modelo).find((p) => !p.estructura)!
    const pos = filum.geometria.getAttribute('position') as THREE.BufferAttribute
    const eje: THREE.Vector3[] = []
    for (let v = 19; v <= iSacro + 1; v += 0.005) eje.push(modelo.punto(v))
    const v = new THREE.Vector3()
    for (let k = 0; k < pos.count; k += 7) {
      v.fromBufferAttribute(pos, k)
      expect(Math.min(...eje.map((q) => q.distanceTo(v)))).toBeLessThan(0.25)
    }
  })
})
