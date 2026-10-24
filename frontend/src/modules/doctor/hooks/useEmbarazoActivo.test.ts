/**
 * «Sin embarazo activo» y «no se pudo consultar» no son lo mismo (plan 29,
 * C-2): antes un fallo dejaba la consulta igual que la de un paciente no
 * embarazada.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))

import { useEmbarazoActivo } from './useEmbarazoActivo'

describe('useEmbarazoActivo', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('sin embarazo activo: sin error', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } })
    const { result } = renderHook(() => useEmbarazoActivo(4))
    await waitFor(() => expect(get).toHaveBeenCalled())
    await waitFor(() => expect(result.current.cargando).toBe(false))
    expect(result.current.embarazo).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('si la consulta falla, lo dice', async () => {
    get.mockRejectedValue(Object.assign(new Error('500'), { response: { status: 500 } }))
    const { result } = renderHook(() => useEmbarazoActivo(4))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.embarazo).toBeNull()
  })

  it('una respuesta sin la lista no se lee como «sin embarazo»', async () => {
    get.mockResolvedValue({ data: {} })
    const { result } = renderHook(() => useEmbarazoActivo(4))
    await waitFor(() => expect(result.current.error).not.toBeNull())
  })

  it('un 403 (sin permiso prenatal) no es un fallo que haya que decir', async () => {
    get.mockRejectedValue(Object.assign(new Error('403'), { response: { status: 403 } }))
    const { result } = renderHook(() => useEmbarazoActivo(4))
    await waitFor(() => expect(get).toHaveBeenCalled())
    await waitFor(() => expect(result.current.cargando).toBe(false))
    expect(result.current.error).toBeNull()
  })
})
