/**
 * Global TypeScript type definitions for G.E.M.S
 */

/**
 * User roles enum
 */
export enum Role {
  MASTER = 'master',
  ADMIN = 'admin',
  SECRETARIA = 'secretaria',
  DOCTOR = 'doctor',
}

/**
 * User interface
 */
export interface User {
  id: number
  email: string
  full_name: string
  /** "Dr.", "Dra." o nulo: sin tratamiento se muestra el nombre solo. */
  tratamiento?: string | null
  role: Role
  tenant_id: number
  is_active: boolean
  created_at: string
  /**
   * Permisos efectivos de la sesión, que devuelve `GET /auth/me`.
   * Opcional a propósito: un perfil guardado antes de este cambio no los trae,
   * y en ese caso la interfaz vuelve a decidir por rol en vez de quedarse sin
   * menú. Los listados de usuarios tampoco los incluyen.
   */
  permissions?: string[]
  /**
   * Version con la que se calcularon esos permisos. El cliente la compara
   * contra la que viaja en cada respuesta para saber que los suyos quedaron
   * viejos y recargar el perfil, en vez de obligar a cerrar sesion.
   */
  permissions_version?: number
}

/**
 * Lo que el servidor confirma tras guardar los permisos de alguien.
 * `permissions_version` es la que hara que la sesion de esa persona recargue
 * los suyos sin volver a iniciar sesion.
 */
export interface PermissionUpdateResult {
  detail: string
  permissions_version: number
  effective_permissions: string[]
}

/**
 * Available permission descriptor
 */
export interface AvailablePermission {
  action: string
  description: string
}

/**
 * A single permission override for a user
 */
export interface PermissionOverride {
  user_id: number
  action: string
  is_granted: boolean
}

/**
 * User permissions response
 */
export interface UserPermissionsResponse {
  role: string
  role_defaults: string[]
  overrides: PermissionOverride[]
  effective_permissions: string[]
}

/**
 * Authentication response
 */
export interface AuthResponse {
  access_token: string | null
  refresh_token: string | null
  token_type: string
  must_change_password: boolean
  mfa_required: boolean
  mfa_enrollment_required: boolean
  mfa_ticket: string | null
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string
  password: string
}

export interface MFASetupResponse {
  mfa_ticket: string
  secret: string
  provisioning_uri: string
  qr_code_data_url: string
}

/**
 * API error response
 */
export interface ApiError {
  detail: string
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  data?: T
  error?: ApiError
}
