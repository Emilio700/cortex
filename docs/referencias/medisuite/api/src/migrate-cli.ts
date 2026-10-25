import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { migrate } from './migrate.js'

const cfg = loadConfig()
const pool = createPool(cfg.migrationsDatabaseUrl)
try {
  const applied = await migrate(pool, undefined, { appRole: cfg.appDbRole })
  console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'Sin migraciones pendientes.')
} catch (e) {
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  await pool.end()
}
