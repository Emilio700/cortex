// Configuración desde variables de entorno. Falla al iniciar si algo crítico falta en producción.
import { createHash } from 'node:crypto'
import path from 'node:path'

export interface Config {
  env: 'production' | 'development' | 'test'
  isProd: boolean
  port: number
  host: string
  databaseUrl: string
  masterKey: Buffer
  filesDir: string
  cookieSecure: boolean
  adminEmail?: string
  adminPassword?: string
  orgName: string
  seedDemo: boolean
  demoPassword: string
  trustProxy: boolean | number | string
  corsOrigin?: string[]
  logLevel: string
  /** Límites de sesión (ms). */
  sessionIdleMs: number
  sessionAbsoluteMs: number
  /** Límites de tasa. */
  rateLimitGlobal: number
  rateLimitLogin: number
  /** URL pública del frontend (enlaces en correos), sin / final. */
  publicUrl?: string
  /** Zona horaria para fechas en recordatorios. */
  timeZone: string
  whatsapp?: WhatsAppConfig
  /** Anticipaciones (horas) de los recordatorios automáticos, de mayor a menor. */
  recordatorioHoras: number[]
  /** false desactiva el programador aunque haya canales configurados. */
  schedulerEnabled: boolean
  schedulerIntervalMs: number
  facturapi?: { key: string; base: string }
  smtp?: SmtpConfig
  mailFrom: string
  storage: StorageConfig
  metricsToken?: string
  rateLimitRecuperar: number
  /** Conexión del dueño del esquema para migraciones (DATABASE_URL_MIGRATIONS; por defecto DATABASE_URL). */
  migrationsDatabaseUrl: string
  /** Rol de BD de la aplicación al que se otorgan permisos mínimos tras migrar (APP_DB_ROLE). */
  appDbRole?: string
}

export interface WhatsAppConfig {
  token: string
  phoneNumberId: string
  template: string
  templateLang: string
  verifyToken?: string
  appSecret?: string
  apiBase: string
}

export type SmtpConfig = { url: string } | { host: string; port: number; secure: boolean; user?: string; pass?: string }

export type StorageConfig =
  | { kind: 'disk' }
  | { kind: 's3'; endpoint?: string; bucket: string; region: string; accessKey?: string; secretKey?: string; forcePathStyle: boolean }

export class ConfigError extends Error {}

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(v.toLowerCase())
}

function parseTrustProxy(v: string | undefined): boolean | number | string {
  if (!v) return false
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^\d+$/.test(v)) return Number(v)
  return v // lista de IPs/CIDR separada por comas
}

const DEV_MASTER_KEY = createHash('sha256').update('medisuite-solo-desarrollo-no-usar-en-produccion').digest()

/** Copia del entorno sin variables vacías: `X=""` (o solo espacios) cuenta como no definida. */
export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v.trim() !== '') out[k] = v
  return out
}

/** Número entero desde el entorno; vacío o inválido → valor por defecto. */
export function envInt(v: string | undefined, def: number, min = 0): number {
  if (v === undefined || v.trim() === '') return def
  const n = Number(v.trim())
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) throw new ConfigError(`Valor numérico inválido: "${v}"`)
  return n
}

export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): Config {
  const env = cleanEnv(rawEnv)
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development'
  const isProd = nodeEnv === 'production'

  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new ConfigError('Falta DATABASE_URL')

  let masterKey: Buffer
  if (env.MASTER_KEY) {
    masterKey = Buffer.from(env.MASTER_KEY, 'base64')
    if (masterKey.length !== 32) throw new ConfigError('MASTER_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)')
  } else if (isProd) {
    throw new ConfigError('Falta MASTER_KEY (32 bytes en base64). Es obligatoria en producción.')
  } else {
    masterKey = DEV_MASTER_KEY
  }

  const wa = env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TEMPLATE
  const whatsapp: WhatsAppConfig | undefined = wa
    ? {
        token: env.WHATSAPP_TOKEN!,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!,
        template: env.WHATSAPP_TEMPLATE!,
        templateLang: env.WHATSAPP_TEMPLATE_LANG || 'es_MX',
        verifyToken: env.WHATSAPP_VERIFY_TOKEN || undefined,
        appSecret: env.WHATSAPP_APP_SECRET || undefined,
        apiBase: (env.WHATSAPP_API_BASE || 'https://graph.facebook.com/v21.0').replace(/\/+$/, ''),
      }
    : undefined
  if (whatsapp && isProd && (!whatsapp.appSecret || !whatsapp.verifyToken))
    throw new ConfigError('WhatsApp: define WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN para el webhook.')

  const horas = (env.RECORDATORIO_HORAS ?? '24')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 24 * 14)
  const recordatorioHoras = [...new Set(horas.map((h) => Math.round(h)))].sort((a, b) => b - a)

  let smtp: SmtpConfig | undefined
  if (env.SMTP_URL) smtp = { url: env.SMTP_URL }
  else if (env.SMTP_HOST) {
    const port = envInt(env.SMTP_PORT, 587, 1)
    smtp = { host: env.SMTP_HOST, port, secure: bool(env.SMTP_SECURE, port === 465), user: env.SMTP_USER || undefined, pass: env.SMTP_PASS || undefined }
  }

  let storage: StorageConfig = { kind: 'disk' }
  if ((env.STORAGE ?? 'disk').toLowerCase() === 's3') {
    if (!env.S3_BUCKET) throw new ConfigError('STORAGE=s3 requiere S3_BUCKET')
    storage = {
      kind: 's3',
      endpoint: env.S3_ENDPOINT || undefined,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION || 'us-east-1',
      accessKey: env.S3_ACCESS_KEY || undefined,
      secretKey: env.S3_SECRET_KEY || undefined,
      forcePathStyle: bool(env.S3_FORCE_PATH_STYLE, !!env.S3_ENDPOINT),
    }
  }

  const cors = env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean)

  return {
    env: nodeEnv,
    isProd,
    port: envInt(env.PORT, 3000, 0),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl,
    masterKey,
    filesDir: path.resolve(env.FILES_DIR ?? './data/files'),
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    adminEmail: env.ADMIN_EMAIL?.trim().toLowerCase() || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    orgName: env.ORG_NAME?.trim() || 'Mi clínica',
    seedDemo: bool(env.SEED_DEMO, false),
    demoPassword: env.DEMO_PASSWORD || 'MediSuite2026!',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    corsOrigin: cors && cors.length ? cors : undefined,
    logLevel: env.LOG_LEVEL ?? (nodeEnv === 'test' ? 'silent' : 'info'),
    sessionIdleMs: 30 * 60 * 1000,
    sessionAbsoluteMs: 12 * 60 * 60 * 1000,
    rateLimitGlobal: envInt(env.RATE_LIMIT_GLOBAL, 600, 1),
    rateLimitLogin: envInt(env.RATE_LIMIT_LOGIN, 10, 1),
    publicUrl: env.PUBLIC_URL?.trim().replace(/\/+$/, '') || undefined,
    timeZone: env.TZ_CLINICA || 'America/Mexico_City',
    whatsapp,
    recordatorioHoras: recordatorioHoras.length ? recordatorioHoras : [24],
    schedulerEnabled: bool(env.SCHEDULER, true),
    schedulerIntervalMs: Math.max(5_000, envInt(env.SCHEDULER_INTERVAL_MS, 60_000, 1)),
    facturapi: env.FACTURAPI_KEY ? { key: env.FACTURAPI_KEY, base: (env.FACTURAPI_BASE || 'https://www.facturapi.io/v2').replace(/\/+$/, '') } : undefined,
    smtp,
    mailFrom: env.MAIL_FROM || 'MediSuite <no-responder@localhost>',
    storage,
    metricsToken: env.METRICS_TOKEN || undefined,
    rateLimitRecuperar: envInt(env.RATE_LIMIT_RECUPERAR, 5, 1),
    migrationsDatabaseUrl: env.DATABASE_URL_MIGRATIONS || databaseUrl,
    appDbRole: env.APP_DB_ROLE || undefined,
  }
}

export const usingDevMasterKey = (c: Config) => c.masterKey.equals(DEV_MASTER_KEY)
