/**
 * «Origen del modelo»: lo que no se puede elegir dice por qué, lo que el
 * consultorio no usa no se pinta, y se maneja con el teclado.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import SelectorOrigen from './SelectorOrigen'

const todas = {
  esquematico: { disponible: true },
  radiografia: { disponible: false, motivo: 'Aún no hay medidas de radiografía de este paciente.' },
  tc: { disponible: true },
}

describe('SelectorOrigen', () => {
  it('es un grupo de radio con la opción elegida marcada', () => {
    render(<SelectorOrigen valor="esquematico" opciones={todas} alCambiar={vi.fn()} />)
    const grupo = screen.getByRole('radiogroup', { name: 'Origen del modelo' })
    expect(grupo).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Esquemático' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Tomografía del paciente' })).toHaveAttribute('aria-checked', 'false')
  })

  it('una opción sin modelo queda deshabilitada y dice por qué', () => {
    render(<SelectorOrigen valor="esquematico" opciones={todas} alCambiar={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Radiografía' })).toBeDisabled()
    expect(screen.getByText('Aún no hay medidas de radiografía de este paciente.')).toBeInTheDocument()
  })

  it('una opción que no llega (módulo apagado) no se pinta', () => {
    render(<SelectorOrigen valor="esquematico" opciones={{ esquematico: todas.esquematico, radiografia: todas.radiografia }} alCambiar={vi.fn()} />)
    expect(screen.queryByRole('radio', { name: 'Tomografía del paciente' })).toBeNull()
  })

  it('al elegir avisa; elegir la que ya está no hace nada', async () => {
    const alCambiar = vi.fn()
    render(<SelectorOrigen valor="esquematico" opciones={todas} alCambiar={alCambiar} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Esquemático' }))
    expect(alCambiar).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('radio', { name: 'Tomografía del paciente' }))
    expect(alCambiar).toHaveBeenCalledWith('tc')
  })

  it('las flechas saltan a la siguiente opción disponible', async () => {
    const alCambiar = vi.fn()
    render(<SelectorOrigen valor="esquematico" opciones={todas} alCambiar={alCambiar} />)
    screen.getByRole('radio', { name: 'Esquemático' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    // Radiografía está deshabilitada: se la salta.
    expect(alCambiar).toHaveBeenCalledWith('tc')
  })

  it('mientras carga no deja cambiar', () => {
    render(<SelectorOrigen valor="esquematico" opciones={todas} alCambiar={vi.fn()} ocupado />)
    expect(screen.getByRole('radio', { name: 'Tomografía del paciente' })).toBeDisabled()
  })
})
