/**
 * El contrato entre `errors.ts` y el backend.
 *
 * El backend traduce los 422 de Pydantic en `app/core/errores_validacion.py`
 * y los devuelve **con la misma forma de siempre**: `detail` es la lista al
 * estilo de Pydantic, con `loc` y `type` intactos y el `msg` ya en español.
 * Estas pruebas fijan que esa forma siga llegando entera a la pantalla: si
 * alguien cambia el manejador para devolver otra cosa, aquí se nota.
 */
import { describe, it, expect } from 'vitest'
import { mensajeDeError } from './errors'

/** Un 422 tal como lo devuelve hoy el backend, ya traducido. */
const respuesta422 = {
  response: {
    status: 422,
    data: {
      detail: [
        {
          loc: ['body', 'scheduled_at'],
          msg: 'Falta llenar «Fecha y hora de la cita».',
          type: 'missing',
        },
        {
          loc: ['body', 'duration_minutes'],
          msg: '«Duración en minutos» debe ser de al menos 15.',
          type: 'greater_than_equal',
        },
      ],
      mensaje:
        'Falta llenar «Fecha y hora de la cita». «Duración en minutos» debe ser de al menos 15.',
    },
  },
}

describe('mensajeDeError con los 422 ya traducidos', () => {
  it('enseña el primer fallo en español, nombrando el campo', () => {
    expect(mensajeDeError(respuesta422)).toBe('Falta llenar «Fecha y hora de la cita».')
  })

  it('no cae en el mensaje genérico del 422', () => {
    expect(mensajeDeError(respuesta422)).not.toContain('Falta información')
  })

  it('un detail de texto suelto se sigue mostrando tal cual', () => {
    const err = {
      response: { status: 404, data: { detail: 'No se encontró la cita.' } },
    }
    expect(mensajeDeError(err)).toBe('No se encontró la cita.')
  })

  it('sin detail legible cae al mensaje por código, en español', () => {
    expect(mensajeDeError({ response: { status: 403, data: {} } })).toBe(
      'No tienes permiso para realizar esta acción.',
    )
  })
})
