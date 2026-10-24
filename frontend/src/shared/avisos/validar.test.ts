/**
 * Una respuesta mal formada de los avisos se trata como fallo de lectura, no
 * tumba la aplicación (los avisos están en todas las pantallas).
 */
import { describe, expect, it } from 'vitest'
import { RespuestaInvalida, validarEstado, validarLista, validarPreferencias } from './validar'

describe('validar', () => {
  it('rechaza un estado sin los contadores', () => {
    expect(() => validarEstado({ sin_leer: 1 })).toThrow(RespuestaInvalida)
    expect(() => validarEstado('<html>')).toThrow(RespuestaInvalida)
    expect(validarEstado({ sin_leer: 0, abiertos: { accionable: 1, urgente: 0 } }).abiertos.accionable).toBe(1)
  })

  it('una lista sin items es fallo; un aviso sin id se descarta', () => {
    expect(() => validarLista({})).toThrow(RespuestaInvalida)
    const lista = validarLista({ unread_count: 0, items: [{ id: 1, type: 't', title: 'x' }, { type: 't' }] })
    expect(lista.items.map((a) => a.id)).toEqual([1])
    expect(lista.items[0].message).toBe('')
  })

  it('preferencias sin tipos_silenciables como lista son fallo', () => {
    expect(() =>
      validarPreferencias({ sonido: false, navegador: false, tipos_silenciados: [], tipos_silenciables: null }),
    ).toThrow(RespuestaInvalida)
    expect(
      validarPreferencias({ sonido: true, navegador: false, tipos_silenciados: [], tipos_silenciables: ['a'] })
        .recordatorio_una_hora,
    ).toBe(false)
  })
})
