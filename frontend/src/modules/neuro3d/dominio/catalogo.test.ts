import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CAPAS } from './capas'
import {
  CATALOGO,
  IDS_DE_MALLAS,
  POLIGONO_DE_WILLIS,
  SISTEMAS,
  buscarEstructuras,
  estructuraPorId,
  idDeRaiz,
  mallasDe,
  normalizar,
} from './catalogo'
import { DISCOS, NIVELES_VERTEBRALES, RAICES } from './columna'

// Se lee del disco: el transformador de estilos de vitest deja vacías las hojas.
// La ruta va en una variable para que Vite no la convierta en un recurso.
const HOJA = '../ui/atlas.css'
const estilos = readFileSync(fileURLToPath(new URL(HOJA, import.meta.url)), 'utf-8')

describe('catálogo anatómico', () => {
  it('no repite ids y cada estructura está completa', () => {
    const ids = CATALOGO.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const capas = CAPAS.map((c) => c.id)
    for (const e of CATALOGO) {
      expect(e.nombre.trim(), e.id).not.toBe('')
      expect(e.descripcion.trim(), e.id).not.toBe('')
      expect(SISTEMAS, e.id).toContain(e.sistema)
      expect(capas, e.id).toContain(e.capa)
      expect(e.color, e.id).toMatch(/^--cx-anat-[a-z-]+$/)
    }
  })

  it('cada color es un token definido en la hoja del módulo', () => {
    for (const color of new Set(CATALOGO.map((e) => e.color))) {
      expect(estilos, color).toContain(`${color}:`)
    }
  })

  it('trae los lóbulos y la ínsula de los dos lados, el cerebelo y el tronco', () => {
    for (const base of ['lobulo-frontal', 'lobulo-parietal', 'lobulo-temporal', 'lobulo-occipital', 'insula']) {
      expect(estructuraPorId(`${base}-izq`), base).toBeDefined()
      expect(estructuraPorId(`${base}-der`), base).toBeDefined()
    }
    for (const id of ['cerebelo', 'mesencefalo', 'protuberancia', 'bulbo']) expect(estructuraPorId(id), id).toBeDefined()
    expect(estructuraPorId('lobulo-frontal-izq')!.nombre).toBe('Lóbulo frontal izquierdo')
    expect(estructuraPorId('insula-der')!.nombre).toBe('Ínsula derecha')
  })

  it('trae el sistema ventricular completo', () => {
    for (const id of ['ventriculo-lateral-izq', 'ventriculo-lateral-der', 'tercer-ventriculo', 'acueducto', 'cuarto-ventriculo']) {
      expect(estructuraPorId(id), id).toBeDefined()
    }
  })

  it('el polígono de Willis tiene sus arterias principales', () => {
    for (const id of [
      'carotida-interna-izq', 'carotida-interna-der',
      'cerebral-anterior-izq', 'cerebral-anterior-der',
      'cerebral-media-izq', 'cerebral-media-der',
      'cerebral-posterior-izq', 'cerebral-posterior-der',
      'comunicante-anterior', 'comunicante-posterior-izq', 'comunicante-posterior-der',
      'basilar',
    ]) {
      expect(POLIGONO_DE_WILLIS, id).toContain(id)
    }
    expect(estructuraPorId('vertebral-izq')).toBeDefined()
    expect(POLIGONO_DE_WILLIS).not.toContain('vertebral-izq')
  })

  it('cada vértebra, disco, segmento y raíz de los dos lados', () => {
    for (const n of NIVELES_VERTEBRALES) expect(estructuraPorId(n.id === 'S' ? 'sacro' : `vertebra-${n.id}`), n.id).toBeDefined()
    for (const d of DISCOS) expect(estructuraPorId(`disco-${d}`), d).toBeDefined()
    for (const r of RAICES) {
      expect(estructuraPorId(`segmento-${r.id}`), r.id).toBeDefined()
      expect(estructuraPorId(idDeRaiz(r.id, 'izquierdo'))!.lado).toBe('izquierdo')
      expect(estructuraPorId(idDeRaiz(r.id, 'derecho'))!.nombre).toBe(`Raíz ${r.id} derecha`)
    }
  })

  it('las compuestas apuntan a mallas que existen', () => {
    for (const e of CATALOGO.filter((x) => x.componentes)) {
      expect(e.componentes!.length, e.id).toBeGreaterThan(0)
      for (const c of e.componentes!) expect(IDS_DE_MALLAS, `${e.id} → ${c}`).toContain(c)
    }
    expect(mallasDe('cono-medular')).toContain('segmento-Co')
    expect(mallasDe('lobulo-frontal-izq')).toEqual(['lobulo-frontal-izq'])
    expect(mallasDe('no-existe')).toEqual([])
  })

  it('las vías se declaran esquemáticas', () => {
    for (const e of CATALOGO.filter((x) => x.capa === 'tractos')) {
      expect(e.esquematica, e.id).toBe(true)
      expect(e.nombre, e.id).toMatch(/esquemática/)
    }
  })
})

describe('búsqueda', () => {
  it('ignora mayúsculas y acentos', () => {
    expect(normalizar('Ínsula DERECHA')).toBe('insula derecha')
    expect(buscarEstructuras('insula').map((e) => e.id)).toEqual(expect.arrayContaining(['insula-izq', 'insula-der']))
  })

  it('encuentra por nivel y por sinónimo', () => {
    expect(buscarEstructuras('L4-L5')[0].id).toBe('disco-L4-L5')
    expect(buscarEstructuras('raiz l5 derecha')[0].id).toBe('raiz-L5-der')
    expect(buscarEstructuras('cauda equina')[0].id).toBe('cola-de-caballo')
    expect(buscarEstructuras('puente')[0].id).toBe('protuberancia')
  })

  it('sin texto no devuelve nada y respeta el límite', () => {
    expect(buscarEstructuras('   ')).toEqual([])
    expect(buscarEstructuras('raiz', 5)).toHaveLength(5)
  })
})
