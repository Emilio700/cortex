import type pg from 'pg'
import type { Config } from './config.js'
import type { Mailer } from './mail.js'
import type { Metrics } from './metrics.js'
import type { Storage } from './storage.js'

export type Rol = 'admin' | 'medico' | 'recepcion' | 'enfermeria'

export interface SessionUser {
  id: string
  orgId: string
  email: string
  nombre: string
  rol: Rol
  sessionHash: string
}

export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface SchedulerState {
  enabled: boolean
  running: boolean
  lastRun?: string
  lastError?: string
  lastSent?: number
}

export interface AppContext {
  cfg: Config
  pool: pg.Pool
  /** fetch inyectable (Graph API de WhatsApp, Facturapi) para pruebas. */
  fetch: FetchFn
  mailer: Mailer
  storage: Storage
  metrics: Metrics
  scheduler: SchedulerState
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser
  }
  interface FastifyInstance {
    ctx: AppContext
  }
}
