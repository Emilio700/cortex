// Punto de entrada: migra, hace el arranque inicial y escucha. Apagado ordenado con SIGTERM/SIGINT.
import { buildApp } from './app.js'
import { bootstrap } from './bootstrap.js'
import { ConfigError, loadConfig, usingDevMasterKey } from './config.js'
import { createPool } from './db.js'
import { migrate } from './migrate.js'

async function main() {
  const cfg = loadConfig()
  const pool = createPool(cfg.databaseUrl)
  const app = await buildApp(cfg, { pool, startScheduler: true })
  const log = app.log

  if (usingDevMasterKey(cfg)) log.warn('MASTER_KEY no definida: se usa una llave de desarrollo. NO usar en producción.')
  if (cfg.isProd && !cfg.cookieSecure) log.warn('COOKIE_SECURE=false en producción: la cookie de sesión viajará sin HTTPS.')

  // Migraciones con la conexión del dueño del esquema (si es distinta) y permisos mínimos al rol de la app.
  const migPool = cfg.migrationsDatabaseUrl !== cfg.databaseUrl ? createPool(cfg.migrationsDatabaseUrl) : pool
  try {
    const applied = await migrate(migPool, undefined, { appRole: cfg.appDbRole })
    if (applied.length) log.info({ applied }, 'Migraciones aplicadas')
  } finally {
    if (migPool !== pool) await migPool.end()
  }
  await bootstrap(pool, cfg, log)

  let closing = false
  const shutdown = async (signal: string) => {
    if (closing) return
    closing = true
    log.info({ signal }, 'Cerrando servidor…')
    const timer = setTimeout(() => process.exit(1), 10_000).unref()
    try {
      await app.close()
      await pool.end()
    } finally {
      clearTimeout(timer)
      process.exit(0)
    }
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ port: cfg.port, host: cfg.host })
}

main().catch((e) => {
  const msg = e instanceof ConfigError ? `Configuración inválida: ${e.message}` : `No se pudo iniciar: ${(e as Error).message}`
  console.error(msg)
  process.exit(1)
})
