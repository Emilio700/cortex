/**
 * Fichas incompletas, sutil (plan 32, punto 5): una línea gris descartable que
 * nunca bloquea.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AvisoCompletarFicha } from './AvisoCompletarFicha'
import { avisoDeFicha, faltantesDeFicha } from '../utils/fichaIncompleta'

beforeEach(() => sessionStorage.clear())

describe('faltantesDeFicha', () => {
  it('sin fecha de nacimiento la ficha está incompleta', () => {
    expect(faltantesDeFicha({ date_of_birth: null })).toEqual(['fecha de nacimiento'])
    expect(avisoDeFicha({ date_of_birth: null })).toBe('Ficha incompleta: falta fecha de nacimiento')
  })

  it('con fecha de nacimiento no falta nada', () => {
    expect(faltantesDeFicha({ date_of_birth: '1990-01-01' })).toEqual([])
    expect(avisoDeFicha({ date_of_birth: '1990-01-01' })).toBeNull()
  })
})

describe('AvisoCompletarFicha', () => {
  it('dice qué falta y se descarta para esa paciente', () => {
    const { unmount } = render(<AvisoCompletarFicha paciente={{ id: 5, date_of_birth: null }} />)
    expect(screen.getByText(/Completa sus datos/)).toHaveTextContent('falta fecha de nacimiento')

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar el aviso de datos incompletos' }))
    expect(screen.queryByText(/Completa sus datos/)).toBeNull()

    // Descartada en esta sesión: al volver a la consulta no reaparece.
    unmount()
    render(<AvisoCompletarFicha paciente={{ id: 5, date_of_birth: null }} />)
    expect(screen.queryByText(/Completa sus datos/)).toBeNull()
  })

  it('con la ficha completa no se dibuja nada', () => {
    const { container } = render(<AvisoCompletarFicha paciente={{ id: 6, date_of_birth: '1990-01-01' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('«Completa sus datos» abre el formulario si la pantalla lo ofrece', () => {
    const completar = vi.fn()
    render(<AvisoCompletarFicha paciente={{ id: 7, date_of_birth: null }} onCompletar={completar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Completa sus datos' }))
    expect(completar).toHaveBeenCalled()
  })
})
