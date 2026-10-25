// Derechos ARCO / NOM-004: expediente completo (acceso/portabilidad) y bloqueo (oposición/cancelación).
// El expediente se conserva siempre (NOM-004-SSA3-2012: mínimo 5 años); la API nunca purga datos clínicos.
import type { FastifyInstance } from 'fastify'
import { auditReq } from '../audit.js'
import { now, nowIso } from '../clock.js'
import { tx } from '../db.js'
import { conflict, forbidden, notFound } from '../errors.js'
import { COLLECTIONS } from '../permissions.js'
import { getRow, listRows, toJson, type ResRow } from '../resources.js'
import { bloqueoSchema, idSchema } from '../schemas.js'
import { requireUser } from '../session.js'
import { getOrg, orgJson } from '../users.js'
import { facturaJson, type FacturaRow } from './facturas.js'
import { mensajeJson, type MensajeRow } from '../recordatorios.js'

function idParam(id: string) {
  if (!idSchema.safeParse(id).success) throw notFound()
  return id
}

export default async function patientRoutes(app: FastifyInstance) {
  const { pool } = app.ctx

  app.get('/api/patients/:id/expediente', async (req, reply) => {
    const u = requireUser(req)
    if (u.rol !== 'admin' && u.rol !== 'medico') throw forbidden()
    const id = idParam((req.params as { id: string }).id)
    const p = await getRow(pool, 'patients', u.orgId, id, false, u.rol)
    const out: Record<string, unknown> = {
      formato: 'medisuite-expediente',
      version: 1,
      exportadoEn: nowIso(),
      org: orgJson(await getOrg(pool, u.orgId)),
      paciente: toJson('patients', p, u),
    }
    for (const col of COLLECTIONS) {
      if (col === 'patients') continue
      // Los documentos van solo con metadatos (dataUrl apunta a /api/files/<id>).
      out[col] = (await listRows(pool, col, u, { patientId: id })).map((r) => toJson(col, r, u))
    }
    out.facturas = (await pool.query<FacturaRow>('SELECT * FROM facturas WHERE org_id = $1 AND patient_id = $2 ORDER BY created_at', [u.orgId, id])).rows.map(facturaJson)
    out.mensajes = (await pool.query<MensajeRow>('SELECT * FROM mensajes WHERE org_id = $1 AND patient_id = $2 ORDER BY created_at', [u.orgId, id])).rows.map(mensajeJson)
    await auditReq(pool, req, { accion: 'exportar', recurso: 'patients', recursoId: id, patientId: id, detalle: { tipo: 'expediente' } })
    reply.header('Content-Disposition', `attachment; filename="expediente-${id}-${nowIso().slice(0, 10)}.json"`).header('Cache-Control', 'no-store')
    return out
  })

  app.post('/api/patients/:id/bloqueo', async (req) => {
    const u = requireUser(req)
    if (u.rol !== 'admin') throw forbidden('sin_permiso', 'Solo un administrador puede bloquear pacientes.')
    const id = idParam((req.params as { id: string }).id)
    const { motivo } = bloqueoSchema.parse(req.body ?? {})
    const row = await tx(pool, async (c) => {
      const cur = await getRow(c, 'patients', u.orgId, id, true, u.rol)
      if (cur.bloqueado) throw conflict('paciente_bloqueado', 'El paciente ya está bloqueado.')
      const t = now()
      const bloqueo = { motivo, fecha: t.toISOString(), por: u.id, porNombre: u.nombre }
      const r = (
        await c.query<ResRow>('UPDATE patients SET bloqueado = true, bloqueo = $3, bloqueo_at = $4, updated_at = $4 WHERE org_id = $1 AND id = $2 RETURNING *', [u.orgId, id, bloqueo, t])
      ).rows[0]
      await auditReq(c, req, { accion: 'actualizar', recurso: 'patients', recursoId: id, patientId: id, detalle: { operacion: 'bloquear', motivo } })
      return r
    })
    return toJson('patients', row, u)
  })

  app.delete('/api/patients/:id/bloqueo', async (req) => {
    const u = requireUser(req)
    if (u.rol !== 'admin') throw forbidden('sin_permiso', 'Solo un administrador puede desbloquear pacientes.')
    const id = idParam((req.params as { id: string }).id)
    const row = await tx(pool, async (c) => {
      const cur = await getRow(c, 'patients', u.orgId, id, true, u.rol)
      if (!cur.bloqueado) throw conflict('paciente_no_bloqueado', 'El paciente no está bloqueado.')
      const t = now()
      const historial = { ...(cur.bloqueo ?? {}), desbloqueadoEn: t.toISOString(), desbloqueadoPor: u.id }
      const r = (
        await c.query<ResRow>('UPDATE patients SET bloqueado = false, bloqueo = $3, bloqueo_at = $4, updated_at = $4 WHERE org_id = $1 AND id = $2 RETURNING *', [u.orgId, id, historial, t])
      ).rows[0]
      await auditReq(c, req, { accion: 'actualizar', recurso: 'patients', recursoId: id, patientId: id, detalle: { operacion: 'desbloquear' } })
      return r
    })
    return toJson('patients', row, u)
  })
}
