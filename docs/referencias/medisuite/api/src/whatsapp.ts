// Cliente mínimo de WhatsApp Cloud API (Meta Graph API): mensajes de plantilla y verificación del webhook.
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WhatsAppConfig } from './config.js'
import { AppError } from './errors.js'
import type { FetchFn } from './types.js'

export const whatsappNoConfigurado = () =>
  new AppError(503, 'whatsapp_no_configurado', 'WhatsApp no está configurado en el servidor (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE).')

/**
 * Normaliza un teléfono mexicano a E.164 (+52 + 10 dígitos). Acepta espacios, guiones, paréntesis,
 * prefijos 044/045 (celular antiguo), 01, 52 y el antiguo 521 de celulares. Devuelve null si no es válido.
 */
export function normalizePhoneMx(input: string | undefined | null): string | null {
  if (!input) return null
  const raw = String(input).trim()
  let d = raw.replace(/\D/g, '')
  if (raw.startsWith('+') || raw.startsWith('00')) {
    if (raw.startsWith('00')) d = d.slice(2)
    if (!d.startsWith('52')) return null // solo números de México
  }
  if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3)
  if (d.length === 13 && (d.startsWith('044') || d.startsWith('045'))) d = d.slice(3)
  if (d.length === 12 && d.startsWith('01')) d = d.slice(2)
  if (d.length === 10) d = '52' + d
  if (!/^52[1-9]\d{9}$/.test(d)) return null
  return '+' + d
}

export interface TemplateParams {
  nombre: string
  fecha: string
  hora: string
  clinica: string
  /** Id de la cita para los botones de respuesta rápida (CONFIRMAR:<id> / REAGENDAR:<id>). */
  appointmentId: string
}

/** Cuerpo del mensaje de plantilla. La plantilla aprobada debe tener 4 variables en el cuerpo y 2 botones de respuesta rápida. */
export function templatePayload(cfg: WhatsAppConfig, toE164: string, p: TemplateParams) {
  const text = (s: string) => ({ type: 'text', text: s.slice(0, 1000) || '-' })
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toE164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: cfg.template,
      language: { code: cfg.templateLang },
      components: [
        { type: 'body', parameters: [text(p.nombre), text(p.fecha), text(p.hora), text(p.clinica)] },
        { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `CONFIRMAR:${p.appointmentId}` }] },
        { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `REAGENDAR:${p.appointmentId}` }] },
      ],
    },
  }
}

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message)
  }
}

/** Envía la plantilla. Devuelve el id del mensaje (wamid). Lanza WhatsAppSendError con el detalle de Meta. */
export async function sendTemplate(fetchFn: FetchFn, cfg: WhatsAppConfig, toE164: string, p: TemplateParams): Promise<string> {
  let res: Response
  try {
    res = await fetchFn(`${cfg.apiBase}/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(templatePayload(cfg, toE164, p)),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    throw new WhatsAppSendError(`No se pudo contactar a WhatsApp: ${(e as Error).message}`)
  }
  let body: any
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  if (!res.ok) {
    const err = body?.error
    const msg = err ? `${err.code ?? res.status}: ${err.error_data?.details ?? err.message ?? 'error'}` : `HTTP ${res.status}`
    throw new WhatsAppSendError(String(msg).slice(0, 500), res.status)
  }
  const id = body?.messages?.[0]?.id
  if (typeof id !== 'string') throw new WhatsAppSendError('Respuesta de WhatsApp sin id de mensaje.')
  return id
}

/** Verifica `X-Hub-Signature-256: sha256=<hex>` (HMAC-SHA256 del cuerpo crudo con el App Secret). */
export function verifySignature(raw: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false
  const given = Buffer.from(header.slice(7), 'hex')
  const expected = createHmac('sha256', appSecret).update(raw).digest()
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Fecha y hora legibles en la zona de la clínica: "lunes 2 de noviembre de 2026", "10:00". */
export function fechaHora(d: Date, timeZone: string): { fecha: string; hora: string } {
  const fecha = new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  const hora = new Intl.DateTimeFormat('es-MX', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return { fecha, hora }
}
