/** Signos vitales en el teléfono (plan 29, lote 8) y errores junto al campo. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createTriage, updateTriage } = vi.hoisted(() => ({
  createTriage: vi.fn(),
  updateTriage: vi.fn(),
}))
vi.mock('../hooks/useTriage', () => ({ useTriage: () => ({ createTriage, updateTriage }) }))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))

import { TriageForm } from './TriageForm'

afterEach(() => vi.restoreAllMocks())

const montar = (onClose = vi.fn()) => {
  render(<TriageForm visible onClose={onClose} onSaved={vi.fn()} appointmentId={1} />)
  return onClose
}

describe('TriageForm', () => {
  it('teclado numérico: decimal para peso, talla y temperatura; numérico para la presión', () => {
    montar()
    expect(screen.getByLabelText('Peso (kg)')).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByLabelText('Temperatura (°C)')).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByLabelText('Presión sistólica (mmHg)')).toHaveAttribute('inputmode', 'numeric')
  })

  it('con datos capturados, «Cancelar» pregunta antes de descartar', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onClose = montar()

    // La foto de «cómo se abrió» se toma un instante después de abrir.
    await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '64' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(confirmar).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('sin cambios cierra sin preguntar', () => {
    const confirmar = vi.spyOn(window, 'confirm')
    const onClose = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(confirmar).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TriageForm · errores junto al campo', () => {
  beforeEach(() => {
    createTriage.mockReset().mockResolvedValue(undefined)
    updateTriage.mockReset().mockResolvedValue(undefined)
  })

  it('un peso fuera de rango se avisa junto al campo y no se llama al servidor', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Triage' }))

    expect(screen.getByText('El peso debe ser mayor que 0 y máximo 300 kg.')).toBeInTheDocument()
    expect(createTriage).not.toHaveBeenCalled()
  })

  it('el aviso se quita al corregir el campo', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Triage' }))
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '64.5' } })

    expect(screen.queryByText('El peso debe ser mayor que 0 y máximo 300 kg.')).not.toBeInTheDocument()
  })

  it('la temperatura también se cuida junto al campo', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Temperatura (°C)'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Triage' }))

    expect(screen.getByText('La temperatura debe estar entre 30 y 45 °C.')).toBeInTheDocument()
    expect(createTriage).not.toHaveBeenCalled()
  })

  it('sin signos se puede guardar: siguen siendo opcionales', async () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Triage' }))

    await waitFor(() => expect(createTriage).toHaveBeenCalled())
    expect(createTriage.mock.calls[0][0]).toMatchObject({ appointment_id: 1 })
  })
})
