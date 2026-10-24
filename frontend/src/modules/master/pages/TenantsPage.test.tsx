/** Sucursales: un fallo de carga no se ve como «No hay sucursales» (plan 29). */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const listTenants = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/tenants', () => ({
  listTenants, createTenant: vi.fn(), updateTenant: vi.fn(), setTenantStatus: vi.fn(),
}))
vi.mock('../../../shared/components/ToastProvider', () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))

import { MemoryRouter } from 'react-router-dom'
import TenantsPage from './TenantsPage'

describe('TenantsPage', () => {
  it('si no se pudieron leer lo dice y deja reintentar', async () => {
    listTenants.mockRejectedValueOnce(new Error('Sin conexión.')).mockResolvedValue([])
    render(<MemoryRouter><TenantsPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    expect(screen.queryByText('No hay sucursales registradas')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('No hay sucursales registradas')).toBeInTheDocument()
  })
})
