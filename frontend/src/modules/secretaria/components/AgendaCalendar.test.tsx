/**
 * Accesibilidad del calendario (paso axe): los chevrones de FullCalendar
 * salen con role="img" y sin nombre. El botón que los lleva ya se anuncia
 * solo, así que los iconos deben quedar fuera del árbol accesible; sin esto,
 * axe marca dos imágenes sin descripción por cada barra.
 */
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AgendaCalendar } from './AgendaCalendar'

describe('AgendaCalendar · accesibilidad de los iconos', () => {
  it('los chevrones quedan ocultos para el lector (no son imágenes sueltas)', async () => {
    const { container } = render(
      <AgendaCalendar appointments={[]} onEventClick={vi.fn()} onDateSelect={vi.fn()} />,
    )

    // El calendario los pinta: si dejara de pintarlos, la prueba falla en vez
    // de quedar como una garantía vacía.
    await waitFor(() => {
      expect(container.querySelectorAll('.fc-icon[role="img"]').length).toBeGreaterThan(0)
    })

    container.querySelectorAll('.fc-icon[role="img"]').forEach((icono) => {
      expect(icono.getAttribute('aria-hidden')).toBe('true')
    })
  })
})
