/**
 * Paridad con el servidor.
 *
 * `paridad.json` es el contrato entre las dos implementaciones del cálculo: la
 * de aquí, que sugiere el puntaje mientras se llena, y la de
 * `backend/app/services/escalas.py`, que es la que se guarda. pytest lee el
 * mismo archivo (`test_escalas_paridad.py`). Si cambias una escala aquí y no
 * allá —o al revés— falla una de las dos suites.
 *
 * Para regenerarlo: `npx vite-node src/modules/escalas/dominio/generarParidad.ts`.
 */
import { describe, expect, it } from 'vitest'
import paridad from './paridad.json'
import { ESCALAS, escalaPorId } from './catalogo'
import { calcular, estructura, validar } from './motor'
import type { Respuestas } from './tipos'

describe('paridad con el servidor', () => {
  it('la estructura de cada escala es la del archivo compartido', () => {
    expect(JSON.parse(JSON.stringify(ESCALAS.map(estructura)))).toEqual(paridad.estructura)
  })

  for (const caso of paridad.casos) {
    it(`${caso.escala}: ${caso.nota}`, () => {
      const r = calcular(escalaPorId(caso.escala)!, caso.respuestas as Respuestas)
      expect({
        puntaje: r.puntaje,
        interpretacion: r.interpretacion,
        tono: r.tono,
        detalle: r.detalle,
        avisos: r.avisos,
      }).toEqual(caso.esperado)
    })
  }

  for (const caso of paridad.invalidos) {
    it(`${caso.escala} inválida: ${caso.nota}`, () => {
      expect(validar(escalaPorId(caso.escala)!, caso.respuestas as Respuestas)).toEqual(caso.errores)
    })
  }
})
