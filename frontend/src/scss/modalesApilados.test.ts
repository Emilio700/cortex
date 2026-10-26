/**
 * Guardia de las ventanas apiladas: el fondo de la segunda ventana tiene que
 * quedar por encima de la primera (y su ventana por encima de ese fondo), o la
 * ventana de abajo se ve clara y «encimada», como el triage sobre la cita.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Se leen del disco: el transformador de estilos de vitest las deja vacías.
// Con la ruta en una variable: Vite trata `new URL('./x', import.meta.url)` literal como un recurso.
const leer = (nombre: string) => readFileSync(fileURLToPath(new URL(nombre, import.meta.url)), 'utf-8')
const fuente = leer('./_cortex.scss')

// Busca la línea exacta del selector (no un trozo de otro) y lee su z-index.
const zDe = (selector: string): number => {
  const lineas = fuente.split(/\r?\n/)
  const i = lineas.findIndex((linea) => linea.trim() === `${selector} {`)
  expect(i, `falta la regla ${selector}`).toBeGreaterThanOrEqual(0)
  const z = lineas[i + 1]?.match(/z-index:\s*(\d+)/)
  expect(z, `la regla ${selector} no empieza con z-index`).not.toBeNull()
  return Number(z![1])
}

describe('ventanas apiladas', () => {
  it('cada nivel sube su fondo y su ventana por encima del nivel anterior', () => {
    const base = { fondo: 1050, ventana: 1055 } // Bootstrap
    const nivel2 = { fondo: zDe('.modal-backdrop ~ .modal-backdrop'), ventana: zDe('.modal ~ .modal') }
    const nivel3 = {
      fondo: zDe('.modal-backdrop ~ .modal-backdrop ~ .modal-backdrop'),
      ventana: zDe('.modal ~ .modal ~ .modal'),
    }

    expect(base.fondo).toBeLessThan(base.ventana)
    expect(nivel2.fondo).toBeGreaterThan(base.ventana)
    expect(nivel2.ventana).toBeGreaterThan(nivel2.fondo)
    expect(nivel3.fondo).toBeGreaterThan(nivel2.ventana)
    expect(nivel3.ventana).toBeGreaterThan(nivel3.fondo)
  })
})
