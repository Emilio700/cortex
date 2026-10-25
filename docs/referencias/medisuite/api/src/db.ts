import pg from 'pg'

export type Db = pg.Pool
export type Q = pg.Pool | pg.PoolClient

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 })
  // Un error en un cliente inactivo no debe tumbar el proceso.
  pool.on('error', () => {})
  return pool
}

export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const r = await fn(c)
    await c.query('COMMIT')
    return r
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}
