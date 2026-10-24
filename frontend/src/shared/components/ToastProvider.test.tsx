/**
 * Cuando dos avisos llegaban en la misma vuelta del sondeo sólo se veía el
 * último: el proveedor guardaba un solo mensaje y React juntaba los cambios
 * (plan 27, F-2). Recepción pasaba a dos pacientes a sala y la doctora se
 * enteraba de una.
 */
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToastProvider, useToast } from './ToastProvider'

let api: ReturnType<typeof useToast> | null = null

const Captura = () => {
  api = useToast()
  return null
}

describe('ToastProvider', () => {
  it('muestra todos los mensajes empujados en el mismo ciclo, no sólo el último', async () => {
    render(
      <ToastProvider>
        <Captura />
      </ToastProvider>,
    )

    act(() => {
      api!.showToast('Rosa Pérez está en sala.')
      api!.showToast('Ana López está en sala.')
      api!.showSuccess('Guardado correctamente.')
    })

    expect(await screen.findByText('Rosa Pérez está en sala.')).toBeInTheDocument()
    expect(screen.getByText('Ana López está en sala.')).toBeInTheDocument()
    expect(screen.getByText('Guardado correctamente.')).toBeInTheDocument()
  })
})
