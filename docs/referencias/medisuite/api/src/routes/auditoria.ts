// Eventos de bitácora generados en el navegador (exportaciones FHIR/CSV que no pasan por el servidor).
// Lista blanca estricta: no es una puerta para escribir texto libre en la bitácora.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { auditReq } from '../audit.js'
import { notFound } from '../errors.js'
import { requireUser } from '../session.js'

export const RECURSOS_EXPORTABLES = ['fhir', 'caja', 'inventario', 'encuestas'] as const

const eventoSchema = z
  .object({
    accion: z.literal('exportar'),
    recurso: z.enum(RECURSOS_EXPORTABLES),
    patientId: z.string().min(1).max(64).optional(),
    detalle: z
      .object({
        formato: z.string().regex(/^[a-z0-9+.-]{1,30}$/),
        recursos: z.number().int().min(0).max(10_000_000),
      })
      .strict()
      .optional(),
  })
  .strict()

export default async function auditoriaRoutes(app: FastifyInstance) {
  const { pool } = app.ctx

  app.post('/api/auditoria/evento', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = requireUser(req)
    const body = eventoSchema.parse(req.body ?? {})
    if (body.patientId) {
      const ok = (await pool.query('SELECT 1 FROM patients WHERE org_id = $1 AND id = $2', [u.orgId, body.patientId])).rowCount
      if (!ok) throw notFound('Paciente no encontrado.')
    }
    await auditReq(pool, req, { accion: body.accion, recurso: body.recurso, patientId: body.patientId ?? null, detalle: { origen: 'navegador', ...(body.detalle ?? {}) } })
    return reply.code(204).send()
  })
}
