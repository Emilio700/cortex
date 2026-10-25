// Levanta PostgreSQL embebido + API real (SEED_DEMO=true) + Vite dev con proxy, para las pruebas E2E.
// Uso directo (dejar corriendo para depurar): node e2e/servers.mjs
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API = path.join(ROOT, 'api')
const requireApi = createRequire(path.join(API, 'package.json'))

export const PORTS = {
  pg: Number(process.env.E2E_PG_PORT ?? 56198),
  api: Number(process.env.E2E_API_PORT ?? 3998),
  web: Number(process.env.E2E_WEB_PORT ?? 5398),
}
export const BASE = `http://localhost:${PORTS.web}/`
export const DEMO_PASSWORD = 'MediSuite2026!'

async function esperar(url, ms, proc) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    if (proc?.exitCode != null) throw new Error(`${url}: el proceso terminó (código ${proc.exitCode})`)
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch {
      /* aún no */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Tiempo agotado esperando ${url}`)
}

export async function start({ log = false } = {}) {
  const { default: EmbeddedPostgres } = await import(requireApi.resolve('embedded-postgres'))
  // /tmp: si corre como root, embedded-postgres usa el usuario "postgres" y necesita acceso al directorio.
  const dir = await mkdtemp(path.join(tmpdir(), 'medisuite-e2e-'))
  await chmod(dir, 0o777)
  const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), user: 'postgres', password: 'postgres', port: PORTS.pg, persistent: false, onLog: () => {}, onError: () => {} })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('medisuite')
  const stdio = log ? 'inherit' : ['ignore', 'ignore', 'inherit']
  const api = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: API,
    stdio,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PORTS.pg}/medisuite`,
      SEED_DEMO: 'true',
      ADMIN_EMAIL: '',
      ADMIN_PASSWORD: '',
      COOKIE_SECURE: 'false',
      PORT: String(PORTS.api),
      FILES_DIR: path.join(dir, 'files'),
      SCHEDULER: 'false',
      LOG_LEVEL: 'warn',
      RATE_LIMIT_LOGIN: '1000',
      RATE_LIMIT_GLOBAL: '100000',
    },
  })
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const web = spawn(process.execPath, [viteBin, '--config', 'e2e/vite.config.ts', '--port', String(PORTS.web), '--host', 'localhost'], {
    cwd: ROOT,
    stdio,
    env: { ...process.env, E2E_API_PORT: String(PORTS.api) },
  })
  const stop = async () => {
    for (const p of [web, api]) if (p.exitCode == null) p.kill('SIGTERM')
    await Promise.all([web, api].map((p) => (p.exitCode != null ? null : new Promise((r) => p.once('exit', r)))))
    await pg.stop().catch(() => {})
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  try {
    await esperar(`http://127.0.0.1:${PORTS.api}/api/health`, 60_000, api)
    await esperar(BASE, 60_000, web)
  } catch (e) {
    await stop()
    throw e
  }
  return { stop, BASE }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const s = await start({ log: true })
  console.log(`E2E listo: ${s.BASE} (API ${PORTS.api}, Postgres ${PORTS.pg}). Ctrl+C para terminar.`)
  const fin = async () => {
    await s.stop()
    process.exit(0)
  }
  process.on('SIGINT', fin)
  process.on('SIGTERM', fin)
}
