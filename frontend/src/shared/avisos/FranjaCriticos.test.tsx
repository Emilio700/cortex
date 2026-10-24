/**
 * La franja de críticos (plan 27, Fase 3): se quita sólo cuando el servidor
 * ya no trae el resultado (la incidencia se cerró), un fallo se dice, y
 * posponer la oculta 15 minutos salvo que llegue un crítico nuevo.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CriticosAbiertos } from './AvisosContext'

const valor = vi.hoisted(() => ({ actual: {} as Record<string, unknown> }))
vi.mock('./AvisosContext', () => ({ useAvisos: () => valor.actual }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, role: 'doctor' } }) }))

import FranjaCriticos from './FranjaCriticos'

const critico = (id: number) => ({ result_id: id, order_id: id, patient_name: 'Ana', study_name: 'Biometría' })
const ok = (...ids: number[]): CriticosAbiertos => ({ estado: 'ok', items: ids.map(critico), total: ids.length })

const montar = (criticos: CriticosAbiertos | null) => {
  valor.actual = { criticos, refrescar: vi.fn(async () => undefined) }
  return render(
    <MemoryRouter>
      <FranjaCriticos />
    </MemoryRouter>,
  )
}

describe('FranjaCriticos', () => {
  beforeEach(() => localStorage.clear())

  it('dice cuántos críticos hay sin cerrar y no lleva el nombre de la paciente', () => {
    montar(ok(1, 2))
    const franja = screen.getByTestId('franja-criticos')
    expect(franja).toHaveTextContent('2 resultados críticos sin cerrar')
    expect(franja).not.toHaveTextContent('Ana')
  })

  it('se quita sólo cuando el servidor ya no trae el resultado', () => {
    const { rerender } = montar(ok(1))
    expect(screen.getByTestId('franja-criticos')).toBeInTheDocument()

    valor.actual = { criticos: ok(), refrescar: vi.fn() }
    rerender(
      <MemoryRouter>
        <FranjaCriticos />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('franja-criticos')).not.toBeInTheDocument()
  })

  it('un fallo se dice, nunca se muestra como «sin críticos»', () => {
    montar({ estado: 'fallo' })
    expect(screen.getByTestId('franja-criticos')).toHaveTextContent('No se pudo consultar')
  })

  it('posponer la oculta, pero un crítico nuevo la vuelve a mostrar', () => {
    const { rerender } = montar(ok(1))
    fireEvent.click(screen.getByRole('button', { name: 'Posponer 15 minutos' }))
    expect(screen.queryByTestId('franja-criticos')).not.toBeInTheDocument()

    valor.actual = { criticos: ok(1, 2), refrescar: vi.fn() }
    rerender(
      <MemoryRouter>
        <FranjaCriticos />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('franja-criticos')).toBeInTheDocument()
  })

  it('a quien no le aplica no le pinta nada', () => {
    const { container } = montar(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('en el inicio de la doctora no se repite: ahí ya está la tarjeta', () => {
    valor.actual = { criticos: ok(1), refrescar: vi.fn() }
    const { rerender } = render(
      <MemoryRouter initialEntries={['/doctor/dashboard']}>
        <FranjaCriticos />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('franja-criticos')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter initialEntries={['/doctor/results']} key="otra">
        <FranjaCriticos />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('franja-criticos')).toBeInTheDocument()
  })
})
