import { describe, expect, it } from 'vitest'
import { AJUSTES_ORDEN_POR_DEFECTO, combinarAjustesOrden } from './ajustesOrden'

describe('combinarAjustesOrden', () => {
  it('sin nada guardado usa los valores de fábrica', () => {
    expect(combinarAjustesOrden(null)).toEqual(AJUSTES_ORDEN_POR_DEFECTO)
  })

  it('respeta lo guardado y descarta valores que no son de la orden', () => {
    const r = combinarAjustesOrden({
      modo_impresion: 'una_hoja',
      mostrar_firma: false,
      leyenda_pie: '   ',
      // @ts-expect-error un valor raro que mandara un servidor viejo
      mostrar_prioridad: 'si',
    })
    expect(r.modo_impresion).toBe('una_hoja')
    expect(r.mostrar_firma).toBe(false)
    expect(r.mostrar_prioridad).toBe(true)
    expect(r.leyenda_pie).toBeNull()
  })
})

describe('ajustes propios de la orden (D-11)', () => {
  it('no hay interruptor para la cédula profesional: sale siempre', async () => {
    const { GRUPOS_ORDEN } = await import('./ajustesOrden')
    const claves = GRUPOS_ORDEN.flatMap((g) => g.opciones.map((o) => o.clave as string))
    expect(claves).not.toContain('mostrar_cedula_profesional')
  })

  it('para enviar: objeto completo, textos vacíos a null y solo claves del contrato', async () => {
    const { ajustesOrdenParaEnviar } = await import('./ajustesOrden')
    const enviado = ajustesOrdenParaEnviar({
      ...AJUSTES_ORDEN_POR_DEFECTO,
      nombre_impreso: '   ',
      leyenda_pie: ' Traer en ayunas ',
      color_acento: '#123abc',
    })
    expect(enviado.nombre_impreso).toBeNull()
    expect(enviado.leyenda_pie).toBe('Traer en ayunas')
    expect(enviado.color_acento).toBe('#123ABC')
    expect(Object.keys(enviado).sort()).toEqual(Object.keys(AJUSTES_ORDEN_POR_DEFECTO).sort())
  })
})
