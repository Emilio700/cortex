// Levanta un PostgreSQL real (embedded-postgres) para toda la corrida de pruebas.
import EmbeddedPostgres from 'embedded-postgres'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    pgUrl: string
  }
}

let pg: EmbeddedPostgres | undefined
let dir: string | undefined

export async function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) {
    project.provide('pgUrl', process.env.TEST_DATABASE_URL.replace(/\/[^/]*$/, '/'))
    return
  }
  // /tmp (no el scratchpad): si corre como root, embedded-postgres usa el usuario "postgres" y necesita acceso.
  dir = await mkdtemp(path.join(tmpdir(), 'medisuite-pg-'))
  await chmod(dir, 0o777)
  const port = 55000 + Math.floor(Math.random() * 5000)
  pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), user: 'postgres', password: 'postgres', port, persistent: false, onLog: () => {}, onError: () => {} })
  await pg.initialise()
  await pg.start()
  project.provide('pgUrl', `postgres://postgres:postgres@127.0.0.1:${port}/`)
}

export async function teardown() {
  await pg?.stop()
  if (dir) await rm(dir, { recursive: true, force: true })
}
