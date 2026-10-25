// Recordatorios de citas: WhatsApp (plantilla con botones) o, como respaldo, correo.
// Cada envío queda en la tabla `mensajes`; el automático es idempotente por (cita, tipo, horas, inicio).
import { randomUUID } from 'node:crypto'
import { now } from './clock.js'
import type { Q } from './db.js'
import { escHtml } from './mail.js'
import type { AppContext } from './types.js'
import { fechaHora, normalizePhoneMx, sendTemplate } from './whatsapp.js'

export interface MensajeRow {
  id: string
  org_id: string
  appointment_id: string | null
  patient_id: string | null
  canal: 'whatsapp' | 'email'
  tipo: 'recordatorio' | 'manual' | 'prueba'
  horas: number | null
  cita_inicio: Date | null
  destino: string
  estado: string
  wa_id: string | null
  error: string | null
  respuesta: string | null
  created_at: Date
  updated_at: Date
  enviado_en: Date | null
  entregado_en: Date | null
  leido_en: Date | null
  respondido_en: Date | null
  created_by: string | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : undefined)

export function mensajeJson(m: MensajeRow) {
  const out: Record<string, unknown> = {
    id: m.id,
    appointmentId: m.appointment_id ?? undefined,
    patientId: m.patient_id ?? undefined,
    canal: m.canal,
    tipo: m.tipo,
    horas: m.horas ?? undefined,
    citaInicio: iso(m.cita_inicio),
    destino: m.destino,
    estado: m.estado,
    waId: m.wa_id ?? undefined,
    error: m.error ?? undefined,
    respuesta: m.respuesta ?? undefined,
    creadoEn: m.created_at.toISOString(),
    actualizadoEn: m.updated_at.toISOString(),
    enviadoEn: iso(m.enviado_en),
    entregadoEn: iso(m.entregado_en),
    leidoEn: iso(m.leido_en),
    respondidoEn: iso(m.respondido_en),
    creadoPor: m.created_by ?? undefined,
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

export interface CitaInfo {
  orgId: string
  appointmentId: string
  patientId: string
  inicio: Date
  paciente: { nombre?: string; apellidos?: string; telefono?: string; email?: string }
  clinica: string
}

export type Canal = { canal: 'whatsapp'; destino: string } | { canal: 'email'; destino: string }

/** Elige el canal: WhatsApp si está configurado y hay teléfono válido; si no, correo si hay SMTP y email. */
export function elegirCanal(ctx: AppContext, p: CitaInfo['paciente']): Canal | null {
  if (ctx.cfg.whatsapp) {
    const tel = normalizePhoneMx(p.telefono)
    if (tel) return { canal: 'whatsapp', destino: tel }
  }
  const email = p.email?.trim()
  if (ctx.mailer.enabled && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { canal: 'email', destino: email.toLowerCase() }
  return null
}

/**
 * Registra y envía un mensaje. Para tipo 'recordatorio' devuelve null si ya existía (idempotencia).
 * Nunca lanza por fallas del proveedor: el mensaje queda como 'fallido' con el error.
 */
export async function enviarRecordatorio(
  ctx: AppContext,
  cita: CitaInfo,
  canal: Canal,
  tipo: 'recordatorio' | 'manual' | 'prueba',
  opts: { horas?: number; createdBy?: string } = {},
): Promise<MensajeRow | null> {
  const { pool, cfg, metrics } = ctx
  const t = now()
  const id = randomUUID()
  const ins = await pool.query<MensajeRow>(
    `INSERT INTO mensajes (id, org_id, appointment_id, patient_id, canal, tipo, horas, cita_inicio, destino, estado, created_at, updated_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendiente',$10,$10,$11)
     ON CONFLICT DO NOTHING RETURNING *`,
    [id, cita.orgId, tipo === 'prueba' ? null : cita.appointmentId, tipo === 'prueba' ? null : cita.patientId, canal.canal, tipo, opts.horas ?? null, tipo === 'prueba' ? null : cita.inicio, canal.destino, t, opts.createdBy ?? null],
  )
  if (!ins.rows[0]) return null

  const { fecha, hora } = fechaHora(cita.inicio, cfg.timeZone)
  const nombre = [cita.paciente.nombre, cita.paciente.apellidos].filter(Boolean).join(' ').trim() || 'Paciente'
  let waId: string | null = null
  let error: string | null = null
  try {
    if (canal.canal === 'whatsapp') {
      waId = await sendTemplate(ctx.fetch, cfg.whatsapp!, canal.destino, { nombre, fecha, hora, clinica: cita.clinica, appointmentId: cita.appointmentId })
    } else {
      const text = `Hola ${nombre}:\n\nLe recordamos su cita en ${cita.clinica} el ${fecha} a las ${hora} h.\n\nSi necesita confirmar o reagendar, comuníquese con la clínica.\n\n— ${cita.clinica}`
      const html = `<p>Hola ${escHtml(nombre)}:</p><p>Le recordamos su cita en <strong>${escHtml(cita.clinica)}</strong> el <strong>${escHtml(fecha)}</strong> a las <strong>${escHtml(hora)} h</strong>.</p><p>Si necesita confirmar o reagendar, comuníquese con la clínica.</p>`
      await ctx.mailer.send({ to: canal.destino, subject: `Recordatorio de cita — ${cita.clinica}`, text, html })
    }
  } catch (e) {
    error = String((e as Error).message ?? e).slice(0, 500)
  }
  const t2 = now()
  const estado = error ? 'fallido' : 'enviado'
  metrics.mensajes.inc({ canal: canal.canal, estado })
  return (
    await pool.query<MensajeRow>(`UPDATE mensajes SET estado = $2, wa_id = $3, error = $4, enviado_en = $5, updated_at = $6 WHERE id = $1 RETURNING *`, [
      id,
      estado,
      waId,
      error,
      error ? null : t2,
      t2,
    ])
  ).rows[0]
}

/** Datos de la cita + paciente + clínica para un recordatorio (null si no aplica). */
export async function citaInfo(q: Q, orgId: string, appointmentId: string): Promise<CitaInfo | null> {
  const r = (
    await q.query<{ id: string; patient_id: string; data: Record<string, any>; pdata: Record<string, any>; settings: Record<string, any>; nombre: string }>(
      `SELECT a.id, a.patient_id, a.data, p.data AS pdata, o.settings, o.nombre
       FROM appointments a JOIN patients p ON p.org_id = a.org_id AND p.id = a.patient_id JOIN orgs o ON o.id = a.org_id
       WHERE a.org_id = $1 AND a.id = $2 AND a.deleted_at IS NULL AND p.deleted_at IS NULL AND NOT p.bloqueado`,
      [orgId, appointmentId],
    )
  ).rows[0]
  if (!r) return null
  return {
    orgId,
    appointmentId: r.id,
    patientId: r.patient_id,
    inicio: new Date(r.data.inicio),
    paciente: r.pdata,
    clinica: r.settings?.clinica ?? r.nombre,
  }
}

/**
 * Una pasada del programador: para cada cita agendada/confirmada que empieza dentro de la mayor anticipación
 * configurada, envía el recordatorio de la menor anticipación que ya aplica (p. ej. con "24,2": a 24 h y a 2 h).
 * Devuelve cuántos mensajes se intentaron.
 */
export async function procesarRecordatorios(ctx: AppContext): Promise<number> {
  const { pool, cfg } = ctx
  const horas = [...cfg.recordatorioHoras].sort((a, b) => a - b)
  const maxH = horas[horas.length - 1]
  const t = now()
  const rows = (
    await pool.query<{ org_id: string; id: string; patient_id: string; data: Record<string, any>; pdata: Record<string, any>; settings: Record<string, any>; nombre: string }>(
      `SELECT a.org_id, a.id, a.patient_id, a.data, p.data AS pdata, o.settings, o.nombre
       FROM appointments a
       JOIN patients p ON p.org_id = a.org_id AND p.id = a.patient_id AND p.deleted_at IS NULL AND NOT p.bloqueado
       JOIN orgs o ON o.id = a.org_id
       WHERE a.deleted_at IS NULL AND a.data->>'estado' IN ('agendada', 'confirmada')
         AND (a.data->>'inicio')::timestamptz > $1 AND (a.data->>'inicio')::timestamptz <= $2
       ORDER BY (a.data->>'inicio')::timestamptz
       LIMIT 500`,
      [t, new Date(t.getTime() + maxH * 3600_000)],
    )
  ).rows
  let n = 0
  for (const r of rows) {
    const inicio = new Date(r.data.inicio)
    const faltan = (inicio.getTime() - t.getTime()) / 3600_000
    const h = horas.find((x) => faltan <= x)
    if (h === undefined) continue
    const cita: CitaInfo = { orgId: r.org_id, appointmentId: r.id, patientId: r.patient_id, inicio, paciente: r.pdata, clinica: r.settings?.clinica ?? r.nombre }
    const canal = elegirCanal(ctx, cita.paciente)
    if (!canal) continue
    const m = await enviarRecordatorio(ctx, cita, canal, 'recordatorio', { horas: h })
    if (m) n++
  }
  return n
}
