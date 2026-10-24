/**
 * Cada novedad enlaza a un recorrido que existe: un id renombrado dejaría la
 * novedad sin su «Ver cómo funciona» y nadie se enteraría.
 */
import { describe, expect, it } from 'vitest'
import { CATALOGO } from './recorridos'
import { NOVEDADES, VERSION_NOVEDADES } from './novedades'
import paquete from '../../../package.json'

describe('Novedades de la versión', () => {
  const ids = new Set(CATALOGO.map((r) => r.id))

  it.each(NOVEDADES.filter((n) => n.recorridos.length > 0).map((n) => [n.id, n.recorridos] as const))(
    '«%s» enlaza a recorridos que existen',
    (_id, recorridos) => {
      for (const r of recorridos) expect(ids.has(r), r).toBe(true)
    },
  )

  it('las que no tienen recorrido se muestran a todas', () => {
    for (const n of NOVEDADES.filter((x) => x.recorridos.length === 0)) expect(n.paraTodas, n.id).toBe(true)
  })

  it('son las de la versión que se está usando', () => {
    expect(VERSION_NOVEDADES).toBe(paquete.version)
  })
})
