/** Panel de Master: la salud de la API se pregunta en /health, fuera de /api/v1 (plan 29). */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { get }, URL_DE_SALUD: 'http://api.prueba/health' }))
const estadisticas = vi.hoisted(() => ({ valor: { totalUsers: 5, usersByRole: { doctor: 3 } as Record<string, number>, loading: false, error: null as string | null } }))
vi.mock('../hooks/useMasterStats', () => ({ useMasterStats: () => estadisticas.valor }))

import MasterDashboard from './MasterDashboard'

afterEach(() => vi.unstubAllGlobals())

describe('MasterDashboard', () => {
  it('con /health en pie dice «En línea» y no lo pide con el prefijo /api/v1', async () => {
    get.mockResolvedValue({ data: [{ action: 'patients.read', description: 'Ver' }] })
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchFalso)
    render(<MasterDashboard />)

    expect(await screen.findByText('En línea')).toBeInTheDocument()
    expect(fetchFalso).toHaveBeenCalledWith('http://api.prueba/health')
    expect(get).not.toHaveBeenCalledWith('/health')
  })

  it('si no se pudieron leer usuarios ni permisos, «—» y no 0', async () => {
    estadisticas.valor = { totalUsers: 0, usersByRole: {}, loading: false, error: 'Error al cargar estadísticas' }
    get.mockRejectedValue(new Error('sin red'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    render(<MasterDashboard />)

    expect(await screen.findByText('No se pudo cargar el catálogo de permisos.')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('No se pudieron contar los usuarios.')).toBeInTheDocument()
  })
})
