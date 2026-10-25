// CRUD de recursos clínicos y administrativos + reglas de negocio (notas firmadas, recetas, adendas).
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z, type ZodType } from 'zod'
import { auditReq } from '../audit.js'
import { now } from '../clock.js'
import { tx } from '../db.js'
import { badRequest, conflict, forbidden, notFound } from '../errors.js'
import { signForOrg } from '../keys.js'
import { COLLECTIONS, RECEPCION_HIDDEN_PATIENT_FIELDS, registroTipoConocido, type Collection } from '../permissions.js'
import {
  assertCan,
  assertDocTipo,
  assertNotBlocked,
  assertRegistroTipo,
  clean,
  encodeCursor,
  getPatientData,
  getRow,
  insertRow,
  listRows,
  newId,
  softDelete,
  toJson,
  updateRow,
} from '../resources.js'
import {
  adendaBodySchema,
  appointmentSchema,
  cancelSchema,
  documentPatchSchema,
  encounterSchema,
  idSchema,
  observationSchema,
  patientSchema,
  paymentSchema,
  prescriptionSchema,
  REGISTRO_TIPO_RE,
  registroSchema,
} from '../schemas.js'
import { requireUser } from '../session.js'
import type { SessionUser } from '../types.js'
import { getUserById } from '../users.js'

const SCHEMAS: Partial<Record<Collection, ZodType<Record<string, any>>>> = {
  patients: patientSchema,
  appointments: appointmentSchema,
  encounters: encounterSchema,
  observations: observationSchema,
  payments: paymentSchema,
  registros: registroSchema,
}
const HAS_FECHA = new Set<Collection>(['encounters', 'observations', 'prescriptions', 'documents', 'payments', 'registros'])

// ---------- v1.2: reglas de registros ----------
/** Documentos que, una vez emitidos, solo admiten cancelación por un médico. */
const DOC_EMITIBLE = new Set(['certificado', 'referencia'])
const tipoNoPermitido = (tipo: string) => badRequest('tipo_no_permitido', `El tipo de registro «${tipo}» no está permitido.`)
function assertTipoConocido(tipo: string) {
  if (!registroTipoConocido(tipo)) throw tipoNoPermitido(tipo)
}
const documentoEmitido = () => conflict('documento_emitido', 'El documento ya fue emitido y no se puede modificar ni borrar; solo un médico puede cancelarlo.')
const movimientoInmutable = () => conflict('movimiento_inmutable', 'Los movimientos de inventario no se modifican ni se borran; registra un movimiento de ajuste.')
const esEmitido = (d: Record<string, any>) => DOC_EMITIBLE.has(d.tipo) && (d.estado === 'emitido' || d.estado === 'cancelado')

/**
 * PATCH sobre un certificado/referencia emitido: solo `{ estado: 'cancelado', datos: { motivoCancelacion } }` por un médico.
 * Devuelve los datos resultantes (el resto del registro no cambia).
 */
function cancelarDocumentoEmitido(user: SessionUser, cur: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  if (cur.estado !== 'emitido' || user.rol !== 'medico') throw documentoEmitido()
  const extra = Object.keys(patch).filter((k) => k !== 'estado' && k !== 'datos')
  const motivo = patch.datos && typeof patch.datos === 'object' ? (patch.datos as Record<string, unknown>).motivoCancelacion : undefined
  if (patch.estado !== 'cancelado' || extra.length) throw documentoEmitido()
  if (typeof motivo !== 'string' || !motivo.trim() || motivo.length > 1000)
    throw badRequest('validacion', 'Indica el motivo de cancelación (datos.motivoCancelacion).', [{ campo: 'datos.motivoCancelacion', mensaje: 'es obligatorio' }])
  return {
    ...cur,
    estado: 'cancelado',
    datos: { ...(cur.datos ?? {}), motivoCancelacion: motivo.trim(), canceladoEn: now().toISOString(), canceladoPor: user.id },
  }
}

function colParam(req: FastifyRequest): Collection {
  const col = (req.params as { col: string }).col
  if (!(COLLECTIONS as readonly string[]).includes(col)) throw notFound('Recurso desconocido.')
  return col as Collection
}
function idParam(req: FastifyRequest): string {
  const id = (req.params as { id: string }).id
  if (!idSchema.safeParse(id).success) throw notFound()
  return id
}
function bodyObject(req: FastifyRequest): Record<string, any> {
  const b = req.body
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw badRequest('validacion', 'Se esperaba un objeto JSON.')
  return { ...(b as Record<string, unknown>) }
}
function stripRecepcion(user: SessionUser, col: Collection, body: Record<string, unknown>) {
  if (col === 'patients' && user.rol === 'recepcion') for (const f of RECEPCION_HIDDEN_PATIENT_FIELDS) delete body[f]
}
const SERVER_FIELDS = ['creadoPor', 'actualizadoEn', 'bloqueado', 'bloqueo', 'eliminado']

const listQuerySchema = z.object({
  patientId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  cursor: z.string().max(300).optional(),
  desde: z.iso.datetime({ offset: true, message: 'desde debe ser fecha/hora ISO' }).optional(),
  tipo: z.string().regex(REGISTRO_TIPO_RE, 'tipo inválido').optional(),
})

/** "María Fernanda López Ramírez" + 1968 → "MFLR-1968" (igual que el frontend). */
export function pacienteCorto(p: { nombre: string; apellidos?: string; fechaNac: string }) {
  const ini = `${p.nombre} ${p.apellidos ?? ''}`
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
  return `${ini}-${p.fechaNac.slice(0, 4)}`
}

export default async function collectionRoutes(app: FastifyInstance) {
  const { pool, cfg } = app.ctx

  // ---------- Listar ----------
  app.get('/api/:col', async (req, reply) => {
    const user = requireUser(req)
    const col = colParam(req)
    assertCan(user, col, 'read')
    const { patientId, limit, cursor, desde, tipo: tipoQ } = listQuerySchema.parse(req.query ?? {})
    const tipo = col === 'registros' ? tipoQ : undefined
    if (tipo) {
      assertTipoConocido(tipo)
      assertRegistroTipo(user, tipo, 'read')
    }
    const desdeDate = desde ? new Date(desde) : undefined
    // Marca para la próxima sincronización (con 5 s de traslape para escrituras concurrentes).
    if (desdeDate) reply.header('X-Sync-Desde', new Date(now().getTime() - 5000).toISOString())
    let rows = await listRows(pool, col, user, { patientId, limit, cursor, desde: desdeDate, tipo })
    if (limit && rows.length > limit) {
      rows = rows.slice(0, limit)
      reply.header('X-Next-Cursor', encodeCursor(rows[rows.length - 1]))
    }
    if (patientId) await auditReq(pool, req, { accion: 'ver_expediente', recurso: col, patientId, detalle: { registros: rows.length, ...(tipo ? { tipo } : {}) } })
    return rows.map((r) => toJson(col, r, user))
  })

  // ---------- Uno ----------
  app.get('/api/:col/:id', async (req) => {
    const user = requireUser(req)
    const col = colParam(req)
    assertCan(user, col, 'read')
    const row = await getRow(pool, col, user.orgId, idParam(req), false, user.rol)
    if (col === 'documents') assertDocTipo(user, row.data.tipo, 'read')
    if (col === 'registros') assertRegistroTipo(user, row.data.tipo, 'read')
    if (col === 'patients') await auditReq(pool, req, { accion: 'ver_expediente', recurso: 'patients', recursoId: row.id, patientId: row.id })
    return toJson(col, row, user)
  })

  // ---------- Crear ----------
  app.post('/api/:col', async (req, reply) => {
    const user = requireUser(req)
    const col = colParam(req)
    if (col === 'prescriptions') return reply.code(201).send(await createPrescription(req, user))
    // POST /api/documents lo atiende routes/documents.ts (ruta estática, tiene prioridad).
    if (col === 'documents') throw badRequest('validacion', 'Los documentos se suben como multipart/form-data (campos file y meta).')
    assertCan(user, col, 'write')
    const body = bodyObject(req)
    stripRecepcion(user, col, body)
    for (const f of SERVER_FIELDS) delete body[f]
    if (col === 'payments') delete body.facturaId // lo fija el servidor al timbrar
    if (col === 'encounters') {
      delete body.firmadaEn
      delete body.firmadoPor
      delete body.adendas
      if (body.firmada === true && user.rol !== 'medico') throw forbidden('sin_permiso', 'Solo un médico puede firmar notas.')
    }
    const data = clean(SCHEMAS[col]!.parse(body))
    if (col === 'registros') {
      assertTipoConocido(data.tipo)
      assertRegistroTipo(user, data.tipo, 'write')
    }
    const t = now()
    const id = (data.id as string | undefined) ?? newId()
    if (HAS_FECHA.has(col) && !data.fecha) data.fecha = t.toISOString()
    if (col === 'patients' && !data.creado) data.creado = t.toISOString()
    if (col === 'observations') data.autor = user.nombre
    if (col === 'encounters') {
      data.adendas = []
      if (data.firmada) {
        data.firmadaEn = t.toISOString()
        data.firmadoPor = user.id
      }
    }
    const patientId = col === 'patients' ? id : ((data.patientId as string | undefined) ?? null)
    const detalle = col === 'registros' ? { tipo: data.tipo, ...(data.estado ? { estado: data.estado } : {}) } : undefined
    const row = await tx(pool, async (c) => {
      if (col !== 'patients' && patientId) await getPatientData(c, user.orgId, patientId)
      const r = await insertRow(c, col, user, id, patientId, data, t)
      await auditReq(c, req, { accion: 'crear', recurso: col, recursoId: id, patientId, detalle })
      if (col === 'encounters' && data.firmada) await auditReq(c, req, { accion: 'firmar', recurso: col, recursoId: id, patientId })
      return r
    })
    return reply.code(201).send(toJson(col, row, user))
  })

  // ---------- Actualizar ----------
  app.patch('/api/:col/:id', async (req) => {
    const user = requireUser(req)
    const col = colParam(req)
    const id = idParam(req)
    assertCan(user, col, 'write')
    const patch = bodyObject(req)
    stripRecepcion(user, col, patch)
    for (const f of [...SERVER_FIELDS, 'id']) delete patch[f]
    if (col === 'payments') delete patch.facturaId

    const row = await tx(pool, async (c) => {
      const cur = await getRow(c, col, user.orgId, id, true, user.rol)
      assertNotBlocked(cur)
      const t = now()
      let data: Record<string, any>
      let firmar = false
      if (col === 'prescriptions') throw conflict('receta_emitida', 'Una receta emitida no se puede modificar; cancélala y emite otra.')
      if (col === 'registros') {
        assertRegistroTipo(user, cur.data.tipo, 'read')
        assertRegistroTipo(user, cur.data.tipo, 'write')
        if ('tipo' in patch && patch.tipo !== cur.data.tipo) throw badRequest('tipo_inmutable', 'El tipo de un registro no se puede cambiar.')
        delete patch.tipo
        if (cur.data.tipo === 'movimiento-inventario') throw movimientoInmutable()
      }
      if (col === 'registros' && esEmitido(cur.data)) {
        data = cancelarDocumentoEmitido(user, cur.data, patch)
      } else if (col === 'documents') {
        assertDocTipo(user, cur.data.tipo, 'write')
        // null en el nivel superior = quitar la clave (nombre es obligatorio → 400).
        const nulls = Object.keys(patch).filter((k) => patch[k] === null)
        if (nulls.includes('nombre')) throw badRequest('validacion', 'Datos inválidos (nombre: es obligatorio).', [{ campo: 'nombre', mensaje: 'es obligatorio' }])
        for (const k of nulls) delete patch[k]
        const p = clean(documentPatchSchema.parse(patch))
        data = { ...cur.data, ...p }
        for (const k of nulls) if (k === 'meta') delete data[k]
      } else {
        if (col === 'encounters') {
          if (cur.data.firmada) throw conflict('nota_firmada', 'La nota está firmada y no se puede modificar. Agrega una adenda.')
          delete patch.firmadaEn
          delete patch.firmadoPor
          delete patch.adendas
          if (patch.firmada === true) {
            if (user.rol !== 'medico') throw forbidden('sin_permiso', 'Solo un médico puede firmar notas.')
            firmar = true
          }
        }
        const merged = { ...cur.data, ...patch }
        // null en el nivel superior = quitar la clave; si es obligatoria, la validación responde 400.
        for (const [k, v] of Object.entries(patch)) if (v === null) delete merged[k]
        if (col === 'patients' && user.rol === 'recepcion') {
          // La validación no ve los campos ocultos; se conservan los guardados.
          for (const f of RECEPCION_HIDDEN_PATIENT_FIELDS) delete merged[f]
        }
        data = clean(SCHEMAS[col]!.parse(merged))
        if (col === 'patients' && user.rol === 'recepcion') for (const f of RECEPCION_HIDDEN_PATIENT_FIELDS) if (cur.data[f] !== undefined) data[f] = cur.data[f]
        if (col === 'encounters') {
          data.adendas = cur.data.adendas ?? []
          if (firmar) {
            data.firmadaEn = t.toISOString()
            data.firmadoPor = user.id
          }
        }
        if (col === 'observations' && cur.data.autor) data.autor = cur.data.autor
        if (col === 'payments' && cur.data.facturaId) {
          // Pago con CFDI timbrado: el monto y el paciente deben seguir coincidiendo con la factura,
          // y la marca de facturado la controla el servidor (se libera al cancelar la factura).
          if (Number(data.monto) !== Number(cur.data.monto) || data.patientId !== cur.data.patientId)
            throw conflict('pago_facturado', 'El pago tiene una factura CFDI vigente: cancélala antes de cambiar el monto o el paciente.')
          data.facturado = true
          data.facturaId = cur.data.facturaId
          if (cur.data.rfc !== undefined) data.rfc = cur.data.rfc
        }
      }
      const patientId = col === 'patients' ? id : ((data.patientId as string | undefined) ?? null)
      if (col !== 'patients' && patientId && patientId !== cur.patient_id) await getPatientData(c, user.orgId, patientId)
      const r = await updateRow(c, col, user.orgId, id, patientId, data, t)
      const detalle: Record<string, unknown> = { campos: Object.keys(patch).slice(0, 50) }
      if (col === 'registros') {
        detalle.tipo = data.tipo
        if (data.estado !== cur.data.estado) detalle.estado = data.estado ?? null
      }
      await auditReq(c, req, { accion: 'actualizar', recurso: col, recursoId: id, patientId: patientId ?? cur.patient_id, detalle })
      if (firmar) await auditReq(c, req, { accion: 'firmar', recurso: col, recursoId: id, patientId })
      return r
    })
    return toJson(col, row, user)
  })

  // ---------- Borrar (lógico) ----------
  app.delete('/api/:col/:id', async (req, reply) => {
    const user = requireUser(req)
    const col = colParam(req)
    const id = idParam(req)
    assertCan(user, col, 'write')
    if (col === 'patients' && user.rol !== 'admin') throw forbidden('sin_permiso', 'Solo un administrador puede borrar pacientes.')
    await tx(pool, async (c) => {
      const cur = await getRow(c, col, user.orgId, id, true, user.rol)
      assertNotBlocked(cur)
      if (col === 'encounters' && cur.data.firmada) throw conflict('nota_firmada', 'Una nota firmada no se puede borrar.')
      if (col === 'prescriptions') throw conflict('receta_emitida', 'Una receta emitida no se puede borrar; cancélala.')
      if (col === 'documents') assertDocTipo(user, cur.data.tipo, 'write')
      if (col === 'payments' && cur.data.facturaId) throw conflict('pago_facturado', 'El pago tiene una factura CFDI vigente: cancélala antes de borrar el pago.')
      if (col === 'registros') {
        assertRegistroTipo(user, cur.data.tipo, 'read')
        assertRegistroTipo(user, cur.data.tipo, 'write')
        if (cur.data.tipo === 'movimiento-inventario') throw movimientoInmutable()
        if (esEmitido(cur.data)) throw documentoEmitido()
      }
      await softDelete(c, col, user.orgId, id, now())
      await auditReq(c, req, { accion: 'borrar', recurso: col, recursoId: id, patientId: cur.patient_id, detalle: col === 'registros' ? { tipo: cur.data.tipo } : undefined })
    })
    return reply.code(204).send()
  })

  // ---------- Adendas ----------
  app.post('/api/encounters/:id/adendas', async (req) => {
    const user = requireUser(req)
    const id = idParam(req)
    assertCan(user, 'encounters', 'write')
    const { texto } = adendaBodySchema.parse(req.body ?? {})
    const row = await tx(pool, async (c) => {
      const cur = await getRow(c, 'encounters', user.orgId, id, true, user.rol)
      assertNotBlocked(cur)
      const data = { ...cur.data, adendas: [...(cur.data.adendas ?? []), { fecha: now().toISOString(), texto, autor: user.nombre, autorId: user.id }] }
      const r = await updateRow(c, 'encounters', user.orgId, id, cur.patient_id, data, now())
      await auditReq(c, req, { accion: 'adenda', recurso: 'encounters', recursoId: id, patientId: cur.patient_id })
      return r
    })
    return toJson('encounters', row, user)
  })

  // ---------- Recetas ----------
  async function createPrescription(req: FastifyRequest, user: SessionUser) {
    assertCan(user, 'prescriptions', 'write')
    const body = bodyObject(req)
    const input = clean(prescriptionSchema.parse(body))
    const id = input.id ?? newId()
    const row = await tx(pool, async (c) => {
      const patient = await getPatientData(c, user.orgId, input.patientId)
      await c.query('INSERT INTO folio_counters (org_id, last) VALUES ($1, 0) ON CONFLICT DO NOTHING', [user.orgId])
      const { last } = (await c.query<{ last: number }>('SELECT last FROM folio_counters WHERE org_id = $1 FOR UPDATE', [user.orgId])).rows[0]
      const n = last + 1
      await c.query('UPDATE folio_counters SET last = $2 WHERE org_id = $1', [user.orgId, n])
      const folio = 'RX-' + String(n).padStart(6, '0')
      const t = now()
      const fecha = t.toISOString() // la fecha de emisión la fija el servidor
      const medico = (await getUserById(c, user.id))!
      const payload = {
        folio,
        fecha,
        paciente: pacienteCorto(patient as { nombre: string; apellidos: string; fechaNac: string }),
        medicamentos: input.items.map((i) => [i.medicamento, i.presentacion].filter(Boolean).join(' ')),
        cedula: medico.profile?.cedula ?? '',
        medico: medico.nombre,
        org: user.orgId,
      }
      const firma = await signForOrg(c, user.orgId, cfg.masterKey, payload)
      const data = clean({ id, patientId: input.patientId, fecha, items: input.items, indicaciones: input.indicaciones, folio, firma })
      const r = await insertRow(c, 'prescriptions', user, id, input.patientId, data, t)
      await auditReq(c, req, { accion: 'crear', recurso: 'prescriptions', recursoId: id, patientId: input.patientId, detalle: { folio } })
      return r
    })
    return toJson('prescriptions', row, user)
  }

  app.post('/api/prescriptions/:id/cancelar', async (req) => {
    const user = requireUser(req)
    const id = idParam(req)
    assertCan(user, 'prescriptions', 'write')
    const { motivo } = cancelSchema.parse(req.body ?? {})
    const row = await tx(pool, async (c) => {
      const cur = await getRow(c, 'prescriptions', user.orgId, id, true, user.rol)
      assertNotBlocked(cur)
      if (cur.data.cancelada) throw conflict('receta_cancelada', 'La receta ya estaba cancelada.')
      const t = now()
      const data = { ...cur.data, cancelada: true, motivoCancelacion: motivo, canceladaEn: t.toISOString(), canceladaPor: user.id }
      const r = await updateRow(c, 'prescriptions', user.orgId, id, cur.patient_id, data, t)
      await auditReq(c, req, { accion: 'actualizar', recurso: 'prescriptions', recursoId: id, patientId: cur.patient_id, detalle: { operacion: 'cancelar', folio: cur.data.folio } })
      return r
    })
    return toJson('prescriptions', row, user)
  })
}
