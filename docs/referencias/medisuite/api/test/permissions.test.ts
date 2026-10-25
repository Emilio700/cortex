import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN, Client, createOtherOrg, loginAs, PASSWORD, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Client, medico: Client & { userId: string }, recepcion: Client, enfermeria: Client
let patientId: string

beforeAll(async () => {
  env = await setupEnv()
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  medico = await userClient(env.app, admin, 'medico', { cedula: '1234567' })
  recepcion = await userClient(env.app, admin, 'recepcion')
  enfermeria = await userClient(env.app, admin, 'enfermeria')
  patientId = (await medico.post('/api/patients', samplePatient())).data.id
})
afterAll(async () => env.close())

const obs = () => ({ patientId, codigo: 'peso', valor: 70, unidad: 'kg', fuente: 'manual' })
const rx = () => ({ patientId, items: [{ medicamento: 'Paracetamol', dosis: '1 tab', via: 'Oral', frecuencia: 'c/8h', duracion: '3 días' }] })
const enc = () => ({ patientId, plantilla: 'SOAP', subjetivo: 's', objetivo: 'o', analisis: 'a', plan: 'p', diagnosticos: [], firmada: false })

describe('matriz de permisos', () => {
  it('recepción: no lee notas, observaciones ni recetas', async () => {
    for (const col of ['encounters', 'observations', 'prescriptions']) {
      const r = await recepcion.get(`/api/${col}`)
      expect(r.statusCode, col).toBe(403)
      expect(r.data.error).toBe('sin_permiso')
    }
    expect((await recepcion.post('/api/encounters', enc())).statusCode).toBe(403)
  })

  it('recepción: pacientes sin campos clínicos en lectura e ignorados en escritura', async () => {
    const list = await recepcion.get('/api/patients')
    expect(list.statusCode).toBe(200)
    const p = list.data.find((x: any) => x.id === patientId)
    expect(p.nombre).toBe('Juana')
    expect(p.alergias).toEqual(['Penicilina'])
    for (const f of ['antecedentes', 'notas', 'medicamentosActuales']) expect(p[f], f).toBeUndefined()
    const one = await recepcion.get(`/api/patients/${patientId}`)
    expect(one.data.antecedentes).toBeUndefined()

    // Escritura: los campos se ignoran y los existentes se conservan.
    const upd = await recepcion.patch(`/api/patients/${patientId}`, { telefono: '55 1111 2222', antecedentes: 'BORRADO', notas: '' })
    expect(upd.statusCode).toBe(200)
    expect(upd.data.telefono).toBe('55 1111 2222')
    expect(upd.data.antecedentes).toBeUndefined()
    const full = await medico.get(`/api/patients/${patientId}`)
    expect(full.data.antecedentes).toBe('HAS desde 2015')
    expect(full.data.notas).toBe('Nota privada')
    expect(full.data.telefono).toBe('55 1111 2222')

    const created = await recepcion.post('/api/patients', samplePatient({ nombre: 'Rec' }))
    expect(created.statusCode).toBe(201)
    const c2 = await medico.get(`/api/patients/${created.data.id}`)
    expect(c2.data.antecedentes).toBeUndefined()
    expect(c2.data.notas).toBeUndefined()
  })

  it('recepción: pagos y citas sí; no borra pacientes', async () => {
    expect((await recepcion.post('/api/payments', { patientId, concepto: 'Consulta', monto: 800, metodo: 'efectivo', facturado: false })).statusCode).toBe(201)
    expect((await recepcion.post('/api/appointments', { patientId, inicio: '2026-11-01T15:00:00.000Z', fin: '2026-11-01T15:45:00.000Z', tipo: 'subsecuente', estado: 'agendada' })).statusCode).toBe(201)
    expect((await recepcion.del(`/api/patients/${patientId}`)).statusCode).toBe(403)
  })

  it('enfermería: escribe observaciones, no recetas ni notas; lee notas y recetas', async () => {
    const o = await enfermeria.post('/api/observations', obs())
    expect(o.statusCode).toBe(201)
    expect(o.data.autor).toBe('Usuario enfermeria')
    expect((await enfermeria.post('/api/prescriptions', rx())).statusCode).toBe(403)
    expect((await enfermeria.post('/api/encounters', enc())).statusCode).toBe(403)
    expect((await enfermeria.get('/api/prescriptions')).statusCode).toBe(200)
    expect((await enfermeria.get('/api/encounters')).statusCode).toBe(200)
    expect((await enfermeria.post('/api/patients', samplePatient())).statusCode).toBe(403)
    expect((await enfermeria.get('/api/payments')).statusCode).toBe(403)
    expect((await enfermeria.post('/api/appointments', {})).statusCode).toBe(403)
  })

  it('médico: no administra usuarios, bitácora ni exportación; settings solo lectura (salvo su perfil)', async () => {
    expect((await medico.get('/api/users')).statusCode).toBe(403)
    expect((await medico.post('/api/users', { email: 'z@z.mx', nombre: 'Z', rol: 'admin', password: PASSWORD })).statusCode).toBe(403)
    expect((await medico.get('/api/audit')).statusCode).toBe(403)
    expect((await medico.get('/api/export')).statusCode).toBe(403)
    expect((await medico.patch('/api/settings', { clinica: 'Hack' })).statusCode).toBe(403)
    expect((await medico.get('/api/settings')).statusCode).toBe(200)
    expect((await medico.post('/api/payments', { patientId, concepto: 'x', monto: 1, metodo: 'efectivo' })).statusCode).toBe(403)
    expect((await medico.get('/api/payments')).statusCode).toBe(200)
  })

  it('admin: lee notas pero no las escribe; no emite recetas', async () => {
    expect((await admin.get('/api/encounters')).statusCode).toBe(200)
    expect((await admin.post('/api/encounters', enc())).statusCode).toBe(403)
    expect((await admin.post('/api/prescriptions', rx())).statusCode).toBe(403)
    expect((await admin.post('/api/observations', obs())).statusCode).toBe(403)
  })

  it('solo médico firma notas', async () => {
    // (admin no puede escribir notas; enfermería tampoco) — el médico sí
    const e = await medico.post('/api/encounters', enc())
    const s = await medico.patch(`/api/encounters/${e.data.id}`, { firmada: true })
    expect(s.statusCode).toBe(200)
  })
})

describe('aislamiento entre organizaciones', () => {
  it('un usuario de la org B no ve ni modifica datos de la org A', async () => {
    await createOtherOrg(env.pool, 'admin@clinica-b.mx')
    const b = await loginAs(env.app, 'admin@clinica-b.mx', PASSWORD)
    expect((await b.get('/api/patients')).data).toEqual([])
    expect((await b.get(`/api/patients/${patientId}`)).statusCode).toBe(404)
    expect((await b.patch(`/api/patients/${patientId}`, { nombre: 'X' })).statusCode).toBe(404)
    expect((await b.del(`/api/patients/${patientId}`)).statusCode).toBe(404)
    expect((await b.get(`/api/observations?patientId=${patientId}`)).data).toEqual([])
    expect((await b.get('/api/users')).data.map((u: any) => u.email)).toEqual(['admin@clinica-b.mx'])
    expect((await b.patch(`/api/users/${medico.userId}`, { activo: false })).statusCode).toBe(404)
    // No puede crear recursos ligados a un paciente de otra org.
    const r = await b.post('/api/payments', { patientId, concepto: 'x', monto: 1, metodo: 'efectivo' })
    expect(r.statusCode).toBe(400)
    expect(r.data.error).toBe('paciente_no_encontrado')
    // Mismo id de cliente en dos orgs no choca.
    const pa = await b.post('/api/patients', samplePatient({ id: patientId }))
    expect(pa.statusCode).toBe(201)
    expect((await medico.get(`/api/patients/${patientId}`)).data.nombre).toBe('Juana')
    const audit = await b.get('/api/audit')
    expect(audit.data.every((a: any) => a.userId !== medico.userId)).toBe(true)
  })
})
