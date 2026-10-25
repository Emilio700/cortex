import { describe, expect, it } from 'vitest'
import { IDS_DE_MALLAS } from './catalogo'
import { conexionDe, conexionDeDisco, conexionDeRaiz, conexionDeSegmento, discoQueCruza } from './conexiones'
import { RAICES } from './columna'

const ids = (c: ReturnType<typeof conexionDeRaiz>) => c!.piezas.map((p) => p.id)

describe('al tocar una raíz se enciende su camino completo', () => {
  it('L5 derecha: segmento, disco que cruza, vértebras del agujero y dermatoma', () => {
    const c = conexionDeRaiz('L5', 'derecho')!
    expect(ids(c)).toEqual([
      'raiz-L5-der',
      'segmento-L5',
      'disco-L4-L5',
      'vertebra-L5',
      'sacro',
      'disco-L5-S1',
    ])
    expect(c.piezas.find((p) => p.id === 'disco-L4-L5')!.papel).toBe('disco-que-cruza')
    expect(c.dermatomas).toEqual([{ dermatoma: 'L5', lado: 'derecho' }])
    expect(c.explicacion.join(' ')).toMatch(/cruza el disco L4-L5/)
  })

  it('C6 izquierda sale entre C5 y C6 y no cruza disco', () => {
    const c = conexionDeRaiz('C6', 'izquierdo')!
    expect(ids(c)).toEqual(['raiz-C6-izq', 'segmento-C6', 'vertebra-C5', 'vertebra-C6', 'disco-C5-C6'])
    expect(c.dermatomas).toEqual([{ dermatoma: 'C6', lado: 'izquierdo' }])
  })

  it('C1 no tiene dermatoma ni vértebra de arriba', () => {
    const c = conexionDeRaiz('C1', 'derecho')!
    expect(ids(c)).toEqual(['raiz-C1-der', 'segmento-C1', 'vertebra-C1'])
    expect(c.dermatomas).toEqual([])
  })

  it('todas las piezas de todas las raíces existen como malla', () => {
    for (const r of RAICES) {
      for (const lado of ['izquierdo', 'derecho'] as const) {
        for (const p of conexionDeRaiz(r.id, lado)!.piezas) expect(IDS_DE_MALLAS, `${r.id}: ${p.id}`).toContain(p.id)
      }
    }
  })

  it('discoQueCruza sólo aplica a las lumbares y a S1', () => {
    expect(discoQueCruza('L4')).toBe('L3-L4')
    expect(discoQueCruza('L1')).toBeNull()
    expect(discoQueCruza('S1')).toBe('L5-S1')
    expect(discoQueCruza('C6')).toBeNull()
  })
})

describe('segmentos y discos', () => {
  it('un segmento enciende sus dos raíces y los dos dermatomas', () => {
    const c = conexionDeSegmento('C7')!
    expect(c.piezas.map((p) => p.id)).toEqual(expect.arrayContaining(['raiz-C7-izq', 'raiz-C7-der', 'segmento-C7']))
    expect(c.dermatomas).toHaveLength(2)
  })

  it('un disco lumbar enciende la raíz que sale y la que pasa', () => {
    const c = conexionDeDisco('L4-L5')!
    const raices = c.piezas.filter((p) => p.papel === 'raiz').map((p) => p.id)
    expect(raices).toEqual(expect.arrayContaining(['raiz-L4-izq', 'raiz-L4-der', 'raiz-L5-izq', 'raiz-L5-der']))
  })

  it('conexionDe decide por el tipo de estructura', () => {
    expect(conexionDe('raiz-S1-izq')!.origen).toBe('raiz-S1-izq')
    expect(conexionDe('segmento-T4')!.origen).toBe('segmento-T4')
    expect(conexionDe('disco-C5-C6')!.origen).toBe('disco-C5-C6')
    expect(conexionDe('cerebelo')).toBeNull()
  })
})
