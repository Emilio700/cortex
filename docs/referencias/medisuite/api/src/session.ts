// Sesiones en base de datos: token aleatorio de 32 bytes en cookie; en la BD solo su SHA-256.
import type { FastifyReply, FastifyRequest } from 'fastify'
import { now, nowMs } from './clock.js'
import type { Config } from './config.js'
import { randomToken, sha256Hex } from './crypto.js'
import type { Q } from './db.js'
import { unauthorized } from './errors.js'
import type { Rol, SessionUser } from './types.js'

export const COOKIE = 'ms_session'

export async function createSession(q: Q, userId: string, orgId: string, ip: string, ua: string | undefined): Promise<string> {
  const token = randomToken(32)
  const t = now()
  await q.query('INSERT INTO sessions (token_hash, user_id, org_id, created_at, last_seen, ip, user_agent) VALUES ($1,$2,$3,$4,$4,$5,$6)', [
    sha256Hex(token),
    userId,
    orgId,
    t,
    ip,
    ua?.slice(0, 300) ?? null,
  ])
  return token
}

export function setSessionCookie(reply: FastifyReply, cfg: Config, token: string) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'strict',
    path: '/api',
    maxAge: Math.floor(cfg.sessionAbsoluteMs / 1000),
  })
}

export function clearSessionCookie(reply: FastifyReply, cfg: Config) {
  reply.clearCookie(COOKIE, { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'strict', path: '/api' })
}

interface SessRow {
  token_hash: string
  user_id: string
  org_id: string
  created_at: Date
  last_seen: Date
  email: string
  nombre: string
  rol: Rol
  activo: boolean
}

/** Resuelve la sesión de la cookie. Devuelve undefined si no hay; lanza 401 si expiró. */
export async function resolveSession(q: Q, cfg: Config, req: FastifyRequest): Promise<SessionUser | undefined> {
  const token = req.cookies?.[COOKIE]
  if (!token || token.length > 200) return undefined
  const hash = sha256Hex(token)
  const row = (
    await q.query<SessRow>(
      `SELECT s.token_hash, s.user_id, s.org_id, s.created_at, s.last_seen, u.email, u.nombre, u.rol, u.activo
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
      [hash],
    )
  ).rows[0]
  if (!row) return undefined
  const t = nowMs()
  const idle = t - row.last_seen.getTime() > cfg.sessionIdleMs
  const absolute = t - row.created_at.getTime() > cfg.sessionAbsoluteMs
  if (idle || absolute || !row.activo) {
    await q.query('DELETE FROM sessions WHERE token_hash = $1', [hash])
    throw unauthorized('sesion_expirada', 'Tu sesión expiró. Inicia sesión de nuevo.')
  }
  // Renueva la inactividad (máximo una escritura cada 10 s por sesión).
  if (t - row.last_seen.getTime() > 10_000) await q.query('UPDATE sessions SET last_seen = $2 WHERE token_hash = $1', [hash, new Date(t)])
  return { id: row.user_id, orgId: row.org_id, email: row.email, nombre: row.nombre, rol: row.rol, sessionHash: hash }
}

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw unauthorized()
  return req.user
}
