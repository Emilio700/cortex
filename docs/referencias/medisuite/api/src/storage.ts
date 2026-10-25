// Almacenamiento de archivos detrás de una interfaz mínima: disco (por defecto) o S3 compatible.
// Los nombres son aleatorios (48 hex) y nunca vienen del cliente.
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { StorageConfig } from './config.js'

export interface Storage {
  readonly kind: 'disk' | 's3'
  /** Guarda el contenido (stream o buffer). Falla si el nombre ya existe (disco). */
  put(name: string, body: Readable | Buffer, mime?: string): Promise<void>
  /** Stream de lectura, o undefined si no existe. */
  get(name: string): Promise<Readable | undefined>
  exists(name: string): Promise<boolean>
  delete(name: string): Promise<void>
  /** Comprobación ligera para /api/health. */
  health(): Promise<boolean>
}

export const STORAGE_NAME_RE = /^[a-f0-9]{48}$/

function checkName(name: string) {
  if (!STORAGE_NAME_RE.test(name)) throw new Error('Nombre de archivo de almacenamiento inválido')
}

export class DiskStorage implements Storage {
  readonly kind = 'disk' as const
  constructor(private dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o750 })
  }
  private p(name: string) {
    checkName(name)
    return path.join(this.dir, name)
  }
  async put(name: string, body: Readable | Buffer) {
    const src = Buffer.isBuffer(body) ? Readable.from([body]) : body
    await pipeline(src, createWriteStream(this.p(name), { flags: 'wx', mode: 0o640 }))
  }
  async get(name: string) {
    const p = this.p(name)
    try {
      await stat(p)
    } catch {
      return undefined
    }
    return createReadStream(p)
  }
  async exists(name: string) {
    try {
      await stat(this.p(name))
      return true
    } catch {
      return false
    }
  }
  async delete(name: string) {
    await rm(this.p(name), { force: true })
  }
  async health() {
    try {
      await stat(this.dir)
      return true
    } catch {
      return false
    }
  }
}

/** Subconjunto de S3Client que se usa (permite inyectar un cliente simulado en pruebas). */
export interface S3Like {
  send(cmd: unknown): Promise<any>
}

export class S3Storage implements Storage {
  readonly kind = 's3' as const
  constructor(
    private client: S3Like,
    private bucket: string,
    private prefix = 'files/',
  ) {}

  private key(name: string) {
    checkName(name)
    return this.prefix + name
  }
  async put(name: string, body: Readable | Buffer, mime?: string) {
    // PutObject necesita la longitud: se acumula en memoria (máx. 25 MB por archivo).
    let buf: Buffer
    if (Buffer.isBuffer(body)) buf = body
    else {
      const chunks: Buffer[] = []
      for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
      buf = Buffer.concat(chunks)
    }
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.key(name), Body: buf, ContentLength: buf.length, ContentType: mime ?? 'application/octet-stream' }),
    )
  }
  async get(name: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(name) }))
      const b = r.Body
      if (!b) return undefined
      if (b instanceof Readable) return b
      if (Buffer.isBuffer(b) || b instanceof Uint8Array) return Readable.from([Buffer.from(b)])
      if (typeof b.transformToByteArray === 'function') return Readable.from([Buffer.from(await b.transformToByteArray())])
      return Readable.from(b as AsyncIterable<Uint8Array>)
    } catch (e) {
      if (isNotFound(e)) return undefined
      throw e
    }
  }
  async exists(name: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(name) }))
      return true
    } catch (e) {
      if (isNotFound(e)) return false
      throw e
    }
  }
  async delete(name: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(name) }))
  }
  async health() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      return true
    } catch {
      return false
    }
  }
}

function isNotFound(e: unknown) {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } }
  return err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404
}

export async function createStorage(cfg: { storage: StorageConfig; filesDir: string }): Promise<Storage> {
  const s = cfg.storage
  if (s.kind === 's3') {
    const client = new S3Client({
      region: s.region,
      endpoint: s.endpoint,
      forcePathStyle: s.forcePathStyle,
      credentials: s.accessKey && s.secretKey ? { accessKeyId: s.accessKey, secretAccessKey: s.secretKey } : undefined,
    })
    return new S3Storage(client, s.bucket)
  }
  const d = new DiskStorage(cfg.filesDir)
  await d.init()
  return d
}

/** Lee un stream completo a memoria (solo para archivos pequeños). */
export async function readAll(r: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of r) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  return Buffer.concat(chunks)
}
