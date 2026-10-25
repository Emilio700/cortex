import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import BarreraDeError from './BarreraDeError'

function Explota(): never {
  throw new Error('Falla simulada de la pantalla')
}

describe('BarreraDeError', () => {
  it('deja pasar la pantalla cuando todo va bien', () => {
    render(
      <BarreraDeError>
        <p>Expediente del paciente</p>
      </BarreraDeError>
    )
    expect(screen.getByText('Expediente del paciente')).toBeInTheDocument()
  })

  it('cuando una pantalla falla, lo dice en vez de dejar el sitio en blanco', () => {
    // React escribe el error en consola; en la prueba no interesa.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <BarreraDeError respaldo={{ etiqueta: 'Ir al inicio', ruta: '/' }}>
        <Explota />
      </BarreraDeError>
    )

    expect(screen.getByText('No se pudo mostrar esta pantalla')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ir al inicio' })).toBeInTheDocument()
    expect(screen.getByText('Falla simulada de la pantalla')).toBeInTheDocument()
    // El detalle técnico queda plegado: no asusta a quien usa el sistema.
    expect(screen.getByText('Detalle técnico para soporte')).toBeInTheDocument()

    consola.mockRestore()
  })

  it('sin respaldo no ofrece un botón que no lleva a ningún lado', () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <BarreraDeError>
        <Explota />
      </BarreraDeError>
    )

    expect(screen.queryByRole('button', { name: 'Ir al inicio' })).toBeNull()

    consola.mockRestore()
  })

  it('«volver a intentar» limpia el error y vuelve a dibujar', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const usuario = userEvent.setup()
    let debeFallar = true

    function Inestable() {
      if (debeFallar) throw new Error('Falla la primera vez')
      return <p>Ahora sí</p>
    }

    render(
      <BarreraDeError>
        <Inestable />
      </BarreraDeError>
    )
    expect(screen.getByText('No se pudo mostrar esta pantalla')).toBeInTheDocument()

    debeFallar = false
    await usuario.click(screen.getByRole('button', { name: 'Volver a intentar' }))

    expect(await screen.findByText('Ahora sí')).toBeInTheDocument()
    consola.mockRestore()
  })
})
