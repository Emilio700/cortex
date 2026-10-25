/**
 * Authentication service
 */
import { apiClient } from './api'
import type { AuthResponse, LoginCredentials, MFASetupResponse, User } from '../types'
import { olvidarPestanas } from '../tabs/almacenPestanas'

/**
 * Login with email and password
 */
export const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/login', credentials)
  const { access_token, refresh_token } = response.data

  // Store tokens
  if (access_token && refresh_token) storeTokens(access_token, refresh_token)

  return response.data
}

export const setupMfa = async (mfa_ticket: string): Promise<MFASetupResponse> => {
  const response = await apiClient.post<MFASetupResponse>('/auth/mfa/setup', { mfa_ticket })
  return response.data
}

export const completeMfa = async (
  mode: 'confirm' | 'verify',
  mfa_ticket: string,
  code: string,
): Promise<AuthResponse & { recovery_codes?: string[] }> => {
  const response = await apiClient.post<AuthResponse & { recovery_codes?: string[] }>(
    `/auth/mfa/${mode}`,
    { mfa_ticket, code },
  )
  if (!response.data.access_token || !response.data.refresh_token) {
    throw new Error('El servidor no emitió una sesión válida')
  }
  storeTokens(response.data.access_token, response.data.refresh_token)
  return response.data
}

/**
 * Get the stored refresh token, if any
 */
export const getStoredRefreshToken = (): string | null => {
  return localStorage.getItem('refresh_token')
}

/**
 * Store a new access/refresh token pair (used after a successful refresh).
 */
export const storeTokens = (access_token: string, refresh_token: string): void => {
  localStorage.setItem('access_token', access_token)
  localStorage.setItem('refresh_token', refresh_token)
}

/**
 * Get current authenticated user
 */
export const getCurrentUser = async (): Promise<User> => {
  const response = await apiClient.get<User>('/auth/me')

  // Store user info
  localStorage.setItem('user', JSON.stringify(response.data))

  return response.data
}

/**
 * Logout user
 */
export const logout = (): void => {
  const refreshToken = localStorage.getItem('refresh_token')
  if (refreshToken) {
    // Best effort: local credentials are cleared immediately even if the
    // network is unavailable; the server revokes the device when reachable.
    void apiClient.post('/auth/logout', { refresh_token: refreshToken }).catch(() => undefined)
  }
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  // Las pestañas de esta cuenta no pasan a la siguiente que entre aquí.
  olvidarPestanas()
  window.location.href = '/#/login'
}

/**
 * Get stored user from localStorage
 */
export const getStoredUser = (): User | null => {
  const userStr = localStorage.getItem('user')
  if (!userStr) return null

  try {
    return JSON.parse(userStr) as User
  } catch {
    return null
  }
}

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('access_token')
}

/**
 * Check if user has specific role
 */
export const hasRole = (role: string): boolean => {
  const user = getStoredUser()
  return user?.role === role
}
