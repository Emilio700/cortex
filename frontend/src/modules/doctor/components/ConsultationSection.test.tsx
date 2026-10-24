import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ConsultationSection from './ConsultationSection'

const renderSection = () =>
  render(
    <ConsultationSection
      step={3}
      title="Plan clínico"
      subtitle="Órdenes de estudios, vacunas y seguimiento de medicamentos."
      summary={<span>2 en esta consulta</span>}
    >
      <div>CONTENIDO DEL PLAN</div>
    </ConsultationSection>,
  )

const collapseOf = (text: string) => screen.getByText(text).closest('.collapse')

describe('ConsultationSection', () => {
  it('arranca cerrada', () => {
    renderSection()
    expect(screen.getByRole('button', { name: /Plan clínico/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(collapseOf('CONTENIDO DEL PLAN')).not.toHaveClass('show')
  })

  it('mantiene el contenido montado aunque esté cerrada, para no perder sus cargas', () => {
    renderSection()
    expect(screen.getByText('CONTENIDO DEL PLAN')).toBeInTheDocument()
  })

  it('muestra el aviso de contenido registrado aunque esté cerrada', () => {
    renderSection()
    expect(screen.getByText('2 en esta consulta')).toBeInTheDocument()
  })

  it('despliega el contenido al pulsar el encabezado', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByRole('button', { name: /Plan clínico/ }))
    expect(screen.getByRole('button', { name: /Plan clínico/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await waitFor(() => expect(collapseOf('CONTENIDO DEL PLAN')).toHaveClass('show'))
  })

  it('despliega el contenido con el interruptor', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByRole('checkbox', { name: /Plan clínico/ }))
    await waitFor(() => expect(collapseOf('CONTENIDO DEL PLAN')).toHaveClass('show'))
  })

  it('se puede señalar en los tutoriales aunque quien la usa no le dé un id', () => {
    // Los recorridos de la consulta apuntan a este id; si el título cambia de
    // forma, el paso se salta en vez de romperse, pero conviene saberlo aquí.
    const { container } = renderSection()
    expect(container.querySelector('[data-tour="consulta-seccion-plan-clinico"]')).not.toBeNull()
  })
})
