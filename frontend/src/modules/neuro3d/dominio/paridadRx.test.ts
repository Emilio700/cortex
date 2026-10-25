/**
 * Paridad con el servidor.
 *
 * `paridadRx.json` es el contrato entre las dos implementaciones de las
 * mediciones de radiografía: la de aquí, que sugiere los ángulos mientras se
 * marca, y la de `backend/app/services/columna_rx.py`, que es la que se guarda.
 * pytest lee el mismo archivo (`test_columna_rx_paridad.py`).
 *
 * Para regenerarlo: `npx vite-node src/modules/neuro3d/dominio/generarParidadRx.ts`.
 */
import { describe, expect, it } from 'vitest'
import paridad from './paridadRx.json'
import { calcularRx, OPCIONES_POR_OMISION, VERSION_CALCULO_RX, type CalibracionesRx, type MarcasRx, type OpcionesRx } from './ajusteRadiografico'

describe('paridad de las mediciones de radiografía', () => {
  it('el archivo es de esta versión del cálculo', () => {
    expect(paridad.version).toBe(VERSION_CALCULO_RX)
  })

  for (const caso of paridad.casos) {
    it(caso.nota, () => {
      const r = calcularRx(
        caso.marcas as MarcasRx,
        caso.calibraciones as CalibracionesRx,
        (caso.opciones as OpcionesRx | null) ?? OPCIONES_POR_OMISION,
      )
      expect(JSON.parse(JSON.stringify(r))).toEqual(caso.esperado)
    })
  }
})
