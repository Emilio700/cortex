import { readdir } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sniffMime } from '../src/mime.js'
import { ADMIN, Client, loginAs, multipart, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Client, medico: Client, recepcion: Client, enfermeria: Client
let pid: string

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b50000000049454e44ae426082', 'hex')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

async function upload(c: Client, meta: Record<string, unknown>, content: Buffer, name = 'archivo.bin', type?: string) {
  const mp = multipart({ meta: JSON.stringify(meta) }, { name, content, type })
  return c.req('POST', '/api/documents', mp.payload, mp.headers)
}

beforeAll(async () => {
  env = await setupEnv()
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  medico = await userClient(env.app, admin, 'medico')
  recepcion = await userClient(env.app, admin, 'recepcion')
  enfermeria = await userClient(env.app, admin, 'enfermeria')
  pid = (await medico.post('/api/patients', samplePatient())).data.id
})
afterAll(async () => env.close())

describe('detección MIME por bytes', () => {
  it('reconoce tipos comunes e ignora el nombre', () => {
    expect(sniffMime(PNG)).toBe('image/png')
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('image/jpeg')
    expect(sniffMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('image/webp')
    expect(sniffMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]))).toBe('audio/wav')
    expect(sniffMime(PDF)).toBe('application/pdf')
    expect(sniffMime(Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), Buffer.alloc(20)]))).toBe('application/dicom')
    const glb = Buffer.alloc(12)
    glb.write('glTF')
    glb.writeUInt32LE(2, 4)
    expect(sniffMime(glb)).toBe('model/gltf-binary')
    expect(sniffMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 0]))).toBe('audio/webm')
    expect(sniffMime(Buffer.from('ID3\x03\x00'))).toBe('audio/mpeg')
    expect(sniffMime(Buffer.from('<?xml version="1.0"?><a/>'))).toBe('application/xml')
    expect(sniffMime(Buffer.from('<html><script>alert(1)</script></html>'))).toBe('text/plain')
    expect(sniffMime(Buffer.from('{"a":1}'), Buffer.from('{"a":1}'))).toBe('application/json')
    expect(sniffMime(Buffer.from('a,b,c\n1,2,3\n4,5,6\n'))).toBe('text/csv')
    expect(sniffMime(Buffer.from('Hola, ¿cómo estás?'))).toBe('text/plain')
    expect(sniffMime(Buffer.from([0, 1, 2, 3, 250, 251]))).toBe('application/octet-stream')
  })
})

describe('documentos', () => {
  it('sube (multipart), detecta MIME, descarga con sesión y audita', async () => {
    const r = await upload(medico, { patientId: pid, tipo: 'estudio', nombre: 'Rx tórax.pdf', meta: { region: 'tórax' } }, PDF, '../../etc/passwd.png', 'image/png')
    expect(r.statusCode).toBe(201)
    expect(r.data).toMatchObject({ patientId: pid, tipo: 'estudio', nombre: 'Rx tórax.pdf', mime: 'application/pdf', meta: { region: 'tórax' } })
    expect(r.data.dataUrl).toBe(`/api/files/${r.data.id}`)
    // Nombre aleatorio en disco, nunca el del cliente.
    const files = await readdir(env.cfg.filesDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^[a-f0-9]{48}$/)

    const d = await medico.get(r.data.dataUrl)
    expect(d.statusCode).toBe(200)
    expect(d.headers['content-type']).toBe('application/pdf')
    expect(d.headers['cache-control']).toMatch(/private/)
    expect(d.headers['content-disposition']).toMatch(/^inline;/)
    expect(d.rawPayload.equals(PDF)).toBe(true)
    expect((await new Client(env.app).get(r.data.dataUrl)).statusCode).toBe(401)

    const a = await admin.get(`/api/audit?patientId=${pid}`)
    expect(a.data.some((x: any) => x.accion === 'descargar_archivo' && x.recursoId === r.data.id)).toBe(true)

    // PATCH solo nombre y meta
    const p = await medico.patch(`/api/documents/${r.data.id}`, { nombre: 'Rx PA.pdf', tipo: 'factura', mime: 'text/html', dataUrl: 'javascript:x' })
    expect(p.statusCode).toBe(200)
    expect(p.data).toMatchObject({ nombre: 'Rx PA.pdf', tipo: 'estudio', mime: 'application/pdf', dataUrl: `/api/files/${r.data.id}` })
    const list = await medico.get(`/api/documents?patientId=${pid}`)
    expect(list.data).toHaveLength(1)
  })

  it('valida meta y archivo', async () => {
    expect((await upload(medico, { patientId: pid, tipo: 'raro', nombre: 'x' }, PNG)).statusCode).toBe(400)
    expect((await upload(medico, { patientId: 'nadie', tipo: 'foto', nombre: 'x' }, PNG)).statusCode).toBe(400)
    const noFile = multipart({ meta: JSON.stringify({ patientId: pid, tipo: 'foto', nombre: 'x' }) })
    expect((await medico.req('POST', '/api/documents', noFile.payload, noFile.headers)).statusCode).toBe(400)
    const json = await medico.post('/api/documents', { patientId: pid, tipo: 'foto', nombre: 'x', dataUrl: 'data:...' })
    expect(json.statusCode).toBe(400)
    // Los archivos rechazados no quedan en disco.
    expect(await readdir(env.cfg.filesDir)).toHaveLength(1)
  })

  it('rechaza archivos de más de 25 MB', async () => {
    const big = Buffer.alloc(25 * 1024 * 1024 + 10, 0x41)
    const r = await upload(medico, { patientId: pid, tipo: 'otro', nombre: 'grande.txt' }, big)
    expect(r.statusCode).toBe(413)
    expect(await readdir(env.cfg.filesDir)).toHaveLength(1)
  })

  it('permisos por tipo: recepción solo consentimiento/factura; enfermería no escribe facturas', async () => {
    expect((await upload(recepcion, { patientId: pid, tipo: 'estudio', nombre: 'x.png' }, PNG)).statusCode).toBe(403)
    const cons = await upload(recepcion, { patientId: pid, tipo: 'consentimiento', nombre: 'Consentimiento.png' }, PNG)
    expect(cons.statusCode).toBe(201)
    expect(cons.data.mime).toBe('image/png')
    const fac = await upload(recepcion, { patientId: pid, tipo: 'factura', nombre: 'Factura.xml' }, Buffer.from('<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="x"/>'))
    expect(fac.statusCode).toBe(201)
    expect(fac.data.mime).toBe('application/xml')

    const recList = await recepcion.get('/api/documents')
    expect(recList.data.map((d: any) => d.tipo).sort()).toEqual(['consentimiento', 'factura'])
    const estudio = (await medico.get('/api/documents')).data.find((d: any) => d.tipo === 'estudio')
    expect((await recepcion.get(estudio.dataUrl)).statusCode).toBe(403)
    expect((await recepcion.get(`/api/documents/${estudio.id}`)).statusCode).toBe(403)
    expect((await recepcion.del(`/api/documents/${estudio.id}`)).statusCode).toBe(403)

    expect((await upload(enfermeria, { patientId: pid, tipo: 'factura', nombre: 'f.pdf' }, PDF)).statusCode).toBe(403)
    expect((await upload(enfermeria, { patientId: pid, tipo: 'foto', nombre: 'herida.png' }, PNG)).statusCode).toBe(201)
    expect((await enfermeria.get(fac.data.dataUrl)).statusCode).toBe(200)
    expect((await enfermeria.patch(`/api/documents/${fac.data.id}`, { nombre: 'x' })).statusCode).toBe(403)
    const xml = await enfermeria.get(fac.data.dataUrl)
    expect(xml.headers['content-type']).toBe('application/xml; charset=utf-8')
    expect(xml.headers['content-security-policy']).toMatch(/sandbox/)
  })

  it('documento borrado ya no se descarga', async () => {
    const r = await upload(medico, { patientId: pid, tipo: 'otro', nombre: 'nota.txt' }, Buffer.from('texto simple'))
    expect(r.data.mime).toBe('text/plain')
    expect((await medico.del(`/api/documents/${r.data.id}`)).statusCode).toBe(204)
    expect((await medico.get(r.data.dataUrl)).statusCode).toBe(404)
  })
})
