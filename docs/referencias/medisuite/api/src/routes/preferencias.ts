// Preferencias clave/valor por organización o por usuario (datos que el frontend guardaba en localStorage).
// scope=org: lectura para todos; escritura admin y médico. scope=user: solo el propio usuario.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { auditReq } from '../audit.js'
import { now } from '../clock.js'
import { AppError, badRequest, forbidden } from '../errors.js'
import { PREF_KEY_RE, PREF_MAX_BYTES } from '../schemas.js'
import { requireUser } from '../session.js'
import type { SessionUser } from '../types.js'

const scopeQuery = z.object({ scope: z.enum(['org', 'user']).default('user') })
const listQuery = z.object({ scope: z.enum(['org', 'user']).default('user'), prefijo: z.string().max(64).regex(/^[a-z0-9._-]*$/).optional() })

interface PrefRow {
  clave: string
  scope: 'org' | 'user'
  valor: unknown
  updated_at: Date
  updated_by: string | null
}

const prefJson = (r: PrefRow) => ({ clave: r.clave, scope: r.scope, valor: r.valor, actualizadoEn: r.updated_at.toISOString(), actualizadoPor: r.updated_by ?? undefined })

function claveParam(req: FastifyRequest) {
  const clave = (req.params as { clave: string }).clave
  if (!PREF_KEY_RE.test(clave)) throw badRequest('clave_invalida', 'Clave inválida: 1–64 caracteres a-z 0-9 . _ -')
  return clave
}

const owner = (u: SessionUser, scope: 'org' | 'user') => (scope === 'org' ? '' : u.id)

function assertWrite(u: SessionUser, scope: 'org' | 'user') {
  if (scope === 'org' && u.rol !== 'admin' && u.rol !== 'medico') throw forbidden('sin_permiso', 'Solo administrador o médico pueden cambiar preferencias de la organización.')
}

export default async function preferenciaRoutes(app: FastifyInstance) {
  const { pool } = app.ctx

  app.get('/api/preferencias', async (req) => {
    const u = requireUser(req)
    const { scope, prefijo } = listQuery.parse(req.query ?? {})
    const params: unknown[] = [u.orgId, scope, owner(u, scope)]
    let where = 'org_id = $1 AND scope = $2 AND owner_id = $3'
    if (prefijo) {
      params.push(prefijo.replace(/[_%\\]/g, (c) => '\\' + c) + '%')
      where += ` AND clave LIKE $${params.length}`
    }
    const rows = (await pool.query<PrefRow>(`SELECT clave, scope, valor, updated_at, updated_by FROM preferencias WHERE ${where} ORDER BY clave`, params)).rows
    return rows.map(prefJson)
  })

  app.get('/api/preferencias/:clave', async (req) => {
    const u = requireUser(req)
    const clave = claveParam(req)
    const { scope } = scopeQuery.parse(req.query ?? {})
    const r = (
      await pool.query<PrefRow>('SELECT clave, scope, valor, updated_at, updated_by FROM preferencias WHERE org_id = $1 AND scope = $2 AND owner_id = $3 AND clave = $4', [
        u.orgId,
        scope,
        owner(u, scope),
        clave,
      ])
    ).rows[0]
    // Clave inexistente: 200 con valor null (más simple para el cliente que un 404).
    return r ? prefJson(r) : { clave, scope, valor: null, actualizadoEn: null }
  })

  app.put('/api/preferencias/:clave', async (req) => {
    const u = requireUser(req)
    const clave = claveParam(req)
    const { scope } = scopeQuery.parse(req.query ?? {})
    assertWrite(u, scope)
    const b = req.body as { valor?: unknown } | undefined
    if (!b || typeof b !== 'object' || Array.isArray(b) || !('valor' in b) || b.valor === undefined) throw badRequest('validacion', 'Se esperaba { "valor": <JSON> }.')
    const json = JSON.stringify(b.valor)
    if (Buffer.byteLength(json, 'utf8') > PREF_MAX_BYTES) throw new AppError(413, 'valor_muy_grande', 'El valor excede el máximo de 256 KB.')
    const t = now()
    const r = (
      await pool.query<PrefRow>(
        `INSERT INTO preferencias (org_id, scope, owner_id, clave, valor, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
         ON CONFLICT (org_id, scope, owner_id, clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
         RETURNING clave, scope, valor, updated_at, updated_by`,
        [u.orgId, scope, owner(u, scope), clave, json, t, u.id],
      )
    ).rows[0]
    await auditReq(pool, req, { accion: 'actualizar', recurso: 'preferencias', recursoId: clave, detalle: { scope, bytes: json.length } })
    return prefJson(r)
  })

  app.delete('/api/preferencias/:clave', async (req, reply) => {
    const u = requireUser(req)
    const clave = claveParam(req)
    const { scope } = scopeQuery.parse(req.query ?? {})
    assertWrite(u, scope)
    const n = (await pool.query('DELETE FROM preferencias WHERE org_id = $1 AND scope = $2 AND owner_id = $3 AND clave = $4', [u.orgId, scope, owner(u, scope), clave])).rowCount
    if (n) await auditReq(pool, req, { accion: 'borrar', recurso: 'preferencias', recursoId: clave, detalle: { scope } })
    return reply.code(204).send()
  })
}
