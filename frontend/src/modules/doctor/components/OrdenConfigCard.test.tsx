/**
 * «Mi orden de estudio» en el perfil (plan 26, D-7).
 *
 * Lo que importa: la vista previa es el PDF del servidor con lo que hay en
 * pantalla (sin guardar), y al guardar se manda el objeto completo.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({
  apiClient: { post, get },
  default: { post, get },
}))

import OrdenConfigCard from './OrdenConfigCard'
import { AJUSTES_ORDEN_POR_DEFECTO } from '../utils/ajustesOrden'

beforeEach(() => {
  post.mockReset()
  get.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

describe('OrdenConfigCard', () => {
  it('arranca con lo guardado', () => {
    render(
      <OrdenConfigCard
        guardados={{
          ...AJUSTES_ORDEN_POR_DEFECTO,
          modo_impresion: 'una_hoja',
          mostrar_firma: false,
        }}
        onGuardar={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Cómo se imprime cuando hay varios estudios')).toHaveValue(
      'una_hoja',
    )
    expect(screen.getByLabelText('Imagen de tu firma')).not.toBeChecked()
  })

  it('la vista previa pide el PDF real con los ajustes aún sin guardar', async () => {
    post.mockResolvedValue({ data: new Blob(['%PDF']) })
    const user = userEvent.setup()
    render(<OrdenConfigCard guardados={AJUSTES_ORDEN_POR_DEFECTO} onGuardar={vi.fn()} />)

    await user.click(screen.getByLabelText('Prioridad'))
    await user.selectOptions(
      screen.getByLabelText('Cómo se imprime cuando hay varios estudios'),
      'una_hoja',
    )
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }))

    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    expect(post).toHaveBeenCalledWith(
      '/doctor-profile/me/order-preview',
      {
        order_settings: {
          ...AJUSTES_ORDEN_POR_DEFECTO,
          mostrar_prioridad: false,
          modo_impresion: 'una_hoja',
        },
        modo: 'una_hoja',
      },
      { responseType: 'blob' },
    )
  })

  it('si la vista previa falla lo dice, sin hoja en blanco', async () => {
    post.mockRejectedValue({ message: 'Network Error', request: {} })
    const user = userEvent.setup()
    render(<OrdenConfigCard guardados={AJUSTES_ORDEN_POR_DEFECTO} onGuardar={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo conectar/)
  })

  it('guardar manda el objeto completo y avisa solo si se guardó', async () => {
    const onGuardar = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<OrdenConfigCard guardados={AJUSTES_ORDEN_POR_DEFECTO} onGuardar={onGuardar} />)

    await user.type(screen.getByLabelText('Leyenda adicional del pie'), '  Traer la orden impresa  ')
    await user.click(screen.getByRole('button', { name: 'Guardar configuración de la orden' }))

    expect(onGuardar).toHaveBeenCalledWith({
      ...AJUSTES_ORDEN_POR_DEFECTO,
      leyenda_pie: 'Traer la orden impresa',
    })
    expect(await screen.findByText(/Configuración de la orden guardada/)).toBeInTheDocument()
  })

  it('si no se guardó, no dice que sí', async () => {
    const user = userEvent.setup()
    render(
      <OrdenConfigCard
        guardados={AJUSTES_ORDEN_POR_DEFECTO}
        onGuardar={vi.fn().mockResolvedValue(false)}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Guardar configuración de la orden' }))
    expect(
      await screen.findByText('No fue posible guardar la configuración de la orden.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Configuración de la orden guardada/)).toBeNull()
  })

  it('«Copiar de mi receta» trae lo de la receta sin guardarlo', async () => {
    get.mockResolvedValue({
      data: {
        ...AJUSTES_ORDEN_POR_DEFECTO,
        nombre_impreso: 'Dra. Ana Ruiz',
        mostrar_especialidad: false,
        color_acento: '#0055AA',
      },
    })
    const onGuardar = vi.fn()
    const user = userEvent.setup()
    render(<OrdenConfigCard guardados={AJUSTES_ORDEN_POR_DEFECTO} onGuardar={onGuardar} />)

    await user.click(screen.getByRole('button', { name: 'Copiar de mi receta' }))

    expect(get).toHaveBeenCalledWith('/doctor-profile/me/order-settings/from-prescription')
    expect(await screen.findByLabelText('Nombre para la orden')).toHaveValue('Dra. Ana Ruiz')
    expect(screen.getByLabelText('Especialidad')).not.toBeChecked()
    expect(screen.getByText(/Todavía no se guardan/)).toBeInTheDocument()
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('la cédula profesional se ve siempre encendida y no se puede apagar', () => {
    render(<OrdenConfigCard guardados={AJUSTES_ORDEN_POR_DEFECTO} onGuardar={vi.fn()} />)
    const cedula = screen.getByLabelText('Cédula profesional (siempre sale)')
    expect(cedula).toBeChecked()
    expect(cedula).toBeDisabled()
  })

  it('el estilo de la firma es opcional: apagado se manda null', async () => {
    const onGuardar = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<OrdenConfigCard guardados={AJUSTES_ORDEN_POR_DEFECTO} onGuardar={onGuardar} />)
    await user.click(screen.getByLabelText('Personalizar la letra de mi nombre'))
    await user.click(screen.getByLabelText('Cursiva'))
    await user.click(screen.getByRole('button', { name: 'Guardar configuración de la orden' }))
    expect(onGuardar.mock.calls[0][0].estilo_firma).toMatchObject({ cursiva: true })
  })

  it('celular y correo de contacto salen encendidos de fábrica y se pueden apagar', async () => {
    const onGuardar = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<OrdenConfigCard guardados={AJUSTES_ORDEN_POR_DEFECTO} onGuardar={onGuardar} />)
    expect(screen.getByLabelText('Celular / WhatsApp')).toBeChecked()
    await user.click(screen.getByLabelText('Correo de contacto'))
    await user.click(screen.getByRole('button', { name: 'Guardar configuración de la orden' }))
    expect(onGuardar.mock.calls[0][0]).toMatchObject({ mostrar_celular: true, mostrar_correo: false })
  })
})
