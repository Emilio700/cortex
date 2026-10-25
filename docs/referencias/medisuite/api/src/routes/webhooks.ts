// Webhook de WhatsApp Cloud API. Público (sin sesión ni CSRF) pero con firma HMAC obligatoria.
//  - GET: verificación de suscripción (hub.mode / hub.verify_token / hub.challenge).
//  - POST: respuestas de botones (CONFIRMAR:<citaId> / REAGENDAR:<citaId>) y estados (sent/delivered/read/failed).
import type { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import type pg from 'pg'
import { audit } from '../audit.js'
import { now } from '../clock.js'
import { tx } from '../db.js'
import { AppError } from '../errors.js'
import type { MensajeRow } from '../recordatorios.js'
import type { AppContext } from '../types.js'
import { verifySignature, whatsappNoConfigurado } from '../whatsapp.js'

const ESTADO_RANK: Record<string, number> = { pendiente: 0, enviado: 1, entregado: 2, leido: 3, respondido: 4, fallido: 5 }
const STATUS_MAP: Record<string, { estado: string; col?: string }> = {
  sent: { estado: 'enviado' },
  delivered: { estado: 'entregado', col: 'entregado_en' },
  read: { estado: 'leido', col: 'leido_en' },
  failed: { estado: 'fallido' },
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function handleStatus(pool: pg.Pool, st: any) {
  const map = STATUS_MAP[String(st?.status)]
  if (!map || typeof st?.id !== 'string') return
  const t = st.timestamp ? new Date(Number(st.timestamp) * 1000) : now()
  const ts = isNaN(t.getTime()) ? now() : t
  const m = (await pool.query<MensajeRow>('SELECT * FROM mensajes WHERE wa_id = $1', [st.id])).rows[0]
  if (!m) return
  const sets = ['updated_at = $2']
  const params: unknown[] = [m.id, now()]
  const add = (sql: string, v: unknown) => {
    params.push(v)
    sets.push(sql.replace('?', `$${params.length}`))
  }
  // Los estados pueden llegar desordenados: nunca se retrocede (salvo a fallido).
  if (map.estado === 'fallido') {
    add('estado = ?', 'fallido')
    const e = st.errors?.[0]
    add('error = ?', String(e ? `${e.code ?? ''} ${e.title ?? e.message ?? ''}`.trim() : 'Falló la entrega').slice(0, 500))
  } else if ((ESTADO_RANK[map.estado] ?? 0) > (ESTADO_RANK[m.estado] ?? 0) && m.estado !== 'fallido') add('estado = ?', map.estado)
  if (map.col) add(`${map.col} = COALESCE(${map.col}, ?)`, ts)
  await pool.query(`UPDATE mensajes SET ${sets.join(', ')} WHERE id = $1`, params)
}

async function handleReply(pool: pg.Pool, msg: any) {
  let payload: string | undefined
  if (msg?.type === 'button') payload = msg.button?.payload
  else if (msg?.type === 'interactive' && msg.interactive?.type === 'button_reply') payload = msg.interactive.button_reply?.id
  if (typeof payload !== 'string') return
  const m = /^(CONFIRMAR|REAGENDAR):([A-Za-z0-9_-]{1,64})$/.exec(payload)
  if (!m) return
  const [, accion, apptId] = m
  const from = '+' + String(msg.from ?? '').replace(/\D/g, '')
  const contextId = typeof msg.context?.id === 'string' ? msg.context.id : undefined

  // Ubica el mensaje original: por el id del mensaje citado o, si no viene, por cita + teléfono del remitente.
  // El remitente debe ser el destinatario del recordatorio (las citas no son únicas entre organizaciones).
  let men: MensajeRow | undefined
  if (contextId) men = (await pool.query<MensajeRow>('SELECT * FROM mensajes WHERE wa_id = $1 AND appointment_id = $2', [contextId, apptId])).rows[0]
  if (!men)
    men = (
      await pool.query<MensajeRow>(
        "SELECT * FROM mensajes WHERE appointment_id = $1 AND canal = 'whatsapp' AND destino = $2 AND tipo <> 'prueba' ORDER BY created_at DESC LIMIT 1",
        [apptId, from],
      )
    ).rows[0]
  if (!men || men.destino !== from) return
  const orgId = men.org_id
  const t = now()

  await tx(pool, async (c) => {
    const a = (
      await c.query<{ data: Record<string, any>; patient_id: string; bloqueado: boolean }>(
        `SELECT a.data, a.patient_id, p.bloqueado FROM appointments a JOIN patients p ON p.org_id = a.org_id AND p.id = a.patient_id
         WHERE a.org_id = $1 AND a.id = $2 AND a.deleted_at IS NULL AND p.deleted_at IS NULL FOR UPDATE OF a`,
        [orgId, apptId],
      )
    ).rows[0]
    await c.query('UPDATE mensajes SET estado = $2, respuesta = $3, respondido_en = $4, updated_at = $4 WHERE id = $1', [men!.id, 'respondido', accion, t])
    if (!a || a.bloqueado) return
    const data = { ...a.data }
    let cambio: string | undefined
    if (accion === 'CONFIRMAR' && data.estado === 'agendada') {
      data.estado = 'confirmada'
      data.confirmacion = { canal: 'whatsapp', fecha: t.toISOString() }
      data.reagendar = false
      cambio = 'confirmar_whatsapp'
    } else if (accion === 'REAGENDAR' && ['agendada', 'confirmada'].includes(data.estado)) {
      data.reagendar = true
      const nota = `[${t.toISOString().slice(0, 16).replace('T', ' ')} UTC] El paciente solicitó reagendar por WhatsApp.`
      data.notas = data.notas ? `${data.notas}\n${nota}`.slice(-5000) : nota
      cambio = 'reagendar_whatsapp'
    }
    if (!cambio) return
    await c.query('UPDATE appointments SET data = $3, updated_at = $4 WHERE org_id = $1 AND id = $2', [orgId, apptId, data, t])
    await audit(c, { orgId, userNombre: 'WhatsApp (paciente)', accion: 'actualizar', recurso: 'appointments', recursoId: apptId, patientId: a.patient_id, detalle: { operacion: cambio, mensajeId: men!.id } })
  })
}

export async function processWebhook(ctx: AppContext, body: any) {
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = ch?.value
      if (ch?.field !== 'messages' || !v) continue
      for (const st of Array.isArray(v.statuses) ? v.statuses : []) {
        ctx.metrics.webhooks.inc({ tipo: 'estado' })
        await handleStatus(ctx.pool, st)
      }
      for (const msg of Array.isArray(v.messages) ? v.messages : []) {
        ctx.metrics.webhooks.inc({ tipo: 'mensaje' })
        await handleReply(ctx.pool, msg)
      }
    }
  }
}

export default async function webhookRoutes(app: FastifyInstance) {
  const ctx = app.ctx
  const wa = ctx.cfg.whatsapp

  // Cuerpo crudo para verificar la firma (solo en este contexto encapsulado).
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  app.get('/api/webhooks/whatsapp', async (req, reply) => {
    if (!wa || !wa.verifyToken) throw whatsappNoConfigurado()
    const q = req.query as Record<string, string | undefined>
    if (q['hub.mode'] === 'subscribe' && typeof q['hub.verify_token'] === 'string' && safeEq(q['hub.verify_token'], wa.verifyToken) && q['hub.challenge'])
      return reply.type('text/plain; charset=utf-8').send(String(q['hub.challenge']).slice(0, 200))
    throw new AppError(403, 'verificacion_invalida', 'Token de verificación inválido.')
  })

  app.post('/api/webhooks/whatsapp', async (req, reply) => {
    if (!wa || !wa.appSecret) throw whatsappNoConfigurado()
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (!verifySignature(raw, req.headers['x-hub-signature-256'] as string | undefined, wa.appSecret)) {
      ctx.metrics.webhooks.inc({ tipo: 'firma_invalida' })
      throw new AppError(401, 'firma_invalida', 'Firma X-Hub-Signature-256 inválida.')
    }
    let body: unknown
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      throw new AppError(400, 'json_invalido', 'El cuerpo de la solicitud no es JSON válido.')
    }
    try {
      await processWebhook(ctx, body)
    } catch (e) {
      // Meta reintenta ante errores 5xx; se registra y se responde 500 para que reintente.
      req.log.error({ err: { message: (e as Error).message } }, 'Webhook de WhatsApp: error al procesar')
      throw e
    }
    return reply.code(200).send({ ok: true })
  })
}
