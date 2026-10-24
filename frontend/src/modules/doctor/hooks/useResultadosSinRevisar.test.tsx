/**
 * El número de resultados sin revisar sale de una sola llamada y nunca miente.
 *
 * Nada empujaba al médico a la bandeja. El contador lo arregla, pero un
 * contador que ante un fallo de red dice «0» es peor que no tenerlo: le dice que
 * no tiene nada que revisar.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({
  apiClient: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const can = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { full_name: 'Ana', role: 'doctor' }, can }),
}))

import {
  avisarResultadosActualizados,
  insigniaDeResultados,
  useResultadosSinRevisar,
} from './useResultadosSinRevisar'

const errorDeRed = () => Object.assign(new Error('Network Error'), { request: {} })

/** Responde la bandeja con `total`; los críticos y el tablero de FPP, vacíos. */
const sinCriticos = { data: { items: [], total: 0 } }
const bandejaCon = (total: number) =>
  get.mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('/critical-results')
        ? sinCriticos
        : { data: url.includes('/orders/inbox') ? { items: [], total } : [] },
    ),
  )

describe('useResultadosSinRevisar', () => {
  beforeEach(() => {
    get.mockReset()
    can.mockReset().mockReturnValue(true)
  })

  it('cuenta con una sola llamada a la bandeja filtrada por «Resultado recibido»', async () => {
    bandejaCon(3)

    const { result } = renderHook(() => useResultadosSinRevisar())

    await waitFor(() => expect(result.current.total).toBe(3))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/clinical-tracking/orders/inbox', {
      params: { status: 'result_received', skip: 0, limit: 1 },
    })
    expect(result.current.error).toBeNull()
  })

  it('si la red falla no dice «0»: deja el total sin saber y el error', async () => {
    get.mockRejectedValue(errorDeRed())

    const { result } = renderHook(() => useResultadosSinRevisar())

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.total).toBeNull()
  })

  it('deshabilitado no llama al servidor', async () => {
    bandejaCon(3)

    renderHook(() => useResultadosSinRevisar(false))

    await new Promise((r) => setTimeout(r, 0))
    expect(get).not.toHaveBeenCalled()
  })

  it('vuelve a contar cuando la bandeja avisa que guardó un resultado', async () => {
    bandejaCon(2)
    const { result } = renderHook(() => useResultadosSinRevisar())
    await waitFor(() => expect(result.current.total).toBe(2))

    bandejaCon(1)
    act(() => avisarResultadosActualizados())

    await waitFor(() => expect(result.current.total).toBe(1))
  })
})

describe('insignia de «Órdenes y resultados» en el menú', () => {
  it('muestra el número cuando hay resultados sin revisar', () => {
    expect(insigniaDeResultados(4, null)).toMatchObject({ text: '4', title: '4 resultados sin revisar' })
  })

  it('con cero confirmado no dibuja insignia', () => {
    expect(insigniaDeResultados(0, null)).toBeUndefined()
  })

  it('si no se pudo contar dibuja «?», nunca «0»', () => {
    expect(insigniaDeResultados(null, 'No se pudo conectar')).toMatchObject({ text: '?' })
  })
})

// La tarjeta del inicio se prueba con el inicio nuevo en
// `pages/DoctorDashboard.test.tsx` (plan 28): ahí el conteo es un renglón de
// «Pendientes» y un indicador, con las mismas reglas (nunca «0» por error).
