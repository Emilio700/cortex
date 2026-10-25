// Subida (multipart) y descarga autenticada de documentos. Los archivos viven fuera de la BD
// (almacenamiento en disco FILES_DIR o S3 compatible, ver storage.ts).
import type { FastifyInstance, FastifyReply } from 'fastify'
import { createHash, randomBytes } from 'node:crypto'
import { Transform } from 'node:stream'
import { auditReq } from '../audit.js'
import { now } from '../clock.js'
import { tx, type Q } from '../db.js'
import { AppError, badRequest, notFound } from '../errors.js'
import { sniffMime } from '../mime.js'
import { assertCan, assertDocTipo, clean, getPatientData, getRow, insertRow, newId, toJson, type ResRow } from '../resources.js'
import { documentMetaSchema, idSchema } from '../schemas.js'
import { requireUser } from '../session.js'
import { STORAGE_NAME_RE, type Storage } from '../storage.js'
import type { SessionUser } from '../types.js'

export const MAX_FILE_BYTES = 25 * 1024 * 1024
const FULL_SNIFF_BYTES = 5 * 1024 * 1024

/** Nombre seguro para Content-Disposition. */
export function dispositionName(nombre: string, kind: 'inline' | 'attachment' = 'inline') {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\;\r\n]/g, '_').slice(0, 150) || 'archivo'
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre.slice(0, 150))}`
}

export const newStorageName = () => randomBytes(24).toString('hex')

/**
 * Guarda un archivo generado por el servidor (p. ej. PDF/XML de una factura) como documento del paciente.
 * Debe llamarse dentro de una transacción; el archivo se escribe antes de insertar las filas.
 */
export async function saveServerDocument(
  c: Q,
  storage: Storage,
  user: SessionUser,
  doc: { id: string; patientId: string; tipo: string; nombre: string; meta?: Record<string, unknown> },
  content: Buffer,
): Promise<ResRow> {
  const name = newStorageName()
  const mime = sniffMime(content.subarray(0, 8192), content.length <= FULL_SNIFF_BYTES ? content : undefined)
  await storage.put(name, content, mime)
  const t = now()
  const data = clean({ id: doc.id, patientId: doc.patientId, fecha: t.toISOString(), tipo: doc.tipo, nombre: doc.nombre, mime, dataUrl: `/api/files/${doc.id}`, meta: doc.meta, tamano: content.length })
  try {
    const r = await insertRow(c, 'documents', user, doc.id, doc.patientId, data, t)
    await c.query('INSERT INTO files (org_id, id, storage_name, mime, size, sha256) VALUES ($1,$2,$3,$4,$5,$6)', [
      user.orgId,
      doc.id,
      name,
      mime,
      content.length,
      createHash('sha256').update(content).digest('hex'),
    ])
    return r
  } catch (e) {
    await storage.delete(name).catch(() => {})
    throw e
  }
}

/** Envía un archivo guardado con los encabezados seguros. Devuelve false si no existe. */
export async function sendStoredFile(storage: Storage, reply: FastifyReply, f: { storage_name: string; mime: string; size: string | number }, nombre: string, kind: 'inline' | 'attachment' = 'inline') {
  if (!STORAGE_NAME_RE.test(f.storage_name)) return false
  const stream = await storage.get(f.storage_name)
  if (!stream) return false
  const type = f.mime.startsWith('text/') || f.mime === 'application/json' || f.mime === 'application/xml' ? `${f.mime}; charset=utf-8` : f.mime
  reply
    .header('Content-Type', type)
    .header('Content-Length', String(f.size))
    .header('Content-Disposition', dispositionName(nombre, kind))
    .header('Cache-Control', 'private, no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    .header('Cross-Origin-Resource-Policy', 'same-origin')
  return reply.send(stream)
}

export default async function documentRoutes(app: FastifyInstance) {
  const { pool, storage } = app.ctx

  app.post('/api/documents', async (req, reply) => {
    const user = requireUser(req)
    assertCan(user, 'documents', 'write')
    if (!req.isMultipart()) throw badRequest('validacion', 'Se esperaba multipart/form-data con los campos file y meta.')

    let metaRaw: string | undefined
    let stored: { name: string; size: number; sha256: string; head: Buffer; full?: Buffer } | undefined
    const cleanup = async () => {
      if (stored) await storage.delete(stored.name).catch(() => {})
    }

    try {
      for await (const part of req.parts({ limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5, fieldSize: 200_000 } })) {
        if (part.type === 'field') {
          if (part.fieldname === 'meta') metaRaw = String(part.value)
          continue
        }
        if (part.fieldname !== 'file' || stored) {
          part.file.resume()
          continue
        }
        const name = newStorageName()
        const hash = createHash('sha256')
        let size = 0
        let head = Buffer.alloc(0)
        // Se conserva en memoria hasta 5 MB para validar JSON completo al detectar el MIME.
        let chunks: Buffer[] | undefined = []
        const meter = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            size += chunk.length
            hash.update(chunk)
            if (head.length < 8192) head = Buffer.concat([head, chunk]).subarray(0, 8192)
            if (chunks) {
              if (size <= FULL_SNIFF_BYTES) chunks.push(chunk)
              else chunks = undefined
            }
            cb(null, chunk)
          },
        })
        part.file.on('error', (e) => meter.destroy(e))
        stored = { name, size: 0, sha256: '', head: Buffer.alloc(0) }
        await storage.put(name, part.file.pipe(meter))
        if (part.file.truncated) throw new AppError(413, 'archivo_muy_grande', 'El archivo excede el máximo de 25 MB.')
        stored = { name, size, sha256: hash.digest('hex'), head, full: chunks ? Buffer.concat(chunks) : undefined }
      }

      if (!stored) throw badRequest('validacion', 'Falta el archivo (campo file).')
      if (!metaRaw) throw badRequest('validacion', 'Falta el campo meta (JSON).')
      let metaJson: unknown
      try {
        metaJson = JSON.parse(metaRaw)
      } catch {
        throw badRequest('validacion', 'El campo meta no es JSON válido.')
      }
      const meta = clean(documentMetaSchema.parse(metaJson))
      assertDocTipo(user, meta.tipo, 'write')

      const mime = sniffMime(stored.head, stored.full ?? stored.head)
      const id = meta.id ?? newId()
      const t = now()
      const data = clean({
        id,
        patientId: meta.patientId,
        fecha: meta.fecha ?? t.toISOString(),
        tipo: meta.tipo,
        nombre: meta.nombre,
        mime,
        dataUrl: `/api/files/${id}`,
        meta: meta.meta,
        tamano: stored.size,
      })
      const s = stored
      const row = await tx(pool, async (c) => {
        await getPatientData(c, user.orgId, meta.patientId)
        const r = await insertRow(c, 'documents', user, id, meta.patientId, data, t)
        await c.query('INSERT INTO files (org_id, id, storage_name, mime, size, sha256) VALUES ($1,$2,$3,$4,$5,$6)', [user.orgId, id, s.name, mime, s.size, s.sha256])
        await auditReq(c, req, { accion: 'crear', recurso: 'documents', recursoId: id, patientId: meta.patientId, detalle: { tipo: meta.tipo, mime, tamano: s.size } })
        return r
      })
      return reply.code(201).send(toJson('documents', row, user))
    } catch (e) {
      await cleanup()
      const err = e as { code?: string; statusCode?: number }
      if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_PARTS_LIMIT' || err.code === 'FST_FILES_LIMIT')
        throw new AppError(413, 'archivo_muy_grande', 'El archivo excede el máximo de 25 MB.')
      throw e
    }
  })

  app.get('/api/files/:id', async (req, reply) => {
    const user = requireUser(req)
    assertCan(user, 'documents', 'read')
    const id = (req.params as { id: string }).id
    if (!idSchema.safeParse(id).success) throw notFound()
    const doc = await getRow(pool, 'documents', user.orgId, id, false, user.rol)
    assertDocTipo(user, doc.data.tipo, 'read')
    const f = (await pool.query<{ storage_name: string; mime: string; size: string }>('SELECT storage_name, mime, size FROM files WHERE org_id = $1 AND id = $2', [user.orgId, id])).rows[0]
    if (!f || !STORAGE_NAME_RE.test(f.storage_name) || !(await storage.exists(f.storage_name))) throw notFound('Archivo no encontrado.')
    await auditReq(pool, req, { accion: 'descargar_archivo', recurso: 'documents', recursoId: id, patientId: doc.patient_id })
    const sent = await sendStoredFile(storage, reply, f, String(doc.data.nombre ?? 'archivo'))
    if (sent === false) throw notFound('Archivo no encontrado.')
    return sent
  })
}
