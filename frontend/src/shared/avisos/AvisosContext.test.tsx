/**
 * El sondeo de avisos (plan 27, Fase 2): que lo que pide algo no se pierda y
 * que no suene dos veces.
 *
 * - Al volver a la pestaña se consulta en el acto.
 * - La lista sólo se vuelve a pedir si el estado cambió.
 * - Si la consulta falla, se dice.
 * - Con dos pestañas abiertas, un aviso nuevo suena una sola vez.
 * - Con el sonido apagado no suena nada.
 * - El latido avisa a otras pantallas, y el título cuenta lo pendiente.
 */
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const patch = vi.hoisted(() => vi.fn())
const tocarSonido = vi.hoisted(() => vi.fn(async () => true))

vi.mock('../services/api', () => ({
  apiClient: { get, post: vi.fn(), put: vi.fn(), patch, delete: vi.fn() },
  default: { get, post: vi.fn(), put: vi.fn(), patch, delete: vi.fn() },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'doctor' }, permissions: ['doctor.appointments.read'] }),
}))
vi.mock('./sonido', () => ({ tocarSonido }))

import { AvisosProvider, useAvisos, useLatidoAvisos, type Latido } from './AvisosContext'

const enSala = (id: number) => ({
  id,
  type: 'patient_arrived',
  title: 'Paciente en sala',
  message: `Paciente ${id} está en sala.`,
  entity_type: 'appointment',
  entity_id: id,
  is_read: false,
  created_at: '2026-09-24T10:00:00',
  priority: 'accionable',
  resolved_at: null,
  ruta: `/doctor/consultation/${id}`,
})

/** Lo que «tiene» el servidor; cada prueba lo cambia. */
let servidor: {
  abiertos: ReturnType<typeof enSala>[]
  sonido: boolean
  falla: boolean
  criticos: { result_id: number; order_id: number; patient_name: string; study_name: string }[]
  fallaCriticos: boolean
}

const estado = () => ({
  sin_leer: servidor.abiertos.filter((a) => !a.is_read).length,
  abiertos: { accionable: servidor.abiertos.length, urgente: 0 },
  ultimo_id: servidor.abiertos.reduce((m, a) => Math.max(m, a.id), 0) || null,
  ultima_resolucion: null,
  hora_servidor: '2026-10-04T10:00:00',
})

const llamadasA = (url: string) => get.mock.calls.filter(([u]) => u === url).length

const volverALaPestana = () =>
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })

let ultimo: ReturnType<typeof useAvisos> | null = null
const Captura = () => {
  ultimo = useAvisos()
  return null
}

describe('AvisosProvider', () => {
  beforeEach(() => {
    servidor = { abiertos: [], sonido: true, falla: false, criticos: [], fallaCriticos: false }
    localStorage.clear()
    tocarSonido.mockClear()
    patch.mockReset()
    get.mockReset()
    get.mockImplementation(async (url: string) => {
      if (servidor.falla) throw new Error('sin red')
      if (url === '/notifications/estado') return { data: estado() }
      if (url === '/clinical-tracking/critical-results') {
        if (servidor.fallaCriticos) throw new Error('500')
        return { data: { items: [...servidor.criticos], total: servidor.criticos.length } }
      }
      if (url === '/notifications/preferencias')
        return {
          data: {
            sonido: servidor.sonido,
            navegador: false,
            recordatorio_una_hora: false,
            tipos_silenciados: [],
            tipos_silenciables: [],
          },
        }
      if (url === '/notifications')
        return { data: { unread_count: 0, abiertos_count: servidor.abiertos.length, items: [...servidor.abiertos] } }
      throw new Error(`url inesperada ${url}`)
    })
    document.title = 'GEMS'
  })

  it('al volver a la pestaña consulta en el acto, y sólo pide la lista si algo cambió', async () => {
    render(
      <AvisosProvider>
        <Captura />
      </AvisosProvider>,
    )
    await waitFor(() => expect(llamadasA('/notifications')).toBe(1))

    volverALaPestana()
    await waitFor(() => expect(llamadasA('/notifications/estado')).toBe(2))
    expect(llamadasA('/notifications')).toBe(1)

    servidor.abiertos = [enSala(3)]
    volverALaPestana()
    await waitFor(() => expect(llamadasA('/notifications')).toBe(2))
    await waitFor(() => expect(ultimo?.emergentes).toHaveLength(1))
    expect(document.title).toBe('(1) GEMS')
  })

  it('si la consulta falla lo dice, en vez de dar lo viejo por vigente', async () => {
    render(
      <AvisosProvider>
        <Captura />
      </AvisosProvider>,
    )
    await waitFor(() => expect(ultimo?.cargando).toBe(false))
    expect(ultimo?.fallo).toBe(false)

    servidor.falla = true
    volverALaPestana()

    await waitFor(() => expect(ultimo?.fallo).toBe(true))
  })

  it('con dos pestañas abiertas, un aviso nuevo suena una sola vez', async () => {
    render(
      <>
        <AvisosProvider>
          <Captura />
        </AvisosProvider>
        <AvisosProvider>
          <span />
        </AvisosProvider>
      </>,
    )
    await waitFor(() => expect(llamadasA('/notifications')).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(llamadasA('/notifications/preferencias')).toBe(2))
    await act(async () => {})

    servidor.abiertos = [enSala(5)]
    volverALaPestana()

    await waitFor(() => expect(ultimo?.emergentes).toHaveLength(1))
    await act(async () => {})
    expect(tocarSonido).toHaveBeenCalledTimes(1)
  })

  it('con el sonido apagado no suena, pero el aviso sí se muestra', async () => {
    servidor.sonido = false
    render(
      <AvisosProvider>
        <Captura />
      </AvisosProvider>,
    )
    await waitFor(() => expect(ultimo?.preferencias?.sonido).toBe(false))

    servidor.abiertos = [enSala(6)]
    volverALaPestana()

    await waitFor(() => expect(ultimo?.emergentes).toHaveLength(1))
    expect(tocarSonido).not.toHaveBeenCalled()
  })

  it('al entrar no suena lo que ya estaba', async () => {
    servidor.abiertos = [enSala(8)]
    render(
      <AvisosProvider>
        <Captura />
      </AvisosProvider>,
    )
    await waitFor(() => expect(ultimo?.abiertos).toHaveLength(1))
    expect(tocarSonido).not.toHaveBeenCalled()
  })

  it('el latido avisa a otras pantallas y dice si cambió algo', async () => {
    const latidos: Latido[] = []
    const Pantalla = () => {
      useLatidoAvisos((l) => latidos.push(l))
      return null
    }
    render(
      <AvisosProvider>
        <Pantalla />
      </AvisosProvider>,
    )
    await waitFor(() => expect(latidos).toHaveLength(1))

    volverALaPestana()
    await waitFor(() => expect(latidos).toHaveLength(2))
    expect(latidos[1].cambio).toBe(false)

    servidor.abiertos = [enSala(9)]
    volverALaPestana()
    await waitFor(() => expect(latidos).toHaveLength(3))
    expect(latidos[2].cambio).toBe(true)
  })

  it('fuera del proveedor, el latido no hace nada ni truena', () => {
    const Suelta = () => {
      useLatidoAvisos(() => undefined)
      return null
    }
    expect(() => render(<Suelta />)).not.toThrow()
  })

  it('un crítico nuevo suena con el tono urgente y refresca el inicio del médico', async () => {
    const refrescos = vi.fn()
    window.addEventListener('gems:resultados-actualizados', refrescos)
    render(
      <AvisosProvider>
        <Captura />
      </AvisosProvider>,
    )
    await waitFor(() => expect(ultimo?.criticos).toEqual({ estado: 'ok', items: [], total: 0 }))
    await waitFor(() => expect(ultimo?.preferencias?.sonido).toBe(true))

    servidor.criticos = [{ result_id: 40, order_id: 4, patient_name: 'Ana', study_name: 'Biometría' }]
    volverALaPestana()

    await waitFor(() => expect(ultimo?.criticos).toMatchObject({ estado: 'ok', total: 1 }))
    expect(tocarSonido).toHaveBeenCalledWith('urgente')
    expect(refrescos).toHaveBeenCalled()
    window.removeEventListener('gems:resultados-actualizados', refrescos)
  })

  it('si la consulta de críticos falla, se sabe que falló: no es «sin críticos»', async () => {
    servidor.fallaCriticos = true
    render(
      <AvisosProvider>
        <Captura />
      </AvisosProvider>,
    )
    await waitFor(() => expect(ultimo?.criticos).toEqual({ estado: 'fallo' }))
  })

  it('preferencias mal formadas no tumban nada: quedan como no leídas', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/notifications/estado') return { data: estado() }
      if (url === '/notifications/preferencias') return { data: { sonido: false, tipos_silenciables: null } }
      if (url === '/notifications') return { data: { unread_count: 0, items: [] } }
      if (url === '/clinical-tracking/critical-results') return { data: { items: [], total: 0 } }
      throw new Error(url)
    })
    render(
      <AvisosProvider>
        <Captura />
      </AvisosProvider>,
    )
    await waitFor(() => expect(ultimo?.cargando).toBe(false))
    await waitFor(() => expect(llamadasA('/notifications/preferencias')).toBe(1))
    expect(ultimo?.preferencias).toBeNull()
    expect(ultimo?.fallo).toBe(false)
  })

  it('un estado mal formado cuenta como fallo, no como cero', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/notifications/estado') return { data: '<html>proxy</html>' }
      return { data: { items: [], total: 0, sonido: false } }
    })
    render(
      <AvisosProvider>
        <Captura />
      </AvisosProvider>,
    )
    await waitFor(() => expect(ultimo?.fallo).toBe(true))
  })
})
