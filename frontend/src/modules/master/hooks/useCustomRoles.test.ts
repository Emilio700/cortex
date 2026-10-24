/**
 * Borrar un rol personalizado que alguien tiene asignado lo rechaza el
 * servidor con 409 y un motivo en español (qué rol y cuántas cuentas). El
 * hook lo descartaba y mostraba «Error al eliminar rol», que no dice qué
 * hacer para poder borrarlo.
 */
import { renderHook, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))

vi.mock('../../../shared/services/api', () => ({ apiClient: api }))

import { useCustomRoles } from './useCustomRoles'

describe('useCustomRoles · eliminar', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.get.mockResolvedValue({ data: [] })
  })

  it('con 409 muestra el motivo que da el servidor', async () => {
    const motivo =
      'No se puede eliminar el rol «Caja» porque lo tiene asignado una cuenta. Asígnales otro rol primero y vuelve a intentarlo.'
    api.delete.mockRejectedValue({ response: { status: 409, data: { detail: motivo } } })

    const { result } = renderHook(() => useCustomRoles())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = true
    await act(async () => {
      ok = await result.current.deleteRole(4)
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe(motivo)
  })

  it('sin conexión da un aviso en español, no el genérico de antes', async () => {
    api.delete.mockRejectedValue({ request: {} })

    const { result } = renderHook(() => useCustomRoles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.deleteRole(4)
    })

    expect(result.current.error).toMatch(/No se pudo conectar/)
  })
})
