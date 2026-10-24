import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCierreSeguro } from './useCierreSeguro'

const Prueba = ({ sucio, onClose }: { sucio: boolean; onClose: () => void }) => {
  const { propsModal, pedirCierre } = useCierreSeguro({ visible: true, sucio, onClose })
  return (
    <div>
      <div className="modal show" data-testid="fondo" />
      <span data-testid="props">{JSON.stringify(propsModal)}</span>
      <button type="button" onClick={pedirCierre}>
        Cancelar
      </button>
    </div>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('useCierreSeguro (plan 29, lote 8)', () => {
  it('sin cambios cierra sin preguntar y el modal se comporta como siempre', () => {
    const onClose = vi.fn()
    const confirmar = vi.spyOn(window, 'confirm')
    render(<Prueba sucio={false} onClose={onClose} />)

    expect(JSON.parse(screen.getByTestId('props').textContent!)).toEqual({ backdrop: true, keyboard: true })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
    expect(confirmar).not.toHaveBeenCalled()
  })

  it('con cambios, Esc, el fondo y Cancelar preguntan; si no se confirma, no cierra', () => {
    const onClose = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Prueba sucio onClose={onClose} />)

    expect(JSON.parse(screen.getByTestId('props').textContent!)).toEqual({ backdrop: 'static', keyboard: false })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseUp(screen.getByTestId('fondo'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(window.confirm).toHaveBeenCalledTimes(3)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('con cambios y confirmando, cierra', () => {
    const onClose = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Prueba sucio onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

import { act } from '@testing-library/react'
import { useState } from 'react'
import { useCambiosDesdeQueAbrio } from './useCierreSeguro'

const ConCarga = () => {
  const [visible, setVisible] = useState(false)
  const [valor, setValor] = useState('viejo')
  const sucio = useCambiosDesdeQueAbrio(visible, valor)
  return (
    <div>
      <button type="button" onClick={() => { setVisible(true); setValor('cargado') }}>abrir</button>
      <button type="button" onClick={() => setValor('editado')}>editar</button>
      <span data-testid="sucio">{String(sucio)}</span>
    </div>
  )
}

describe('useCambiosDesdeQueAbrio', () => {
  it('toma la foto con los datos ya cargados, no con los de antes de abrir', async () => {
    render(<ConCarga />)
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }))
    await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
    expect(screen.getByTestId('sucio')).toHaveTextContent('false')

    fireEvent.click(screen.getByRole('button', { name: 'editar' }))
    expect(screen.getByTestId('sucio')).toHaveTextContent('true')
  })
})
