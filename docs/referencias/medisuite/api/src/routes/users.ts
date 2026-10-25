// Administración de usuarios (solo admin), con salvaguardas.
import type { FastifyInstance } from 'fastify'
import { auditReq } from '../audit.js'
import { now } from '../clock.js'
import { hashPassword, passwordProblem } from '../crypto.js'
import { tx } from '../db.js'
import { badRequest, conflict, forbidden, notFound } from '../errors.js'
import { can } from '../permissions.js'
import { newId } from '../resources.js'
import { PROFILE_KEYS, userCreateSchema, userPatchSchema } from '../schemas.js'
import { requireUser } from '../session.js'
import type { SessionUser } from '../types.js'
import { userJson, type UserRow } from '../users.js'
import { invalidarRecuperaciones } from './auth.js'

function requireAdmin(u: SessionUser) {
  if (!can(u.rol, 'users', 'write')) throw forbidden()
}

export default async function userRoutes(app: FastifyInstance) {
  const { pool } = app.ctx

  app.get('/api/users', async (req) => {
    const u = requireUser(req)
    requireAdmin(u)
    const rows = (await pool.query<UserRow>('SELECT * FROM users WHERE org_id = $1 ORDER BY created_at, id', [u.orgId])).rows
    return rows.map(userJson)
  })

  // Usuarios a los que se puede asignar trabajo (tareas): cualquier rol, solo id/nombre/rol de los activos.
  app.get('/api/users/asignables', async (req) => {
    const u = requireUser(req)
    const rows = (
      await pool.query<{ id: string; nombre: string; rol: string }>('SELECT id, nombre, rol FROM users WHERE org_id = $1 AND activo ORDER BY nombre, id', [u.orgId])
    ).rows
    return rows.map((r) => ({ id: r.id, nombre: r.nombre, rol: r.rol }))
  })

  app.post('/api/users', async (req, reply) => {
    const u = requireUser(req)
    requireAdmin(u)
    const body = userCreateSchema.parse(req.body ?? {})
    const email = body.email.trim().toLowerCase()
    const problem = passwordProblem(body.password, email)
    if (problem) throw badRequest('contrasena_debil', problem)
    const profile: Record<string, string> = {}
    for (const k of PROFILE_KEYS) if (body[k]) profile[k] = body[k]!
    const id = newId()
    const hash = await hashPassword(body.password)
    const row = await tx(pool, async (c) => {
      const exists = (await c.query('SELECT 1 FROM users WHERE lower(email) = $1', [email])).rowCount
      if (exists) throw conflict('email_duplicado', 'Ya existe un usuario con ese correo.')
      const t = now()
      const r = (
        await c.query<UserRow>(
          'INSERT INTO users (id, org_id, email, nombre, rol, password_hash, profile, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *',
          [id, u.orgId, email, body.nombre, body.rol, hash, profile, t],
        )
      ).rows[0]
      await auditReq(c, req, { accion: 'crear', recurso: 'users', recursoId: id, detalle: { rol: body.rol } })
      return r
    })
    return reply.code(201).send(userJson(row))
  })

  app.patch('/api/users/:id', async (req) => {
    const u = requireUser(req)
    requireAdmin(u)
    const id = (req.params as { id: string }).id
    const raw = { ...((req.body as Record<string, unknown>) ?? {}) }
    // null en campos de perfil = quitar el dato (equivale a cadena vacía).
    for (const k of PROFILE_KEYS) if (raw[k] === null) raw[k] = ''
    const body = userPatchSchema.parse(raw)
    if (body.password !== undefined) {
      const problem = passwordProblem(body.password)
      if (problem) throw badRequest('contrasena_debil', problem)
    }
    const hash = body.password !== undefined ? await hashPassword(body.password) : undefined
    const row = await tx(pool, async (c) => {
      const cur = (await c.query<UserRow>('SELECT * FROM users WHERE id = $1 AND org_id = $2 FOR UPDATE', [id, u.orgId])).rows[0]
      if (!cur) throw notFound('Usuario no encontrado.')
      if (id === u.id && body.activo === false) throw conflict('no_desactivarse', 'No puedes desactivar tu propia cuenta.')
      const losesAdmin = cur.rol === 'admin' && cur.activo && ((body.rol !== undefined && body.rol !== 'admin') || body.activo === false)
      if (losesAdmin) {
        // Bloquea a los demás admins para evitar carreras.
        const others = (await c.query("SELECT id FROM users WHERE org_id = $1 AND rol = 'admin' AND activo AND id <> $2 FOR UPDATE", [u.orgId, id])).rowCount
        if (!others) throw conflict('ultimo_admin', 'Debe quedar al menos un administrador activo.')
      }
      const profile = { ...(cur.profile ?? {}) }
      for (const k of PROFILE_KEYS) {
        const v = body[k]
        if (v === undefined) continue
        if (v === '') delete profile[k]
        else profile[k] = v
      }
      const sets: string[] = ['profile = $3', 'updated_at = $4']
      const params: unknown[] = [id, u.orgId, profile, now()]
      const add = (sql: string, v: unknown) => {
        params.push(v)
        sets.push(sql.replace('?', `$${params.length}`))
      }
      if (body.nombre !== undefined) add('nombre = ?', body.nombre)
      if (body.rol !== undefined) add('rol = ?', body.rol)
      if (body.activo !== undefined) add('activo = ?', body.activo)
      if (hash) add('password_hash = ?', hash)
      if (hash || body.activo === true) sets.push('failed_attempts = 0', 'locked_until = NULL')
      if (body.totp === false) sets.push('totp_enabled = false', 'totp_secret_enc = NULL', 'totp_pending_enc = NULL', 'totp_last_step = NULL')
      const r = (await c.query<UserRow>(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 AND org_id = $2 RETURNING *`, params)).rows[0]
      // Cambio de contraseña o desactivación: cierra sus sesiones.
      if (hash || body.activo === false) {
        await c.query('DELETE FROM sessions WHERE user_id = $1', [id])
        await invalidarRecuperaciones(c, id, now())
      }
      const campos = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined)
      await auditReq(c, req, { accion: 'actualizar', recurso: 'users', recursoId: id, detalle: { campos } })
      return r
    })
    return userJson(row)
  })
}
