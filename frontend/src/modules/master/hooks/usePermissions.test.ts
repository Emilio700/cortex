/**
 * Si los permisos de una persona no se pudieron leer, no se devuelve «nada»:
 * la pantalla seguía mostrando los de la persona anterior como si fueran de
 * ésta, y guardar los escribía encima (plan 29, T-1).
 */
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get, put: vi.fn() } }))

import { usePermissions } from './usePermissions'

describe('usePermissions (master)', () => {
  it('un fallo al leer los permisos de una persona se lanza con mensaje en español', async () => {
    get.mockImplementation((url: string) =>
      url === '/permissions/available' ? Promise.resolve({ data: [] }) : Promise.reject(new Error('Network Error')),
    )
    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loadingAvailable).toBe(false))

    await expect(result.current.getUserPermissions(5)).rejects.toThrow('No se pudieron leer los permisos de esta persona.')
  })

  it('si el catálogo no se pudo leer, lo dice', async () => {
    get.mockRejectedValue(new Error('Network Error'))
    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.errorDisponibles).not.toBeNull())
  })
})
