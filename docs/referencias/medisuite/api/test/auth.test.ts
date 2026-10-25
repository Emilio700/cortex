import { generate } from 'otplib'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, nowMs, resetClock } from '../src/clock.js'
import { ADMIN, Client, loginAs, setupEnv, userClient, type TestEnv } from './helpers.js'

let env: TestEnv
beforeAll(async () => {
  env = await setupEnv()
})
afterAll(async () => env.close())
afterEach(() => resetClock())

describe('salud y arranque', () => {
  it('GET /api/health responde con la BD', async () => {
    const r = await new Client(env.app).get('/api/health')
    expect(r.statusCode).toBe(200)
    expect(r.data).toMatchObject({ app: 'medisuite', version: expect.stringMatching(/^1\./), db: 'ok' })
    expect(r.headers['x-content-type-options']).toBe('nosniff')
  })

  it('crea organización, admin y llave de firma en el primer arranque', async () => {
    const { rows } = await env.pool.query('SELECT u.email, u.rol, o.nombre FROM users u JOIN orgs o ON o.id = u.org_id')
    expect(rows).toEqual([{ email: ADMIN.email, rol: 'admin', nombre: 'Clínica A' }])
    const keys = await env.pool.query('SELECT private_enc, public_jwk FROM org_keys')
    expect(keys.rowCount).toBe(1)
    expect(keys.rows[0].private_enc).toMatch(/^v1\./) // cifrada
    expect(keys.rows[0].public_jwk.d).toBeUndefined()
    const jwks = await new Client(env.app).get('/api/public/jwks')
    expect(jwks.data.keys).toHaveLength(1)
    expect(jwks.data.keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256', kid: expect.any(String) })
    expect(jwks.data.keys[0].d).toBeUndefined()
  })
})

describe('login', () => {
  it('ok: devuelve user, org y cookie segura', async () => {
    const c = new Client(env.app)
    const r = await c.login(ADMIN.email, ADMIN.password)
    expect(r.statusCode).toBe(200)
    expect(r.data.user).toMatchObject({ email: ADMIN.email, rol: 'admin', activo: true, totp: false })
    expect(r.data.user.password_hash).toBeUndefined()
    expect(r.data.org).toEqual({ id: expect.any(String), nombre: 'Clínica A' })
    const sc = String(r.headers['set-cookie'])
    expect(sc).toMatch(/ms_session=/)
    expect(sc).toMatch(/HttpOnly/)
    expect(sc).toMatch(/SameSite=Strict/)
    expect(sc).toMatch(/Path=\/api/)
    // El token no se guarda en claro.
    const token = c.cookie!.split('=')[1]
    const s = await env.pool.query('SELECT token_hash FROM sessions')
    expect(s.rows.map((x) => x.token_hash)).not.toContain(token)
    const me = await c.get('/api/auth/me')
    expect(me.statusCode).toBe(200)
    expect(me.data.user.email).toBe(ADMIN.email)
  })

  it('correo con mayúsculas funciona; credenciales malas → 401', async () => {
    expect((await new Client(env.app).login(ADMIN.email.toUpperCase(), ADMIN.password)).statusCode).toBe(200)
    const bad = await new Client(env.app).login(ADMIN.email, 'incorrecta-123')
    expect(bad.statusCode).toBe(401)
    expect(bad.data).toEqual({ error: 'credenciales_invalidas', message: expect.any(String) })
    const nouser = await new Client(env.app).login('nadie@x.mx', 'loquesea-12345')
    expect(nouser.statusCode).toBe(401)
    expect(nouser.data.error).toBe('credenciales_invalidas')
    // Sin cuerpo válido → 400
    const v = await new Client(env.app).post('/api/auth/login', { email: 1 })
    expect(v.statusCode).toBe(400)
    expect(v.data.error).toBe('validacion')
  })

  it('sin sesión → 401', async () => {
    const r = await new Client(env.app).get('/api/patients')
    expect(r.statusCode).toBe(401)
    expect(r.data.error).toBe('no_autenticado')
  })

  it('bloqueo: 5 intentos fallidos → 423 por 15 minutos', async () => {
    const admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
    const u = await userClient(env.app, admin, 'recepcion')
    const c = new Client(env.app)
    for (let i = 0; i < 4; i++) expect((await c.login(u.email, 'mala-contrasena-' + i)).statusCode).toBe(401)
    const fifth = await c.login(u.email, 'mala-contrasena-5')
    expect(fifth.statusCode).toBe(423)
    expect(fifth.data.error).toBe('cuenta_bloqueada')
    // Aun con la contraseña correcta.
    expect((await c.login(u.email, 'Contrasena-Prueba-99')).statusCode).toBe(423)
    advanceClock(16 * 60 * 1000)
    expect((await c.login(u.email, 'Contrasena-Prueba-99')).statusCode).toBe(200)
    const audit = await env.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE accion = 'login_fallido' AND user_id = $1", [u.userId])
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(6)
  })

  it('usuario desactivado no puede entrar y pierde su sesión', async () => {
    const admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
    const u = await userClient(env.app, admin, 'medico')
    expect((await u.get('/api/patients')).statusCode).toBe(200)
    expect((await admin.patch(`/api/users/${u.userId}`, { activo: false })).statusCode).toBe(200)
    expect((await u.get('/api/patients')).statusCode).toBe(401)
    expect((await new Client(env.app).login(u.email, 'Contrasena-Prueba-99')).statusCode).toBe(401)
  })

  it('logout borra la sesión', async () => {
    const c = await loginAs(env.app, ADMIN.email, ADMIN.password)
    const cookie = c.cookie
    expect((await c.post('/api/auth/logout')).statusCode).toBe(204)
    const again = new Client(env.app)
    again.cookie = cookie
    expect((await again.get('/api/auth/me')).statusCode).toBe(401)
  })
})

describe('CSRF', () => {
  it('peticiones que modifican sin X-Requested-With → 403', async () => {
    const c = await loginAs(env.app, ADMIN.email, ADMIN.password)
    const r = await env.app.inject({ method: 'POST', url: '/api/patients', headers: { cookie: c.cookie!, 'content-type': 'application/json' }, payload: '{}' })
    expect(r.statusCode).toBe(403)
    expect(JSON.parse(r.body).error).toBe('csrf')
    const login = await env.app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: JSON.stringify(ADMIN) })
    expect(login.statusCode).toBe(403)
    const wrong = await c.req('DELETE', '/api/patients/x', undefined, { 'x-requested-with': 'XMLHttpRequest' })
    expect(wrong.statusCode).toBe(403)
    // GET no lo necesita
    const g = await env.app.inject({ method: 'GET', url: '/api/patients', headers: { cookie: c.cookie! } })
    expect(g.statusCode).toBe(200)
  })

  it('origen cruzado no permitido → 403', async () => {
    const c = await loginAs(env.app, ADMIN.email, ADMIN.password)
    const r = await c.req('POST', '/api/patients', {}, { origin: 'https://malo.example' })
    expect(r.statusCode).toBe(403)
    expect(r.data.error).toBe('origen_no_permitido')
  })
})

describe('TOTP (2FA)', () => {
  it('setup → enable → login requiere código → disable', async () => {
    const admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
    const u = await userClient(env.app, admin, 'medico')
    const setup = await u.post('/api/auth/totp/setup')
    expect(setup.statusCode).toBe(200)
    expect(setup.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\/MediSuite:/)
    const secret = setup.data.secret as string

    expect((await u.post('/api/auth/totp/enable', { code: '000000' })).statusCode).toBe(400)
    const code = await generate({ secret, epoch: Math.floor(nowMs() / 1000) })
    expect((await u.post('/api/auth/totp/enable', { code })).statusCode).toBe(204)
    expect((await u.get('/api/auth/me')).data.user.totp).toBe(true)
    // secreto cifrado en BD
    const row = (await env.pool.query('SELECT totp_secret_enc FROM users WHERE id = $1', [u.userId])).rows[0]
    expect(row.totp_secret_enc).toMatch(/^v1\./)
    expect(row.totp_secret_enc).not.toContain(secret)

    const c = new Client(env.app)
    const r1 = await c.login(u.email, 'Contrasena-Prueba-99')
    expect(r1.statusCode).toBe(401)
    expect(r1.data.error).toBe('totp_requerido')
    expect(c.cookie).toBeUndefined()
    const r2 = await c.login(u.email, 'Contrasena-Prueba-99', '123456')
    expect(r2.statusCode).toBe(401)

    advanceClock(30_000) // siguiente ventana (el código de "enable" ya se usó)
    const code2 = await generate({ secret, epoch: Math.floor(nowMs() / 1000) })
    const r3 = await c.login(u.email, 'Contrasena-Prueba-99', code2)
    expect(r3.statusCode).toBe(200)
    expect(r3.data.user.totp).toBe(true)
    // El mismo código no se puede reutilizar.
    expect((await new Client(env.app).login(u.email, 'Contrasena-Prueba-99', code2)).statusCode).toBe(401)

    expect((await c.post('/api/auth/totp/disable', { password: 'mala-contrasena' })).statusCode).toBe(400)
    expect((await c.post('/api/auth/totp/disable', { password: 'Contrasena-Prueba-99' })).statusCode).toBe(204)
    expect((await new Client(env.app).login(u.email, 'Contrasena-Prueba-99')).statusCode).toBe(200)
  })
})

describe('sesión', () => {
  it('expira tras 30 min de inactividad; la actividad la renueva', async () => {
    const c = await loginAs(env.app, ADMIN.email, ADMIN.password)
    advanceClock(25 * 60 * 1000)
    expect((await c.get('/api/auth/me')).statusCode).toBe(200)
    advanceClock(25 * 60 * 1000) // 50 min desde login, 25 desde la última actividad
    expect((await c.get('/api/auth/me')).statusCode).toBe(200)
    advanceClock(31 * 60 * 1000)
    const r = await c.get('/api/auth/me')
    expect(r.statusCode).toBe(401)
    expect(r.data.error).toBe('sesion_expirada')
  })

  it('expira a las 12 h absolutas aunque haya actividad', async () => {
    const c = await loginAs(env.app, ADMIN.email, ADMIN.password)
    for (let i = 0; i < 25; i++) {
      advanceClock(29 * 60 * 1000)
      const r = await c.get('/api/auth/me')
      if (i < 24) expect(r.statusCode).toBe(200) // 24 × 29 min = 11.6 h
      else expect(r.statusCode).toBe(401) // 12.1 h
    }
  })

  it('cambio de contraseña: valida la actual, mínimo 10 y cierra otras sesiones', async () => {
    const admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
    const u = await userClient(env.app, admin, 'enfermeria')
    const other = await loginAs(env.app, u.email, 'Contrasena-Prueba-99')
    expect((await u.post('/api/auth/password', { actual: 'mala', nueva: 'Otra-Clave-Larga-1' })).statusCode).toBe(400)
    const weak = await u.post('/api/auth/password', { actual: 'Contrasena-Prueba-99', nueva: 'corta' })
    expect(weak.statusCode).toBe(400)
    expect(weak.data.error).toBe('contrasena_debil')
    expect((await u.post('/api/auth/password', { actual: 'Contrasena-Prueba-99', nueva: 'Otra-Clave-Larga-1' })).statusCode).toBe(204)
    expect((await u.get('/api/auth/me')).statusCode).toBe(200)
    expect((await other.get('/api/auth/me')).statusCode).toBe(401)
    expect((await new Client(env.app).login(u.email, 'Otra-Clave-Larga-1')).statusCode).toBe(200)
  })
})

describe('límite de tasa en login', () => {
  it('10/min por IP → 429', async () => {
    const e2 = await setupEnv({ RATE_LIMIT_LOGIN: '10' })
    try {
      const c = new Client(e2.app)
      const codes: number[] = []
      for (let i = 0; i < 11; i++) codes.push((await c.login('x' + i + '@x.mx', 'loquesea-12345')).statusCode)
      expect(codes.slice(0, 10).every((s) => s === 401)).toBe(true)
      expect(codes[10]).toBe(429)
      const r = await c.login('x@x.mx', 'loquesea-12345')
      expect(r.data.error).toBe('limite')
    } finally {
      await e2.close()
    }
  })
})
