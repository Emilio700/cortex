/**
 * El pie muestra la versión de package.json, no una escrita a mano (plan 32).
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import paquete from '../../package.json'

vi.mock('../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

import AppFooter from './AppFooter'
import { VERSION_GEMS } from '../shared/version'

describe('AppFooter', () => {
  it('la versión del pie es la de package.json', () => {
    render(<AppFooter />)
    expect(VERSION_GEMS).toBe(paquete.version)
    expect(screen.getByText(`v${paquete.version}`)).toBeInTheDocument()
  })

})
