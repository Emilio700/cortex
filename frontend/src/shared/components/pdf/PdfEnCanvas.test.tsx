/**
 * Dibujo de las páginas del PDF (plan 26, R6).
 *
 * Lo que no puede pasar: dibujar a un ancho inventado cuando el contenedor
 * todavía mide 0, ni dejar dos dibujos peleándose por el mismo canvas.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dibujos = vi.hoisted(() => ({
  pedidos: [] as number[],
  cancelados: [] as number[],
}))

vi.mock('./renderizarPdf', () => ({
  abrirPdf: vi.fn(async () => ({
    paginas: 1,
    dibujar: (_n: number, _c: HTMLCanvasElement, ancho: number) => {
      dibujos.pedidos.push(ancho)
      return { listo: new Promise<void>(() => {}), cancelar: () => dibujos.cancelados.push(ancho) }
    },
    cerrar: () => {},
  })),
  esCancelacion: () => false,
}))

import PdfEnCanvas from './PdfEnCanvas'

let ancho = 0
let avisar: (() => void) | null = null
const anchoOriginal = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

beforeEach(() => {
  dibujos.pedidos = []
  dibujos.cancelados = []
  ancho = 0
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => ancho })
  ;(globalThis as any).ResizeObserver = class {
    constructor(cb: () => void) {
      avisar = cb
    }
    observe() {}
    disconnect() {}
  }
})

afterEach(() => {
  if (anchoOriginal) Object.defineProperty(HTMLElement.prototype, 'clientWidth', anchoOriginal)
  delete (globalThis as any).ResizeObserver
})

describe('PdfEnCanvas', () => {
  it('con el contenedor en 0 no dibuja; al tener medida, dibuja a ese ancho', async () => {
    render(<PdfEnCanvas pdf={new Blob(['%PDF'])} titulo="Orden" />)
    await screen.findByRole('img', { name: 'Página 1 de 1' })
    expect(dibujos.pedidos).toEqual([])

    ancho = 376
    act(() => avisar?.())
    await waitFor(() => expect(dibujos.pedidos).toEqual([360]))
  })

  it('al cambiar de ancho cancela el dibujo en curso antes de empezar otro', async () => {
    ancho = 616
    render(<PdfEnCanvas pdf={new Blob(['%PDF'])} titulo="Orden" />)
    await waitFor(() => expect(dibujos.pedidos).toEqual([600]))

    ancho = 376
    act(() => avisar?.())
    await waitFor(() => expect(dibujos.pedidos).toEqual([600, 360]))
    expect(dibujos.cancelados).toEqual([600])
  })
})
