// Correo saliente (SMTP con nodemailer). Si no hay SMTP configurado, `enabled` es false y no se envía nada.
import nodemailer, { type Transporter } from 'nodemailer'
import type { Config } from './config.js'

export interface MailMessage {
  to: string | string[]
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  readonly enabled: boolean
  send(msg: MailMessage): Promise<void>
}

export function createMailer(cfg: Config, transport?: Transporter): Mailer {
  let t = transport
  if (!t && cfg.smtp) {
    t =
      'url' in cfg.smtp
        ? nodemailer.createTransport(cfg.smtp.url)
        : nodemailer.createTransport({
            host: cfg.smtp.host,
            port: cfg.smtp.port,
            secure: cfg.smtp.secure,
            auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass ?? '' } : undefined,
          })
  }
  if (!t) return { enabled: false, send: async () => {} }
  const tr = t
  return {
    enabled: true,
    async send(msg) {
      await tr.sendMail({ from: cfg.mailFrom, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html })
    },
  }
}

/** Escapa texto para insertarlo en HTML de correos. */
export const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// ---------- Tareas en segundo plano (envíos que no deben retrasar la respuesta) ----------
const enCurso = new Set<Promise<unknown>>()

/** Ejecuta una promesa sin esperarla (los errores deben manejarse en ella). Se puede esperar con esperarSegundoPlano. */
export function enSegundoPlano(p: Promise<unknown>) {
  const q: Promise<unknown> = p.catch(() => {}).finally(() => enCurso.delete(q))
  enCurso.add(q)
}

/** Espera las tareas en segundo plano pendientes (pruebas y apagado ordenado). */
export async function esperarSegundoPlano(timeoutMs = 10_000) {
  const limite = Date.now() + timeoutMs
  while (enCurso.size && Date.now() < limite) await Promise.race([Promise.all([...enCurso]), new Promise((r) => setTimeout(r, Math.max(1, limite - Date.now())))])
}
