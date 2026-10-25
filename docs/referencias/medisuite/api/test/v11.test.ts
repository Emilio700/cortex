import { decodeProtectedHeader } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN, Client, createOtherOrg, loginAs, PASSWORD, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Client, medico: Client & { userId: string }, recepcion: Client & { userId: string }, enfermeria: Client
let pid: string

beforeAll(async () => {
  env = await setupEnv({ METRICS_TOKEN: 'token-metricas-123' })
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  medico = await userClient(env.app, admin, 'medico', { cedula: '1234567' })
  recepcion = await userClient(env.app, admin, 'recepcion')
  enfermeria = await userClient(env.app, admin, 'enfermeria')
  pid = (await medico.post('/api/patients', samplePatient())).data.id
})
afterAll(async () => env.close())

describe('preferencias', () => {
  it('scope user: privado por usuario; clave inexistente → valor null', async () => {
    const vacio = await medico.get('/api/preferencias/receta.plantillas')
    expect(vacio.statusCode).toBe(200)
    expect(vacio.data).toEqual({ clave: 'receta.plantillas', scope: 'user', valor: null, actualizadoEn: null })
    const put = await medico.put('/api/preferencias/receta.plantillas', { valor: [{ nombre: 'Gripe', items: [1, 2] }] })
    expect(put.statusCode).toBe(200)
    expect(put.data).toMatchObject({ clave: 'receta.plantillas', scope: 'user', valor: [{ nombre: 'Gripe', items: [1, 2] }], actualizadoEn: expect.any(String) })
    expect((await medico.get('/api/preferencias/receta.plantillas?scope=user')).data.valor).toEqual([{ nombre: 'Gripe', items: [1, 2] }])
    // Otro usuario no la ve.
    expect((await recepcion.get('/api/preferencias/receta.plantillas')).data.valor).toBeNull()
    // Valores primitivos y null.
    expect((await medico.put(`/api/preferencias/anatomia.borrador.${pid}`, { valor: 'texto' })).data.valor).toBe('texto')
    expect((await medico.put('/api/preferencias/telemedicina.notas.sala-1', { valor: null })).data.valor).toBeNull()
    const lista = await medico.get('/api/preferencias?prefijo=anatomia.')
    expect(lista.data.map((x: any) => x.clave)).toEqual([`anatomia.borrador.${pid}`])
    expect((await medico.del(`/api/preferencias/anatomia.borrador.${pid}`)).statusCode).toBe(204)
    expect((await medico.get(`/api/preferencias/anatomia.borrador.${pid}`)).data.valor).toBeNull()
  })

  it('scope org: todos leen; escriben admin y médico', async () => {
    expect((await admin.put('/api/preferencias/caja.precios?scope=org', { valor: { consulta: 800 } })).statusCode).toBe(200)
    expect((await medico.put('/api/preferencias/odontograma.precios?scope=org', { valor: { resina: 1200 } })).statusCode).toBe(200)
    expect((await recepcion.put('/api/preferencias/caja.precios?scope=org', { valor: {} })).statusCode).toBe(403)
    expect((await enfermeria.del('/api/preferencias/caja.precios?scope=org')).statusCode).toBe(403)
    expect((await recepcion.get('/api/preferencias/caja.precios?scope=org')).data.valor).toEqual({ consulta: 800 })
    // scope org y user son espacios distintos
    expect((await admin.get('/api/preferencias/caja.precios')).data.valor).toBeNull()
    // Aislamiento entre organizaciones
    await createOtherOrg(env.pool, 'admin@clinica-b.mx')
    const otro = await loginAs(env.app, 'admin@clinica-b.mx', PASSWORD)
    expect((await otro.get('/api/preferencias/caja.precios?scope=org')).data.valor).toBeNull()
  })

  it('validación: clave, tamaño, cuerpo, scope; bitácora', async () => {
    expect((await medico.put('/api/preferencias/Mayusculas', { valor: 1 })).data.error).toBe('clave_invalida')
    expect((await medico.put(`/api/preferencias/${'a'.repeat(65)}`, { valor: 1 })).statusCode).toBe(400)
    expect((await medico.put('/api/preferencias/x', { otro: 1 })).statusCode).toBe(400)
    expect((await medico.put('/api/preferencias/x?scope=global', { valor: 1 })).statusCode).toBe(400)
    const big = await medico.put('/api/preferencias/grande', { valor: 'x'.repeat(256 * 1024 + 10) })
    expect(big.statusCode).toBe(413)
    expect(big.data.error).toBe('valor_muy_grande')
    expect((await medico.put('/api/preferencias/justo', { valor: 'x'.repeat(256 * 1024 - 10) })).statusCode).toBe(200)
    const audit = await admin.get('/api/audit?limit=100')
    expect(audit.data.some((a: any) => a.recurso === 'preferencias' && a.accion === 'actualizar' && a.recursoId === 'caja.precios')).toBe(true)
    // CSRF aplica
    const r = await env.app.inject({ method: 'PUT', url: '/api/preferencias/x', headers: { cookie: medico.cookie!, 'content-type': 'application/json' }, payload: '{"valor":1}' })
    expect(r.statusCode).toBe(403)
  })
})

describe('PATCH con null = quitar la clave', () => {
  it('colecciones: quita opcionales; obligatorios → 400', async () => {
    const p = await medico.post('/api/patients', samplePatient({ telefono: '5512345678', curp: 'PEGJ800512MDFRMN09' }))
    const r = await medico.patch(`/api/patients/${p.data.id}`, { telefono: null, notas: null })
    expect(r.statusCode).toBe(200)
    expect(r.data).not.toHaveProperty('telefono')
    expect(r.data).not.toHaveProperty('notas')
    expect(r.data.curp).toBe('PEGJ800512MDFRMN09')
    const bad = await medico.patch(`/api/patients/${p.data.id}`, { nombre: null })
    expect(bad.statusCode).toBe(400)
    expect(bad.data.error).toBe('validacion')
    // Recepción no puede borrar campos ocultos con null.
    await medico.patch(`/api/patients/${p.data.id}`, { notas: 'secreta' })
    expect((await recepcion.patch(`/api/patients/${p.data.id}`, { notas: null, telefono: '5500000000' })).statusCode).toBe(200)
    expect((await medico.get(`/api/patients/${p.data.id}`)).data.notas).toBe('secreta')

    const a = await recepcion.post('/api/appointments', { patientId: pid, inicio: '2026-12-01T16:00:00.000Z', fin: '2026-12-01T16:30:00.000Z', tipo: 'subsecuente', estado: 'agendada', motivo: 'x' })
    expect((await recepcion.patch(`/api/appointments/${a.data.id}`, { motivo: null })).data).not.toHaveProperty('motivo')
    expect((await recepcion.patch(`/api/appointments/${a.data.id}`, { inicio: null })).statusCode).toBe(400)
  })

  it('usuarios y configuración: null quita datos de perfil', async () => {
    expect((await admin.patch(`/api/users/${medico.userId}`, { universidad: 'UNAM' })).data.universidad).toBe('UNAM')
    const u = await admin.patch(`/api/users/${medico.userId}`, { universidad: null })
    expect(u.statusCode).toBe(200)
    expect(u.data).not.toHaveProperty('universidad')
    expect((await admin.patch(`/api/users/${medico.userId}`, { nombre: null })).statusCode).toBe(400)
    await admin.patch('/api/settings', { servicios: { orthanc: 'http://orthanc:8042' } })
    const s = await admin.patch('/api/settings', { servicios: { orthanc: null } })
    expect(s.statusCode).toBe(200)
    expect(s.data.servicios).not.toHaveProperty('orthanc')
    expect((await medico.patch('/api/settings', { doctor: { cedula: null } })).data.doctor.cedula).toBe('')
  })
})

describe('paginación y sincronización incremental', () => {
  it('?limit=&cursor= recorre todo sin repetir; sin parámetros devuelve todo', async () => {
    for (let i = 0; i < 5; i++) await recepcion.post('/api/payments', { patientId: pid, concepto: `C${i}`, monto: 100 + i, metodo: 'efectivo' })
    const todos = (await admin.get('/api/payments')).data
    expect(todos.length).toBeGreaterThanOrEqual(5)
    const vistos: string[] = []
    let cursor: string | undefined
    let paginas = 0
    do {
      const r = await admin.get(`/api/payments?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
      expect(r.statusCode).toBe(200)
      expect(r.data.length).toBeLessThanOrEqual(2)
      vistos.push(...r.data.map((x: any) => x.id))
      cursor = r.headers['x-next-cursor'] as string | undefined
      paginas++
    } while (cursor && paginas < 20)
    expect(vistos).toEqual(todos.map((x: any) => x.id))
    expect((await admin.get('/api/payments?limit=0')).statusCode).toBe(400)
    expect((await admin.get('/api/payments?limit=2&cursor=basura')).data.error).toBe('cursor_invalido')
  })

  it('?desde= devuelve cambiados e incluye borrados como { id, eliminado: true }', async () => {
    const marca = new Date(Date.now() - 1000).toISOString()
    await new Promise((r) => setTimeout(r, 1100))
    const a = await recepcion.post('/api/payments', { patientId: pid, concepto: 'Nuevo', monto: 1, metodo: 'efectivo' })
    const b = await recepcion.post('/api/payments', { patientId: pid, concepto: 'Borrar', monto: 2, metodo: 'efectivo' })
    const r0 = await admin.get(`/api/payments?desde=${encodeURIComponent(marca)}`)
    expect(r0.headers['x-sync-desde']).toBeTypeOf('string')
    const sync = r0.headers['x-sync-desde'] as string
    expect(r0.data.map((x: any) => x.id)).toEqual(expect.arrayContaining([a.data.id, b.data.id]))
    await new Promise((r) => setTimeout(r, 10))
    await recepcion.del(`/api/payments/${b.data.id}`)
    const r1 = await admin.get(`/api/payments?desde=${encodeURIComponent(sync)}`)
    const del = r1.data.find((x: any) => x.id === b.data.id)
    expect(del).toEqual({ id: b.data.id, eliminado: true, actualizadoEn: expect.any(String) })
    // Sin desde, el borrado no aparece.
    expect((await admin.get('/api/payments')).data.find((x: any) => x.id === b.data.id)).toBeUndefined()
    expect((await admin.get('/api/payments?desde=ayer')).statusCode).toBe(400)
  })
})

describe('rotación de llaves', () => {
  it('nueva llave activa; las recetas anteriores siguen verificando', async () => {
    const pat = await medico.post('/api/patients', samplePatient({ nombre: 'Rotación' }))
    const rx1 = await medico.post('/api/prescriptions', { patientId: pat.data.id, items: [{ medicamento: 'Paracetamol', dosis: '500 mg', via: 'oral', frecuencia: 'c/8h', duracion: '3 días' }] })
    const kid1 = decodeProtectedHeader(rx1.data.firma).kid
    expect((await medico.post('/api/admin/llaves/rotar')).statusCode).toBe(403)
    const rot = await admin.post('/api/admin/llaves/rotar')
    expect(rot.statusCode).toBe(201)
    expect(rot.data.kid).not.toBe(kid1)
    const llaves = await admin.get('/api/admin/llaves')
    expect(llaves.data.filter((k: any) => k.activa).map((k: any) => k.kid)).toEqual([rot.data.kid])
    const jwks = await new Client(env.app).get('/api/public/jwks')
    expect(jwks.data.keys.map((k: any) => k.kid)).toEqual(expect.arrayContaining([kid1, rot.data.kid]))
    const rx2 = await medico.post('/api/prescriptions', { patientId: pat.data.id, items: [{ medicamento: 'Ibuprofeno', dosis: '400 mg', via: 'oral', frecuencia: 'c/8h', duracion: '3 días' }] })
    expect(decodeProtectedHeader(rx2.data.firma).kid).toBe(rot.data.kid)
    const pub = new Client(env.app)
    expect((await pub.get(`/api/public/verificar?t=${rx1.data.firma}`)).data.valida).toBe(true)
    expect((await pub.get(`/api/public/verificar?t=${rx2.data.firma}`)).data.valida).toBe(true)
    expect((await admin.get('/api/settings')).data.llavePublica.kid).toBe(rot.data.kid)
    const audit = await admin.get('/api/audit?limit=20')
    expect(audit.data.some((a: any) => a.recurso === 'org_keys' && a.detalle?.operacion === 'rotar')).toBe(true)
  })
})

describe('operación', () => {
  it('/api/metrics: admin o bearer; formato Prometheus', async () => {
    const anon = new Client(env.app)
    expect((await anon.get('/api/metrics')).statusCode).toBe(401)
    expect((await medico.get('/api/metrics')).statusCode).toBe(403)
    expect((await anon.req('GET', '/api/metrics', undefined, { authorization: 'Bearer malo' })).statusCode).toBe(401)
    const r = await anon.req('GET', '/api/metrics', undefined, { authorization: 'Bearer token-metricas-123' })
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toMatch(/^text\/plain/)
    expect(r.body).toMatch(/medisuite_http_requests_total\{method="GET",route="\/api\/:col",status="2xx"\} \d+/)
    expect(r.body).toContain('medisuite_http_request_duration_seconds_bucket')
    expect(r.body).toContain('medisuite_scheduler_runs_total')
    expect(r.body).toContain('medisuite_mensajes_total')
    expect((await admin.get('/api/metrics')).statusCode).toBe(200)
  })

  it('/api/health informa programador, almacenamiento y servicios sin secretos', async () => {
    const r = await new Client(env.app).get('/api/health')
    expect(r.data).toMatchObject({ db: 'ok', storage: { tipo: 'disk', estado: 'ok' }, scheduler: { activo: false }, servicios: { whatsapp: false, correo: false, pac: false } })
    expect(r.body).not.toContain('token-metricas')
  })
})
