/**
 * La consulta express no puede verse como una consulta agendada.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { InsigniaExpress } from './InsigniaExpress'

describe('InsigniaExpress', () => {
  it('marca la consulta express con su origen', () => {
    render(<InsigniaExpress cita={{ origen: 'express' }} />)
    expect(screen.getByText('Express · registrada al cobrar')).toBeInTheDocument()
  })

  it('en el calendario usa el texto corto pero anuncia el completo', () => {
    render(<InsigniaExpress cita={{ origen: 'express' }} compacta />)
    expect(screen.getByText('Express')).toHaveAttribute('aria-label', 'Express · registrada al cobrar')
  })

  it('una cita agendada, o de un servidor que no manda el origen, no lleva marca', () => {
    const { container } = render(
      <>
        <InsigniaExpress cita={{ origen: 'agenda' }} />
        <InsigniaExpress cita={{}} />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
