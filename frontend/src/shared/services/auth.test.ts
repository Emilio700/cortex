import { describe, it, expect, beforeEach } from 'vitest'
import { getStoredUser, isAuthenticated, hasRole } from './auth'
import { Role } from '../types'

const sampleUser = {
  id: 1,
  email: 'doc@gems.local',
  full_name: 'Dra. Ada',
  role: Role.DOCTOR,
  tenant_id: 1,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}

describe('auth service (localStorage-backed)', () => {
  beforeEach(() => localStorage.clear())

  it('reports not authenticated without a token', () => {
    expect(isAuthenticated()).toBe(false)
  })

  it('reports authenticated when a token is present', () => {
    localStorage.setItem('access_token', 'jwt.token.here')
    expect(isAuthenticated()).toBe(true)
  })

  it('returns null for a missing or corrupt stored user', () => {
    expect(getStoredUser()).toBeNull()
    localStorage.setItem('user', '{not-json')
    expect(getStoredUser()).toBeNull()
  })

  it('parses the stored user and resolves its role', () => {
    localStorage.setItem('user', JSON.stringify(sampleUser))
    expect(getStoredUser()?.email).toBe('doc@gems.local')
    expect(hasRole(Role.DOCTOR)).toBe(true)
    expect(hasRole(Role.ADMIN)).toBe(false)
  })
})
