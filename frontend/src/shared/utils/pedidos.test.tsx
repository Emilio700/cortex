import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { pedir, tomar, useAtenderPedido } from './pedidos'

const Pantalla = ({ alPedir }: { alPedir: (fecha: string) => void }) => {
  useAtenderPedido('agenda:dia', ({ fecha }) => alPedir(fecha))
  return null
}

describe('pedidos de pantalla (plan 28)', () => {
  it('si la pantalla no está montada, lo toma al montarse y se consume', () => {
    expect(pedir('agenda:dia', { fecha: '2026-10-08' })).toBe(false)
    const alPedir = vi.fn()

    const { unmount } = render(<Pantalla alPedir={alPedir} />)
    expect(alPedir).toHaveBeenCalledWith('2026-10-08')
    unmount()

    // Volver a montarla no repite el pedido.
    const otra = vi.fn()
    render(<Pantalla alPedir={otra} />)
    expect(otra).not.toHaveBeenCalled()
  })

  it('si ya está montada, lo atiende al momento y quien pide lo sabe', () => {
    const alPedir = vi.fn()
    render(<Pantalla alPedir={alPedir} />)

    expect(pedir('agenda:dia', { fecha: '2026-10-09' })).toBe(true)
    expect(alPedir).toHaveBeenCalledWith('2026-10-09')
    expect(tomar('agenda:dia')).toBeNull()
  })

  it('un pedido de otra clave no le llega', () => {
    const alPedir = vi.fn()
    render(<Pantalla alPedir={alPedir} />)

    expect(pedir('pagos:registrar', true)).toBe(false)
    expect(alPedir).not.toHaveBeenCalled()
    expect(tomar('pagos:registrar')).toBe(true)
  })
})
