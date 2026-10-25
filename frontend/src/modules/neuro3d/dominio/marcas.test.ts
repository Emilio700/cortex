import { describe, expect, it } from 'vitest'
import {
  LARGO_MAXIMO_DE_NOTA,
  crearMarcaDeNivel,
  crearMarcaDeRegion,
  dermatomasDeMarcas,
  describirMarca,
  mallasAfectadas,
  raicesDeMarca,
  textoDeMarcasParaCaptura,
  type MarcaDeNivel,
} from './marcas'

const hernia = (datos: Partial<MarcaDeNivel> = {}) => {
  const r = crearMarcaDeNivel({
    disco: 'L4-L5',
    hallazgo: 'hernia',
    posicion: 'paracentral',
    lado: 'derecho',
    nota: '',
    ...datos,
  })
  if (!r.ok) throw new Error(r.error)
  return r.marca
}

describe('marcas de nivel', () => {
  it('hernia L4-L5 paracentral derecha: raíz L5 derecha y su dermatoma', () => {
    const m = hernia()
    expect(describirMarca(m)).toBe('Hernia L4-L5 paracentral derecha · raíz L5')
    expect(raicesDeMarca(m)).toEqual([{ raiz: 'L5', lado: 'derecho' }])
    expect(dermatomasDeMarcas([m])).toEqual([{ dermatoma: 'L5', lado: 'derecho' }])
    expect(mallasAfectadas(m)).toEqual(['disco-L4-L5', 'raiz-L5-der'])
  })

  it('la estenosis foraminal aprieta la raíz que sale', () => {
    const m = hernia({ hallazgo: 'estenosis-foraminal', lado: 'izquierdo' })
    expect(m.posicion).toBe('foraminal')
    expect(describirMarca(m)).toBe('Estenosis foraminal L4-L5 izquierda · raíz L4')
  })

  it('ambos lados enciende los dos dermatomas, sin repetir entre marcas', () => {
    const a = hernia({ lado: 'ambos' })
    const b = hernia({ lado: 'derecho' })
    expect(dermatomasDeMarcas([a, b])).toEqual([
      { dermatoma: 'L5', lado: 'izquierdo' },
      { dermatoma: 'L5', lado: 'derecho' },
    ])
  })

  it('central lumbar: cola de caballo, sin inventar una raíz', () => {
    const m = hernia({ posicion: 'central', lado: 'ambos' })
    expect(describirMarca(m)).toMatch(/cola de caballo$/)
    expect(raicesDeMarca(m)).toEqual([])
    expect(mallasAfectadas(m)).toContain('raiz-S1-izq')
  })

  it('rechaza un nivel inexistente y una central de un solo lado', () => {
    expect(crearMarcaDeNivel({ disco: 'L6-S1', hallazgo: 'hernia', posicion: 'paracentral', lado: 'derecho', nota: '' }).ok).toBe(false)
    const central = crearMarcaDeNivel({ disco: 'L4-L5', hallazgo: 'hernia', posicion: 'central', lado: 'derecho', nota: '' })
    expect(central).toEqual({ ok: false, error: expect.stringMatching(/ambos lados/) })
  })

  it('limpia y recorta la nota', () => {
    const m = hernia({ nota: `  dolor   irradiado ${'x'.repeat(400)}` })
    expect(m.nota.startsWith('dolor irradiado')).toBe(true)
    expect(m.nota.length).toBe(LARGO_MAXIMO_DE_NOTA)
  })

  it('ids distintos aunque se creen en el mismo instante', () => {
    expect(hernia().id).not.toBe(hernia().id)
  })
})

describe('marcas de región', () => {
  it('se describen con el hallazgo y la estructura', () => {
    const r = crearMarcaDeRegion({ estructura: 'lobulo-temporal-izq', hallazgo: 'tumor', nota: 'lesión de 2 cm' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(describirMarca(r.marca)).toBe('Tumor · Lóbulo temporal izquierdo')
    expect(mallasAfectadas(r.marca)).toEqual(['lobulo-temporal-izq'])
    expect(dermatomasDeMarcas([r.marca])).toEqual([])
    expect(textoDeMarcasParaCaptura([r.marca])).toEqual(['Tumor · Lóbulo temporal izquierdo — lesión de 2 cm'])
  })

  it('una compuesta marca todas sus piezas', () => {
    const r = crearMarcaDeRegion({ estructura: 'cono-medular', hallazgo: 'lesion', nota: '' })
    expect(r.ok && mallasAfectadas(r.marca)).toContain('segmento-Co')
  })

  it('rechaza una estructura que no está en el atlas', () => {
    expect(crearMarcaDeRegion({ estructura: 'higado', hallazgo: 'lesion', nota: '' }).ok).toBe(false)
  })
})
