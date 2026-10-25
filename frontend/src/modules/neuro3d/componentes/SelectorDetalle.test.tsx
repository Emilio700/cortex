import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { COMO_INSTALAR_ATLAS, MOTIVO_SIN_ATLAS, MOTIVO_SOLO_ESQUEMATICO } from '../dominio/atlasDetallado'
import SelectorDetalle from './SelectorDetalle'

const disponible = { simplificado: { disponible: true }, atlas: { disponible: true } }

describe('SelectorDetalle', () => {
  it('es un grupo de radio «Modelo» con la opción que se ve marcada', () => {
    render(<SelectorDetalle valor="simplificado" opciones={disponible} alCambiar={() => {}} progreso={null} />)
    expect(screen.getByRole('radiogroup', { name: 'Modelo' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Simplificado' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Atlas detallado' })).toHaveAttribute('aria-checked', 'false')
  })

  it('al elegir el atlas avisa; elegir el que ya está no hace nada', async () => {
    const alCambiar = vi.fn()
    render(<SelectorDetalle valor="simplificado" opciones={disponible} alCambiar={alCambiar} progreso={null} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Simplificado' }))
    expect(alCambiar).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('radio', { name: 'Atlas detallado' }))
    expect(alCambiar).toHaveBeenCalledWith('atlas')
  })

  it('sin atlas instalado la opción sale deshabilitada, dice por qué y cómo instalarlo', () => {
    render(
      <SelectorDetalle
        valor="simplificado"
        opciones={{ simplificado: { disponible: true }, atlas: { disponible: false, motivo: MOTIVO_SIN_ATLAS } }}
        alCambiar={() => {}}
        progreso={null}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Atlas detallado' })).toBeDisabled()
    expect(screen.getByText(MOTIVO_SIN_ATLAS)).toBeInTheDocument()
    expect(screen.getByText(COMO_INSTALAR_ATLAS)).toBeInTheDocument()
  })

  it('con otro origen dice que el atlas es sólo para el esquemático (sin pasos de instalación)', () => {
    render(
      <SelectorDetalle
        valor="simplificado"
        opciones={{ simplificado: { disponible: true }, atlas: { disponible: false, motivo: MOTIVO_SOLO_ESQUEMATICO } }}
        alCambiar={() => {}}
        progreso={null}
      />,
    )
    expect(screen.getByText(MOTIVO_SOLO_ESQUEMATICO)).toBeInTheDocument()
    expect(screen.queryByText(COMO_INSTALAR_ATLAS)).not.toBeInTheDocument()
  })

  it('mientras se descarga, muestra el avance y no acepta otro cambio', () => {
    render(<SelectorDetalle valor="simplificado" opciones={disponible} alCambiar={() => {}} progreso={0.42} />)
    expect(screen.getByRole('status')).toHaveTextContent('Descargando el atlas detallado… 42 %')
    expect(screen.getByRole('radio', { name: 'Atlas detallado' })).toBeDisabled()
  })
})
