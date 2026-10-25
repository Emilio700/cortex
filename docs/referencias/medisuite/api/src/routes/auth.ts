import type { FastifyInstance } from 'fastify'
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib'
import { audit, auditReq } from '../audit.js'
import type { Q } from '../db.js'
import { now, nowMs } from '../clock.js'
import { decrypt, encrypt, hashPassword, passwordProblem, verifyPassword } from '../crypto.js'
import { AppError, badRequest, conflict } from '../errors.js'
import { enSegundoPlano, escHtml } from '../mail.js'
import { loginSchema, passwordChangeSchema, passwordOnlySchema, recuperarSchema, restablecerSchema, totpCodeSchema } from '../schemas.js'
import { clearSessionCookie, COOKIE, createSession, requireUser, setSessionCookie } from '../session.js'
import { getOrg, getUserByEmail, getUserById, orgJson, userJson, type UserRow } from '../users.js'
import { randomToken, sha256Hex } from '../crypto.js'

const MAX_FAILED = 5
const LOCK_MS = 15 * 60 * 1000
const RESET_MS = 30 * 60 * 1000
/** Máximo de correos de recuperación por usuario por hora (además del límite por IP). */
const RESET_PER_HOUR = 3

/** Verifica un código TOTP (±1 paso de 30 s) y evita su reutilización. Devuelve el paso usado. */
/** Marca como usados los enlaces de recuperación pendientes (cambio de contraseña, desactivación). */
export async function invalidarRecuperaciones(q: Q, userId: string, t: Date) {
  await q.query('UPDATE password_resets SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL', [userId, t])
}

export async function checkTotp(secret: string, code: string, lastStep: string | null): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null
  const r = await verifyTotp({ secret, token: code, epoch: Math.floor(nowMs() / 1000), epochTolerance: 30 })
  if (!r.valid) return null
  const step = (r as { timeStep?: number }).timeStep ?? Math.floor(nowMs() / 30000)
  if (lastStep !== null && step <= Number(lastStep)) return null
  return step
}

export default async function authRoutes(app: FastifyInstance) {
  const { pool, cfg, mailer } = app.ctx

  /** Aviso por correo a los administradores activos de la organización cuando se bloquea una cuenta. */
  async function alertLockout(user: UserRow, ip: string) {
    if (!mailer.enabled) return
    const admins = (await pool.query<{ email: string }>("SELECT email FROM users WHERE org_id = $1 AND rol = 'admin' AND activo", [user.org_id])).rows.map((r) => r.email)
    if (!admins.length) return
    const hasta = new Date(nowMs() + LOCK_MS).toISOString()
    await mailer.send({
      to: admins,
      subject: 'MediSuite: cuenta bloqueada por intentos fallidos',
      text: `La cuenta ${user.email} (${user.nombre}) se bloqueó por ${MAX_FAILED} intentos fallidos de inicio de sesión.\nIP: ${ip}\nBloqueada hasta: ${hasta} (UTC)\n\nSi no reconoces esta actividad, revisa la bitácora y considera cambiar la contraseña del usuario.`,
      html: `<p>La cuenta <strong>${escHtml(user.email)}</strong> (${escHtml(user.nombre)}) se bloqueó por ${MAX_FAILED} intentos fallidos de inicio de sesión.</p><p>IP: ${escHtml(ip)}<br>Bloqueada hasta: ${hasta} (UTC)</p><p>Si no reconoces esta actividad, revisa la bitácora y considera cambiar la contraseña del usuario.</p>`,
    })
  }
  const key = cfg.masterKey
  const totpAad = (u: { id: string }) => `totp:${u.id}`

  app.post('/api/auth/login', { config: { rateLimit: { max: cfg.rateLimitLogin, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = loginSchema.parse(req.body)
    const email = body.email.trim().toLowerCase()
    const user = await getUserByEmail(pool, email)

    // Se verifica la contraseña SIEMPRE antes de decidir (cuenta inexistente, bloqueada o no): mismo costo de
    // scrypt en todas las ramas, para no revelar por el tiempo de respuesta qué cuentas existen o están bloqueadas.
    const ok = await verifyPassword(body.password, user?.password_hash)

    if (user?.locked_until && user.locked_until.getTime() > nowMs()) {
      await audit(pool, { orgId: user.org_id, userId: user.id, userNombre: user.nombre, accion: 'login_fallido', ip: req.ip, detalle: { motivo: 'cuenta_bloqueada' } })
      throw new AppError(423, 'cuenta_bloqueada', 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en 15 minutos.')
    }

    const fail = async (motivo: string, code = 'credenciales_invalidas', msg = 'Correo o contraseña incorrectos.'): Promise<never> => {
      if (!user) {
        await audit(pool, { accion: 'login_fallido', ip: req.ip, detalle: { motivo, email: email.slice(0, 200) } })
        throw new AppError(401, code, msg)
      }
      const r = (
        await pool.query<{ failed_attempts: number }>('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = $1 RETURNING failed_attempts', [user.id])
      ).rows[0]
      const locked = r.failed_attempts >= MAX_FAILED
      if (locked) await pool.query('UPDATE users SET failed_attempts = 0, locked_until = $2 WHERE id = $1', [user.id, new Date(nowMs() + LOCK_MS)])
      await audit(pool, { orgId: user.org_id, userId: user.id, userNombre: user.nombre, accion: 'login_fallido', ip: req.ip, detalle: { motivo, bloqueo: locked || undefined } })
      if (locked) await alertLockout(user, req.ip).catch((e) => req.log.warn({ err: { message: (e as Error).message } }, 'No se pudo enviar el aviso de bloqueo'))
      if (locked) throw new AppError(423, 'cuenta_bloqueada', 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en 15 minutos.')
      throw new AppError(401, code, msg)
    }

    if (!user || !ok) return fail('contrasena')
    if (!user.activo) return fail('inactivo')

    let totpStep: number | null = null
    if (user.totp_enabled && user.totp_secret_enc) {
      if (!body.totp) throw new AppError(401, 'totp_requerido', 'Ingresa el código de tu app de autenticación.')
      const secret = decrypt(user.totp_secret_enc, key, totpAad(user))
      totpStep = await checkTotp(secret, body.totp.trim(), user.totp_last_step)
      if (totpStep === null) return fail('totp', 'totp_invalido', 'El código de verificación no es válido.')
      // Consumo atómico del paso TOTP: dos inicios de sesión simultáneos con el mismo código no pueden pasar ambos.
      const used = await pool.query('UPDATE users SET totp_last_step = $2 WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)', [user.id, totpStep])
      if (!used.rowCount) return fail('totp', 'totp_invalido', 'El código de verificación no es válido.')
    }

    await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id])
    const token = await createSession(pool, user.id, user.org_id, req.ip, req.headers['user-agent'])
    setSessionCookie(reply, cfg, token)
    await audit(pool, { orgId: user.org_id, userId: user.id, userNombre: user.nombre, accion: 'login', ip: req.ip })
    const org = await getOrg(pool, user.org_id)
    return { user: userJson(user), org: orgJson(org) }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies?.[COOKIE]
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256Hex(token)])
    if (req.user) await auditReq(pool, req, { accion: 'logout' })
    clearSessionCookie(reply, cfg)
    return reply.code(204).send()
  })

  app.get('/api/auth/me', async (req) => {
    const u = requireUser(req)
    const user = (await getUserById(pool, u.id))!
    return { user: userJson(user), org: orgJson(await getOrg(pool, u.orgId)) }
  })

  // Operaciones que verifican la contraseña actual: mismo límite por IP que el login (evita fuerza bruta
  // de la contraseña con una sesión robada).
  const pwLimit = { config: { rateLimit: { max: cfg.rateLimitLogin, timeWindow: '1 minute' } } }

  app.post('/api/auth/password', pwLimit, async (req, reply) => {
    const u = requireUser(req)
    const body = passwordChangeSchema.parse(req.body)
    const user = (await getUserById(pool, u.id))!
    if (!(await verifyPassword(body.actual, user.password_hash))) throw badRequest('contrasena_incorrecta', 'La contraseña actual no es correcta.')
    const problem = passwordProblem(body.nueva, user.email)
    if (problem) throw badRequest('contrasena_debil', problem)
    const t = now()
    await pool.query('UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1', [u.id, await hashPassword(body.nueva), t])
    // Cierra las demás sesiones del usuario e invalida enlaces de recuperación pendientes.
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [u.id, u.sessionHash])
    await invalidarRecuperaciones(pool, u.id, t)
    await auditReq(pool, req, { accion: 'actualizar', recurso: 'users', recursoId: u.id, detalle: { campo: 'password' } })
    return reply.code(204).send()
  })

  app.post('/api/auth/totp/setup', async (req) => {
    const u = requireUser(req)
    const user = (await getUserById(pool, u.id)) as UserRow
    if (user.totp_enabled) throw conflict('totp_activo', 'La verificación en dos pasos ya está activa.')
    const secret = generateSecret()
    await pool.query('UPDATE users SET totp_pending_enc = $2 WHERE id = $1', [u.id, encrypt(secret, key, totpAad(user))])
    const otpauthUrl = generateURI({ issuer: 'MediSuite', label: user.email, secret })
    return { secret, otpauthUrl }
  })

  app.post('/api/auth/totp/enable', pwLimit, async (req, reply) => {
    const u = requireUser(req)
    const { code } = totpCodeSchema.parse(req.body)
    const user = (await getUserById(pool, u.id)) as UserRow
    if (user.totp_enabled) throw conflict('totp_activo', 'La verificación en dos pasos ya está activa.')
    if (!user.totp_pending_enc) throw badRequest('totp_sin_configurar', 'Primero genera el código QR (configuración de 2FA).')
    const secret = decrypt(user.totp_pending_enc, key, totpAad(user))
    const step = await checkTotp(secret, code, null)
    if (step === null) throw badRequest('codigo_invalido', 'El código no es válido. Revisa la hora de tu teléfono.')
    await pool.query('UPDATE users SET totp_enabled = true, totp_secret_enc = $2, totp_pending_enc = NULL, totp_last_step = $3, updated_at = $4 WHERE id = $1', [
      u.id,
      user.totp_pending_enc,
      step,
      now(),
    ])
    await auditReq(pool, req, { accion: 'actualizar', recurso: 'users', recursoId: u.id, detalle: { campo: 'totp', valor: true } })
    return reply.code(204).send()
  })

  app.post('/api/auth/totp/disable', pwLimit, async (req, reply) => {
    const u = requireUser(req)
    const { password } = passwordOnlySchema.parse(req.body)
    const user = (await getUserById(pool, u.id)) as UserRow
    if (!(await verifyPassword(password, user.password_hash))) throw badRequest('contrasena_incorrecta', 'La contraseña no es correcta.')
    await pool.query('UPDATE users SET totp_enabled = false, totp_secret_enc = NULL, totp_pending_enc = NULL, totp_last_step = NULL, updated_at = $2 WHERE id = $1', [u.id, now()])
    await auditReq(pool, req, { accion: 'actualizar', recurso: 'users', recursoId: u.id, detalle: { campo: 'totp', valor: false } })
    return reply.code(204).send()
  })

  // ---------- Recuperación de contraseña ----------
  const resetLimit = { config: { rateLimit: { max: cfg.rateLimitRecuperar, timeWindow: '1 minute' } } }

  app.post('/api/auth/recuperar', resetLimit, async (req, reply) => {
    const { email: raw } = recuperarSchema.parse(req.body ?? {})
    if (!mailer.enabled || !cfg.publicUrl) throw new AppError(503, 'correo_no_configurado', 'La recuperación por correo no está disponible. Pide a un administrador que restablezca tu contraseña.')
    const email = raw.trim().toLowerCase()
    const user = email ? await getUserByEmail(pool, email) : undefined
    // Siempre 204 (no revela si el correo existe).
    if (!user || !user.activo) return reply.code(204).send()
    const t = now()
    const recientes = Number(
      (await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM password_resets WHERE user_id = $1 AND created_at > $2', [user.id, new Date(t.getTime() - 3600_000)])).rows[0].n,
    )
    if (recientes >= RESET_PER_HOUR) return reply.code(204).send()
    const token = randomToken(32)
    // Un solo enlace vigente: invalida los anteriores.
    await pool.query('UPDATE password_resets SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL', [user.id, t])
    await pool.query('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at, ip) VALUES ($1,$2,$3,$4,$5)', [sha256Hex(token), user.id, t, new Date(t.getTime() + RESET_MS), req.ip])
    const link = `${cfg.publicUrl}/#/restablecer?t=${encodeURIComponent(token)}`
    // El envío NO se espera: si la respuesta tardara lo que tarda el SMTP solo para cuentas existentes,
    // el tiempo de respuesta revelaría qué correos están registrados.
    enSegundoPlano(
      mailer.send({
        to: user.email,
        subject: 'MediSuite: restablecer contraseña',
        text: `Hola ${user.nombre}:\n\nPara restablecer tu contraseña abre este enlace (válido 30 minutos, un solo uso):\n${link}\n\nSi no lo solicitaste, ignora este correo; tu contraseña no cambia.`,
        html: `<p>Hola ${escHtml(user.nombre)}:</p><p>Para restablecer tu contraseña abre este enlace (válido 30 minutos, un solo uso):</p><p><a href="${escHtml(link)}">${escHtml(link)}</a></p><p>Si no lo solicitaste, ignora este correo; tu contraseña no cambia.</p>`,
      }).catch((e) => req.log.error({ err: { message: (e as Error).message } }, 'No se pudo enviar el correo de recuperación')),
    )
    await audit(pool, { orgId: user.org_id, userId: user.id, userNombre: user.nombre, accion: 'actualizar', recurso: 'users', recursoId: user.id, ip: req.ip, detalle: { operacion: 'recuperar_solicitud' } })
    return reply.code(204).send()
  })

  app.post('/api/auth/restablecer', resetLimit, async (req, reply) => {
    const body = restablecerSchema.parse(req.body ?? {})
    const invalid = () => badRequest('token_invalido', 'El enlace no es válido o ya expiró. Solicita uno nuevo.')
    const hash = sha256Hex(body.token)
    const r = (await pool.query<{ user_id: string; expires_at: Date; used_at: Date | null }>('SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = $1', [hash])).rows[0]
    if (!r || r.used_at || r.expires_at.getTime() < nowMs()) throw invalid()
    const user = await getUserById(pool, r.user_id)
    if (!user || !user.activo) throw invalid()
    const problem = passwordProblem(body.nueva, user.email)
    if (problem) throw badRequest('contrasena_debil', problem)
    const pw = await hashPassword(body.nueva)
    const t = now()
    const ok = await pool.query('UPDATE password_resets SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL', [hash, t])
    if (!ok.rowCount) throw invalid() // uso concurrente del mismo enlace
    await pool.query('UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = NULL, updated_at = $3 WHERE id = $1', [user.id, pw, t])
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id])
    await audit(pool, { orgId: user.org_id, userId: user.id, userNombre: user.nombre, accion: 'actualizar', recurso: 'users', recursoId: user.id, ip: req.ip, detalle: { campo: 'password', operacion: 'restablecer' } })
    return reply.code(204).send()
  })
}
