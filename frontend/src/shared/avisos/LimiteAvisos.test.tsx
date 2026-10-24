/**
 * Si una pieza de los avisos revienta al pintarse, se apaga sólo ella: el
 * resto de la pantalla sigue.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { conLimite } from './LimiteAvisos'

describe('conLimite', () => {
  it('un error al pintar se queda en esa pieza', () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Revienta = () => {
      throw new Error('dato inesperado')
    }
    const Protegida = conLimite(Revienta, 'la prueba')

    render(
      <div>
        <Protegida />
        <span>La consulta sigue aquí</span>
      </div>,
    )

    expect(screen.getByText('La consulta sigue aquí')).toBeInTheDocument()
    espia.mockRestore()
  })
})
