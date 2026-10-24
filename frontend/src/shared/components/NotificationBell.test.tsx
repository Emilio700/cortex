/**
 * La campana: el número rojo cuenta lo que pide hacer algo, no cualquier aviso
 * sin leer (plan 27, §3.3). Lo informativo sin leer sólo pinta un punto.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const valor = vi.hoisted(() => ({ actual: {} as Record<string, unknown> }))
vi.mock('../avisos/AvisosContext', () => ({ useAvisos: () => valor.actual }))

import NotificationBell from './NotificationBell'

const montar = (porAtender: number, sinLeer: number) => {
  const abrirCentro = vi.fn()
  valor.actual = { porAtender, estado: { sin_leer: sinLeer }, abrirCentro, fallo: false }
  const vista = render(<NotificationBell />)
  return { abrirCentro, ...vista }
}

describe('NotificationBell', () => {
  it('el número rojo es lo que está por atender', () => {
    montar(2, 5)
    expect(screen.getByRole('button', { name: 'Avisos: 2 por atender' })).toHaveTextContent('2')
  })

  it('lo informativo sin leer no sube el número: sólo un punto', () => {
    const { container } = montar(0, 3)
    expect(screen.getByRole('button', { name: 'Avisos: 3 sin leer' })).not.toHaveTextContent('3')
    expect(container.querySelector('.campana-avisos__punto')).not.toBeNull()
  })

  it('abre el centro de avisos', () => {
    const { abrirCentro } = montar(0, 0)
    fireEvent.click(screen.getByRole('button', { name: 'Avisos' }))
    expect(abrirCentro).toHaveBeenCalled()
  })
})
