/**
 * El archivo del papel de órdenes se llama con el folio que imprimió el
 * servidor (plan 32, folios homologados), nunca con uno armado en la pantalla.
 */
import { describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => {
  const cliente = { get, post: vi.fn() }
  return { apiClient: cliente, default: cliente }
})

import {
  NOMBRE_PAPEL_SIN_FOLIO,
  folioDeRespuesta,
  nombreArchivoConsulta,
  obtenerPdfOrdenesDeConsulta,
} from './ordenEstudioPdf'

describe('folioDeRespuesta', () => {
  it('toma X-Folio cuando el servidor lo manda', () => {
    expect(folioDeRespuesta({ 'x-folio': 'GYG-ORD-2026-0118' })).toEqual({
      folio: 'GYG-ORD-2026-0118',
      nombreArchivo: 'Orden_de_estudios_GYG-ORD-2026-0118.pdf',
    })
  })

  it('si no, lo saca del nombre de Content-Disposition', () => {
    expect(
      folioDeRespuesta({ 'content-disposition': 'attachment; filename="Orden_de_estudios_GYG-ORD-2026-0007.pdf"' }),
    ).toEqual({ folio: 'GYG-ORD-2026-0007', nombreArchivo: 'Orden_de_estudios_GYG-ORD-2026-0007.pdf' })
  })

  it('sin ninguna de las dos no inventa folio', () => {
    expect(folioDeRespuesta({})).toEqual({ folio: null, nombreArchivo: null })
  })
})

describe('papel de varias órdenes', () => {
  it('el nombre provisional es neutro: no promete un folio C- que el papel no lleva', () => {
    expect(nombreArchivoConsulta(41)).toBe(NOMBRE_PAPEL_SIN_FOLIO)
    expect(NOMBRE_PAPEL_SIN_FOLIO).not.toMatch(/C-|G-|\d/)
  })

  it('devuelve el PDF con el folio y las órdenes que dijo el servidor', async () => {
    get.mockResolvedValue({
      data: new Blob(['%PDF']),
      headers: {
        'content-disposition': 'attachment; filename="Orden_de_estudios_GYG-ORD-2026-0118.pdf"',
        'x-order-ids': '5,6',
      },
    })
    const r = await obtenerPdfOrdenesDeConsulta(41)
    expect(r.folio).toBe('GYG-ORD-2026-0118')
    expect(r.nombreArchivo).toBe('Orden_de_estudios_GYG-ORD-2026-0118.pdf')
    expect(r.orderIds).toEqual([5, 6])
    expect(r.pdf.type).toBe('application/pdf')
  })
})
