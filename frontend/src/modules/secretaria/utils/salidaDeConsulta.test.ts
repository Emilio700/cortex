import { describe, expect, it } from 'vitest'

import { salidaDeConsulta } from './salidaDeConsulta'

describe('salidaDeConsulta · salir de «en consulta» sin cerrarla (plan 28, D-3)', () => {
  it('si estaba en sala, «Regresar a sala»', () => {
    expect(salidaDeConsulta({ estado_antes_de_consulta: 'en_sala' })).toMatchObject({
      destino: 'en_sala',
      texto: 'Regresar a sala',
    })
  })

  it.each(['agendada', 'confirmada'] as const)(
    'si la abrió antes de que llegara (%s), vuelve ahí y no a sala',
    (previo) => {
      const salida = salidaDeConsulta({ estado_antes_de_consulta: previo })
      expect(salida.destino).toBe(previo)
      expect(salida.texto).toBe('Salir sin atender')
      expect(salida.explicacion).toMatch(/todavía no pasaba a sala/)
    },
  )

  it('sin estado guardado (cita anterior al cambio), a sala como el servidor', () => {
    expect(salidaDeConsulta({ estado_antes_de_consulta: null }).destino).toBe('en_sala')
    expect(salidaDeConsulta({}).destino).toBe('en_sala')
  })
})
