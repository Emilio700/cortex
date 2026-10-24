/**
 * El centro de avisos (plan 27, §3.3): «Por atender» agrupado, «Ir» sólo con
 * una pantalla que la persona puede abrir, «Descartar» en lo que pide algo, y
 * el aviso de otra sucursal dice de cuál es.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Notification } from '../types/notification'

const valor = vi.hoisted(() => ({ actual: {} as Record<string, unknown> }))

vi.mock('./AvisosContext', async (original) => ({
  ...(await original<typeof import('./AvisosContext')>()),
  useAvisos: () => valor.actual,
}))
vi.mock('../tutoriales/BotonAyudaContextual', () => ({ default: () => null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ permissions: [] }) }))

import CentroAvisos, { estadoDelAviso } from './CentroAvisos'

const aviso = (id: number, extra: Partial<Notification> = {}): Notification => ({
  id,
  type: 'patient_arrived',
  title: 'Paciente en sala',
  message: `Paciente ${id} está en sala.`,
  entity_type: 'appointment',
  entity_id: id,
  is_read: true,
  created_at: '2026-10-04T10:00:00',
  priority: 'accionable',
  resolved_at: null,
  ruta: `/doctor/consultation/${id}`,
  ...extra,
})

const descartar = vi.fn(async () => undefined)

const montar = (abiertos: Notification[]) => {
  valor.actual = {
    centroAbierto: true,
    cerrarCentro: vi.fn(),
    abiertos,
    porAtender: abiertos.length,
    estado: { sin_leer: 0, abiertos: { accionable: abiertos.length, urgente: 0 }, ultimo_id: 1, ultima_resolucion: null, hora_servidor: '' },
    fallo: false,
    actualizadoEn: Date.now(),
    cargando: false,
    cargarTodos: vi.fn(async () => ({ unread_count: 0, items: [], total: 0 })),
    marcarLeidos: vi.fn(async () => undefined),
    marcarTodasLeidas: vi.fn(),
    descartar,
    borrar: vi.fn(),
    borrarLeidas: vi.fn(),
    preferencias: null,
    guardarPreferencias: vi.fn(),
  }
  return render(
    <MemoryRouter>
      <CentroAvisos />
    </MemoryRouter>,
  )
}

describe('CentroAvisos', () => {
  beforeEach(() => {
    descartar.mockClear()
  })

  it('agrupa «Por atender» por tipo y cuenta cuántos hay', () => {
    montar([aviso(1), aviso(2), aviso(3, { type: 'consultation_completed', title: 'Consulta finalizada — pendiente de cobro', ruta: null })])

    expect(screen.getByText('Paciente en sala · 2')).toBeInTheDocument()
    expect(screen.getByText('Consulta finalizada — pendiente de cobro · 1')).toBeInTheDocument()
  })

  it('sin ruta no hay «Ir», pero sí «Descartar»', () => {
    montar([aviso(4, { ruta: null })])

    const seccion = screen.getByRole('region', { name: 'Avisos por atender' })
    expect(within(seccion).queryByRole('button', { name: 'Atender' })).not.toBeInTheDocument()
    fireEvent.click(within(seccion).getByRole('button', { name: 'Descartar' }))

    return waitFor(() => expect(descartar).toHaveBeenCalledWith(4))
  })

  it('el de otra sucursal dice de cuál es y cómo abrirlo', () => {
    montar([aviso(5, { ruta: null, de_otra_sucursal: true, sucursal: 'Sucursal Norte' })])

    expect(screen.getByText('Sucursal Norte')).toBeInTheDocument()
    expect(screen.getByText(/Cambia a esa sucursal/)).toBeInTheDocument()
  })

  it('si descartar falla, lo dice', async () => {
    descartar.mockRejectedValueOnce(new Error('sin red'))
    montar([aviso(6)])

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo descartar')
  })
})

describe('estadoDelAviso', () => {
  it('dice quién lo atendió y a qué hora, o que se descartó', () => {
    expect(estadoDelAviso(aviso(1, { resolved_at: '2026-10-04T17:42:00', resolution: 'auto', resolved_by_name: 'Laura' }))).toMatch(
      /^Atendido por Laura a las 10:42/,
    )
    expect(estadoDelAviso(aviso(1, { resolved_at: '2026-10-04T17:42:00', resolution: 'descartado', resolved_by_name: 'Laura' }))).toMatch(
      /^Descartado por Laura/,
    )
    expect(estadoDelAviso(aviso(1, { priority: 'informativo', is_read: false }))).toBe('Sin leer')
  })
})
