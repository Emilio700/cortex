import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { purgarArchivos } from '../src/purgar-archivos.js'
import { DiskStorage, readAll, S3Storage, type S3Like } from '../src/storage.js'
import { ADMIN, Client, loginAs, multipart, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

const name = () => randomBytes(24).toString('hex')

describe('DiskStorage', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ms-st-'))
  })
  afterAll(async () => rm(dir, { recursive: true, force: true }))

  it('put/get/exists/delete con buffer y stream; nombres validados', async () => {
    const s = new DiskStorage(path.join(dir, 'files'))
    await s.init()
    expect(await s.health()).toBe(true)
    const a = name()
    await s.put(a, Buffer.from('hola'))
    expect(await s.exists(a)).toBe(true)
    expect((await readAll((await s.get(a))!)).toString()).toBe('hola')
    const b = name()
    await s.put(b, Readable.from([Buffer.from('uno '), Buffer.from('dos')]))
    expect((await readAll((await s.get(b))!)).toString()).toBe('uno dos')
    await expect(s.put(a, Buffer.from('x'))).rejects.toThrow() // no sobrescribe
    await s.delete(a)
    expect(await s.exists(a)).toBe(false)
    expect(await s.get(a)).toBeUndefined()
    await expect(s.put('../escape', Buffer.from('x'))).rejects.toThrow(/inválido/)
    await expect(s.get('ABC')).rejects.toThrow(/inválido/)
  })
})

describe('S3Storage (cliente simulado)', () => {
  it('traduce las operaciones a comandos S3 con prefijo', async () => {
    const objects = new Map<string, Buffer>()
    const cmds: string[] = []
    const client: S3Like = {
      async send(cmd: any) {
        const i = cmd.input
        cmds.push(`${cmd.constructor.name} ${i.Key ?? i.Bucket}`)
        const notFound = () => Object.assign(new Error('nf'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })
        if (cmd instanceof PutObjectCommand) {
          expect(i.ContentLength).toBe((i.Body as Buffer).length)
          objects.set(i.Key!, i.Body as Buffer)
          return {}
        }
        if (cmd instanceof GetObjectCommand) {
          const b = objects.get(i.Key!)
          if (!b) throw notFound()
          return { Body: Readable.from([b]) }
        }
        if (cmd instanceof HeadObjectCommand) {
          if (!objects.has(i.Key!)) throw Object.assign(new Error('nf'), { name: 'NotFound' })
          return {}
        }
        if (cmd instanceof DeleteObjectCommand) {
          objects.delete(i.Key!)
          return {}
        }
        if (cmd instanceof HeadBucketCommand) return {}
        throw new Error('comando inesperado')
      },
    }
    const s = new S3Storage(client, 'mi-bucket')
    const n = name()
    await s.put(n, Readable.from([Buffer.from('abc'), Buffer.from('def')]), 'text/plain')
    expect(objects.get(`files/${n}`)!.toString()).toBe('abcdef')
    expect(await s.exists(n)).toBe(true)
    expect((await readAll((await s.get(n))!)).toString()).toBe('abcdef')
    await s.delete(n)
    expect(await s.exists(n)).toBe(false)
    expect(await s.get(n)).toBeUndefined()
    expect(await s.health()).toBe(true)
    expect(cmds[0]).toBe(`PutObjectCommand files/${n}`)
  })

  it('configuración STORAGE=s3', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x/y', STORAGE: 's3', S3_BUCKET: 'b', S3_ENDPOINT: 'https://minio:9000', S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's' })
    expect(c.storage).toMatchObject({ kind: 's3', bucket: 'b', endpoint: 'https://minio:9000', forcePathStyle: true, region: 'us-east-1' })
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x/y', STORAGE: 's3' })).toThrow(/S3_BUCKET/)
  })
})

describe('documentos sobre la interfaz y purga de archivos', () => {
  let env: TestEnv
  let admin: Client, medico: Client
  let pid: string
  beforeAll(async () => {
    env = await setupEnv()
    admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
    medico = await userClient(env.app, admin, 'medico')
    pid = (await medico.post('/api/patients', samplePatient())).data.id
  })
  afterAll(async () => env.close())

  const upload = async (content: Buffer, nombre = 'a.json') => {
    const mp = multipart({ meta: JSON.stringify({ patientId: pid, tipo: 'otro', nombre }) }, { name: nombre, content })
    const r = await medico.req('POST', '/api/documents', mp.payload, mp.headers)
    expect(r.statusCode).toBe(201)
    return r.data
  }

  it('el borrado lógico conserva el archivo; la purga solo actúa con --confirmar y antes de la fecha', async () => {
    const keep = await upload(Buffer.from('{"a":1}'))
    expect(keep.mime).toBe('application/json')
    const gone = await upload(Buffer.from('texto plano para borrar'), 'b.txt')
    expect((await medico.del(`/api/documents/${gone.id}`)).statusCode).toBe(204)
    const files = () => readdir(env.cfg.filesDir)
    expect(await files()).toHaveLength(2) // retención: el archivo sigue

    const antesPasado = new Date('2020-01-01')
    expect(await purgarArchivos(env.pool, env.app.ctx.storage, antesPasado, true)).toMatchObject({ candidatos: 0, purgados: 0 })
    const futuro = new Date('2031-01-01')
    const sim = await purgarArchivos(env.pool, env.app.ctx.storage, futuro, false)
    expect(sim).toMatchObject({ candidatos: 1, purgados: 0 })
    expect(await files()).toHaveLength(2)
    const real = await purgarArchivos(env.pool, env.app.ctx.storage, futuro, true)
    expect(real).toMatchObject({ candidatos: 1, purgados: 1, errores: 0 })
    expect(await files()).toHaveLength(1)
    expect((await medico.get(keep.dataUrl)).statusCode).toBe(200)
    const audit = await admin.get('/api/audit?limit=10')
    expect(audit.data.some((a: any) => a.recurso === 'files' && a.detalle?.operacion === 'purga' && a.recursoId === gone.id)).toBe(true)
  })
})
