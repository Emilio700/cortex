// Arranque inicial: crea la organización, el administrador y la llave de firma si no hay usuarios.
// Con SEED_DEMO=true carga los datos sintéticos de demostración.
import type { FastifyBaseLogger } from 'fastify'
import { randomBytes, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { now } from './clock.js'
import { ConfigError, type Config } from './config.js'
import { hashPassword, passwordProblem } from './crypto.js'
import { tx } from './db.js'
import { createOrgKey, signForOrg } from './keys.js'
import { pacienteCorto } from './routes/collections.js'
import { seedDB } from './demo/seed.gen.js'
import type { Collection } from './permissions.js'

type Log = Pick<FastifyBaseLogger, 'info' | 'warn'>

async function insertUser(c: pg.PoolClient, orgId: string, email: string, nombre: string, rol: string, password: string, profile: Record<string, string> = {}) {
  const id = randomUUID()
  const t = now()
  await c.query('INSERT INTO users (id, org_id, email, nombre, rol, password_hash, profile, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)', [
    id,
    orgId,
    email.toLowerCase(),
    nombre,
    rol,
    await hashPassword(password),
    profile,
    t,
  ])
  // Pequeño desfase para que el orden por created_at sea estable.
  await new Promise((r) => setTimeout(r, 2))
  return id
}

export async function bootstrap(pool: pg.Pool, cfg: Config, log: Log): Promise<void> {
  await tx(pool, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(727275)')
    const { n } = (await c.query<{ n: string }>('SELECT count(*)::text AS n FROM users')).rows[0]
    if (Number(n) > 0) {
      // Asegura que toda organización tenga llave de firma.
      const sinLlave = (await c.query<{ id: string }>('SELECT o.id FROM orgs o WHERE NOT EXISTS (SELECT 1 FROM org_keys k WHERE k.org_id = o.id AND k.active)')).rows
      for (const o of sinLlave) await createOrgKey(c, o.id, cfg.masterKey)
      return
    }

    let adminEmail = cfg.adminEmail
    let adminPassword = cfg.adminPassword
    if (adminEmail || adminPassword || !cfg.seedDemo) {
      if (!adminEmail || !adminPassword) {
        if (cfg.isProd) throw new ConfigError('Primer arranque: define ADMIN_EMAIL y ADMIN_PASSWORD para crear el administrador.')
        adminEmail = adminEmail ?? 'admin@medisuite.local'
        adminPassword = randomBytes(12).toString('base64url')
        log.warn({ adminEmail }, `Administrador de desarrollo creado con contraseña temporal: ${adminPassword}`)
      }
      const problem = passwordProblem(adminPassword, adminEmail)
      if (problem) {
        if (cfg.isProd) throw new ConfigError(`ADMIN_PASSWORD no es segura: ${problem}`)
        log.warn(`ADMIN_PASSWORD débil (permitida solo fuera de producción): ${problem}`)
      }
    }

    if (cfg.seedDemo) {
      await seedDemo(c, cfg, log, adminEmail && adminPassword ? { email: adminEmail, password: adminPassword } : undefined)
      return
    }

    const orgId = randomUUID()
    await c.query('INSERT INTO orgs (id, nombre, settings) VALUES ($1, $2, $3)', [orgId, cfg.orgName, { clinica: cfg.orgName, servicios: {}, tema: 'claro' }])
    await insertUser(c, orgId, adminEmail!, 'Administrador', 'admin', adminPassword!)
    await createOrgKey(c, orgId, cfg.masterKey)
    log.info({ org: cfg.orgName }, 'Organización y administrador iniciales creados')
  })
}

async function seedDemo(c: pg.PoolClient, cfg: Config, log: Log, extraAdmin?: { email: string; password: string }) {
  const db = seedDB()
  const orgId = randomUUID()
  const d = db.settings.doctor
  await c.query('INSERT INTO orgs (id, nombre, settings) VALUES ($1, $2, $3)', [orgId, db.settings.clinica, { clinica: db.settings.clinica, servicios: {}, tema: 'claro' }])
  const pw = cfg.demoPassword
  await insertUser(c, orgId, 'admin@demo.mx', 'Administrador Demo', 'admin', pw)
  const medicoId = await insertUser(c, orgId, 'medico@demo.mx', d.nombre, 'medico', pw, {
    especialidad: d.especialidad,
    cedula: d.cedula,
    ...(d.cedulaEspecialidad ? { cedulaEspecialidad: d.cedulaEspecialidad } : {}),
    universidad: d.universidad,
    direccion: d.direccion,
    telefono: d.telefono,
    emailContacto: d.email,
    ...(d.rfc ? { rfc: d.rfc } : {}),
  })
  await insertUser(c, orgId, 'recepcion@demo.mx', 'Recepción Demo', 'recepcion', pw)
  await insertUser(c, orgId, 'enfermeria@demo.mx', 'Enfermería Demo', 'enfermeria', pw)
  if (extraAdmin && extraAdmin.email.toLowerCase() !== 'admin@demo.mx') await insertUser(c, orgId, extraAdmin.email, 'Administrador', 'admin', extraAdmin.password)
  await createOrgKey(c, orgId, cfg.masterKey)

  const t = now()
  const ins = async (col: Collection, id: string, patientId: string | null, data: object, created: string | undefined) => {
    const at = created ? new Date(created) : t
    await c.query('INSERT INTO ' + col + ' (org_id, id, patient_id, data, created_at, updated_at, created_by) VALUES ($1,$2,$3,$4,$5,$5,$6)', [
      orgId,
      id,
      patientId,
      JSON.parse(JSON.stringify(data)),
      at,
      medicoId,
    ])
  }
  for (const p of db.patients) await ins('patients', p.id, p.id, p, p.creado)
  for (const a of db.appointments) await ins('appointments', a.id, a.patientId, a, undefined)
  for (const e of db.encounters) await ins('encounters', e.id, e.patientId, e.firmada ? { ...e, firmadoPor: medicoId } : e, e.fecha)
  for (const o of db.observations) await ins('observations', o.id, o.patientId, o, o.fecha)
  for (const p of db.payments) await ins('payments', p.id, p.patientId, p, p.fecha)
  for (const r of db.registros ?? []) await ins('registros', r.id, r.patientId ?? null, r, r.fecha)
  let maxFolio = 0
  for (const rx of db.prescriptions) {
    const p = db.patients.find((x) => x.id === rx.patientId)!
    const payload = {
      folio: rx.folio,
      fecha: rx.fecha,
      paciente: pacienteCorto(p),
      medicamentos: rx.items.map((i) => [i.medicamento, i.presentacion].filter(Boolean).join(' ')),
      cedula: d.cedula,
      medico: d.nombre,
      org: orgId,
    }
    const firma = await signForOrg(c, orgId, cfg.masterKey, payload)
    await ins('prescriptions', rx.id, rx.patientId, { ...rx, firma }, rx.fecha)
    maxFolio = Math.max(maxFolio, Number(rx.folio.replace(/\D/g, '')) || 0)
  }
  await c.query('INSERT INTO folio_counters (org_id, last) VALUES ($1, $2)', [orgId, maxFolio])
  log.info({ pacientes: db.patients.length }, 'Datos de demostración cargados (SEED_DEMO=true)')
}
