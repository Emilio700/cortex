/**
 * El atlas detallado y el catálogo hablan de lo mismo: cada pieza que el
 * script de BodyParts3D pone en el manifiesto cae en una estructura del
 * catálogo (o en la que la contiene), en una capa que existe.
 *
 * `atlasMapeo.json` lo escribe `scripts/atlas/preparar_atlas.py --escribir-mapeo`
 * y una prueba de Python comprueba que está al día con la tabla del script.
 */
import { describe, expect, it } from 'vitest'

import mapeo from './atlasMapeo.json'
import { CAPAS } from './capas'
import { CATALOGO, IDS_DE_MALLAS, buscarEstructuras, estructuraPorId } from './catalogo'
import { DISCOS, NIVELES_VERTEBRALES } from './columna'
import { conexionDe } from './conexiones'
import { AVISO_ATLAS, leerManifiesto, MOTIVO_SIN_ATLAS, ubicarEnCatalogo, type EntradaDelAtlas } from './atlasDetallado'
import { AVISO_ORIGEN } from './origenModelo'

const entradas = mapeo as unknown as EntradaDelAtlas[]
const capas = new Set<string>(CAPAS.map((c) => c.id))

const manifiestoValido = () => ({
  version: 1,
  fuente: 'BodyParts3D',
  versionFuente: '4.0',
  unidades: 'mm',
  sistema: 'LPS',
  archivos: [{ region: 'columna', ruta: 'columna.glb', bytes: 100 }],
  estructuras: [{ clave: 'vertebra-L5', estructura: 'vertebra-L5', parteDe: null, capa: 'columna', tejido: 'hueso', region: 'columna', fma: ['FMA13076'] }],
})

describe('mapeo del atlas al catálogo', () => {
  it('cada pieza usa un id del catálogo, en su misma capa', () => {
    for (const e of entradas) {
      const enCatalogo = estructuraPorId(e.estructura)
      expect(enCatalogo, e.clave).toBeDefined()
      expect(capas.has(e.capa), `${e.clave}: capa ${e.capa}`).toBe(true)
      expect(enCatalogo!.capa, e.clave).toBe(e.capa)
    }
  })

  it('lo que es parte de algo apunta a una estructura que existe (giro → lóbulo, hueso → cráneo)', () => {
    for (const e of entradas.filter((x) => x.parteDe)) {
      expect(estructuraPorId(e.parteDe!), `${e.clave} → ${e.parteDe}`).toBeDefined()
      // Y el catálogo dice lo mismo.
      if (e.estructura === e.clave) expect(estructuraPorId(e.estructura)!.parteDe, e.clave).toBe(e.parteDe)
    }
    expect(entradas.find((e) => e.clave === 'giro-precentral-izq')!.parteDe).toBe('lobulo-frontal-izq')
    expect(entradas.find((e) => e.clave === 'hueso-frontal')!.parteDe).toBe('craneo')
  })

  it('la columna real usa los mismos ids: tocar la raíz L5 enciende la vértebra L5 del atlas', () => {
    const ids = new Set(entradas.map((e) => e.estructura))
    for (const n of NIVELES_VERTEBRALES) expect(ids.has(n.id === 'S' ? 'sacro' : `vertebra-${n.id}`), n.id).toBe(true)
    // BodyParts3D no trae el disco T12-L1: ése lo sigue poniendo el modelo simplificado.
    expect(DISCOS.filter((d) => !ids.has(`disco-${d}`))).toEqual(['T12-L1'])
    const piezas = conexionDe('raiz-L5-der')!.piezas.map((p) => p.id)
    expect(piezas).toEqual(expect.arrayContaining(['vertebra-L5', 'disco-L4-L5']))
    for (const p of piezas.filter((id) => id.startsWith('vertebra-') || id.startsWith('disco-'))) expect(ids.has(p), p).toBe(true)
  })

  it('trae el polígono de Willis, los lóbulos (por giros) y los ventrículos', () => {
    const ids = new Set(entradas.flatMap((e) => [e.estructura, e.parteDe]))
    for (const id of [
      'carotida-interna-izq',
      'basilar',
      'cerebral-media-der',
      'comunicante-anterior',
      'comunicante-posterior-izq',
      'lobulo-frontal-izq',
      'lobulo-parietal-der',
      'lobulo-temporal-izq',
      'lobulo-occipital-der',
      'insula-izq',
      'cerebelo',
      'mesencefalo',
      'ventriculo-lateral-der',
      'cuarto-ventriculo',
    ]) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('cada estructura exclusiva del atlas tiene su malla en el atlas', () => {
    const ids = new Set(entradas.map((e) => e.estructura))
    for (const e of CATALOGO.filter((x) => x.soloAtlas)) expect(ids.has(e.id), e.id).toBe(true)
  })

  it('lo exclusivo del atlas no se exige al modelo simplificado ni se busca sin el atlas', () => {
    expect(IDS_DE_MALLAS).not.toContain('giro-precentral-izq')
    expect(IDS_DE_MALLAS).toContain('lobulo-frontal-izq')
    expect(buscarEstructuras('precentral')).toEqual([])
    expect(buscarEstructuras('precentral', 8, { incluirAtlas: true }).map((e) => e.id)).toEqual(
      expect.arrayContaining(['giro-precentral-izq', 'giro-precentral-der']),
    )
    expect(estructuraPorId('giros-orbitarios-izq')!.nombre).toBe('Giros orbitarios izquierdos')
  })
})

describe('ubicar una pieza', () => {
  const entrada = (e: Partial<EntradaDelAtlas>): EntradaDelAtlas => ({
    clave: 'x',
    estructura: 'x',
    parteDe: null,
    capa: 'encefalo',
    tejido: 'corteza',
    region: 'cabeza',
    fma: [],
    ...e,
  })

  it('con el id del catálogo toma su color y su capa', () => {
    expect(ubicarEnCatalogo(entrada({ clave: 'giro-precentral-izq', estructura: 'giro-precentral-izq', parteDe: 'lobulo-frontal-izq' }))).toEqual({
      estructura: 'giro-precentral-izq',
      parteDe: 'lobulo-frontal-izq',
      capa: 'encefalo',
      color: '--cx-anat-frontal',
    })
  })

  it('un id que este catálogo no conoce se ve, pero no se elige', () => {
    const u = ubicarEnCatalogo(entrada({ estructura: 'algo-nuevo', tejido: 'arteria', capa: 'vasos' }))
    expect(u).toEqual({ estructura: undefined, parteDe: undefined, capa: 'vasos', color: '--cx-anat-arteria' })
  })

  it('una capa que aún no existe (las venas del tramo REAL) no rompe la escena', () => {
    expect(ubicarEnCatalogo(entrada({ estructura: 'yugular-interna-izq', capa: 'venas', tejido: 'vena' }))).toBeNull()
    expect(ubicarEnCatalogo(entrada({ estructura: 'basilar', capa: 'venas', tejido: 'vena' }))!.capa).toBe('vasos')
  })
})

describe('manifiesto', () => {
  it('acepta el que escribe el script', () => {
    const m = leerManifiesto(manifiestoValido())
    expect(m!.estructuras[0].estructura).toBe('vertebra-L5')
    expect(m!.archivos[0].bytes).toBe(100)
  })

  it('un servidor sin atlas (HTML, nada, otra cosa) cuenta como no instalado', () => {
    expect(leerManifiesto(null)).toBeNull()
    expect(leerManifiesto('<!doctype html>')).toBeNull()
    expect(leerManifiesto({ ...manifiestoValido(), estructuras: [] })).toBeNull()
  })

  it('sin milímetros y LPS no se dibuja: se vería del tamaño o del lado equivocado', () => {
    expect(leerManifiesto({ ...manifiestoValido(), unidades: 'm' })).toBeNull()
    expect(leerManifiesto({ ...manifiestoValido(), sistema: 'RAS' })).toBeNull()
  })

  it('no acepta rutas a otras carpetas ni tejidos desconocidos', () => {
    expect(leerManifiesto({ ...manifiestoValido(), archivos: [{ region: 'columna', ruta: '../secreto.glb', bytes: 1 }] })).toBeNull()
    const m = manifiestoValido()
    m.estructuras[0].tejido = 'plastilina'
    expect(leerManifiesto(m)).toBeNull()
  })
})

describe('avisos', () => {
  it('el atlas dice que es otra persona, sin tocar el contrato de los orígenes', () => {
    expect(AVISO_ATLAS).toMatch(/persona de referencia/)
    expect(AVISO_ATLAS).toMatch(/no la de este paciente/)
    expect(Object.keys(AVISO_ORIGEN)).toEqual(['esquematico', 'radiografia', 'tc'])
    expect(MOTIVO_SIN_ATLAS).toBe('El atlas detallado no está instalado en este servidor.')
  })
})
