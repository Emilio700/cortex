import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SenalesNeuroquirurgicas from './SenalesNeuroquirurgicas'

describe('SenalesNeuroquirurgicas', () => {
  it('muestra los implantes y los anticoagulantes registrados', () => {
    render(<SenalesNeuroquirurgicas paciente={{ implanted_devices: 'VÁLVULA VP', anticoagulants: 'CLOPIDOGREL' }} />)
    expect(screen.getByText(/Implantes: VÁLVULA VP/)).toBeInTheDocument()
    expect(screen.getByText(/Anticoagulantes: CLOPIDOGREL/)).toBeInTheDocument()
  })

  it('sin nada registrado no pinta nada: vacío no quiere decir «no tiene»', () => {
    const { container } = render(<SenalesNeuroquirurgicas paciente={{ implanted_devices: '  ', anticoagulants: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
