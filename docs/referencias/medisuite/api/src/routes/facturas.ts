// Facturación CFDI 4.0 con PAC (Facturapi): timbrado a partir de un pago, descarga de PDF/XML,
// cancelación (motivos SAT 01–04) y reenvío por correo. Los PDF/XML se guardan como documentos
// tipo "factura" del paciente (mismo almacenamiento que los demás archivos).
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { auditReq } from '../audit.js'
import { now } from '../clock.js'
import { tx, type Q } from '../db.js'
import { AppError, badRequest, conflict, forbidden, notFound } from '../errors.js'
import { Facturapi, invoiceBody, pacNoConfigurado, receptorProblem, type FacturapiInvoice } from '../facturapi.js'
import { can } from '../permissions.js'
import { assertNotBlocked, getRow, pacienteBloqueado, updateRow } from '../resources.js'
import { facturaCancelSchema, facturaCreateSchema, idSchema } from '../schemas.js'
import { requireUser } from '../session.js'
import type { SessionUser } from '../types.js'
import { saveServerDocument, sendStoredFile } from './documents.js'

export interface FacturaRow {
  org_id: string
  id: string
  payment_id: string
  patient_id: string | null
  pac_id: string | null
  uuid: string | null
  serie: string | null
  folio: string | null
  status: string
  cancellation_status: string | null
  total: string | null
  receptor: Record<string, unknown>
  forma_pago: string
  uso_cfdi: string
  error: string | null
  cancelacion: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  created_by: string | null
}

export const CLAVE_SERVICIOS_MEDICOS = '85121600' // Servicios de médicos especialistas (catálogo c_ClaveProdServ)

export function facturaJson(f: FacturaRow) {
  const out: Record<string, unknown> = {
    id: f.id,
    paymentId: f.payment_id,
    patientId: f.patient_id ?? undefined,
    pacId: f.pac_id ?? undefined,
    uuid: f.uuid ?? undefined,
    serie: f.serie ?? undefined,
    folio: f.folio ?? undefined,
    status: f.status,
    cancellationStatus: f.cancellation_status ?? undefined,
    total: f.total !== null ? Number(f.total) : undefined,
    receptor: f.receptor,
    formaPago: f.forma_pago,
    usoCfdi: f.uso_cfdi,
    error: f.error ?? undefined,
    cancelacion: f.cancelacion ?? undefined,
    creadoEn: f.created_at.toISOString(),
    actualizadoEn: f.updated_at.toISOString(),
    creadoPor: f.created_by ?? undefined,
  }
  if (f.pac_id) {
    out.pdfUrl = `/api/facturas/${f.id}/pdf`
    out.xmlUrl = `/api/facturas/${f.id}/xml`
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

const listQuery = z.object({ patientId: idSchema.optional(), paymentId: idSchema.optional(), status: z.string().max(30).optional(), limit: z.coerce.number().int().min(1).max(1000).default(500) })
const enviarSchema = z.object({ email: z.email('Correo inválido').max(200).optional() })

const docId = (facturaId: string, kind: 'pdf' | 'xml') => `fac-${facturaId}-${kind}`

/**
 * Factura de la organización. Igual que el resto del expediente, las facturas de un paciente bloqueado (ARCO)
 * son invisibles (404) para roles no admin.
 */
async function getFactura(q: Q, u: SessionUser, id: string, forUpdate = false): Promise<FacturaRow & { p_bloqueado: boolean }> {
  if (!idSchema.safeParse(id).success) throw notFound()
  const f = (
    await q.query<FacturaRow & { p_bloqueado: boolean }>(
      `SELECT f.*, COALESCE(p.bloqueado, false) AS p_bloqueado FROM facturas f LEFT JOIN patients p ON p.org_id = f.org_id AND p.id = f.patient_id
       WHERE f.org_id = $1 AND f.id = $2${forUpdate ? ' FOR UPDATE OF f' : ''}`,
      [u.orgId, id],
    )
  ).rows[0]
  if (!f || (f.p_bloqueado && u.rol !== 'admin')) throw notFound('Factura no encontrada.')
  return f
}

export default async function facturaRoutes(app: FastifyInstance) {
  const { pool, cfg, storage, metrics } = app.ctx
  const pac = () => {
    if (!cfg.facturapi) throw pacNoConfigurado()
    return new Facturapi(app.ctx.fetch, cfg.facturapi)
  }
  const canRead = (u: SessionUser) => can(u.rol, 'payments', 'read')
  const canWrite = (u: SessionUser) => can(u.rol, 'payments', 'write')

  /** Descarga del PAC y guarda el PDF/XML como documento "factura" del paciente (si aún no existe). */
  async function storeFile(u: SessionUser, f: FacturaRow, kind: 'pdf' | 'xml') {
    if (!f.pac_id || !f.patient_id) return
    const id = docId(f.id, kind)
    const exists = (await pool.query('SELECT 1 FROM files WHERE org_id = $1 AND id = $2', [f.org_id, id])).rowCount
    if (exists) return
    const content = await pac().download(f.pac_id, kind)
    const nombre = `Factura ${[f.serie, f.folio].filter(Boolean).join('-') || f.uuid || f.id}.${kind}`
    await tx(pool, async (c) => {
      const again = (await c.query('SELECT 1 FROM documents WHERE org_id = $1 AND id = $2', [f.org_id, id])).rowCount
      if (again) return
      await saveServerDocument(c, storage, u, { id, patientId: f.patient_id!, tipo: 'factura', nombre, meta: { facturaId: f.id, uuid: f.uuid, formato: kind } }, content)
    })
  }

  app.get('/api/facturas', async (req) => {
    const u = requireUser(req)
    if (!canRead(u)) throw forbidden()
    const q = listQuery.parse(req.query ?? {})
    const params: unknown[] = [u.orgId]
    const where = ['f.org_id = $1']
    const add = (sql: string, v: unknown) => {
      params.push(v)
      where.push(sql.replace('?', `$${params.length}`))
    }
    if (q.patientId) add('f.patient_id = ?', q.patientId)
    if (q.paymentId) add('f.payment_id = ?', q.paymentId)
    if (q.status) add('f.status = ?', q.status)
    if (u.rol !== 'admin') where.push('NOT EXISTS (SELECT 1 FROM patients p WHERE p.org_id = f.org_id AND p.id = f.patient_id AND p.bloqueado)')
    params.push(q.limit)
    const rows = (await pool.query<FacturaRow>(`SELECT f.* FROM facturas f WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC, f.id LIMIT $${params.length}`, params)).rows
    return rows.map(facturaJson)
  })

  app.get('/api/facturas/:id', async (req) => {
    const u = requireUser(req)
    if (!canRead(u)) throw forbidden()
    return facturaJson(await getFactura(pool, u, (req.params as { id: string }).id))
  })

  app.post('/api/facturas', async (req, reply) => {
    const u = requireUser(req)
    if (!canWrite(u)) throw forbidden()
    const client = pac()
    const body = facturaCreateSchema.parse(req.body ?? {})
    const problem = receptorProblem(body.receptor)
    if (problem) throw badRequest('receptor_invalido', problem)

    // 1) Reserva: una factura "pendiente" por pago (índice único) antes de llamar al PAC.
    const id = randomUUID()
    const { payment } = await tx(pool, async (c) => {
      const payment = await getRow(c, 'payments', u.orgId, body.paymentId, true, u.rol)
      assertNotBlocked(payment)
      if (payment.data.facturado) throw conflict('ya_facturado', 'El pago ya está marcado como facturado.')
      if (!(Number(payment.data.monto) > 0)) throw badRequest('monto_invalido', 'El pago debe tener un monto mayor a cero para facturarse.')
      const t = now()
      try {
        await c.query(
          `INSERT INTO facturas (org_id, id, payment_id, patient_id, status, total, receptor, forma_pago, uso_cfdi, created_at, updated_at, created_by)
           VALUES ($1,$2,$3,$4,'pendiente',$5,$6,$7,$8,$9,$9,$10)`,
          [u.orgId, id, payment.id, payment.patient_id, payment.data.monto, body.receptor, body.formaPago, body.receptor.usoCfdi, t, u.id],
        )
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw conflict('ya_facturado', 'El pago ya tiene una factura vigente o en proceso.')
        throw e
      }
      return { payment }
    })

    // 2) Timbrado.
    let inv: FacturapiInvoice
    try {
      inv = await client.createInvoice(
        invoiceBody({
          receptor: body.receptor,
          formaPago: body.formaPago,
          claveProdServ: body.claveProdServ ?? CLAVE_SERVICIOS_MEDICOS,
          descripcion: body.descripcion ?? String(payment.data.concepto ?? 'Consulta médica'),
          monto: Number(payment.data.monto),
          externalId: payment.id,
        }),
      )
      if (!inv?.id) throw new AppError(502, 'pac_error', 'Respuesta del PAC sin id de factura.')
    } catch (e) {
      const msg = (e as Error).message
      await pool.query("UPDATE facturas SET status = 'error', error = $3, updated_at = $4 WHERE org_id = $1 AND id = $2", [u.orgId, id, String(msg).slice(0, 1000), now()])
      await auditReq(pool, req, { accion: 'crear', recurso: 'facturas', recursoId: id, patientId: payment.patient_id, detalle: { paymentId: payment.id, resultado: 'error' } })
      metrics.facturas.inc({ operacion: 'timbrar', resultado: 'error' })
      throw e
    }
    metrics.facturas.inc({ operacion: 'timbrar', resultado: 'ok' })

    // 3) Guarda el resultado y marca el pago como facturado.
    const f = await tx(pool, async (c) => {
      const t = now()
      const r = (
        await c.query<FacturaRow>(
          `UPDATE facturas SET pac_id = $3, uuid = $4, serie = $5, folio = $6, status = $7, cancellation_status = $8, total = COALESCE($9, total), updated_at = $10
           WHERE org_id = $1 AND id = $2 RETURNING *`,
          [u.orgId, id, inv.id, inv.uuid ?? null, inv.series ?? null, inv.folio_number != null ? String(inv.folio_number) : null, inv.status ?? 'valid', inv.cancellation_status ?? null, inv.total ?? null, t],
        )
      ).rows[0]
      const cur = await getRow(c, 'payments', u.orgId, payment.id, true)
      await updateRow(c, 'payments', u.orgId, payment.id, cur.patient_id, { ...cur.data, facturado: true, rfc: body.receptor.rfc, facturaId: id }, t)
      await auditReq(c, req, { accion: 'crear', recurso: 'facturas', recursoId: id, patientId: payment.patient_id, detalle: { paymentId: payment.id, uuid: inv.uuid, total: inv.total } })
      return r
    })

    // 4) PDF y XML (si falla, se reintenta al pedirlos con GET /api/facturas/:id/pdf|xml).
    for (const kind of ['pdf', 'xml'] as const) {
      try {
        await storeFile(u, f, kind)
      } catch (e) {
        req.log.warn({ err: { message: (e as Error).message }, kind }, 'No se pudo descargar el archivo de la factura')
      }
    }
    return reply.code(201).send(facturaJson(f))
  })

  app.get('/api/facturas/:id/:formato', async (req, reply) => {
    const u = requireUser(req)
    if (!canRead(u)) throw forbidden()
    const { id, formato } = req.params as { id: string; formato: string }
    if (formato !== 'pdf' && formato !== 'xml') throw notFound()
    const f = await getFactura(pool, u, id)
    if (!f.pac_id) throw notFound('La factura no está timbrada.')
    await storeFile(u, f, formato)
    const file = (await pool.query<{ storage_name: string; mime: string; size: string }>('SELECT storage_name, mime, size FROM files WHERE org_id = $1 AND id = $2', [u.orgId, docId(f.id, formato)])).rows[0]
    if (!file) throw notFound('Archivo no encontrado.')
    await auditReq(pool, req, { accion: 'descargar_archivo', recurso: 'facturas', recursoId: f.id, patientId: f.patient_id, detalle: { formato } })
    const nombre = `Factura ${[f.serie, f.folio].filter(Boolean).join('-') || f.uuid || f.id}.${formato}`
    const sent = await sendStoredFile(storage, reply, file, nombre, 'attachment')
    if (sent === false) throw notFound('Archivo no encontrado.')
    return sent
  })

  app.post('/api/facturas/:id/cancelar', async (req) => {
    const u = requireUser(req)
    if (!canWrite(u)) throw forbidden()
    const client = pac()
    const body = facturaCancelSchema.parse(req.body ?? {})
    const f0 = await getFactura(pool, u, (req.params as { id: string }).id)
    if (f0.p_bloqueado) throw pacienteBloqueado()
    if (!f0.pac_id || f0.status !== 'valid') throw conflict('factura_no_vigente', 'Solo se puede cancelar una factura timbrada vigente.')
    const inv = await client.cancel(f0.pac_id, body.motivo, body.sustitucion)
    metrics.facturas.inc({ operacion: 'cancelar', resultado: 'ok' })
    const f = await tx(pool, async (c) => {
      const t = now()
      const status = inv.status ?? f0.status
      const cancelacion = { motivo: body.motivo, sustitucion: body.sustitucion, solicitadaEn: t.toISOString(), solicitadaPor: u.id }
      const r = (
        await c.query<FacturaRow>('UPDATE facturas SET status = $3, cancellation_status = $4, cancelacion = $5, updated_at = $6 WHERE org_id = $1 AND id = $2 RETURNING *', [
          u.orgId,
          f0.id,
          status,
          inv.cancellation_status ?? null,
          cancelacion,
          t,
        ])
      ).rows[0]
      // Cancelada en firme: el pago vuelve a poder facturarse.
      if (status === 'canceled') {
        const p = (await c.query<{ data: Record<string, any>; patient_id: string }>('SELECT data, patient_id FROM payments WHERE org_id = $1 AND id = $2 FOR UPDATE', [u.orgId, f0.payment_id])).rows[0]
        if (p && (!p.data.facturaId || p.data.facturaId === f0.id)) {
          const data: Record<string, any> = { ...p.data, facturado: false }
          delete data.facturaId
          await updateRow(c, 'payments', u.orgId, f0.payment_id, p.patient_id, data, t)
        }
      }
      await auditReq(c, req, { accion: 'actualizar', recurso: 'facturas', recursoId: f0.id, patientId: f0.patient_id, detalle: { operacion: 'cancelar', motivo: body.motivo, uuid: f0.uuid, status } })
      return r
    })
    return facturaJson(f)
  })

  app.post('/api/facturas/:id/enviar', async (req, reply) => {
    const u = requireUser(req)
    if (!canWrite(u)) throw forbidden()
    const client = pac()
    const { email } = enviarSchema.parse(req.body ?? {})
    const f = await getFactura(pool, u, (req.params as { id: string }).id)
    if (f.p_bloqueado) throw pacienteBloqueado()
    if (!f.pac_id) throw conflict('factura_no_vigente', 'La factura no está timbrada.')
    if (!email && !f.receptor.email) throw badRequest('sin_correo', 'Indica el correo del receptor.')
    await client.sendByEmail(f.pac_id, email)
    // La bitácora registra a dónde salió el CFDI (contiene nombre y RFC del receptor).
    await auditReq(pool, req, { accion: 'actualizar', recurso: 'facturas', recursoId: f.id, patientId: f.patient_id, detalle: { operacion: 'enviar_correo', destino: email ?? String(f.receptor.email) } })
    return reply.code(204).send()
  })
}
