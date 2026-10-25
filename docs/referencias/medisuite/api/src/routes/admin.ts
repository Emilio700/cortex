// Bitácora (lectura), exportación, salud y endpoints públicos (JWKS y verificación de recetas).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { timingSafeEqual } from 'node:crypto'
import { auditReq } from '../audit.js'
import { nowIso } from '../clock.js'
import { tx } from '../db.js'
import { forbidden, unauthorized } from '../errors.js'
import { createOrgKey, publicJwks, verifyJws } from '../keys.js'
import { can, COLLECTIONS } from '../permissions.js'
import { listRows, toJson } from '../resources.js'
import { requireUser } from '../session.js'
import { getOrg, orgJson, userJson, type UserRow } from '../users.js'
import { buildSettings } from './settings.js'

export const APP_VERSION = '1.2.0'

const auditQuery = z.object({
  patientId: z.string().max(64).optional(),
  userId: z.string().max(64).optional(),
  desde: z.string().max(40).optional(),
  hasta: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
})

function parseDate(s: string | undefined, endOfDay = false): Date | undefined {
  if (!s) return undefined
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z')) : new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

export default async function adminRoutes(app: FastifyInstance) {
  const { pool } = app.ctx

  app.get('/api/health', async (_req, reply) => {
    const { storage, scheduler, cfg, mailer } = app.ctx
    // Sin secretos: solo estados y banderas de configuración.
    const extra = {
      storage: { tipo: storage.kind, estado: (await storage.health().catch(() => false)) ? 'ok' : 'error' },
      scheduler: {
        activo: scheduler.enabled,
        ...(scheduler.lastRun ? { ultimaEjecucion: scheduler.lastRun } : {}),
        ...(scheduler.lastSent !== undefined ? { ultimosEnviados: scheduler.lastSent } : {}),
        ...(scheduler.lastError ? { error: true } : {}),
      },
      servicios: { whatsapp: !!cfg.whatsapp, correo: mailer.enabled, pac: !!cfg.facturapi },
    }
    try {
      await pool.query('SELECT 1')
      return { app: 'medisuite', version: APP_VERSION, db: 'ok', ...extra }
    } catch {
      return reply.code(503).send({ app: 'medisuite', version: APP_VERSION, db: 'error', ...extra })
    }
  })

  // ---------- Métricas (Prometheus) ----------
  app.get('/api/metrics', async (req, reply) => {
    const token = app.ctx.cfg.metricsToken
    const auth = req.headers.authorization
    let ok = false
    if (token && auth?.startsWith('Bearer ')) {
      const a = Buffer.from(auth.slice(7))
      const b = Buffer.from(token)
      ok = a.length === b.length && timingSafeEqual(a, b)
      if (!ok) throw unauthorized('token_invalido', 'Token de métricas inválido.')
    }
    if (!ok) {
      const u = requireUser(req)
      if (u.rol !== 'admin') throw forbidden()
    }
    reply.type('text/plain; version=0.0.4; charset=utf-8').header('Cache-Control', 'no-store')
    return app.ctx.metrics.render()
  })

  // ---------- Llaves de firma ----------
  app.get('/api/admin/llaves', async (req) => {
    const u = requireUser(req)
    if (u.rol !== 'admin') throw forbidden()
    const rows = (await pool.query<{ kid: string; active: boolean; created_at: Date; public_jwk: unknown }>('SELECT kid, active, created_at, public_jwk FROM org_keys WHERE org_id = $1 ORDER BY created_at', [u.orgId])).rows
    return rows.map((r) => ({ kid: r.kid, activa: r.active, creadaEn: r.created_at.toISOString(), llavePublica: r.public_jwk }))
  })

  app.post('/api/admin/llaves/rotar', async (req, reply) => {
    const u = requireUser(req)
    if (u.rol !== 'admin') throw forbidden()
    const r = await tx(pool, async (c) => {
      await c.query('SELECT 1 FROM orgs WHERE id = $1 FOR UPDATE', [u.orgId]) // serializa rotaciones concurrentes
      const anteriores = (await c.query<{ kid: string }>('SELECT kid FROM org_keys WHERE org_id = $1 AND active', [u.orgId])).rows.map((x) => x.kid)
      const kid = await createOrgKey(c, u.orgId, app.ctx.cfg.masterKey)
      const pub = (await c.query<{ public_jwk: unknown; created_at: Date }>('SELECT public_jwk, created_at FROM org_keys WHERE kid = $1', [kid])).rows[0]
      await auditReq(c, req, { accion: 'actualizar', recurso: 'org_keys', recursoId: kid, detalle: { operacion: 'rotar', anteriores } })
      return { kid, activa: true, creadaEn: pub.created_at.toISOString(), llavePublica: pub.public_jwk }
    })
    return reply.code(201).send(r)
  })

  app.get('/api/audit', async (req) => {
    const u = requireUser(req)
    if (!can(u.rol, 'audit', 'read')) throw forbidden()
    const q = auditQuery.parse(req.query)
    const params: unknown[] = [u.orgId]
    const where = ['org_id = $1']
    const add = (sql: string, v: unknown) => {
      params.push(v)
      where.push(sql.replace('?', `$${params.length}`))
    }
    if (q.patientId) add('patient_id = ?', q.patientId)
    if (q.userId) add('user_id = ?', q.userId)
    const desde = parseDate(q.desde)
    const hasta = parseDate(q.hasta, true)
    if (desde) add('fecha >= ?', desde)
    if (hasta) add('fecha <= ?', hasta)
    params.push(q.limit)
    const rows = (
      await pool.query(
        `SELECT id, fecha, user_id, user_nombre, accion, recurso, recurso_id, patient_id, ip, detalle FROM audit_log
         WHERE ${where.join(' AND ')} ORDER BY fecha DESC, id DESC LIMIT $${params.length}`,
        params,
      )
    ).rows
    return rows.map((r) => ({
      id: String(r.id),
      fecha: r.fecha.toISOString(),
      userId: r.user_id,
      userNombre: r.user_nombre,
      accion: r.accion,
      recurso: r.recurso,
      recursoId: r.recurso_id,
      patientId: r.patient_id,
      ip: r.ip,
      detalle: r.detalle,
    }))
  })

  app.get('/api/export', async (req, reply) => {
    const u = requireUser(req)
    if (u.rol !== 'admin') throw forbidden()
    const out: Record<string, unknown> = {
      formato: 'medisuite-export',
      version: 1,
      exportadoEn: nowIso(),
      org: orgJson(await getOrg(pool, u.orgId)),
      settings: await buildSettings(pool, u),
    }
    for (const col of COLLECTIONS) out[col] = (await listRows(pool, col, u)).map((r) => toJson(col, r, u))
    out.users = (await pool.query<UserRow>('SELECT * FROM users WHERE org_id = $1 ORDER BY created_at', [u.orgId])).rows.map(userJson)
    await auditReq(pool, req, { accion: 'exportar', recurso: 'org', recursoId: u.orgId })
    const fecha = nowIso().slice(0, 10)
    reply.header('Content-Disposition', `attachment; filename="medisuite-respaldo-${fecha}.json"`).header('Cache-Control', 'no-store')
    return out
  })

  // ---------- Público ----------
  app.get('/api/public/jwks', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300')
    return publicJwks(pool)
  })

  app.get('/api/public/verificar', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    const t = String((req.query as { t?: string }).t ?? '').trim()
    if (!t || t.length > 8000 || t.split('.').length !== 3) return { valida: false }
    const v = await verifyJws(pool, t)
    if (!v) return { valida: false }
    const folio = v.payload.folio
    if (typeof folio !== 'string') return { valida: false }
    const rx = (
      await pool.query<{ data: Record<string, any>; created_by: string | null }>(
        `SELECT data, created_by FROM prescriptions WHERE org_id = $1 AND data->>'folio' = $2 AND deleted_at IS NULL`,
        [v.orgId, folio],
      )
    ).rows[0]
    // La receta debe existir y el token debe ser exactamente el emitido.
    if (!rx || rx.data.firma !== t) return { valida: false }
    const org = await getOrg(pool, v.orgId)
    const emisor = { clinica: org.settings?.clinica ?? org.nombre, medico: String(v.payload.medico ?? ''), cedula: String(v.payload.cedula ?? '') }
    if (rx.data.cancelada) return { valida: false, cancelada: true, payload: v.payload, emisor }
    return { valida: true, payload: v.payload, emisor }
  })

}
