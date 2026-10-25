// Bitácora de solo inserción. Este módulo nunca actualiza ni borra filas.
import type { FastifyRequest } from 'fastify'
import { now } from './clock.js'
import type { Q } from './db.js'

export type Accion =
  | 'login'
  | 'login_fallido'
  | 'logout'
  | 'crear'
  | 'actualizar'
  | 'borrar'
  | 'firmar'
  | 'adenda'
  | 'ver_expediente'
  | 'descargar_archivo'
  | 'exportar'

export interface AuditEntry {
  orgId?: string | null
  userId?: string | null
  userNombre?: string | null
  accion: Accion
  recurso?: string | null
  recursoId?: string | null
  patientId?: string | null
  ip?: string | null
  detalle?: Record<string, unknown> | null
}

export async function audit(q: Q, e: AuditEntry): Promise<void> {
  await q.query(
    `INSERT INTO audit_log (fecha, org_id, user_id, user_nombre, accion, recurso, recurso_id, patient_id, ip, detalle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [now(), e.orgId ?? null, e.userId ?? null, e.userNombre ?? null, e.accion, e.recurso ?? null, e.recursoId ?? null, e.patientId ?? null, e.ip ?? null, e.detalle ?? null],
  )
}

/** Atajo con el usuario de la sesión y la IP del cliente. */
export function auditReq(q: Q, req: FastifyRequest, e: Omit<AuditEntry, 'orgId' | 'userId' | 'userNombre' | 'ip'>) {
  const u = req.user
  return audit(q, { ...e, orgId: u?.orgId, userId: u?.id, userNombre: u?.nombre, ip: req.ip })
}
