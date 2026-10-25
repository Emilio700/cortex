import { describe, expect, it } from 'vitest'

import { mensajeDeFallo } from './mensajes'

describe('mensajeDeFallo', () => {
  it('un error propio conserva su mensaje', () => {
    expect(mensajeDeFallo(new Error('Este navegador no permite copiar imágenes.'))).toBe(
      'Este navegador no permite copiar imágenes.'
    )
  })

  it('un error del servidor usa su detalle, no el texto técnico de axios', () => {
    const error = Object.assign(new Error('Request failed with status code 409'), {
      response: { status: 409, data: { detail: 'El estudio no está listo para compartirse.' } },
    })
    expect(mensajeDeFallo(error)).toBe('El estudio no está listo para compartirse.')
  })

  it('un error del servidor sin detalle se traduce por su código', () => {
    const error = Object.assign(new Error('boom'), { response: { status: 403, data: {} } })
    expect(mensajeDeFallo(error)).toBe('No tienes permiso para realizar esta acción.')
  })

  it('sin conexión lo dice', () => {
    const error = Object.assign(new Error('Network Error'), { request: {} })
    expect(mensajeDeFallo(error)).toMatch(/No se pudo conectar/)
  })

  it('algo que no es un error cae al mensaje genérico', () => {
    expect(mensajeDeFallo(undefined)).toBe('Ocurrió un error inesperado.')
    expect(mensajeDeFallo(new Error('  '))).toBe('Ocurrió un error inesperado.')
  })
})
