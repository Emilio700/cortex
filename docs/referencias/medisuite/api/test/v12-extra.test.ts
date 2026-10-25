import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN, Client, loginAs, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Client, medico: Client & { userId: string }, recepcion: Client & { userId: string }, enfermeria: Client & { userId: string }

beforeAll(async () => {
  env = await setupEnv()
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  medico = await userClient(env.app, admin, 'medico', { cedula: '7654321' })
  recepcion = await userClient(env.app, admin, 'recepcion')
  enfermeria = await userClient(env.app, admin, 'enfermeria')
})
afterAll(async () => env.close())

describe('GET /api/users/asignables', () => {
  it('cualquier rol obtiene solo id, nombre y rol de los usuarios activos de su organización', async () => {
    const inactivo = await userClient(env.app, admin, 'medico')
    expect((await admin.patch('/api/users/' + inactivo.userId, { activo: false })).statusCode).toBe(200)
    for (const c of [admin, medico, recepcion, enfermeria]) {
      const r = await c.get('/api/users/asignables')
      expect(r.statusCode).toBe(200)
      const ids = r.data.map((u: any) => u.id)
      expect(ids).toEqual(expect.arrayContaining([medico.userId, recepcion.userId, enfermeria.userId]))
      expect(ids).not.toContain(inactivo.userId)
      for (const u of r.data) expect(Object.keys(u).sort()).toEqual(['id', 'nombre', 'rol'])
    }
    // /api/users completo sigue siendo solo de admin.
    expect((await recepcion.get('/api/users')).statusCode).toBe(403)
    expect((await new Client(env.app).get('/api/users/asignables')).statusCode).toBe(401)
  })
})

describe('POST /api/auditoria/evento', () => {
  it('registra exportaciones del navegador en la bitácora con lista blanca', async () => {
    const pid = (await medico.post('/api/patients', samplePatient({ nombre: 'Exporta' }))).data.id
    const r = await medico.post('/api/auditoria/evento', { accion: 'exportar', recurso: 'fhir', patientId: pid, detalle: { formato: 'fhir+json', recursos: 12 } })
    expect(r.statusCode).toBe(204)
    expect((await recepcion.post('/api/auditoria/evento', { accion: 'exportar', recurso: 'caja', detalle: { formato: 'csv', recursos: 30 } })).statusCode).toBe(204)
    const log = (await admin.get('/api/audit?accion=exportar')).data
    const filas = Array.isArray(log) ? log : log.items ?? log.data
    const fhir = filas.find((x: any) => x.recurso === 'fhir')
    expect(fhir).toMatchObject({ accion: 'exportar', patientId: pid, detalle: { origen: 'navegador', formato: 'fhir+json', recursos: 12 } })
    expect(filas.some((x: any) => x.recurso === 'caja')).toBe(true)

    // Lista blanca: acción, recurso, campos extra y formato inválidos → 400.
    for (const body of [
      { accion: 'borrar', recurso: 'fhir' },
      { accion: 'exportar', recurso: 'patients' },
      { accion: 'exportar', recurso: 'fhir', detalle: { formato: 'csv', recursos: 1, nota: 'texto libre' } },
      { accion: 'exportar', recurso: 'fhir', extra: 1 },
      { accion: 'exportar', recurso: 'fhir', detalle: { formato: '<script>', recursos: 1 } },
      { accion: 'exportar', recurso: 'fhir', detalle: { formato: 'csv', recursos: -1 } },
    ])
      expect((await medico.post('/api/auditoria/evento', body)).statusCode).toBe(400)
    // Paciente de otra organización / inexistente → 404; sin sesión → 401; sin encabezado CSRF → 403.
    expect((await medico.post('/api/auditoria/evento', { accion: 'exportar', recurso: 'fhir', patientId: 'no-existe' })).statusCode).toBe(404)
    expect((await new Client(env.app).post('/api/auditoria/evento', { accion: 'exportar', recurso: 'fhir' })).statusCode).toBe(401)
    expect((await medico.req('POST', '/api/auditoria/evento', { accion: 'exportar', recurso: 'fhir' }, { 'x-requested-with': '' })).statusCode).toBe(403)
  })

  it('tiene límite de frecuencia', async () => {
    let ultimo = 0
    for (let i = 0; i < 70 && ultimo !== 429; i++) ultimo = (await enfermeria.post('/api/auditoria/evento', { accion: 'exportar', recurso: 'inventario', detalle: { formato: 'csv', recursos: 1 } })).statusCode
    expect(ultimo).toBe(429)
  })
})
