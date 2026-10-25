// Programador de recordatorios dentro de la API: cada minuto (SCHEDULER_INTERVAL_MS) toma un candado
// consultivo de PostgreSQL; si otra instancia lo tiene, esta pasada se omite (sin envíos duplicados).
import type { FastifyBaseLogger } from 'fastify'
import { nowIso } from './clock.js'
import { procesarRecordatorios } from './recordatorios.js'
import type { AppContext } from './types.js'

export const SCHEDULER_LOCK = 727276

/** Hay algún canal configurado (WhatsApp o correo). */
export const schedulerConfigured = (ctx: Pick<AppContext, 'cfg' | 'mailer'>) => !!ctx.cfg.whatsapp || ctx.mailer.enabled

/** Una pasada con candado. Devuelve el número de mensajes enviados, o null si otra instancia tenía el candado. */
export async function runSchedulerOnce(ctx: AppContext): Promise<number | null> {
  const st = ctx.scheduler
  if (st.running) return null
  st.running = true
  const c = await ctx.pool.connect()
  let locked = false
  try {
    locked = (await c.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [SCHEDULER_LOCK])).rows[0].ok
    if (!locked) {
      ctx.metrics.schedulerRuns.inc({ resultado: 'omitida' })
      return null
    }
    const n = await procesarRecordatorios(ctx)
    st.lastRun = nowIso()
    st.lastSent = n
    st.lastError = undefined
    ctx.metrics.schedulerRuns.inc({ resultado: 'ok' })
    return n
  } catch (e) {
    st.lastRun = nowIso()
    st.lastError = String((e as Error).message ?? e).slice(0, 300)
    ctx.metrics.schedulerRuns.inc({ resultado: 'error' })
    throw e
  } finally {
    if (locked) await c.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK]).catch(() => {})
    c.release()
    st.running = false
  }
}

export function createScheduler(ctx: AppContext, log: Pick<FastifyBaseLogger, 'info' | 'error'>) {
  let timer: NodeJS.Timeout | undefined
  let first: NodeJS.Timeout | undefined
  const tick = () => {
    runSchedulerOnce(ctx).catch((e) => log.error({ err: { message: (e as Error).message } }, 'Programador de recordatorios: error'))
  }
  return {
    start() {
      if (timer) return
      log.info({ horas: ctx.cfg.recordatorioHoras, whatsapp: !!ctx.cfg.whatsapp, correo: ctx.mailer.enabled }, 'Programador de recordatorios activo')
      timer = setInterval(tick, ctx.cfg.schedulerIntervalMs)
      timer.unref()
      first = setTimeout(tick, 5_000)
      first.unref()
    },
    async stop() {
      if (timer) clearInterval(timer)
      if (first) clearTimeout(first)
      timer = first = undefined
      // Espera a que termine una pasada en curso (máx. 10 s).
      for (let i = 0; i < 100 && ctx.scheduler.running; i++) await new Promise((r) => setTimeout(r, 100))
    },
  }
}
