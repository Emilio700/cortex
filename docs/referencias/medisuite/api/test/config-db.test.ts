import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanEnv, envInt, loadConfig } from '../src/config.js'
import { grantAppRole, migrate } from '../src/migrate.js'
import { buildApp } from '../src/app.js'
import { createPool } from '../src/db.js'
import { ADMIN, Client, samplePatient, setupEnv, type TestEnv } from './helpers.js'

describe('variables de entorno vacías = no definidas', () => {
  it('cleanEnv y envInt', () => {
    expect(cleanEnv({ A: '', B: '  ', C: 'x' })).toEqual({ C: 'x' })
    expect(envInt('', 600)).toBe(600)
    expect(envInt(undefined, 10)).toBe(10)
    expect(envInt(' 25 ', 10)).toBe(25)
    expect(() => envInt('abc', 10)).toThrow(/inválido/)
    expect(() => envInt('0', 10, 1)).toThrow()
  })

  it('loadConfig usa los valores por defecto con X=""', () => {
    const c = loadConfig({
      DATABASE_URL: 'postgres://x/y',
      DATABASE_URL_MIGRATIONS: '',
      RATE_LIMIT_GLOBAL: '',
      RATE_LIMIT_LOGIN: '',
      PORT: '',
      SMTP_HOST: 'smtp.example.mx',
      SMTP_PORT: '',
      SMTP_URL: '',
      WHATSAPP_TOKEN: '',
      FACTURAPI_KEY: '',
      STORAGE: '',
      LOG_LEVEL: '',
      APP_DB_ROLE: '',
      PUBLIC_URL: '',
      MAIL_FROM: '',
      RECORDATORIO_HORAS: '',
      SCHEDULER: '',
    })
    expect(c.rateLimitGlobal).toBe(600)
    expect(c.rateLimitLogin).toBe(10)
    expect(c.port).toBe(3000)
    expect(c.smtp).toEqual({ host: 'smtp.example.mx', port: 587, secure: false, user: undefined, pass: undefined })
    expect(c.whatsapp).toBeUndefined()
    expect(c.facturapi).toBeUndefined()
    expect(c.storage).toEqual({ kind: 'disk' })
    expect(c.logLevel).toBe('info')
    expect(c.appDbRole).toBeUndefined()
    expect(c.publicUrl).toBeUndefined()
    expect(c.recordatorioHoras).toEqual([24])
    expect(c.schedulerEnabled).toBe(true)
    expect(c.migrationsDatabaseUrl).toBe('postgres://x/y')
    expect(loadConfig({ DATABASE_URL: 'postgres://x/y', DATABASE_URL_MIGRATIONS: 'postgres://owner/y' }).migrationsDatabaseUrl).toBe('postgres://owner/y')
    expect(() => loadConfig({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/)
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x/y', NODE_ENV: 'production', MASTER_KEY: '' })).toThrow(/MASTER_KEY/)
  })
})

describe('rol de BD de la aplicación con privilegios mínimos (APP_DB_ROLE)', () => {
  let env: TestEnv
  const role = 'ms_app_' + randomBytes(4).toString('hex')
  const pw = 'pw_' + randomBytes(8).toString('hex')
  let app: pg.Client
  beforeAll(async () => {
    env = await setupEnv()
    await env.pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${pw}'`)
    expect(await grantAppRole(env.pool, 'rol_que_no_existe')).toBe(false)
    await migrate(env.pool, undefined, { appRole: role })
    const url = new URL(env.cfg.databaseUrl)
    url.username = role
    url.password = pw
    app = new pg.Client({ connectionString: url.toString() })
    await app.connect()
  })
  afterAll(async () => {
    await app?.end()
    await env.close()
  })

  it('puede leer/escribir datos y sesiones, pero no alterar la bitácora', async () => {
    expect((await app.query('SELECT count(*) FROM patients')).rowCount).toBe(1)
    const org = (await app.query('SELECT id FROM orgs LIMIT 1')).rows[0].id
    await app.query("INSERT INTO preferencias (org_id, scope, owner_id, clave, valor, updated_at) VALUES ($1, 'org', '', 'k', '1', now())", [org])
    await app.query("UPDATE preferencias SET valor = '2' WHERE clave = 'k'")
    await app.query("DELETE FROM preferencias WHERE clave = 'k'")
    await app.query('DELETE FROM sessions WHERE false')
    await app.query("INSERT INTO audit_log (fecha, accion) VALUES (now(), 'login')")
    expect((await app.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n).toBeGreaterThan(0)
    await expect(app.query('DELETE FROM audit_log')).rejects.toThrow(/permission denied/)
    await expect(app.query("UPDATE audit_log SET accion = 'x'")).rejects.toThrow(/permission denied/)
    await expect(app.query('TRUNCATE audit_log')).rejects.toThrow(/permission denied/)
    await expect(app.query('DELETE FROM patients')).rejects.toThrow(/permission denied/)
    await expect(app.query('DROP TABLE patients')).rejects.toThrow()
    await expect(app.query("INSERT INTO schema_migrations (name) VALUES ('x')")).rejects.toThrow(/permission denied/)
  })

  it('la API funciona completa con el rol restringido', async () => {
    const url = new URL(env.cfg.databaseUrl)
    url.username = role
    url.password = pw
    const pool = createPool(url.toString())
    const a = await buildApp({ ...env.cfg, databaseUrl: url.toString() }, { pool })
    try {
      await a.ready()
      const c = new Client(a)
      expect((await c.login(ADMIN.email, ADMIN.password)).statusCode).toBe(200)
      const p = await c.post('/api/patients', samplePatient())
      expect(p.statusCode).toBe(201)
      const pay = await c.post('/api/payments', { patientId: p.data.id, concepto: 'C', monto: 1, metodo: 'efectivo' })
      expect((await c.del(`/api/payments/${pay.data.id}`)).statusCode).toBe(204)
      expect((await c.req('PUT', '/api/preferencias/x', { valor: 1 })).statusCode).toBe(200)
      expect((await c.del('/api/preferencias/x')).statusCode).toBe(204)
      expect((await c.post(`/api/patients/${p.data.id}/bloqueo`, { motivo: 'ARCO' })).statusCode).toBe(200)
      expect((await c.post('/api/admin/llaves/rotar')).statusCode).toBe(201)
      expect((await c.get('/api/audit')).data.length).toBeGreaterThan(0)
      expect((await c.post('/api/auth/logout')).statusCode).toBe(204)
    } finally {
      await a.close()
      await pool.end()
    }
  })
})
