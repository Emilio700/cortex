/**
 * Guardia de la regla global de movimiento (plan 29, T-7): que siga
 * existiendo para el sistema y para la clase `.reduce-motion`, y que ninguna
 * microinteracción de este archivo dure más de 200 ms.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Se leen del disco: el transformador de estilos de vitest las deja vacías.
const leer = (nombre: string) => readFileSync(fileURLToPath(new URL(nombre, import.meta.url)), 'utf-8')
const fuente = leer('./_movimiento.scss')
const estilo = leer('./style.scss')

describe('movimiento', () => {
  it('apaga transiciones y animaciones con prefers-reduced-motion y con .reduce-motion', () => {
    expect(fuente).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*@include sin-movimiento/)
    expect(fuente).toMatch(/\.reduce-motion\s*\{\s*@include sin-movimiento/)
    expect(fuente).toMatch(/transition-duration: 0\.01ms !important/)
    expect(fuente).toMatch(/animation-duration: 0\.01ms !important/)
  })

  it('se carga en la hoja principal', () => {
    expect(estilo).toContain('@use "movimiento"')
  })

  it('ninguna duración pasa de 200 ms', () => {
    const duraciones = [...fuente.matchAll(/(\d+(?:\.\d+)?)ms/g)].map((m) => Number(m[1]))
    expect(duraciones.length).toBeGreaterThan(0)
    expect(Math.max(...duraciones)).toBeLessThanOrEqual(200)
  })
})
