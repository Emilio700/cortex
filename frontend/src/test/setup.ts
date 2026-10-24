/**
 * Vitest global setup: extends `expect` with jest-dom matchers and clears
 * localStorage between tests so session-based tests stay isolated.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Margen para que se disparen los temporizadores de CoreUI.
 *
 * `CModal` programa un `setTimeout` interno para su animación de cierre. Si la
 * prueba termina antes, ese temporizador salta cuando el entorno ya se
 * desmontó y revienta con `window is not defined`. Eso hacía fallar pruebas
 * de forma intermitente —alrededor de una de cada cinco corridas— según si el
 * reloj ganaba la carrera o no.
 *
 * Esperar aquí deja que se disparen mientras `window` todavía existe. Es más
 * lento que no hacer nada, pero una prueba que falla a veces no sirve de nada.
 */
const MARGEN_TEMPORIZADORES_MS = 200

afterEach(async () => {
  cleanup()
  localStorage.clear()
  await new Promise((resolver) => setTimeout(resolver, MARGEN_TEMPORIZADORES_MS))
})

/**
 * pdf.js no corre en jsdom (no hay canvas ni worker). Las pruebas no revisan
 * los píxeles del PDF sino que el visor lo muestre: se sustituye por un doble
 * que dice que el PDF tiene una página y no dibuja nada (plan 26, N5).
 */
vi.mock('../shared/components/pdf/renderizarPdf', () => ({
  abrirPdf: vi.fn(async () => ({
    paginas: 1,
    dibujar: () => ({ listo: Promise.resolve(), cancelar: () => {} }),
    cerrar: () => {},
  })),
  esCancelacion: () => false,
}))
