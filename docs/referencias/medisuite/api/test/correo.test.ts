import nodemailer from 'nodemailer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, resetClock } from '../src/clock.js'
import { esperarSegundoPlano } from '../src/mail.js'
import { runSchedulerOnce } from '../src/scheduler.js'
import { ADMIN, Client, loginAs, PASSWORD, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

interface Sent {
  to: { address: string }[]
  subject: string
  text: string
  html?: string
  from: { address: string }
}

const sent: Sent[] = []
const transport = nodemailer.createTransport({ jsonTransport: true })
const origSend = transport.sendMail.bind(transport)
transport.sendMail = (async (msg: any) => {
  const info = await origSend(msg)
  sent.push(JSON.parse(info.message as unknown as string))
  return info
}) as typeof transport.sendMail

let env: TestEnv
let admin: Client, medico: Client & { email: string; userId: string }

const tokenFrom = (m: Sent) => decodeURIComponent(/restablecer\?t=([A-Za-z0-9_%-]+)/.exec(m.text)![1])

beforeAll(async () => {
  env = await setupEnv({ PUBLIC_URL: 'https://clinica.example.mx/', MAIL_FROM: 'MediSuite <no-responder@clinica.example.mx>', RATE_LIMIT_RECUPERAR: '1000' }, { mailTransport: transport })
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  medico = await userClient(env.app, admin, 'medico')
})
afterAll(async () => {
  resetClock()
  await env.close()
})

describe('recuperación de contraseña', () => {
  it('flujo completo: correo con enlace, token de un solo uso, cierra sesiones', async () => {
    sent.length = 0
    const anon = new Client(env.app)
    const r = await anon.post('/api/auth/recuperar', { email: medico.email.toUpperCase() })
    expect(r.statusCode).toBe(204)
    await esperarSegundoPlano() // el correo se envía sin retrasar la respuesta
    expect(sent).toHaveLength(1)
    expect(sent[0].to[0].address).toBe(medico.email)
    expect(sent[0].from.address).toBe('no-responder@clinica.example.mx')
    expect(sent[0].text).toContain('https://clinica.example.mx/#/restablecer?t=')
    const token = tokenFrom(sent[0])
    // En BD solo el hash
    const rows = (await env.pool.query('SELECT token_hash FROM password_resets')).rows
    expect(rows.some((x) => x.token_hash === token)).toBe(false)

    expect((await anon.post('/api/auth/restablecer', { token, nueva: 'corta' })).data.error).toBe('contrasena_debil')
    const ok = await anon.post('/api/auth/restablecer', { token, nueva: 'Nueva-Clave-Segura-77' })
    expect(ok.statusCode).toBe(204)
    // La sesión previa se cerró
    expect((await medico.get('/api/auth/me')).statusCode).toBe(401)
    expect((await new Client(env.app).login(medico.email, PASSWORD)).statusCode).toBe(401)
    expect((await new Client(env.app).login(medico.email, 'Nueva-Clave-Segura-77')).statusCode).toBe(200)
    // Un solo uso
    expect((await anon.post('/api/auth/restablecer', { token, nueva: 'Otra-Clave-Segura-88' })).data.error).toBe('token_invalido')
    const audit = await admin.get('/api/audit?limit=20')
    expect(audit.data.some((a: any) => a.detalle?.operacion === 'restablecer' && a.recursoId === medico.userId)).toBe(true)
  })

  it('correo inexistente → 204 sin enviar; token expira a los 30 min; nuevo enlace invalida el anterior', async () => {
    sent.length = 0
    const anon = new Client(env.app)
    expect((await anon.post('/api/auth/recuperar', { email: 'nadie@clinica-a.mx' })).statusCode).toBe(204)
    await esperarSegundoPlano()
    expect(sent).toHaveLength(0)
    expect((await anon.post('/api/auth/restablecer', { token: 'x'.repeat(43), nueva: 'Nueva-Clave-Segura-77' })).data.error).toBe('token_invalido')

    const u = await userClient(env.app, admin, 'recepcion')
    await anon.post('/api/auth/recuperar', { email: u.email })
    await anon.post('/api/auth/recuperar', { email: u.email })
    await esperarSegundoPlano()
    const [t1, t2] = sent.map(tokenFrom)
    expect((await anon.post('/api/auth/restablecer', { token: t1, nueva: 'Nueva-Clave-Segura-77' })).data.error).toBe('token_invalido')
    advanceClock(31 * 60 * 1000)
    try {
      expect((await anon.post('/api/auth/restablecer', { token: t2, nueva: 'Nueva-Clave-Segura-77' })).data.error).toBe('token_invalido')
    } finally {
      resetClock()
    }
    // Máximo 3 por hora por usuario
    sent.length = 0
    for (let i = 0; i < 3; i++) await anon.post('/api/auth/recuperar', { email: u.email })
    await esperarSegundoPlano()
    expect(sent).toHaveLength(1)
  })

  it('límite por IP', async () => {
    const e2 = await setupEnv({ PUBLIC_URL: 'https://x.mx', RATE_LIMIT_RECUPERAR: '2' }, { mailTransport: transport })
    try {
      const anon = new Client(e2.app)
      expect((await anon.post('/api/auth/recuperar', { email: 'a@b.mx' })).statusCode).toBe(204)
      expect((await anon.post('/api/auth/recuperar', { email: 'a@b.mx' })).statusCode).toBe(204)
      expect((await anon.post('/api/auth/recuperar', { email: 'a@b.mx' })).statusCode).toBe(429)
    } finally {
      await e2.close()
    }
  })

  it('sin SMTP → 503 correo_no_configurado', async () => {
    const e2 = await setupEnv()
    try {
      const r = await new Client(e2.app).post('/api/auth/recuperar', { email: ADMIN.email })
      expect(r.statusCode).toBe(503)
      expect(r.data.error).toBe('correo_no_configurado')
    } finally {
      await e2.close()
    }
  })
})

describe('alertas y recordatorios por correo', () => {
  it('bloqueo de cuenta avisa a los administradores', async () => {
    const u = await userClient(env.app, admin, 'enfermeria')
    sent.length = 0
    for (let i = 0; i < 5; i++) await new Client(env.app).login(u.email, 'incorrecta-xxxx')
    expect(sent).toHaveLength(1)
    expect(sent[0].to.map((t) => t.address)).toEqual([ADMIN.email])
    expect(sent[0].subject).toContain('bloqueada')
    expect(sent[0].text).toContain(u.email)
  })

  it('sin WhatsApp, el recordatorio sale por correo si el paciente tiene email', async () => {
    const p = (await admin.post('/api/patients', samplePatient({ nombre: 'Luis', apellidos: 'Mora', email: 'luis@example.mx', telefono: '5512345678' }))).data.id
    const inicio = new Date(Date.now() + 20 * 3600_000).toISOString()
    const a = await admin.post('/api/appointments', { patientId: p, inicio, fin: new Date(Date.now() + 21 * 3600_000).toISOString(), tipo: 'subsecuente', estado: 'confirmada' })
    sent.length = 0
    expect(await runSchedulerOnce(env.app.ctx)).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].to[0].address).toBe('luis@example.mx')
    expect(sent[0].subject).toBe('Recordatorio de cita — Clínica A')
    expect(sent[0].text).toContain('Luis Mora')
    expect(await runSchedulerOnce(env.app.ctx)).toBe(0)
    const ms = (await admin.get(`/api/mensajes?appointmentId=${a.data.id}`)).data
    expect(ms[0]).toMatchObject({ canal: 'email', destino: 'luis@example.mx', estado: 'enviado', horas: 24 })
    // Envío inmediato por correo
    const m = await admin.post(`/api/appointments/${a.data.id}/recordatorio`)
    expect(m.statusCode).toBe(201)
    expect(m.data.canal).toBe('email')
    expect((await new Client(env.app).get('/api/health')).data.servicios.correo).toBe(true)
  })
})
