// Acceso genérico a las tablas de recursos (una por colección, datos en JSONB).
import { randomUUID } from 'node:crypto'
import type { Q } from './db.js'
import { badRequest, conflict, forbidden, notFound } from './errors.js'
import { can, documentTipoAllowed, RECEPCION_HIDDEN_PATIENT_FIELDS, registroTipoAllowed, registroTiposLegibles, type Collection } from './permissions.js'
import type { SessionUser } from './types.js'

export interface ResRow {
  org_id: string
  id: string
  patient_id: string | null
  data: Record<string, any>
  created_at: Date
  updated_at: Date
  created_by: string | null
  deleted_at: Date | null
  /** Solo pacientes: bloqueo ARCO. */
  bloqueado?: boolean
  bloqueo?: Record<string, unknown> | null
  /** Calculados en consultas: el paciente del registro está bloqueado / el registro es visible para el usuario. */
  p_bloqueado?: boolean
  visible?: boolean
}

export const newId = () => randomUUID()

/** Paciente del registro (LEFT JOIN): para pacientes es el mismo registro. */
const JOIN_PATIENT = (col: Collection) => `LEFT JOIN patients p ON p.org_id = c.org_id AND p.id = ${col === 'patients' ? 'c.id' : 'c.patient_id'}`

/** Visible: no borrado, paciente no borrado y, para no-admin, paciente no bloqueado. */
const VISIBLE = (user: Pick<SessionUser, 'rol'>) => `(c.deleted_at IS NULL AND p.deleted_at IS NULL${user.rol === 'admin' ? '' : ' AND NOT COALESCE(p.bloqueado, false)'})`

export function toJson(col: Collection, row: ResRow, user: SessionUser): Record<string, unknown> {
  if (row.visible === false) return { id: row.id, eliminado: true, actualizadoEn: lastChange(row).toISOString() }
  const out: Record<string, unknown> = { ...row.data, id: row.id }
  if (row.created_by) out.creadoPor = row.created_by
  out.actualizadoEn = row.updated_at.toISOString()
  if (col === 'patients' && user.rol === 'recepcion') for (const f of RECEPCION_HIDDEN_PATIENT_FIELDS) delete out[f]
  if (col === 'patients' && row.bloqueado) {
    out.bloqueado = true
    if (user.rol === 'admin' && row.bloqueo) out.bloqueo = row.bloqueo
  }
  return out
}

function lastChange(row: ResRow & { p_deleted_at?: Date | null; p_bloqueo_at?: Date | null }): Date {
  const ds = [row.updated_at, row.deleted_at, row.p_deleted_at, row.p_bloqueo_at].filter((d): d is Date => d instanceof Date)
  return new Date(Math.max(...ds.map((d) => d.getTime())))
}

export function assertCan(user: SessionUser, col: Collection, op: 'read' | 'write') {
  if (!can(user.rol, col, op)) throw forbidden()
}

export function assertDocTipo(user: SessionUser, tipo: string, op: 'read' | 'write') {
  if (!documentTipoAllowed(user.rol, tipo, op)) throw forbidden('sin_permiso', 'Tu rol no tiene acceso a este tipo de documento.')
}

export function assertRegistroTipo(user: SessionUser, tipo: string, op: 'read' | 'write') {
  if (!registroTipoAllowed(user.rol, tipo, op)) throw forbidden('sin_permiso', 'Tu rol no tiene acceso a este tipo de registro.')
}

export const pacienteBloqueado = () => conflict('paciente_bloqueado', 'El paciente está bloqueado (derechos ARCO): su expediente se conserva pero no admite cambios.')

/** Lanza 409 si el paciente del registro está bloqueado (toda escritura). */
export function assertNotBlocked(row: ResRow) {
  if (row.p_bloqueado) throw pacienteBloqueado()
}

export interface ListOpts {
  patientId?: string
  /** Paginación por llave (created_at, id). */
  limit?: number
  cursor?: string
  /** Sincronización incremental: registros cambiados después de esta fecha, incluidos los eliminados/ocultos. */
  desde?: Date
  /** Solo registros: filtra por tipo (además del filtro por tipos legibles del rol). */
  tipo?: string
}

export function encodeCursor(row: ResRow): string {
  return Buffer.from(JSON.stringify([row.created_at.toISOString(), row.id])).toString('base64url')
}

function decodeCursor(c: string): [Date, string] {
  try {
    const [iso, id] = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as [string, string]
    const d = new Date(iso)
    if (typeof id !== 'string' || id.length > 64 || isNaN(d.getTime())) throw new Error()
    return [d, id]
  } catch {
    throw badRequest('cursor_invalido', 'El cursor de paginación no es válido.')
  }
}

/**
 * Lista registros de la organización. Sin opciones devuelve todo (compatibilidad v1).
 * Con `limit` devuelve hasta `limit + 1` filas: el llamador recorta y genera el siguiente cursor.
 */
export async function listRows(q: Q, col: Collection, user: SessionUser, opts: ListOpts = {}): Promise<ResRow[]> {
  const params: unknown[] = [user.orgId]
  const add = (v: unknown) => {
    params.push(v)
    return `$${params.length}`
  }
  const where = ['c.org_id = $1']
  let select = 'c.*, COALESCE(p.bloqueado, false) AS p_bloqueado'
  if (opts.desde) {
    const d = add(opts.desde)
    where.push(`(c.updated_at > ${d} OR c.deleted_at > ${d} OR p.deleted_at > ${d} OR p.bloqueo_at > ${d})`)
    select += `, ${VISIBLE(user)} AS visible, p.deleted_at AS p_deleted_at, p.bloqueo_at AS p_bloqueo_at`
  } else where.push(VISIBLE(user))
  if (opts.patientId) where.push(`c.patient_id = ${add(opts.patientId)}`)
  if (col === 'documents' && user.rol === 'recepcion') where.push(`c.data->>'tipo' IN ('consentimiento','factura')`)
  if (col === 'registros') {
    where.push(`c.data->>'tipo' = ANY(${add(registroTiposLegibles(user.rol))}::text[])`)
    if (opts.tipo) where.push(`c.data->>'tipo' = ${add(opts.tipo)}`)
  }
  if (opts.cursor) {
    const [d, id] = decodeCursor(opts.cursor)
    where.push(`(c.created_at, c.id) > (${add(d)}::timestamptz, ${add(id)})`)
  }
  let sql = `SELECT ${select} FROM ${col} c ${JOIN_PATIENT(col)} WHERE ${where.join(' AND ')} ORDER BY c.created_at, c.id`
  if (opts.limit) sql += ` LIMIT ${add(opts.limit + 1)}`
  return (await q.query<ResRow>(sql, params)).rows
}

/**
 * Un registro visible de la organización (404 si no existe, está borrado o su paciente lo está).
 * `p_bloqueado` indica si el paciente está bloqueado (ARCO): para no-admin se oculta (404) en lectura;
 * las escrituras deben llamar a assertNotBlocked.
 */
export async function getRow(q: Q, col: Collection, orgId: string, id: string, forUpdate = false, rol?: SessionUser['rol']): Promise<ResRow> {
  const row = (
    await q.query<ResRow>(
      `SELECT c.*, COALESCE(p.bloqueado, false) AS p_bloqueado FROM ${col} c ${JOIN_PATIENT(col)}
       WHERE c.org_id = $1 AND c.id = $2 AND c.deleted_at IS NULL AND p.deleted_at IS NULL${forUpdate ? ' FOR UPDATE OF c' : ''}`,
      [orgId, id],
    )
  ).rows[0]
  if (!row) throw notFound()
  if (row.p_bloqueado && rol && rol !== 'admin') throw notFound()
  return row
}

/** Datos del paciente para una escritura: 400 si no existe, 409 si está bloqueado. */
export async function getPatientData(q: Q, orgId: string, patientId: string): Promise<Record<string, any>> {
  const row = (await q.query<ResRow>('SELECT data, bloqueado FROM patients WHERE org_id = $1 AND id = $2 AND deleted_at IS NULL', [orgId, patientId])).rows[0]
  if (!row) throw badRequest('paciente_no_encontrado', 'El paciente no existe en esta organización.')
  if (row.bloqueado) throw pacienteBloqueado()
  return row.data
}

export async function insertRow(q: Q, col: Collection, user: SessionUser, id: string, patientId: string | null, data: Record<string, unknown>, at: Date): Promise<ResRow> {
  try {
    return (
      await q.query<ResRow>(
        `INSERT INTO ${col} (org_id, id, patient_id, data, created_at, updated_at, created_by) VALUES ($1,$2,$3,$4,$5,$5,$6) RETURNING *`,
        [user.orgId, id, patientId, { ...data, id }, at, user.id],
      )
    ).rows[0]
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw conflict('id_duplicado', 'Ya existe un registro con ese id.')
    throw e
  }
}

export async function updateRow(q: Q, col: Collection, orgId: string, id: string, patientId: string | null, data: Record<string, unknown>, at: Date): Promise<ResRow> {
  return (
    await q.query<ResRow>(`UPDATE ${col} SET data = $3, patient_id = $4, updated_at = $5 WHERE org_id = $1 AND id = $2 RETURNING *`, [orgId, id, { ...data, id }, patientId, at])
  ).rows[0]
}

export async function softDelete(q: Q, col: Collection, orgId: string, id: string, at: Date) {
  // updated_at también cambia para que la sincronización incremental (?desde=) vea el borrado.
  await q.query(`UPDATE ${col} SET deleted_at = $3, updated_at = $3 WHERE org_id = $1 AND id = $2`, [orgId, id, at])
}

/** Quita claves con valor undefined (JSONB no las guarda, pero mantiene el objeto limpio). */
export function clean<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return o
}
