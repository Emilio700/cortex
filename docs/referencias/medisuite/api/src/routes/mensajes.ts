// Mensajes (recordatorios por WhatsApp/correo): bitácora de envíos, envío de prueba y envío inmediato.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { auditReq } from '../audit.js'
import { now } from '../clock.js'
import { AppError, badRequest, conflict, forbidden, notFound } from '../errors.js'
import { can } from '../permissions.js'
import { citaInfo, elegirCanal, enviarRecordatorio, mensajeJson, type MensajeRow } from '../recordatorios.js'
import { assertNotBlocked, getRow } from '../resources.js'
import { idSchema } from '../schemas.js'
import { requireUser } from '../session.js'
import { getOrg } from '../users.js'
import { normalizePhoneMx, whatsappNoConfigurado } from '../whatsapp.js'

const listQuery = z.object({
  appointmentId: idSchema.optional(),
  patientId: idSchema.optional(),
  estado: z.enum(['pendiente', 'enviado', 'entregado', 'leido', 'fallido', 'respondido']).optional(),
  canal: z.enum(['whatsapp', 'email']).optional(),
  tipo: z.enum(['recordatorio', 'manual', 'prueba']).optional(),
  desde: z.iso.datetime({ offset: true }).optional(),
  hasta: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
})

const pruebaSchema = z.object({ telefono: z.string().min(1).max(40) })

const envioFallido = (m: MensajeRow) => new AppError(502, 'envio_fallido', `No se pudo enviar el mensaje: ${m.error ?? 'error del proveedor'}`, { mensaje: mensajeJson(m) })

export default async function mensajeRoutes(app: FastifyInstance) {
  const ctx = app.ctx
  const { pool, cfg } = ctx

  app.get('/api/mensajes', async (req) => {
    const u = requireUser(req)
    if (!can(u.rol, 'appointments', 'write')) throw forbidden()
    const q = listQuery.parse(req.query ?? {})
    const params: unknown[] = [u.orgId]
    const where = ['m.org_id = $1']
    const add = (sql: string, v: unknown) => {
      params.push(v)
      where.push(sql.replace('?', `$${params.length}`))
    }
    if (q.appointmentId) add('m.appointment_id = ?', q.appointmentId)
    if (q.patientId) add('m.patient_id = ?', q.patientId)
    if (q.estado) add('m.estado = ?', q.estado)
    if (q.canal) add('m.canal = ?', q.canal)
    if (q.tipo) add('m.tipo = ?', q.tipo)
    if (q.desde) add('m.created_at >= ?', new Date(q.desde))
    if (q.hasta) add('m.created_at <= ?', new Date(q.hasta))
    // Los mensajes de pacientes bloqueados solo los ve el administrador.
    if (u.rol !== 'admin') where.push('NOT EXISTS (SELECT 1 FROM patients p WHERE p.org_id = m.org_id AND p.id = m.patient_id AND p.bloqueado)')
    params.push(q.limit)
    const rows = (await pool.query<MensajeRow>(`SELECT m.* FROM mensajes m WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC, m.id LIMIT $${params.length}`, params)).rows
    return rows.map(mensajeJson)
  })

  app.post('/api/mensajes/prueba', async (req, reply) => {
    const u = requireUser(req)
    if (u.rol !== 'admin') throw forbidden()
    if (!cfg.whatsapp) throw whatsappNoConfigurado()
    const { telefono } = pruebaSchema.parse(req.body ?? {})
    const tel = normalizePhoneMx(telefono)
    if (!tel) throw badRequest('telefono_invalido', 'Teléfono inválido: usa 10 dígitos de México (o +52…).')
    const org = await getOrg(pool, u.orgId)
    const m = (await enviarRecordatorio(
      ctx,
      { orgId: u.orgId, appointmentId: 'prueba', patientId: '', inicio: new Date(now().getTime() + 24 * 3600_000), paciente: { nombre: 'Paciente de prueba' }, clinica: org.settings?.clinica ?? org.nombre },
      { canal: 'whatsapp', destino: tel },
      'prueba',
      { createdBy: u.id },
    ))!
    await auditReq(pool, req, { accion: 'crear', recurso: 'mensajes', recursoId: m.id, detalle: { tipo: 'prueba', estado: m.estado } })
    if (m.estado === 'fallido') throw envioFallido(m)
    return reply.code(201).send(mensajeJson(m))
  })

  app.post('/api/appointments/:id/recordatorio', async (req, reply) => {
    const u = requireUser(req)
    if (!can(u.rol, 'appointments', 'write')) throw forbidden()
    const id = (req.params as { id: string }).id
    if (!idSchema.safeParse(id).success) throw notFound()
    const row = await getRow(pool, 'appointments', u.orgId, id, false, u.rol)
    assertNotBlocked(row)
    if (!cfg.whatsapp && !ctx.mailer.enabled) throw whatsappNoConfigurado()
    if (['cancelada', 'atendida', 'no-asistio'].includes(row.data.estado)) throw conflict('cita_no_vigente', 'La cita no está vigente (cancelada, atendida o no asistió).')
    const cita = await citaInfo(pool, u.orgId, id)
    if (!cita) throw notFound()
    const canal = elegirCanal(ctx, cita.paciente)
    if (!canal) {
      if (!cfg.whatsapp) throw whatsappNoConfigurado()
      throw conflict('sin_contacto', 'El paciente no tiene un teléfono válido de México' + (ctx.mailer.enabled ? ' ni correo.' : '.'))
    }
    const m = (await enviarRecordatorio(ctx, cita, canal, 'manual', { createdBy: u.id }))!
    await auditReq(pool, req, { accion: 'crear', recurso: 'mensajes', recursoId: m.id, patientId: cita.patientId, detalle: { tipo: 'manual', canal: m.canal, appointmentId: id, estado: m.estado } })
    if (m.estado === 'fallido') throw envioFallido(m)
    return reply.code(201).send(mensajeJson(m))
  })
}
