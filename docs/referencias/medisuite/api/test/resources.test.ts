import { decodeProtectedHeader } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN, Client, loginAs, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Client, medico: Client & { userId: string }, recepcion: Client
let pid: string

beforeAll(async () => {
  env = await setupEnv()
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  medico = await userClient(env.app, admin, 'medico', { cedula: '7654321', especialidad: 'Medicina Interna', universidad: 'UNAM' })
  recepcion = await userClient(env.app, admin, 'recepcion')
  pid = (await medico.post('/api/patients', samplePatient())).data.id
})
afterAll(async () => env.close())

describe('CRUD por colección', () => {
  it('patients: crear con id del cliente, validar, actualizar, listar', async () => {
    const r = await medico.post('/api/patients', samplePatient({ id: 'pac-001', curp: 'PEGJ800512MDFRMN09' }))
    expect(r.statusCode).toBe(201)
    expect(r.data).toMatchObject({ id: 'pac-001', nombre: 'Juana', creadoPor: medico.userId, creado: expect.any(String), actualizadoEn: expect.any(String) })
    expect((await medico.post('/api/patients', samplePatient({ id: 'pac-001' }))).statusCode).toBe(409)
    const bad = await medico.post('/api/patients', { nombre: '', sexo: 'X', fechaNac: '12/05/1980' })
    expect(bad.statusCode).toBe(400)
    expect(bad.data.error).toBe('validacion')
    expect(bad.data.detalles.length).toBeGreaterThan(0)
    expect((await medico.post('/api/patients', samplePatient({ id: 'bad id!' }))).statusCode).toBe(400)
    const up = await medico.patch('/api/patients/pac-001', { telefono: '55 0000 1111', creadoPor: 'hack', id: 'otro' })
    expect(up.statusCode).toBe(200)
    expect(up.data).toMatchObject({ id: 'pac-001', telefono: '55 0000 1111', creadoPor: medico.userId, nombre: 'Juana' })
    expect((await medico.patch('/api/patients/pac-001', { sexo: 'Z' })).statusCode).toBe(400)
    expect((await medico.patch('/api/patients/no-existe', { nombre: 'x' })).statusCode).toBe(404)
    const list = await medico.get('/api/patients')
    expect(list.data.map((p: any) => p.id)).toContain('pac-001')
  })

  it('appointments', async () => {
    const a = await recepcion.post('/api/appointments', { patientId: pid, inicio: '2026-11-02T16:00:00.000Z', fin: '2026-11-02T16:45:00.000Z', tipo: 'primera-vez', estado: 'agendada', motivo: 'Dolor' })
    expect(a.statusCode).toBe(201)
    expect((await recepcion.patch(`/api/appointments/${a.data.id}`, { estado: 'confirmada' })).data.estado).toBe('confirmada')
    expect((await recepcion.patch(`/api/appointments/${a.data.id}`, { estado: 'perdida' })).statusCode).toBe(400)
    expect((await recepcion.post('/api/appointments', { patientId: pid, inicio: '2026-11-02T16:00:00.000Z', fin: '2026-11-02T15:00:00.000Z', tipo: 'subsecuente', estado: 'agendada' })).statusCode).toBe(400)
    expect((await recepcion.post('/api/appointments', { patientId: 'nadie', inicio: '2026-11-02T16:00:00.000Z', fin: '2026-11-02T17:00:00.000Z', tipo: 'subsecuente', estado: 'agendada' })).statusCode).toBe(400)
    expect((await recepcion.del(`/api/appointments/${a.data.id}`)).statusCode).toBe(204)
    expect((await recepcion.get(`/api/appointments/${a.data.id}`)).statusCode).toBe(404)
  })

  it('observations: fecha por defecto del servidor, fuente se guarda tal cual', async () => {
    const o = await medico.post('/api/observations', { patientId: pid, codigo: 'spo2', valor: 97, unidad: '%', fuente: 'bluetooth' })
    expect(o.statusCode).toBe(201)
    expect(o.data.fuente).toBe('bluetooth')
    expect(Math.abs(new Date(o.data.fecha).getTime() - Date.now())).toBeLessThan(10_000)
    expect((await medico.post('/api/observations', { patientId: pid, codigo: 'spo2', valor: 'x', unidad: '%', fuente: 'manual' })).statusCode).toBe(400)
    expect((await medico.post('/api/observations', { patientId: pid, codigo: 'spo2', valor: 1, unidad: '%', fuente: 'telepatia' })).statusCode).toBe(400)
    const byP = await medico.get(`/api/observations?patientId=${pid}`)
    expect(byP.data).toHaveLength(1)
    expect((await medico.del(`/api/observations/${o.data.id}`)).statusCode).toBe(204)
  })

  it('payments', async () => {
    const p = await recepcion.post('/api/payments', { patientId: pid, concepto: 'Consulta', monto: 800, metodo: 'tarjeta', facturado: false })
    expect(p.statusCode).toBe(201)
    expect((await recepcion.patch(`/api/payments/${p.data.id}`, { facturado: true, rfc: 'XAXX010101000' })).data.facturado).toBe(true)
    expect((await recepcion.post('/api/payments', { patientId: pid, concepto: 'x', monto: -5, metodo: 'tarjeta' })).statusCode).toBe(400)
  })

  it('recurso desconocido → 404; JSON inválido → 400', async () => {
    expect((await medico.get('/api/inventario')).statusCode).toBe(404)
    const r = await env.app.inject({ method: 'POST', url: '/api/patients', headers: { cookie: medico.cookie!, 'x-requested-with': 'MediSuite', 'content-type': 'application/json' }, payload: '{malo' })
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body).error).toBeTypeOf('string')
  })

  it('borrado lógico de pacientes (solo admin) y desaparece de listas', async () => {
    const p = await medico.post('/api/patients', samplePatient({ nombre: 'Borrable' }))
    await recepcion.post('/api/payments', { patientId: p.data.id, concepto: 'C', monto: 1, metodo: 'efectivo' })
    expect((await medico.del(`/api/patients/${p.data.id}`)).statusCode).toBe(403)
    expect((await admin.del(`/api/patients/${p.data.id}`)).statusCode).toBe(204)
    expect((await medico.get('/api/patients')).data.find((x: any) => x.id === p.data.id)).toBeUndefined()
    expect((await medico.get(`/api/patients/${p.data.id}`)).statusCode).toBe(404)
    expect((await admin.get(`/api/payments?patientId=${p.data.id}`)).data).toEqual([])
    const row = (await env.pool.query('SELECT deleted_at FROM patients WHERE id = $1', [p.data.id])).rows[0]
    expect(row.deleted_at).not.toBeNull()
  })
})

describe('notas (NOM-004)', () => {
  it('firma fija firmadaEn/firmadoPor; firmada es inmutable; adendas con autor', async () => {
    const e = await medico.post('/api/encounters', { patientId: pid, plantilla: 'SOAP', subjetivo: 'S', objetivo: 'O', analisis: 'A', plan: 'P', diagnosticos: [{ codigo: 'I10', nombre: 'HAS' }], firmada: false, firmadoPor: 'hack', adendas: [{ fecha: '2020-01-01T00:00:00Z', texto: 'falsa' }] })
    expect(e.statusCode).toBe(201)
    expect(e.data.adendas).toEqual([])
    expect(e.data.firmadoPor).toBeUndefined()
    expect((await medico.patch(`/api/encounters/${e.data.id}`, { plan: 'P2' })).data.plan).toBe('P2')

    const s = await medico.patch(`/api/encounters/${e.data.id}`, { firmada: true, firmadaEn: '2000-01-01T00:00:00Z' })
    expect(s.statusCode).toBe(200)
    expect(s.data.firmada).toBe(true)
    expect(s.data.firmadoPor).toBe(medico.userId)
    expect(new Date(s.data.firmadaEn).getFullYear()).toBeGreaterThan(2020)

    const p = await medico.patch(`/api/encounters/${e.data.id}`, { plan: 'cambio' })
    expect(p.statusCode).toBe(409)
    expect(p.data.error).toBe('nota_firmada')
    expect((await medico.patch(`/api/encounters/${e.data.id}`, { firmada: false })).statusCode).toBe(409)
    expect((await medico.del(`/api/encounters/${e.data.id}`)).statusCode).toBe(409)

    const a = await medico.post(`/api/encounters/${e.data.id}/adendas`, { texto: 'Se agrega resultado de laboratorio.' })
    expect(a.statusCode).toBe(200)
    expect(a.data.adendas).toHaveLength(1)
    expect(a.data.adendas[0]).toMatchObject({ texto: 'Se agrega resultado de laboratorio.', autor: 'Usuario medico', fecha: expect.any(String) })
    expect(a.data.plan).toBe('P2')
    expect((await medico.post(`/api/encounters/${e.data.id}/adendas`, { texto: '' })).statusCode).toBe(400)
    const enf = await userClient(env.app, admin, 'enfermeria')
    expect((await enf.post(`/api/encounters/${e.data.id}/adendas`, { texto: 'x' })).statusCode).toBe(403)

    const audit = await admin.get(`/api/audit?patientId=${pid}`)
    const acciones = audit.data.map((x: any) => x.accion)
    expect(acciones).toContain('firmar')
    expect(acciones).toContain('adenda')
  })

  it('nota sin firmar se puede borrar', async () => {
    const e = await medico.post('/api/encounters', { patientId: pid, subjetivo: '', objetivo: '', analisis: '', plan: '', firmada: false })
    expect(e.statusCode).toBe(201)
    expect((await medico.del(`/api/encounters/${e.data.id}`)).statusCode).toBe(204)
  })
})

describe('recetas', () => {
  const item = { medicamento: 'Metformina', presentacion: 'Tabletas 850 mg', dosis: '1 tableta', via: 'Oral', frecuencia: 'Cada 12 horas', duracion: '30 días' }

  it('folio consecutivo, firma del servidor verificable, cancelación', async () => {
    const r1 = await medico.post('/api/prescriptions', { patientId: pid, items: [item], folio: 'RX-999999', firma: 'falsa' })
    expect(r1.statusCode).toBe(201)
    expect(r1.data.folio).toBe('RX-000001')
    expect(r1.data.firma.split('.')).toHaveLength(3)
    expect(r1.data.firma).not.toBe('falsa')
    const r2 = await medico.post('/api/prescriptions', { patientId: pid, items: [item] })
    expect(r2.data.folio).toBe('RX-000002')
    // concurrentes: folios únicos
    const many = await Promise.all([1, 2, 3, 4, 5].map(() => medico.post('/api/prescriptions', { patientId: pid, items: [item] })))
    const folios = many.map((m) => m.data.folio).sort()
    expect(new Set(folios).size).toBe(5)
    expect(folios).toEqual(['RX-000003', 'RX-000004', 'RX-000005', 'RX-000006', 'RX-000007'])

    expect((await medico.post('/api/prescriptions', { patientId: pid, items: [] })).statusCode).toBe(400)

    const h = decodeProtectedHeader(r1.data.firma)
    expect(h.alg).toBe('ES256')
    const jwks = await new Client(env.app).get('/api/public/jwks')
    expect(jwks.data.keys.map((k: any) => k.kid)).toContain(h.kid)

    const v = await new Client(env.app).get('/api/public/verificar?t=' + encodeURIComponent(r1.data.firma))
    expect(v.statusCode).toBe(200)
    expect(v.data.valida).toBe(true)
    expect(v.data.payload).toMatchObject({ folio: 'RX-000001', paciente: 'JPG-1980', medicamentos: ['Metformina Tabletas 850 mg'], cedula: '7654321', medico: 'Usuario medico' })
    expect(v.data.emisor).toEqual({ clinica: 'Clínica A', medico: 'Usuario medico', cedula: '7654321' })

    // Alterada: cambiar el payload invalida la firma.
    const [hh, pp, ss] = r1.data.firma.split('.')
    const payload = JSON.parse(Buffer.from(pp, 'base64url').toString())
    payload.medicamentos = ['Morfina 100 mg']
    const tampered = [hh, Buffer.from(JSON.stringify(payload)).toString('base64url'), ss].join('.')
    expect((await new Client(env.app).get('/api/public/verificar?t=' + tampered)).data).toEqual({ valida: false })
    expect((await new Client(env.app).get('/api/public/verificar?t=basura')).data).toEqual({ valida: false })

    // No se modifica ni se borra.
    const p = await medico.patch(`/api/prescriptions/${r1.data.id}`, { indicaciones: 'x' })
    expect(p.statusCode).toBe(409)
    expect(p.data.error).toBe('receta_emitida')
    expect((await medico.del(`/api/prescriptions/${r1.data.id}`)).statusCode).toBe(409)

    // Cancelación
    expect((await medico.post(`/api/prescriptions/${r1.data.id}/cancelar`, {})).statusCode).toBe(400)
    const c = await medico.post(`/api/prescriptions/${r1.data.id}/cancelar`, { motivo: 'Error en dosis' })
    expect(c.statusCode).toBe(200)
    expect(c.data).toMatchObject({ cancelada: true, motivoCancelacion: 'Error en dosis', folio: 'RX-000001' })
    expect((await medico.post(`/api/prescriptions/${r1.data.id}/cancelar`, { motivo: 'otra vez' })).statusCode).toBe(409)
    const vc = await new Client(env.app).get('/api/public/verificar?t=' + encodeURIComponent(r1.data.firma))
    expect(vc.data.valida).toBe(false)
    expect(vc.data.cancelada).toBe(true)
    // La otra sigue válida.
    expect((await new Client(env.app).get('/api/public/verificar?t=' + encodeURIComponent(r2.data.firma))).data.valida).toBe(true)
  })
})

describe('configuración', () => {
  it('GET sin secretos; doctor = primer médico; PATCH con reglas de fusión', async () => {
    const s = await recepcion.get('/api/settings')
    expect(s.statusCode).toBe(200)
    expect(s.data.llavePrivada).toBeUndefined()
    expect(s.data.anthropicApiKey).toBeUndefined()
    expect(s.data.llavePublica?.d).toBeUndefined()
    expect(s.data.doctor).toMatchObject({ nombre: 'Usuario medico', cedula: '7654321', especialidad: 'Medicina Interna' })
    expect(s.data.clinica).toBe('Clínica A')

    const p = await admin.patch('/api/settings', { clinica: 'Clínica A Norte', servicios: { orthanc: 'https://pacs.local' }, llavePrivada: { d: 'x' }, anthropicApiKey: 'sk-x' })
    expect(p.statusCode).toBe(200)
    expect(p.data.clinica).toBe('Clínica A Norte')
    expect(p.data.servicios).toEqual({ orthanc: 'https://pacs.local' })
    expect(p.data.anthropicApiKey).toBeUndefined()
    const p2 = await admin.patch('/api/settings', { servicios: { whisper: 'https://stt.local' } })
    expect(p2.data.servicios).toEqual({ orthanc: 'https://pacs.local', whisper: 'https://stt.local' })
    const p3 = await admin.patch('/api/settings', { servicios: { orthanc: '' } })
    expect(p3.data.servicios).toEqual({ whisper: 'https://stt.local' })

    // Médico actualiza su propio perfil.
    const m = await medico.patch('/api/settings', { doctor: { direccion: 'Av. Reforma 1', telefono: '55 1234 0000' } })
    expect(m.statusCode).toBe(200)
    expect(m.data.doctor).toMatchObject({ direccion: 'Av. Reforma 1', cedula: '7654321' })
    // Tema = preferencia por usuario.
    expect((await recepcion.patch('/api/settings', { tema: 'oscuro' })).data.tema).toBe('oscuro')
    expect((await medico.get('/api/settings')).data.tema).toBe('claro')
    expect((await recepcion.patch('/api/settings', { doctor: { nombre: 'x' } })).statusCode).toBe(403)
    // Admin con doctorUserId
    const a = await admin.patch('/api/settings', { doctorUserId: medico.userId, doctor: { universidad: 'IPN' } })
    expect(a.data.doctor.universidad).toBe('IPN')
  })
})

describe('usuarios', () => {
  it('salvaguardas: correo único, no desactivarse, no quitar el último admin', async () => {
    const me = (await admin.get('/api/auth/me')).data.user
    expect((await admin.patch(`/api/users/${me.id}`, { activo: false })).statusCode).toBe(409)
    const r = await admin.patch(`/api/users/${me.id}`, { rol: 'medico' })
    expect(r.statusCode).toBe(409)
    expect(r.data.error).toBe('ultimo_admin')
    expect((await admin.post('/api/users', { email: ADMIN.email, nombre: 'Dup', rol: 'medico', password: 'Una-Clave-Larga-1' })).statusCode).toBe(409)
    expect((await admin.post('/api/users', { email: 'nuevo@a.mx', nombre: 'N', rol: 'medico', password: 'corta' })).statusCode).toBe(400)
    expect((await admin.post('/api/users', { email: 'nuevo@a.mx', nombre: 'N', rol: 'jefe', password: 'Una-Clave-Larga-1' })).statusCode).toBe(400)
    const n = await admin.post('/api/users', { email: 'otro-admin@a.mx', nombre: 'Otro Admin', rol: 'admin', password: 'Una-Clave-Larga-1' })
    expect(n.statusCode).toBe(201)
    expect(n.data).toEqual({ id: expect.any(String), email: 'otro-admin@a.mx', nombre: 'Otro Admin', rol: 'admin', activo: true, totp: false })
    // Ahora sí puede degradarse uno.
    expect((await admin.patch(`/api/users/${n.data.id}`, { rol: 'medico', cedula: '111' })).data).toMatchObject({ rol: 'medico', cedula: '111' })
    const list = await admin.get('/api/users')
    expect(list.data.length).toBeGreaterThanOrEqual(4)
    expect(JSON.stringify(list.data)).not.toMatch(/password|scrypt|totp_secret/)
    // Reset de contraseña por admin
    expect((await admin.patch(`/api/users/${n.data.id}`, { password: 'Nueva-Clave-Larga-2' })).statusCode).toBe(200)
    expect((await new Client(env.app).login('otro-admin@a.mx', 'Nueva-Clave-Larga-2')).statusCode).toBe(200)
  })
})

describe('bitácora y exportación', () => {
  it('registra lecturas (ver_expediente) y escrituras; es inmutable', async () => {
    await medico.get(`/api/patients/${pid}`)
    await medico.get(`/api/encounters?patientId=${pid}`)
    const a = await admin.get(`/api/audit?patientId=${pid}&limit=500`)
    expect(a.statusCode).toBe(200)
    const acciones = new Set(a.data.map((x: any) => x.accion))
    for (const ac of ['ver_expediente', 'crear', 'actualizar', 'firmar', 'adenda']) expect(acciones.has(ac), ac).toBe(true)
    const ver = a.data.find((x: any) => x.accion === 'ver_expediente' && x.userId === medico.userId)
    expect(ver).toMatchObject({ id: expect.any(String), fecha: expect.any(String), userNombre: 'Usuario medico', patientId: pid, ip: expect.any(String) })
    const byUser = await admin.get(`/api/audit?userId=${medico.userId}&limit=2`)
    expect(byUser.data).toHaveLength(2)
    expect(byUser.data.every((x: any) => x.userId === medico.userId)).toBe(true)
    const future = await admin.get('/api/audit?desde=2999-01-01')
    expect(future.data).toEqual([])
    const all = await admin.get('/api/audit')
    expect(all.data.some((x: any) => x.accion === 'login')).toBe(true)

    await expect(env.pool.query("UPDATE audit_log SET accion = 'x'")).rejects.toThrow(/solo inserción/)
    await expect(env.pool.query('DELETE FROM audit_log')).rejects.toThrow(/solo inserción/)
    await expect(env.pool.query('TRUNCATE audit_log')).rejects.toThrow(/solo inserción/)
  })

  it('exportación completa (admin) y queda en bitácora', async () => {
    const r = await admin.get('/api/export')
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-disposition']).toMatch(/attachment/)
    for (const col of ['patients', 'appointments', 'encounters', 'observations', 'prescriptions', 'documents', 'payments', 'users']) expect(Array.isArray(r.data[col]), col).toBe(true)
    expect(r.data.patients.find((p: any) => p.id === pid).antecedentes).toBe('HAS desde 2015')
    expect(r.data.prescriptions.length).toBeGreaterThan(0)
    expect(r.data.settings.llavePrivada).toBeUndefined()
    expect(JSON.stringify(r.data)).not.toMatch(/password_hash|scrypt\$|private_enc/)
    const a = await admin.get('/api/audit?limit=5')
    expect(a.data[0].accion).toBe('exportar')
  })
})
