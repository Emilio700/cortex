/**
 * Authentication context — single reactive source of truth for the session.
 *
 * Replaces the scattered `getStoredUser()` / `isAuthenticated()` reads across
 * guards, sidebar and header. localStorage remains the persistence layer
 * (written by the auth service); this context hydrates from it on mount and
 * keeps a reactive `user` so login/logout update the UI without a full reload.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { setPermissionsVersionListener } from '../services/api'
import * as authService from '../services/auth'
import type { AuthResponse, LoginCredentials, MFASetupResponse, User } from '../types'

type CompletedLogin = { user: User; must_change_password: boolean; recovery_codes?: string[] }

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  /** Permisos efectivos de la sesión; vacío si el perfil aún no los trae. */
  permissions: string[]
  /** ¿La sesión puede ejecutar esta acción? Es el criterio que sustituye al rol. */
  can: (action: string) => boolean
  login: (credentials: LoginCredentials) => Promise<CompletedLogin | AuthResponse>
  setupMfa: (ticket: string) => Promise<MFASetupResponse>
  completeMfa: (mode: 'confirm' | 'verify', ticket: string, code: string) => Promise<CompletedLogin>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Version con la que se calcularon los permisos que hay en pantalla. Se
  // guarda en una ref y no en el estado porque el interceptor la consulta en
  // cada respuesta y no debe provocar re-render por si sola.
  const knownPermissionsVersion = useRef<number | null>(null)
  const refreshingPermissions = useRef(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedUser = authService.getStoredUser()
    if (storedUser && authService.isAuthenticated()) {
      setUser(storedUser)
      knownPermissionsVersion.current = storedUser.permissions_version ?? null
    }
    setLoading(false)
  }, [])

  // Los permisos cambian mientras la sesion sigue abierta: alguien los edito
  // desde la pantalla de Master. Antes eso no se notaba hasta volver a entrar,
  // asi que conceder un permiso parecia no hacer nada. Se recarga el perfil en
  // silencio en vez de cerrar la sesion: una doctora documentando una nota no
  // puede perder lo capturado porque alguien toco un permiso.
  useEffect(() => {
    setPermissionsVersionListener((version) => {
      if (knownPermissionsVersion.current === null) {
        knownPermissionsVersion.current = version
        return
      }
      if (version === knownPermissionsVersion.current || refreshingPermissions.current) return
      refreshingPermissions.current = true
      knownPermissionsVersion.current = version
      void authService
        .getCurrentUser()
        .then((fresh) => setUser(fresh))
        .catch(() => {
          // Si falla la recarga se deja la version vieja anotada para que el
          // siguiente intento vuelva a dispararse: es preferible reintentar a
          // quedarse callado con permisos que ya no son los que rigen.
          knownPermissionsVersion.current = null
        })
        .finally(() => {
          refreshingPermissions.current = false
        })
    })
    return () => setPermissionsVersionListener(null)
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const authResponse = await authService.login(credentials)
    if (authResponse.mfa_required) return authResponse
    const userData = await authService.getCurrentUser()
    knownPermissionsVersion.current = userData.permissions_version ?? null
    setUser(userData)
    return { user: userData, must_change_password: authResponse.must_change_password }
  }, [])

  const setupMfa = useCallback((ticket: string) => authService.setupMfa(ticket), [])

  const completeMfa = useCallback(async (mode: 'confirm' | 'verify', ticket: string, code: string) => {
    const authResponse = await authService.completeMfa(mode, ticket, code)
    const userData = await authService.getCurrentUser()
    knownPermissionsVersion.current = userData.permissions_version ?? null
    setUser(userData)
    return {
      user: userData,
      must_change_password: authResponse.must_change_password,
      recovery_codes: authResponse.recovery_codes,
    }
  }, [])

  const logout = useCallback(() => {
    knownPermissionsVersion.current = null
    setUser(null)
    authService.logout()
  }, [])

  const permissions = useMemo(() => user?.permissions ?? [], [user])

  // MASTER no se consulta aparte: el backend ya le devuelve el catálogo entero.
  const can = useCallback(
    (action: string) => permissions.includes(action),
    [permissions],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      permissions,
      can,
      // Token-based so a hard reload doesn't flash a redirect before the
      // profile finishes hydrating from localStorage.
      isAuthenticated: authService.isAuthenticated(),
      login,
      setupMfa,
      completeMfa,
      logout,
    }),
    [user, loading, permissions, can, login, setupMfa, completeMfa, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Access the auth session. Must be used within an <AuthProvider>. */
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}

export default AuthProvider
