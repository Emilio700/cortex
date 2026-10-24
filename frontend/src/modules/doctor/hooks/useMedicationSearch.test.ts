/**
 * Un fallo al buscar en el catálogo de medicamentos no se ve como «sin
 * resultados»: el médico creía que el medicamento no existía (plan 29, T-1).
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ default: { get } }))

import { useMedicationSearch } from './useMedicationSearch'

describe('useMedicationSearch', () => {
  it('marca el fallo y lo limpia en la siguiente búsqueda que sí sale', async () => {
    const { result } = renderHook(() => useMedicationSearch())

    get.mockRejectedValueOnce(new Error('sin red'))
    await act(async () => {
      await result.current.search('para')
    })
    expect(result.current.error).toBe(true)

    get.mockResolvedValueOnce({ data: { results: [], source: 'cache', total: 0 } })
    await act(async () => {
      await result.current.search('para')
    })
    expect(result.current.error).toBe(false)
  })
})
