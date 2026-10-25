// Acceso a usuarios y su representación JSON pública (nunca expone hashes ni secretos).
import type { Q } from './db.js'
import type { Rol } from './types.js'

export interface UserRow {
  id: string
  org_id: string
  email: string
  nombre: string
  rol: Rol
  activo: boolean
  password_hash: string
  profile: Record<string, string | undefined>
  prefs: Record<string, unknown>
  totp_enabled: boolean
  totp_secret_enc: string | null
  totp_pending_enc: string | null
  totp_last_step: string | null
  failed_attempts: number
  locked_until: Date | null
  created_at: Date
}

const PUBLIC_PROFILE = ['especialidad', 'cedula', 'cedulaEspecialidad', 'universidad', 'direccion', 'telefono', 'rfc'] as const

export function userJson(u: UserRow) {
  const out: Record<string, unknown> = { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, activo: u.activo, totp: u.totp_enabled }
  for (const k of PUBLIC_PROFILE) if (u.profile?.[k] !== undefined && u.profile[k] !== '') out[k] = u.profile[k]
  return out
}

export async function getUserById(q: Q, id: string): Promise<UserRow | undefined> {
  return (await q.query<UserRow>('SELECT * FROM users WHERE id = $1', [id])).rows[0]
}

export async function getUserByEmail(q: Q, email: string): Promise<UserRow | undefined> {
  return (await q.query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email])).rows[0]
}

export async function getOrg(q: Q, orgId: string): Promise<{ id: string; nombre: string; settings: Record<string, any> }> {
  return (await q.query('SELECT id, nombre, settings FROM orgs WHERE id = $1', [orgId])).rows[0]
}

export const orgJson = (o: { id: string; nombre: string }) => ({ id: o.id, nombre: o.nombre })
