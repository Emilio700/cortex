/**
 * La preferencia de impresión es de una usuaria (plan 26, M4): si entra otra
 * en la misma computadora, no se queda con la de la anterior.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const sesion = vi.hoisted(() => ({ user: { id: 1, role: 'doctor' } as { id: number; role: string } | null }))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get } }))
vi.mock('../../../shared/context/AuthContext', () => ({ useAuth: () => ({ user: sesion.user }) }))

import { olvidarModoImpresion, useModoImpresionPredeterminado } from './useModoImpresionPredeterminado'

beforeEach(() => {
  get.mockReset()
  olvidarModoImpresion()
})

describe('useModoImpresionPredeterminado', () => {
  it('al cambiar de usuaria vuelve a leer el perfil y no usa el modo de la anterior', async () => {
    sesion.user = { id: 1, role: 'doctor' }
    get.mockResolvedValueOnce({ data: { order_settings: { modo_impresion: 'una_hoja' } } })
    const { result, rerender } = renderHook(() => useModoImpresionPredeterminado())
    await waitFor(() => expect(result.current.modo).toBe('una_hoja'))

    sesion.user = { id: 2, role: 'doctor' }
    get.mockResolvedValueOnce({ data: { order_settings: { modo_impresion: 'separado' } } })
    rerender()
    await waitFor(() => expect(result.current.modo).toBe('separado'))
    expect(get).toHaveBeenCalledTimes(2)
  })
})
