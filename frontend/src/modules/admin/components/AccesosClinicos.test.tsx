/**
 * Accesos a expedientes (plan 32, punto 7): una fila por visita con sus
 * secciones en palabras, y un fallo no se lee como «nadie abrió nada».
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))

import AccesosClinicos from './AccesosClinicos'

beforeEach(() => {
  get.mockReset()
})

describe('AccesosClinicos', () => {
  it('muestra quién abrió qué secciones de qué paciente', async () => {
    get.mockResolvedValue({
      data: {
        total: 1,
        items: [{
          sesion: 'ab12cd34', user_id: 2, user_name: 'Cintia', patient_id: 7, patient_name: 'Ana López',
          device_label: 'Windows', primer_acceso: '2026-10-09T16:00:00', ultimo_acceso: '2026-10-09T16:20:00',
          secciones: [
            { seccion: 'consultas', veces: 3, primer_acceso: '2026-10-09T16:00:00', ultimo_acceso: '2026-10-09T16:20:00' },
            { seccion: 'imagenes', veces: 1, primer_acceso: '2026-10-09T16:05:00', ultimo_acceso: '2026-10-09T16:05:00' },
          ],
        }],
      },
    })
    render(<AccesosClinicos />)
    expect(await screen.findByText('Cintia')).toBeInTheDocument()
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('Consultas ×3')).toBeInTheDocument()
    expect(screen.getByText('Imágenes')).toBeInTheDocument()
    expect(screen.getByText('1 visita')).toBeInTheDocument()
  })

  it('si no se pudo leer lo dice en vez de mostrar cero accesos', async () => {
    get.mockRejectedValue(new Error('sin red'))
    render(<AccesosClinicos />)
    expect(await screen.findByText(/Esto no quiere decir que no haya accesos/)).toBeInTheDocument()
    expect(screen.queryByText('Todavía no hay accesos registrados.')).not.toBeInTheDocument()
  })
})
