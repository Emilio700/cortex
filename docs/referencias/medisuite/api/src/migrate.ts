// Ejecuta migrations/*.sql en orden, cada una en su transacción, registradas en schema_migrations.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR, opts: { appRole?: string } = {}): Promise<string[]> {
  const c = await pool.connect()
  const applied: string[] = []
  try {
    // Evita que dos instancias migren a la vez.
    await c.query('SELECT pg_advisory_lock(727274)')
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const done = new Set((await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
    for (const f of files) {
      if (done.has(f)) continue
      const sql = await readFile(path.join(dir, f), 'utf8')
      try {
        await c.query('BEGIN')
        await c.query(sql)
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f])
        await c.query('COMMIT')
        applied.push(f)
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {})
        throw new Error(`Falló la migración ${f}: ${(e as Error).message}`)
      }
    }
    if (opts.appRole) await grantAppRole(c, opts.appRole)
  } finally {
    await c.query('SELECT pg_advisory_unlock(727274)').catch(() => {})
    c.release()
  }
  return applied
}

/** Tablas en las que la aplicación necesita DELETE (sesiones y preferencias). */
const DELETE_TABLES = ['sessions', 'preferencias']

/**
 * Privilegios mínimos para el rol de la aplicación (APP_DB_ROLE), si existe y no es el usuario actual:
 * SELECT/INSERT/UPDATE en las tablas, DELETE solo en sesiones y preferencias, y en audit_log solo
 * SELECT/INSERT (sin UPDATE/DELETE/TRUNCATE). Se reaplica en cada arranque (idempotente) para cubrir
 * tablas de migraciones nuevas. Devuelve false si el rol no existe.
 */
export async function grantAppRole(c: pg.PoolClient | pg.Pool, role: string): Promise<boolean> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error(`APP_DB_ROLE inválido: ${role}`)
  const exists = (await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount
  if (!exists) return false
  const me = (await c.query<{ u: string }>('SELECT current_user AS u')).rows[0].u
  if (me === role) return true // el dueño ya tiene todo; nada que restringir
  const r = `"${role}"`
  const tables = (await c.query<{ t: string }>("SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'")).rows.map((x) => x.t)
  const sql = [
    `GRANT USAGE ON SCHEMA public TO ${r}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r}`,
    ...tables
      .filter((t) => t !== 'audit_log' && t !== 'schema_migrations')
      .map((t) => `GRANT SELECT, INSERT, UPDATE${DELETE_TABLES.includes(t) ? ', DELETE' : ''} ON "${t}" TO ${r}`),
    `GRANT SELECT, INSERT ON audit_log TO ${r}`,
    `GRANT SELECT ON schema_migrations TO ${r}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`,
  ]
  await c.query('BEGIN')
  try {
    for (const q of sql) await c.query(q)
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  }
  return true
}
