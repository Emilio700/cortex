// Construcción de la aplicación Fastify: plugins de seguridad, hooks (CORS, CSRF, sesión), errores y rutas.
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { ZodError } from 'zod'
import type { Config } from './config.js'
import type { Transporter } from 'nodemailer'
import { createPool } from './db.js'
import { AppError } from './errors.js'
import { createMailer } from './mail.js'
import { Metrics } from './metrics.js'
import adminRoutes from './routes/admin.js'
import auditoriaRoutes from './routes/auditoria.js'
import authRoutes from './routes/auth.js'
import collectionRoutes from './routes/collections.js'
import documentRoutes, { MAX_FILE_BYTES } from './routes/documents.js'
import facturaRoutes from './routes/facturas.js'
import mensajeRoutes from './routes/mensajes.js'
import patientRoutes from './routes/patients.js'
import preferenciaRoutes from './routes/preferencias.js'
import settingsRoutes from './routes/settings.js'
import userRoutes from './routes/users.js'
import webhookRoutes from './routes/webhooks.js'
import { createScheduler, schedulerConfigured } from './scheduler.js'
import { resolveSession } from './session.js'
import { createStorage, type Storage } from './storage.js'
import type { FetchFn } from './types.js'
import './types.js'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const NO_SESSION_PREFIXES = ['/api/public/', '/api/health', '/api/auth/login', '/api/auth/recuperar', '/api/auth/restablecer', '/api/webhooks/']
/** Rutas públicas que reciben llamadas de servidores externos (sin CSRF; verifican su propia firma). */
const WEBHOOK_PREFIX = '/api/webhooks/'

function zodMessage(e: ZodError): string {
  const i = e.issues[0]
  if (!i) return 'Datos inválidos.'
  const where = i.path.length ? `${i.path.join('.')}: ` : ''
  return `Datos inválidos (${where}${i.message}).`
}

function pathOnly(url: string) {
  const i = url.indexOf('?')
  return i === -1 ? url : url.slice(0, i)
}

export interface BuildOptions {
  pool?: pg.Pool
  /** fetch para servicios externos (WhatsApp, Facturapi). Por defecto el global. */
  fetch?: FetchFn
  /** Transporte de nodemailer (p. ej. jsonTransport en pruebas). Por defecto SMTP de la configuración. */
  mailTransport?: Transporter
  storage?: Storage
  /** Inicia el programador de recordatorios (server.ts lo activa; las pruebas lo ejecutan a mano). */
  startScheduler?: boolean
}

export async function buildApp(cfg: Config, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const ownPool = !opts.pool
  const pool = opts.pool ?? createPool(cfg.databaseUrl)

  const app = Fastify({
    trustProxy: cfg.trustProxy as boolean | string,
    bodyLimit: 1024 * 1024,
    genReqId: () => randomUUID(),
    logger: {
      level: cfg.logLevel,
      // Sin datos clínicos en los registros: no se registran cuerpos ni la cadena de consulta.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      serializers: {
        req: (req: FastifyRequest) => ({ method: req.method, url: pathOnly(req.url), ip: req.ip }),
      },
    },
  })
  const metrics = new Metrics()
  app.decorate('ctx', {
    cfg,
    pool,
    fetch: opts.fetch ?? ((input, init) => fetch(input, init)),
    mailer: createMailer(cfg, opts.mailTransport),
    storage: opts.storage ?? (await createStorage(cfg)),
    metrics,
    scheduler: { enabled: false, running: false },
  })
  app.ctx.scheduler.enabled = !!opts.startScheduler && cfg.schedulerEnabled && schedulerConfigured(app.ctx)

  // ---------- Métricas (por ruta registrada, sin parámetros) ----------
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? 'desconocida'
    metrics.recordRequest(req.method, route, reply.statusCode, reply.elapsedTime / 1000)
  })

  // JSON vacío → sin cuerpo (p. ej. POST /logout con Content-Type: application/json).
  const defaultJson = app.getDefaultJsonParser('error', 'error')
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '' || body === undefined) return done(null, undefined)
    defaultJson(req, body as string, done)
  })

  await app.register(cookie)
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: cfg.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
  await app.register(rateLimit, {
    global: true,
    max: cfg.rateLimitGlobal,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: 'limite', message: `Demasiadas solicitudes. Intenta de nuevo en ${Math.ceil(ctx.ttl / 1000)} s.` }),
  })
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1 } })

  // ---------- CORS (opcional; por defecto solo mismo origen) ----------
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin
    if (!origin) return
    const allowed = cfg.corsOrigin?.includes(origin)
    if (allowed) {
      reply.header('Access-Control-Allow-Origin', origin).header('Access-Control-Allow-Credentials', 'true').header('Vary', 'Origin')
      if (req.method === 'OPTIONS') {
        reply
          .header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE')
          .header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
          .header('Access-Control-Max-Age', '600')
        return reply.code(204).send()
      }
      return
    }
    // Solicitudes que modifican desde otro origen no permitido → 403.
    if (MUTATING.has(req.method) && !req.url.startsWith(WEBHOOK_PREFIX)) {
      let sameOrigin = false
      try {
        sameOrigin = new URL(origin).host === req.host
      } catch {
        /* Origin inválido */
      }
      if (!sameOrigin) return reply.code(403).send({ error: 'origen_no_permitido', message: 'Origen no permitido.' })
    }
  })

  // ---------- CSRF: encabezado obligatorio en peticiones que modifican ----------
  app.addHook('onRequest', async (req, reply) => {
    if (!MUTATING.has(req.method) || !req.url.startsWith('/api/')) return
    if (req.url.startsWith(WEBHOOK_PREFIX)) return // firmados por el emisor (HMAC), no vienen de un navegador
    if (req.headers['x-requested-with'] !== 'MediSuite')
      return reply.code(403).send({ error: 'csrf', message: 'Falta el encabezado X-Requested-With: MediSuite.' })
  })

  // ---------- Sesión ----------
  app.addHook('onRequest', async (req) => {
    const p = pathOnly(req.url)
    if (!p.startsWith('/api/') || NO_SESSION_PREFIXES.some((x) => p.startsWith(x))) return
    try {
      req.user = await resolveSession(pool, cfg, req)
    } catch (e) {
      if (p === '/api/auth/logout') return // cerrar sesión siempre funciona
      throw e
    }
  })

  // ---------- Errores con formato del contrato ----------
  app.setErrorHandler((err: FastifyError | AppError | ZodError | Record<string, any>, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validacion', message: zodMessage(err), detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) })
    }
    if (err instanceof AppError) {
      const body: Record<string, unknown> = { error: err.code, message: err.message }
      if (err.details) body.detalles = err.details
      return reply.code(err.statusCode).send(body)
    }
    const e = err as FastifyError & { error?: string }
    const status = e.statusCode ?? 500
    if (status === 429) return reply.code(429).send({ error: 'limite', message: e.message || 'Demasiadas solicitudes.' })
    if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || e.code === 'FST_REQ_FILE_TOO_LARGE' || status === 413)
      return reply.code(413).send({ error: 'cuerpo_muy_grande', message: 'La solicitud excede el tamaño máximo permitido.' })
    if (e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || status === 415) return reply.code(415).send({ error: 'tipo_no_soportado', message: 'Tipo de contenido no soportado.' })
    if (e.validation || (status === 400 && e.code?.startsWith('FST_ERR_CTP'))) return reply.code(400).send({ error: 'json_invalido', message: 'El cuerpo de la solicitud no es JSON válido.' })
    if (status >= 400 && status < 500) return reply.code(status).send({ error: 'solicitud_invalida', message: cfg.isProd ? 'Solicitud inválida.' : e.message })
    req.log.error({ err: { message: e.message, code: e.code, stack: cfg.isProd ? undefined : e.stack } }, 'Error interno')
    return reply.code(500).send({ error: 'error_interno', message: 'Ocurrió un error interno. Intenta de nuevo.' })
  })

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'no_encontrado', message: 'Ruta no encontrada.' }))

  await app.register(adminRoutes)
  await app.register(auditoriaRoutes)
  await app.register(authRoutes)
  await app.register(settingsRoutes)
  await app.register(userRoutes)
  await app.register(documentRoutes)
  await app.register(preferenciaRoutes)
  await app.register(mensajeRoutes)
  await app.register(facturaRoutes)
  await app.register(patientRoutes)
  await app.register(webhookRoutes)
  await app.register(collectionRoutes)

  if (app.ctx.scheduler.enabled) {
    const sched = createScheduler(app.ctx, app.log)
    app.addHook('onReady', async () => sched.start())
    app.addHook('onClose', async () => sched.stop())
  }
  if (ownPool) app.addHook('onClose', async () => pool.end())
  return app
}
