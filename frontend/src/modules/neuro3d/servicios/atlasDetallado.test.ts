/**
 * Consultar y descargar el atlas detallado sin red: `pedir` simula al servidor.
 *
 * Un servidor sin atlas suele contestar 404 o la página de inicio con 200; los
 * dos casos tienen que terminar en «no instalado», nunca en una excepción ni
 * en una pantalla en blanco.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MOTIVO_SIN_ATLAS, type ManifiestoDelAtlas } from '../dominio/atlasDetallado'
import { AtlasIncompleto, consultarAtlas, descargarAtlas, olvidarDescargas } from './atlasDetallado'

const MANIFIESTO = {
  version: 1,
  fuente: 'BodyParts3D',
  versionFuente: '4.0',
  unidades: 'mm',
  sistema: 'LPS',
  archivos: [
    { region: 'cabeza', ruta: 'cabeza.glb', bytes: 6 },
    { region: 'columna', ruta: 'columna.glb', bytes: 4 },
  ],
  estructuras: [{ clave: 'vertebra-L5', estructura: 'vertebra-L5', parteDe: null, capa: 'columna', tejido: 'hueso', region: 'columna', fma: [] }],
}
const CREDITOS = {
  id: 'bodyparts3d',
  titulo: 'BodyParts3D',
  licencia: 'CC BY 4.0',
  texto: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
}

const respuesta = (cuerpo: string | Uint8Array, status = 200) => new Response(cuerpo as BodyInit, { status })

const servidor = (rutas: Record<string, () => Response>) =>
  vi.fn(async (url: string) => {
    const nombre = url.split('/').pop()!
    const r = rutas[nombre]
    if (!r) return respuesta('no', 404)
    return r()
  })

beforeEach(() => olvidarDescargas())

describe('¿está instalado el atlas?', () => {
  it('con manifiesto y créditos válidos, sí', async () => {
    const pedir = servidor({
      'manifiesto.json': () => respuesta(JSON.stringify(MANIFIESTO)),
      'CREDITOS.json': () => respuesta(JSON.stringify(CREDITOS)),
    })
    const e = await consultarAtlas('/atlas/bodyparts3d/', pedir)
    expect(e.instalado).toBe(true)
    if (e.instalado) {
      expect(e.creditos.texto).toBe(CREDITOS.texto)
      expect(e.manifiesto.archivos).toHaveLength(2)
    }
    expect(pedir).toHaveBeenCalledWith('/atlas/bodyparts3d/manifiesto.json', expect.anything())
  })

  it('un 404 o la página de inicio (HTML con 200) es «no instalado», con su motivo', async () => {
    expect(await consultarAtlas('/a/', servidor({}))).toEqual({ instalado: false, motivo: MOTIVO_SIN_ATLAS })
    const html = () => respuesta('<!doctype html><html></html>')
    expect(await consultarAtlas('/a/', servidor({ 'manifiesto.json': html, 'CREDITOS.json': html }))).toEqual({
      instalado: false,
      motivo: MOTIVO_SIN_ATLAS,
    })
  })

  it('sin créditos no se ofrece: la licencia pide la atribución', async () => {
    const pedir = servidor({ 'manifiesto.json': () => respuesta(JSON.stringify(MANIFIESTO)) })
    expect((await consultarAtlas('/a/', pedir)).instalado).toBe(false)
  })

  it('sin red tampoco lanza', async () => {
    const pedir = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await consultarAtlas('/a/', pedir)).toEqual({ instalado: false, motivo: MOTIVO_SIN_ATLAS })
  })
})

describe('descarga', () => {
  const manifiesto = MANIFIESTO as unknown as ManifiestoDelAtlas

  it('avisa el avance hasta 1 y entrega los archivos en el orden del manifiesto', async () => {
    const pedir = servidor({
      'cabeza.glb': () => respuesta(new Uint8Array([1, 2, 3, 4, 5, 6])),
      'columna.glb': () => respuesta(new Uint8Array([7, 8, 9, 10])),
    })
    const avance: number[] = []
    const datos = await descargarAtlas(manifiesto, (f) => avance.push(f), '/a/', pedir)
    expect(datos.map((d) => d.byteLength)).toEqual([6, 4])
    expect(new Uint8Array(datos[1])[0]).toBe(7)
    expect(avance[0]).toBe(0)
    expect(avance[avance.length - 1]).toBe(1)
    expect([...avance].sort((a, b) => a - b)).toEqual(avance)
  })

  it('lo ya descargado en la pestaña no se vuelve a pedir', async () => {
    const pedir = servidor({
      'cabeza.glb': () => respuesta(new Uint8Array(6)),
      'columna.glb': () => respuesta(new Uint8Array(4)),
    })
    await descargarAtlas(manifiesto, () => {}, '/a/', pedir)
    await descargarAtlas(manifiesto, () => {}, '/a/', pedir)
    expect(pedir).toHaveBeenCalledTimes(2)
  })

  it('un archivo cortado no se dibuja, y la próxima vez se vuelve a pedir', async () => {
    const pedir = servidor({
      'cabeza.glb': () => respuesta(new Uint8Array(3)),
      'columna.glb': () => respuesta(new Uint8Array(4)),
    })
    await expect(descargarAtlas(manifiesto, () => {}, '/a/', pedir)).rejects.toBeInstanceOf(AtlasIncompleto)
    await expect(descargarAtlas(manifiesto, () => {}, '/a/', pedir)).rejects.toThrow(/incompleto/)
    expect(pedir.mock.calls.filter(([u]) => String(u).endsWith('cabeza.glb'))).toHaveLength(2)
  })

  it('si se cae la red, el mensaje es para el médico', async () => {
    const pedir = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(descargarAtlas(manifiesto, () => {}, '/a/', pedir)).rejects.toThrow('Se cortó la descarga del atlas detallado. Revisa la conexión e inténtalo de nuevo.')
  })
})
