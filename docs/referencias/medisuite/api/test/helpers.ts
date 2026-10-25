import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { inject } from 'vitest'
import { buildApp, type BuildOptions } from '../src/app.js'
import { bootstrap } from '../src/bootstrap.js'
import { loadConfig, type Config } from '../src/config.js'
import { createPool } from '../src/db.js'
import { hashPassword } from '../src/crypto.js'
import { migrate } from '../src/migrate.js'

export const ADMIN = { email: 'admin@clinica-a.mx', password: 'Clave-Segura-2026' }
export const PASSWORD = 'Contrasena-Prueba-99'

const silentLog = { info: () => {}, warn: () => {} }

export interface TestEnv {
  app: FastifyInstance
  pool: pg.Pool
  cfg: Config
  close: () => Promise<void>
}

export async function setupEnv(env: Record<string, string> = {}, opts: Omit<BuildOptions, 'pool'> = {}): Promise<TestEnv> {
  const base = inject('pgUrl')
  const dbName = 'ms_' + randomBytes(6).toString('hex')
  const admin = new pg.Client({ connectionString: base + 'postgres' })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${dbName}`)
  await admin.end()
  const filesDir = await mkdtemp(path.join(tmpdir(), 'ms-files-'))
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: base + dbName,
    FILES_DIR: filesDir,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ORG_NAME: 'Clínica A',
    MASTER_KEY: randomBytes(32).toString('base64'),
    RATE_LIMIT_LOGIN: '1000',
    RATE_LIMIT_GLOBAL: '100000',
    ...env,
  })
  const pool = createPool(cfg.databaseUrl)
  await migrate(pool)
  await bootstrap(pool, cfg, silentLog)
  const app = await buildApp(cfg, { ...opts, pool })
  await app.ready()
  return {
    app,
    pool,
    cfg,
    close: async () => {
      await app.close()
      await pool.end()
      await rm(filesDir, { recursive: true, force: true })
    },
  }
}

type Res = LightMyRequestResponse & { body: string; data: any }

/** Cliente con cookie de sesión y encabezado CSRF por defecto. */
export class Client {
  cookie?: string
  constructor(public app: FastifyInstance) {}

  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const h: Record<string, string> = { 'x-requested-with': 'MediSuite', ...headers }
    if (this.cookie) h.cookie = this.cookie
    const opts: InjectOptions = { method: method as 'GET', url, headers: h }
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) opts.payload = body
      else {
        opts.payload = JSON.stringify(body)
        h['content-type'] = 'application/json'
      }
    }
    const res = (await this.app.inject(opts)) as unknown as Res
    const sc = res.headers['set-cookie']
    const list = Array.isArray(sc) ? sc : sc ? [sc] : []
    for (const c of list) {
      const m = /^ms_session=([^;]*)/.exec(c)
      if (m) this.cookie = m[1] ? `ms_session=${m[1]}` : undefined
    }
    try {
      res.data = res.body ? JSON.parse(res.body) : undefined
    } catch {
      res.data = undefined
    }
    return res
  }
  get = (url: string) => this.req('GET', url)
  post = (url: string, body?: unknown, headers?: Record<string, string>) => this.req('POST', url, body ?? {}, headers)
  patch = (url: string, body: unknown) => this.req('PATCH', url, body)
  put = (url: string, body: unknown) => this.req('PUT', url, body)
  del = (url: string) => this.req('DELETE', url)

  async login(email: string, password: string, totp?: string) {
    const r = await this.post('/api/auth/login', { email, password, ...(totp ? { totp } : {}) })
    return r
  }
}

export async function loginAs(app: FastifyInstance, email: string, password: string) {
  const c = new Client(app)
  const r = await c.login(email, password)
  if (r.statusCode !== 200) throw new Error(`login ${email} falló: ${r.statusCode} ${r.body}`)
  return c
}

/** Crea un usuario vía API como admin y devuelve un cliente con sesión. */
export async function userClient(app: FastifyInstance, admin: Client, rol: string, extra: Record<string, unknown> = {}) {
  const email = `${rol}-${randomBytes(3).toString('hex')}@clinica-a.mx`
  const r = await admin.post('/api/users', { email, nombre: `Usuario ${rol}`, rol, password: PASSWORD, ...extra })
  if (r.statusCode !== 201) throw new Error(`crear usuario falló: ${r.statusCode} ${r.body}`)
  const c = await loginAs(app, email, PASSWORD)
  return Object.assign(c, { userId: r.data.id as string, email })
}

/** Crea otra organización con un admin directamente en BD (para pruebas de aislamiento). */
export async function createOtherOrg(pool: pg.Pool, email: string) {
  const orgId = randomUUID()
  await pool.query('INSERT INTO orgs (id, nombre, settings) VALUES ($1, $2, $3)', [orgId, 'Clínica B', { clinica: 'Clínica B' }])
  await pool.query("INSERT INTO users (id, org_id, email, nombre, rol, password_hash) VALUES ($1, $2, $3, 'Admin B', 'admin', $4)", [randomUUID(), orgId, email, await hashPassword(PASSWORD)])
  return orgId
}

export function multipart(fields: Record<string, string>, file?: { name: string; content: Buffer; type?: string }) {
  const boundary = '----ms' + randomBytes(8).toString('hex')
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  if (file)
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type ?? 'application/octet-stream'}\r\n\r\n`),
      file.content,
      Buffer.from('\r\n'),
    )
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

export const samplePatient = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Juana',
  apellidos: 'Pérez Gómez',
  sexo: 'F',
  fechaNac: '1980-05-12',
  alergias: ['Penicilina'],
  antecedentes: 'HAS desde 2015',
  medicamentosActuales: ['Losartán 50 mg'],
  notas: 'Nota privada',
  ...extra,
})

export interface FetchCall {
  method: string
  url: URL
  headers: Record<string, string>
  body?: string
}

/** fetch simulado: registra las llamadas y responde con el manejador (Response o { status, json | body }). */
export function mockFetch(handler: (call: FetchCall) => Promise<Response | { status?: number; json?: unknown; body?: Buffer | string; type?: string }> | Response | { status?: number; json?: unknown; body?: Buffer | string; type?: string }) {
  const calls: FetchCall[] = []
  const fn = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const h: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => (h[k] = v))
    const call: FetchCall = { method: init?.method ?? 'GET', url: new URL(String(input)), headers: h, body: typeof init?.body === 'string' ? init.body : undefined }
    calls.push(call)
    const r = await handler(call)
    if (r instanceof Response) return r
    if (r.json !== undefined) return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } })
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'application/octet-stream' } })
  }
  return Object.assign(fn, { calls })
}
