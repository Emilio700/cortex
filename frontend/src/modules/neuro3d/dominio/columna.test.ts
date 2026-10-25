import { describe, expect, it } from 'vitest'
import {
  DISCOS,
  FIN_DEL_CONO,
  NIVELES_VERTEBRALES,
  RAICES,
  RAICES_DE_LA_COLA_DE_CABALLO,
  SEGMENTOS_MEDULARES,
  coordenadaDeAgujero,
  efectoDeHernia,
  salidaDeRaiz,
  segmentoDeRaiz,
  vertebraFrenteAlSegmento,
  vertebrasDelDisco,
} from './columna'

describe('niveles vertebrales', () => {
  it('son C1–C7, T1–T12, L1–L5 y el sacro, en orden', () => {
    expect(NIVELES_VERTEBRALES.map((n) => n.id)).toEqual([
      'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7',
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
      'L1', 'L2', 'L3', 'L4', 'L5', 'S',
    ])
    NIVELES_VERTEBRALES.forEach((n, i) => expect(n.indice).toBe(i))
    expect(NIVELES_VERTEBRALES[0].nombre).toBe('Atlas (C1)')
    expect(NIVELES_VERTEBRALES[1].nombre).toBe('Axis (C2)')
  })

  it('hay disco de C2-C3 a L5-S1, y no entre el atlas y el axis', () => {
    expect(DISCOS[0]).toBe('C2-C3')
    expect(DISCOS).toContain('C7-T1')
    expect(DISCOS).toContain('T12-L1')
    expect(DISCOS[DISCOS.length - 1]).toBe('L5-S1')
    expect(DISCOS).not.toContain('C1-C2')
    expect(DISCOS).toHaveLength(23)
    expect(vertebrasDelDisco('L5-S1')).toEqual(['L5', 'S'])
    expect(vertebrasDelDisco('C1-C2')).toBeNull()
  })
})

describe('raíces', () => {
  it('son 31 pares: 8 cervicales, 12 torácicas, 5 lumbares, 5 sacras y una coccígea', () => {
    expect(RAICES).toHaveLength(31)
    expect(RAICES.filter((r) => r.region === 'cervical')).toHaveLength(8)
    expect(RAICES.filter((r) => r.region === 'toracica')).toHaveLength(12)
    expect(RAICES.filter((r) => r.region === 'lumbar')).toHaveLength(5)
    expect(RAICES.filter((r) => r.region === 'sacra')).toHaveLength(5)
    expect(RAICES[RAICES.length - 1]!.id).toBe('Co')
  })

  it('las cervicales salen por encima de su vértebra y C8 entre C7 y T1', () => {
    expect(salidaDeRaiz('C1')).toMatchObject({ arriba: 'occipital', abajo: 'C1' })
    expect(salidaDeRaiz('C6')).toMatchObject({ arriba: 'C5', abajo: 'C6', disco: 'C5-C6' })
    expect(salidaDeRaiz('C8')).toMatchObject({ arriba: 'C7', abajo: 'T1', disco: 'C7-T1' })
  })

  it('de T1 hacia abajo salen por debajo de su vértebra', () => {
    expect(salidaDeRaiz('T1')).toMatchObject({ arriba: 'T1', abajo: 'T2' })
    expect(salidaDeRaiz('T12')).toMatchObject({ arriba: 'T12', abajo: 'L1', disco: 'T12-L1' })
    expect(salidaDeRaiz('L4')).toMatchObject({ arriba: 'L4', abajo: 'L5', disco: 'L4-L5' })
    expect(salidaDeRaiz('L5')).toMatchObject({ arriba: 'L5', abajo: 'S', disco: 'L5-S1' })
  })

  it('las sacras salen por los agujeros sacros y S5 por el hiato', () => {
    expect(salidaDeRaiz('S2')!.descripcion).toContain('2.º agujero sacro')
    expect(salidaDeRaiz('S5')!.abajo).toBeNull()
    expect(salidaDeRaiz('X9')).toBeNull()
  })

  it('cada agujero queda entre las vértebras que dice su salida', () => {
    for (const r of RAICES) {
      const c = coordenadaDeAgujero(r.id)!
      const salida = salidaDeRaiz(r.id)!
      if (salida.disco) {
        // El agujero está al final de la vértebra de arriba, junto a su disco.
        const arriba = NIVELES_VERTEBRALES.find((n) => n.id === salida.arriba)!
        expect(Math.floor(c), r.id).toBe(arriba.indice)
      }
    }
    // Y bajan en orden.
    const coords = RAICES.map((r) => coordenadaDeAgujero(r.id)!)
    expect([...coords].sort((a, b) => a - b)).toEqual(coords)
  })
})

describe('segmentos medulares (aproximación clásica)', () => {
  it('hay uno por raíz, contiguos y de arriba abajo', () => {
    expect(SEGMENTOS_MEDULARES.map((s) => s.raiz)).toEqual(RAICES.map((r) => r.id))
    for (let i = 1; i < SEGMENTOS_MEDULARES.length; i++) {
      expect(SEGMENTOS_MEDULARES[i].desde).toBeCloseTo(SEGMENTOS_MEDULARES[i - 1].hasta)
    }
  })

  it('la médula es más corta que la columna: el cono termina hacia L1-L2', () => {
    expect(SEGMENTOS_MEDULARES[SEGMENTOS_MEDULARES.length - 1]!.hasta).toBe(FIN_DEL_CONO)
    expect(Math.floor(FIN_DEL_CONO)).toBe(20) // L2 empieza en 20: el cono acaba en el disco L1-L2
  })

  it('el segmento L5 queda frente a la columna torácica baja, no frente a L5', () => {
    expect(vertebraFrenteAlSegmento('L5')!.id).toMatch(/^T1[12]$/)
    // Los cervicales quedan una vértebra por arriba de su número.
    expect(vertebraFrenteAlSegmento('C6')!.id).toBe('C5')
    expect(segmentoDeRaiz('Zz')).toBeUndefined()
  })

  it('la cola de caballo son las raíces que salen por debajo del cono', () => {
    expect(RAICES_DE_LA_COLA_DE_CABALLO[0]).toBe('L2')
    expect(RAICES_DE_LA_COLA_DE_CABALLO).toContain('S1')
    expect(RAICES_DE_LA_COLA_DE_CABALLO).toContain('Co')
    expect(RAICES_DE_LA_COLA_DE_CABALLO).not.toContain('T12')
  })
})

describe('hernias', () => {
  it('lumbar paracentral comprime la raíz que pasa; foraminal, la que sale', () => {
    expect(efectoDeHernia('L4-L5', 'paracentral')!.raiz).toBe('L5')
    expect(efectoDeHernia('L4-L5', 'foraminal')!.raiz).toBe('L4')
    expect(efectoDeHernia('L5-S1', 'paracentral')!.raiz).toBe('S1')
    expect(efectoDeHernia('L5-S1', 'foraminal')!.raiz).toBe('L5')
  })

  it('cervical C5-C6 comprime C6 y C7-T1 comprime C8', () => {
    expect(efectoDeHernia('C5-C6', 'paracentral')!.raiz).toBe('C6')
    expect(efectoDeHernia('C5-C6', 'foraminal')!.raiz).toBe('C6')
    expect(efectoDeHernia('C7-T1', 'paracentral')!.raiz).toBe('C8')
  })

  it('central: médula en el cuello y el tórax, cola de caballo en la columna lumbar', () => {
    expect(efectoDeHernia('C4-C5', 'central')).toMatchObject({ raiz: null, medula: true })
    expect(efectoDeHernia('T8-T9', 'paracentral')).toMatchObject({ raiz: null, medula: true })
    expect(efectoDeHernia('L4-L5', 'central')).toMatchObject({ raiz: null, colaDeCaballo: true, medula: false })
    expect(efectoDeHernia('L1-L2', 'central')).toMatchObject({ colaDeCaballo: true, medula: true })
  })

  it('un nivel que no existe no inventa efecto', () => {
    expect(efectoDeHernia('L6-S1', 'paracentral')).toBeNull()
  })
})
