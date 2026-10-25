// Configuración de la organización. Nunca devuelve llaves privadas ni secretos.
import type { FastifyInstance } from 'fastify'
import { auditReq } from '../audit.js'
import { now } from '../clock.js'
import { tx, type Q } from '../db.js'
import { badRequest, forbidden } from '../errors.js'
import { settingsPatchSchema, PROFILE_KEYS } from '../schemas.js'
import { requireUser } from '../session.js'
import type { SessionUser } from '../types.js'
import { getOrg, getUserById, type UserRow } from '../users.js'

const EMPTY_DOCTOR = { nombre: '', especialidad: '', cedula: '', universidad: '', direccion: '', telefono: '', email: '' }

function doctorFromUser(u: UserRow) {
  const p = u.profile ?? {}
  const d: Record<string, string> = {
    nombre: u.nombre,
    especialidad: p.especialidad ?? '',
    cedula: p.cedula ?? '',
    universidad: p.universidad ?? '',
    direccion: p.direccion ?? '',
    telefono: p.telefono ?? '',
    email: p.emailContacto ?? u.email,
  }
  if (p.cedulaEspecialidad) d.cedulaEspecialidad = p.cedulaEspecialidad
  if (p.rfc) d.rfc = p.rfc
  return d
}

async function firstMedico(q: Q, orgId: string): Promise<UserRow | undefined> {
  return (await q.query<UserRow>("SELECT * FROM users WHERE org_id = $1 AND rol = 'medico' AND activo ORDER BY created_at, id LIMIT 1", [orgId])).rows[0]
}

export async function buildSettings(q: Q, user: SessionUser) {
  const org = await getOrg(q, user.orgId)
  const s = org.settings ?? {}
  const me = (await getUserById(q, user.id))!
  const docUser = me.rol === 'medico' ? me : await firstMedico(q, user.orgId)
  const doctor = docUser ? doctorFromUser(docUser) : { ...EMPTY_DOCTOR, ...(s.doctor ?? {}) }
  const key = (await q.query<{ public_jwk: unknown }>('SELECT public_jwk FROM org_keys WHERE org_id = $1 AND active ORDER BY created_at DESC LIMIT 1', [user.orgId])).rows[0]
  const out: Record<string, unknown> = {
    doctor,
    clinica: s.clinica ?? org.nombre,
    tema: (me.prefs?.tema as string) ?? s.tema ?? 'claro',
    servicios: s.servicios ?? {},
  }
  if (key) out.llavePublica = key.public_jwk
  return out
}

export default async function settingsRoutes(app: FastifyInstance) {
  const { pool } = app.ctx

  app.get('/api/settings', async (req) => buildSettings(pool, requireUser(req)))

  app.patch('/api/settings', async (req) => {
    const user = requireUser(req)
    const raw = { ...((req.body as Record<string, any>) ?? {}) }
    // null = quitar: en servicios y en el perfil del médico equivale a cadena vacía.
    for (const sub of ['servicios', 'doctor'] as const)
      if (raw[sub] && typeof raw[sub] === 'object') {
        raw[sub] = { ...raw[sub] }
        for (const k of Object.keys(raw[sub])) if (raw[sub][k] === null && !(sub === 'doctor' && k === 'nombre')) raw[sub][k] = ''
      }
    const body = settingsPatchSchema.parse(raw)
    const isAdmin = user.rol === 'admin'
    // No admin: solo su preferencia de tema y, si es médico, su propio perfil.
    if (!isAdmin) {
      if (body.clinica !== undefined || body.servicios !== undefined || body.doctorUserId !== undefined) throw forbidden()
      if (body.doctor !== undefined && user.rol !== 'medico') throw forbidden()
    }
    await tx(pool, async (c) => {
      const t = now()
      const org = (await c.query('SELECT settings FROM orgs WHERE id = $1 FOR UPDATE', [user.orgId])).rows[0]
      const s = { ...(org.settings ?? {}) }
      let orgChanged = false
      if (body.clinica !== undefined) {
        s.clinica = body.clinica
        orgChanged = true
      }
      if (body.servicios !== undefined) {
        const merged = { ...(s.servicios ?? {}) }
        for (const [k, v] of Object.entries(body.servicios)) {
          if (v === undefined) continue
          if (v === '') delete merged[k]
          else merged[k] = v
        }
        s.servicios = merged
        orgChanged = true
      }
      if (body.tema !== undefined) {
        await c.query(`UPDATE users SET prefs = prefs || jsonb_build_object('tema', $2::text) WHERE id = $1`, [user.id, body.tema])
        if (isAdmin) {
          s.tema = body.tema
          orgChanged = true
        }
      }
      if (body.doctor !== undefined) {
        let target: UserRow | undefined
        if (user.rol === 'medico') target = await getUserById(c, user.id)
        else if (body.doctorUserId) {
          target = await getUserById(c, body.doctorUserId)
          if (!target || target.org_id !== user.orgId || target.rol !== 'medico') throw badRequest('validacion', 'doctorUserId no corresponde a un médico de la organización.')
        } else target = await firstMedico(c, user.orgId)

        if (target) {
          const profile = { ...(target.profile ?? {}) }
          for (const k of PROFILE_KEYS) {
            const v = body.doctor[k]
            if (v === undefined) continue
            if (v === '') delete profile[k]
            else profile[k] = v
          }
          if (body.doctor.email === '') delete profile.emailContacto
          else if (body.doctor.email !== undefined) profile.emailContacto = body.doctor.email
          await c.query('UPDATE users SET profile = $2, nombre = COALESCE($3, nombre), updated_at = $4 WHERE id = $1', [target.id, profile, body.doctor.nombre ?? null, t])
        } else {
          s.doctor = { ...(s.doctor ?? {}), ...body.doctor }
          orgChanged = true
        }
      }
      if (orgChanged) await c.query('UPDATE orgs SET settings = $2 WHERE id = $1', [user.orgId, s])
      await auditReq(c, req, { accion: 'actualizar', recurso: 'settings', recursoId: user.orgId, detalle: { campos: Object.keys(body) } })
    })
    return buildSettings(pool, user)
  })
}
