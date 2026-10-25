// Regresiones de la revisión de seguridad (docs/operacion/revision-seguridad.md).
import nodemailer from 'nodemailer'
import { generate } from 'otplib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { nowMs } from '../src/clock.js'
import { esperarSegundoPlano } from '../src/mail.js'
import { ADMIN, Client, loginAs, PASSWORD, setupEnv, userClient, type TestEnv } from './helpers.js'

interface Sent {
  to: { address: string }[]
  text: string
}
const sent: Sent[] = []
const transport = nodemailer.createTransport({ jsonTransport: true })
const origSend = transport.sendMail.bind(transport)
transport.sendMail = (async (msg: any) => {
  const info = await origSend(msg)
  sent.push(JSON.parse(info.message as unknown as string))
  return info
}) as typeof transport.sendMail
const tokenFrom = (m: Sent) => decodeURIComponent(/restablecer\?t=([A-Za-z0-9_%-]+)/.exec(m.text)![1])

let env: TestEnv
let admin: Client

beforeAll(async () => {
  env = await setupEnv({ PUBLIC_URL: 'https://clinica.example.mx', RATE_LIMIT_RECUPERAR: '1000' }, { mailTransport: transport })
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
})
afterAll(async () => env.close())

async function duracion(fn: () => Promise<unknown>) {
  const t = performance.now()
  await fn()
  return performance.now() - t
}
const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

describe('login: sin enumeración por tiempo', () => {
  it('una cuenta bloqueada cuesta lo mismo (scrypt) que una inexistente', async () => {
    const u = await userClient(env.app, admin, 'recepcion')
    for (let i = 0; i < 5; i++) await new Client(env.app).login(u.email, 'incorrecta-123456')
    expect((await new Client(env.app).login(u.email, 'incorrecta-123456')).statusCode).toBe(423)
    const bloqueada: number[] = []
    const inexistente: number[] = []
    for (let i = 0; i < 5; i++) {
      bloqueada.push(await duracion(() => new Client(env.app).login(u.email, 'incorrecta-123456')))
      inexistente.push(await duracion(() => new Client(env.app).login('nadie-' + i + '@clinica-a.mx', 'incorrecta-123456')))
    }
    // Antes de la corrección la rama "bloqueada" respondía sin calcular scrypt (≈1 ms vs ≈50–150 ms).
    expect(mediana(bloqueada)).toBeGreaterThan(mediana(inexistente) * 0.5)
  })
})

describe('TOTP', () => {
  it('el mismo código no sirve para dos inicios de sesión simultáneos', async () => {
    const u = await userClient(env.app, admin, 'medico')
    const { secret } = (await u.post('/api/auth/totp/setup')).data
    // El código de activación consume su paso; se espera al siguiente paso para el login.
    const enable = await generate({ secret, epoch: Math.floor(nowMs() / 1000) - 30 })
    expect((await u.post('/api/auth/totp/enable', { code: enable })).statusCode).toBe(204)
    const code = await generate({ secret, epoch: Math.floor(nowMs() / 1000) })
    const [a, b] = await Promise.all([new Client(env.app).login(u.email, PASSWORD, code), new Client(env.app).login(u.email, PASSWORD, code)])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 401])
  })
})

describe('recuperación de contraseña', () => {
  it('la respuesta no espera al SMTP (no revela por tiempo si el correo existe)', async () => {
    // Transporte que nunca termina: antes de la corrección la solicitud quedaba colgada.
    const lento = nodemailer.createTransport({ name: 'lento', version: '1', send: () => {} } as any)
    const e2 = await setupEnv({ PUBLIC_URL: 'https://x.mx', RATE_LIMIT_RECUPERAR: '1000' }, { mailTransport: lento })
    try {
      const r = await Promise.race([
        new Client(e2.app).post('/api/auth/recuperar', { email: ADMIN.email }),
        new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), 5000)),
      ])
      expect(r).not.toBe('timeout')
      expect((r as { statusCode: number }).statusCode).toBe(204)
    } finally {
      await e2.close()
    }
  })

  it('cambiar la contraseña invalida los enlaces de recuperación pendientes', async () => {
    const u = await userClient(env.app, admin, 'enfermeria')
    sent.length = 0
    await new Client(env.app).post('/api/auth/recuperar', { email: u.email })
    await esperarSegundoPlano()
    const token = tokenFrom(sent[0])
    expect((await u.post('/api/auth/password', { actual: PASSWORD, nueva: 'Cambio-Propio-2026' })).statusCode).toBe(204)
    expect((await new Client(env.app).post('/api/auth/restablecer', { token, nueva: 'Atacante-Clave-2026' })).data.error).toBe('token_invalido')
  })

  it('el restablecimiento por un admin o la desactivación también los invalidan', async () => {
    const u = await userClient(env.app, admin, 'recepcion')
    sent.length = 0
    await new Client(env.app).post('/api/auth/recuperar', { email: u.email })
    await esperarSegundoPlano()
    const t1 = tokenFrom(sent[0])
    expect((await admin.patch(`/api/users/${u.userId}`, { password: 'Admin-Reset-2026x' })).statusCode).toBe(200)
    expect((await new Client(env.app).post('/api/auth/restablecer', { token: t1, nueva: 'Atacante-Clave-2026' })).data.error).toBe('token_invalido')
  })
})

describe('límite de intentos con sesión', () => {
  it('cambiar contraseña / desactivar 2FA tienen el límite por IP del login', async () => {
    const e2 = await setupEnv({ RATE_LIMIT_LOGIN: '3' })
    try {
      const c = await loginAs(e2.app, ADMIN.email, ADMIN.password)
      const codes: number[] = []
      for (let i = 0; i < 4; i++) codes.push((await c.post('/api/auth/password', { actual: 'mala-' + i + '-xxxxxx', nueva: 'Otra-Clave-Larga-1' })).statusCode)
      expect(codes).toEqual([400, 400, 400, 429])
    } finally {
      await e2.close()
    }
  })
})

describe('configuración: URLs de servicios', () => {
  it('solo http(s) o rutas del mismo origen (nada de javascript:/data:)', async () => {
    for (const mala of ['javascript:alert(document.cookie)', 'data:text/html,<script>1</script>', '//evil.example/x', 'https://u:p@pacs.local', 'pacs.local'])
      expect((await admin.patch('/api/settings', { servicios: { ohif: mala } })).statusCode).toBe(400)
    const ok = await admin.patch('/api/settings', { servicios: { ohif: 'https://ohif.clinica.mx', orthanc: '/orthanc', whisper: 'http://whisper:8000' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.data.servicios).toMatchObject({ ohif: 'https://ohif.clinica.mx', orthanc: '/orthanc', whisper: 'http://whisper:8000' })
  })
})
