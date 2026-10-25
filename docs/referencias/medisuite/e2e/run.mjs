// Corre las pruebas E2E en modo servidor: levanta Postgres embebido + API (SEED_DEMO) + Vite y ejecuta e2e/tests/*.test.mjs
// con el runner nativo de Node (node:test) y Playwright.
//   npm run e2e                     → todo
//   npm run e2e -- --test-name-pattern=triaje
//   E2E_EXTERNAL=1 npm run e2e      → usa servidores ya levantados con `node e2e/servers.mjs`
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { BASE, ROOT, start } from './servers.mjs'

const externo = !!process.env.E2E_EXTERNAL
const srv = externo ? null : await start()
const dir = path.join(ROOT, 'e2e', 'tests')
const archivos = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f))
const extra = process.argv.slice(2)
const code = await new Promise((resolve) => {
  const p = spawn(process.execPath, ['--test', '--test-concurrency=1', ...extra, ...archivos], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, E2E_BASE: BASE } })
  p.on('exit', (c) => resolve(c ?? 1))
})
await srv?.stop()
process.exit(code)
