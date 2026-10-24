/**
 * En el celular, tres emergentes apilados tapaban media pantalla: a la vista
 * queda uno y el resto se resume en «y N más» (revisión de la Fase 0).
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AvisosEmergentes, { type AvisoEmergente } from './AvisosEmergentes'

const avisos: AvisoEmergente[] = [1, 2, 3, 4].map((i) => ({
  clave: `a${i}`,
  titulo: `Aviso ${i}`,
  mensaje: 'm',
  cerrar: vi.fn(),
}))

const conAncho = (celular: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: celular, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

describe('AvisosEmergentes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('en la computadora muestra tres y resume el resto', () => {
    conAncho(false)
    render(<AvisosEmergentes avisos={avisos} alVerTodos={vi.fn()} />)
    expect(screen.getAllByTestId('aviso-emergente')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'y 1 aviso más por atender' })).toBeInTheDocument()
  })

  it('en el celular muestra uno solo', () => {
    conAncho(true)
    render(<AvisosEmergentes avisos={avisos} alVerTodos={vi.fn()} />)
    expect(screen.getAllByTestId('aviso-emergente')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'y 3 avisos más por atender' })).toBeInTheDocument()
  })
})
