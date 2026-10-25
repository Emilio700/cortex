/**
 * La herramienta de marcado, con eventos de puntero simulados.
 *
 * jsdom no mide ni trae PointerEvent: el SVG se «mide» a 500 × 1000 px de
 * pantalla para una imagen de 1000 × 2000, así que un toque en (100, 200) de
 * pantalla es el píxel (200, 400) de la imagen.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MarcadorRadiografia from './MarcadorRadiografia'
import type { PasoDeMarcado } from '../dominio/marcadoRadiografia'

beforeAll(() => {
  // Sin PointerEvent, testing-library crea un Event sin coordenadas.
  if (!('PointerEvent' in window)) {
    // @ts-expect-error: un MouseEvent basta para clientX/clientY en las pruebas.
    window.PointerEvent = class extends MouseEvent {
      pointerId = 1
      pointerType: string
      constructor(tipo: string, init: PointerEventInit = {}) {
        super(tipo, init)
        this.pointerType = init.pointerType ?? 'touch'
      }
    }
  }
})

const PASO: PasoDeMarcado = { vista: 'lateral', clave: 'L1.sa', vertebra: 'L1', titulo: 'L1 · platillo superior, esquina anterior', ayuda: '' }

const montar = (extra: Partial<Parameters<typeof MarcadorRadiografia>[0]> = {}) => {
  const alColocar = vi.fn()
  const alColocarReferencia = vi.fn()
  render(
    <MarcadorRadiografia
      src="blob:placa"
      ancho={1000}
      alto={2000}
      vista="lateral"
      puntos={{}}
      pendiente={PASO}
      modo="marcar"
      referencia={[]}
      zoom={1}
      alColocar={alColocar}
      alColocarReferencia={alColocarReferencia}
      {...extra}
    />,
  )
  const svg = screen.getByRole('img')
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) })
  return { svg, alColocar, alColocarReferencia }
}

const tocar = (el: Element, x: number, y: number, hastaX = x, hastaY = y) => {
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerType: 'touch' })
  fireEvent.pointerMove(el, { clientX: hastaX, clientY: hastaY, pointerType: 'touch' })
  fireEvent.pointerUp(el, { clientX: hastaX, clientY: hastaY, pointerType: 'touch' })
}

beforeEach(() => vi.clearAllMocks())

describe('marcar sobre la radiografía', () => {
  it('dice qué punto toca marcar', () => {
    montar()
    expect(screen.getByRole('img', { name: /Toca para marcar: L1 · platillo superior, esquina anterior/ })).toBeInTheDocument()
  })

  it('al soltar el dedo coloca el punto que toca, en píxeles de la imagen', () => {
    const { svg, alColocar } = montar()
    tocar(svg, 100, 200)
    expect(alColocar).toHaveBeenCalledWith(null, { x: 200, y: 400 })
  })

  it('mientras el dedo no se levanta, el punto se afina (cuenta donde se suelta)', () => {
    const { svg, alColocar } = montar()
    tocar(svg, 100, 200, 103, 201)
    expect(alColocar).toHaveBeenCalledWith(null, { x: 206, y: 402 })
  })

  it('tocar cerca de un punto ya puesto lo arrastra en vez de poner otro', () => {
    const { svg, alColocar } = montar({ puntos: { 'T12.ip': { x: 200, y: 400 } } })
    tocar(svg, 104, 203, 120, 220)
    expect(alColocar).toHaveBeenCalledTimes(1)
    expect(alColocar).toHaveBeenCalledWith('T12.ip', { x: 240, y: 440 })
  })

  it('un toque sin arrastrar junto a un punto ya puesto pone el que toca (disco estrecho)', () => {
    const { svg, alColocar } = montar({ puntos: { 'T12.ip': { x: 200, y: 400 } } })
    tocar(svg, 104, 203)
    expect(alColocar).toHaveBeenCalledTimes(1)
    expect(alColocar).toHaveBeenCalledWith(null, { x: 208, y: 406 })
  })

  it('un toque rápido (bajar y soltar sin moverse) no se pierde', () => {
    const { svg, alColocar } = montar()
    fireEvent.pointerDown(svg, { clientX: 50, clientY: 60, pointerType: 'touch' })
    fireEvent.pointerUp(svg, { clientX: 50, clientY: 60, pointerType: 'touch' })
    expect(alColocar).toHaveBeenCalledWith(null, { x: 100, y: 120 })
  })

  it('en modo «Mover» el dedo no marca', () => {
    const { svg, alColocar } = montar({ modo: 'mover' })
    tocar(svg, 100, 200)
    expect(alColocar).not.toHaveBeenCalled()
  })

  it('el punto nuevo lo resuelve la pantalla con su estado más reciente (null = el que toca)', () => {
    const { svg, alColocar } = montar({ pendiente: null })
    tocar(svg, 100, 200)
    expect(alColocar).toHaveBeenCalledWith(null, { x: 200, y: 400 })
  })

  it('en la distancia conocida pone primero un extremo y luego el otro', () => {
    const { svg, alColocarReferencia } = montar({ modo: 'referencia', referencia: [{ x: 10, y: 10 }, null] })
    tocar(svg, 250, 500)
    expect(alColocarReferencia).toHaveBeenCalledWith(1, { x: 500, y: 1000 })
  })

  it('la lupa aparece mientras se apunta', () => {
    const { svg } = montar()
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 200, pointerType: 'touch' })
    expect(document.querySelector('.rx-marcador__lupa')).not.toBeNull()
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 200, pointerType: 'touch' })
    expect(document.querySelector('.rx-marcador__lupa')).toBeNull()
  })

  it('dibuja los platillos con sus dos esquinas y el nombre de la vértebra', () => {
    montar({ puntos: { 'L1.sa': { x: 10, y: 10 }, 'L1.sp': { x: 60, y: 12 } } })
    expect(document.querySelectorAll('.rx-marcador__platillo')).toHaveLength(1)
    expect(screen.getByText('L1')).toBeInTheDocument()
  })
})
