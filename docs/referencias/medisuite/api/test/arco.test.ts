import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN, Client, loginAs, multipart, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Client, medico: Client, recepcion: Client, enfermeria: Client
let pid: string

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b50000000049454e44ae426082', 'hex')

beforeAll(async () => {
  env = await setupEnv()
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  medico = await userClient(env.app, admin, 'medico', { cedula: '7654321' })
  recepcion = await userClient(env.app, admin, 'recepcion')
  enfermeria = await userClient(env.app, admin, 'enfermeria')
  pid = (await medico.post('/api/patients', samplePatient({ nombre: 'Expediente' }))).data.id
  await medico.post('/api/encounters', { patientId: pid, motivo: 'Control', subjetivo: 's', firmada: true })
  await medico.post('/api/observations', { patientId: pid, codigo: 'fc', valor: 70, unidad: 'lpm', fuente: 'manual' })
  await medico.post('/api/prescriptions', { patientId: pid, items: [{ medicamento: 'Metformina', dosis: '850 mg', via: 'oral', frecuencia: 'c/12h', duracion: '30 días' }] })
  await recepcion.post('/api/payments', { patientId: pid, concepto: 'Consulta', monto: 700, metodo: 'efectivo' })
  await recepcion.post('/api/appointments', { patientId: pid, inicio: '2026-12-01T16:00:00.000Z', fin: '2026-12-01T16:30:00.000Z', tipo: 'subsecuente', estado: 'agendada' })
  const mp = multipart({ meta: JSON.stringify({ patientId: pid, tipo: 'foto', nombre: 'lesion.png' }) }, { name: 'lesion.png', content: PNG })
  expect((await medico.req('POST', '/api/documents', mp.payload, mp.headers)).statusCode).toBe(201)
  // Otro paciente no debe aparecer
  const otro = (await medico.post('/api/patients', samplePatient({ nombre: 'Otro' }))).data.id
  await medico.post('/api/observations', { patientId: otro, codigo: 'fc', valor: 80, unidad: 'lpm', fuente: 'manual' })
})
afterAll(async () => env.close())

describe('expediente (acceso / portabilidad)', () => {
  it('JSON completo de un paciente, auditado como exportar', async () => {
    const r = await medico.get(`/api/patients/${pid}/expediente`)
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="expediente-/)
    const e = r.data
    expect(e).toMatchObject({ formato: 'medisuite-expediente', version: 1, paciente: { id: pid, nombre: 'Expediente', antecedentes: 'HAS desde 2015' } })
    expect(e.encounters).toHaveLength(1)
    expect(e.observations).toHaveLength(1)
    expect(e.prescriptions).toHaveLength(1)
    expect(e.payments).toHaveLength(1)
    expect(e.appointments).toHaveLength(1)
    expect(e.documents).toHaveLength(1)
    expect(e.documents[0]).toMatchObject({ nombre: 'lesion.png', mime: 'image/png', dataUrl: expect.stringMatching(/^\/api\/files\//) })
    expect(e.facturas).toEqual([])
    expect(e.mensajes).toEqual([])
    expect((await admin.get(`/api/patients/${pid}/expediente`)).statusCode).toBe(200)
    expect((await recepcion.get(`/api/patients/${pid}/expediente`)).statusCode).toBe(403)
    expect((await enfermeria.get(`/api/patients/${pid}/expediente`)).statusCode).toBe(403)
    expect((await medico.get('/api/patients/no-existe/expediente')).statusCode).toBe(404)
    const audit = await admin.get(`/api/audit?patientId=${pid}`)
    expect(audit.data.some((a: any) => a.accion === 'exportar' && a.detalle?.tipo === 'expediente')).toBe(true)
  })
})

describe('bloqueo ARCO', () => {
  it('oculto para no-admin, escrituras 409, datos conservados; desbloqueo', async () => {
    const p = (await medico.post('/api/patients', samplePatient({ nombre: 'Bloqueable' }))).data.id
    const obs = (await medico.post('/api/observations', { patientId: p, codigo: 'fc', valor: 60, unidad: 'lpm', fuente: 'manual' })).data.id
    const pay = (await recepcion.post('/api/payments', { patientId: p, concepto: 'C', monto: 1, metodo: 'efectivo' })).data.id

    expect((await medico.post(`/api/patients/${p}/bloqueo`, { motivo: 'x' })).statusCode).toBe(403)
    expect((await admin.post(`/api/patients/${p}/bloqueo`, {})).statusCode).toBe(400)
    const b = await admin.post(`/api/patients/${p}/bloqueo`, { motivo: 'Oposición ARCO, solicitud 2026-10-01' })
    expect(b.statusCode).toBe(200)
    expect(b.data).toMatchObject({ id: p, bloqueado: true, bloqueo: { motivo: 'Oposición ARCO, solicitud 2026-10-01', por: expect.any(String) } })
    expect((await admin.post(`/api/patients/${p}/bloqueo`, { motivo: 'otra vez' })).data.error).toBe('paciente_bloqueado')

    // No-admin: oculto
    expect((await medico.get('/api/patients')).data.find((x: any) => x.id === p)).toBeUndefined()
    expect((await medico.get(`/api/patients/${p}`)).statusCode).toBe(404)
    expect((await medico.get('/api/observations')).data.find((x: any) => x.id === obs)).toBeUndefined()
    expect((await medico.get(`/api/observations/${obs}`)).statusCode).toBe(404)
    expect((await medico.get(`/api/patients/${p}/expediente`)).statusCode).toBe(404)
    // Admin: visible y conservado
    const lista = (await admin.get('/api/patients')).data.find((x: any) => x.id === p)
    expect(lista).toMatchObject({ bloqueado: true, nombre: 'Bloqueable' })
    expect((await admin.get(`/api/patients/${p}/expediente`)).data.observations).toHaveLength(1)
    expect((await admin.get('/api/export')).data.patients.find((x: any) => x.id === p).bloqueado).toBe(true)

    // Escrituras rechazadas (incluso admin)
    const w = await medico.post('/api/observations', { patientId: p, codigo: 'fc', valor: 61, unidad: 'lpm', fuente: 'manual' })
    expect(w.statusCode).toBe(409)
    expect(w.data.error).toBe('paciente_bloqueado')
    expect((await admin.patch(`/api/patients/${p}`, { telefono: '5500000000' })).data.error).toBe('paciente_bloqueado')
    expect((await admin.patch(`/api/payments/${pay}`, { concepto: 'X' })).data.error).toBe('paciente_bloqueado')
    expect((await admin.del(`/api/payments/${pay}`)).data.error).toBe('paciente_bloqueado')
    expect((await admin.del(`/api/patients/${p}`)).data.error).toBe('paciente_bloqueado')
    const mp = multipart({ meta: JSON.stringify({ patientId: p, tipo: 'foto', nombre: 'x.png' }) }, { name: 'x.png', content: PNG })
    expect((await medico.req('POST', '/api/documents', mp.payload, mp.headers)).statusCode).toBe(409)

    // Sincronización: el no-admin recibe el paciente como eliminado
    const desde = new Date(Date.now() - 60_000).toISOString()
    const sync = await medico.get(`/api/patients?desde=${encodeURIComponent(desde)}`)
    expect(sync.data.find((x: any) => x.id === p)).toEqual({ id: p, eliminado: true, actualizadoEn: expect.any(String) })

    // Desbloqueo
    expect((await recepcion.del(`/api/patients/${p}/bloqueo`)).statusCode).toBe(403)
    const d = await admin.del(`/api/patients/${p}/bloqueo`)
    expect(d.statusCode).toBe(200)
    expect(d.data).not.toHaveProperty('bloqueado')
    expect((await medico.get(`/api/patients/${p}`)).statusCode).toBe(200)
    expect((await admin.del(`/api/patients/${p}/bloqueo`)).data.error).toBe('paciente_no_bloqueado')
    const audit = await admin.get(`/api/audit?patientId=${p}`)
    expect(audit.data.filter((a: any) => ['bloquear', 'desbloquear'].includes(a.detalle?.operacion))).toHaveLength(2)
  })

  it('rectificación = PATCH auditado', async () => {
    const r = await medico.patch(`/api/patients/${pid}`, { curp: 'PEGJ800512MDFRMN09' })
    expect(r.statusCode).toBe(200)
    const audit = await admin.get(`/api/audit?patientId=${pid}`)
    expect(audit.data.some((a: any) => a.accion === 'actualizar' && a.detalle?.campos?.includes('curp'))).toBe(true)
  })
})
