import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))

import EstadoServiciosPage from './EstadoServiciosPage'

const SERVICIOS = [
  { id: 'orthanc', nombre: 'Orthanc (PACS)', para_que: 'Recibe estudios.', estado: 'en_linea', detalle: 'Responde.' },
  { id: 'whisper', nombre: 'Whisper (dictado)', para_que: 'Dictado.', estado: 'no_configurado', detalle: 'Falta su dirección.' },
  { id: 'ia', nombre: 'Asistente IA', para_que: 'Borradores.', estado: 'configurado', detalle: 'No se probó.' },
]

describe('Sistema → Estado de servicios', () => {
  beforeEach(() => get.mockReset())

  it('muestra lo que dice el servidor de cada servicio', async () => {
    get.mockResolvedValue({ data: SERVICIOS })
    render(<EstadoServiciosPage />)
    expect(await screen.findByText('Orthanc (PACS)')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/servicios/estado')
    expect(screen.getByText('En línea')).toBeInTheDocument()
    expect(screen.getByText('No configurado')).toBeInTheDocument()
    expect(screen.getByText('Configurado, sin probar')).toBeInTheDocument()
  })

  it('si la consulta falla no pinta ningún estado', async () => {
    get.mockRejectedValueOnce({ response: { status: 500, data: {} } })
    render(<EstadoServiciosPage />)
    expect(await screen.findByText(/Ocurrió un error en el sistema/)).toBeInTheDocument()
    expect(screen.queryByText('En línea')).not.toBeInTheDocument()
  })

  it('«Volver a revisar» pregunta otra vez', async () => {
    get.mockResolvedValue({ data: SERVICIOS })
    render(<EstadoServiciosPage />)
    await screen.findByText('Orthanc (PACS)')
    await userEvent.click(screen.getByRole('button', { name: 'Volver a revisar' }))
    await screen.findByText('Orthanc (PACS)')
    expect(get).toHaveBeenCalledTimes(2)
  })
})
