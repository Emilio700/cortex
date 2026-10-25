import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REGISTROS_PERMISOS } from '../src/permissions.js'
import { ADMIN, Client, createOtherOrg, loginAs, PASSWORD, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Client, medico: Client, recepcion: Client, enfermeria: Client
let pid: string
const ROLES = ['admin', 'medico', 'enfermeria', 'recepcion'] as const
const cli = () => ({ admin, medico, enfermeria, recepcion })

beforeAll(async () => {
  env = await setupEnv()
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  medico = await userClient(env.app, admin, 'medico', { cedula: '7654321' })
  recepcion = await userClient(env.app, admin, 'recepcion')
  enfermeria = await userClient(env.app, admin, 'enfermeria')
  pid = (await medico.post('/api/patients', samplePatient({ nombre: 'Registros' }))).data.id
})
afterAll(async () => env.close())

describe('registros: CRUD y validación', () => {
  it('crea, lee, actualiza y borra (lógico) con auditoría por tipo', async () => {
    const c = await medico.post('/api/registros', { patientId: pid, tipo: 'prenatal', titulo: 'Control prenatal 22 SDG', estado: 'abierto', datos: { sdg: 22, fu: 20 } })
    expect(c.statusCode).toBe(201)
    expect(c.data).toMatchObject({ id: expect.any(String), patientId: pid, tipo: 'prenatal', titulo: 'Control prenatal 22 SDG', datos: { sdg: 22, fu: 20 }, fecha: expect.any(String) })
    const id = c.data.id
    expect((await medico.get(`/api/registros/${id}`)).data.datos.sdg).toBe(22)
    const u = await enfermeria.patch(`/api/registros/${id}`, { datos: { sdg: 22, fu: 21 }, estado: 'cerrado' })
    expect(u.statusCode).toBe(200)
    expect(u.data).toMatchObject({ estado: 'cerrado', datos: { fu: 21 }, tipo: 'prenatal' })
    // tipo inmutable
    expect((await medico.patch(`/api/registros/${id}`, { tipo: 'vacuna' })).data.error).toBe('tipo_inmutable')
    expect((await medico.patch(`/api/registros/${id}`, { tipo: 'prenatal', titulo: 'ok' })).statusCode).toBe(200)
    // filtros
    await medico.post('/api/registros', { patientId: pid, tipo: 'vacuna', titulo: 'BCG', datos: {} })
    const porTipo = await medico.get('/api/registros?tipo=vacuna')
    expect(porTipo.data.every((r: any) => r.tipo === 'vacuna')).toBe(true)
    expect(porTipo.data.length).toBeGreaterThan(0)
    const porPaciente = await medico.get(`/api/registros?patientId=${pid}&tipo=prenatal`)
    expect(porPaciente.data.map((r: any) => r.id)).toEqual([id])
    // borrar
    expect((await medico.del(`/api/registros/${id}`)).statusCode).toBe(204)
    expect((await medico.get(`/api/registros/${id}`)).statusCode).toBe(404)
    const audit = (await admin.get(`/api/audit?patientId=${pid}`)).data
    expect(audit.some((a: any) => a.recurso === 'registros' && a.accion === 'crear' && a.detalle?.tipo === 'prenatal')).toBe(true)
    expect(audit.some((a: any) => a.recurso === 'registros' && a.accion === 'actualizar' && a.detalle?.tipo === 'prenatal' && a.detalle?.estado === 'cerrado')).toBe(true)
    expect(audit.some((a: any) => a.recurso === 'registros' && a.accion === 'borrar' && a.detalle?.tipo === 'prenatal')).toBe(true)
    expect(audit.some((a: any) => a.recurso === 'registros' && a.accion === 'ver_expediente' && a.detalle?.tipo === 'prenatal')).toBe(true)
  })

  it('valida tipo (formato y lista blanca), datos y paciente', async () => {
    const r1 = await medico.post('/api/registros', { tipo: 'desconocido', datos: {} })
    expect(r1.statusCode).toBe(400)
    expect(r1.data.error).toBe('tipo_no_permitido')
    expect((await medico.post('/api/registros', { tipo: 'Mal Tipo', datos: {} })).data.error).toBe('validacion')
    expect((await medico.post('/api/registros', { tipo: 'tarea' })).statusCode).toBe(400) // datos obligatorio
    expect((await medico.post('/api/registros', { tipo: 'tarea', datos: [] })).statusCode).toBe(400)
    expect((await medico.post('/api/registros', { tipo: 'tarea', datos: {}, titulo: 'x'.repeat(201) })).statusCode).toBe(400)
    expect((await medico.post('/api/registros', { tipo: 'tarea', datos: {}, estado: 'x'.repeat(41) })).statusCode).toBe(400)
    expect((await medico.post('/api/registros', { tipo: 'tarea', datos: { s: 'x'.repeat(260 * 1024) } })).statusCode).toBe(400)
    expect((await medico.get('/api/registros?tipo=desconocido')).data.error).toBe('tipo_no_permitido')
    const np = await medico.post('/api/registros', { patientId: 'no-existe', tipo: 'vacuna', datos: {} })
    expect(np.data.error).toBe('paciente_no_encontrado')
  })

  it('patientId opcional (inventario, tareas) y paginación/sincronización', async () => {
    const inv = await enfermeria.post('/api/registros', { tipo: 'inventario', titulo: 'Paracetamol 500 mg', datos: { minimo: 10 } })
    expect(inv.statusCode).toBe(201)
    expect(inv.data).not.toHaveProperty('patientId')
    expect((await recepcion.get(`/api/registros/${inv.data.id}`)).statusCode).toBe(200)
    expect((await recepcion.patch(`/api/registros/${inv.data.id}`, { titulo: 'x' })).statusCode).toBe(403)
    expect((await admin.patch(`/api/registros/${inv.data.id}`, { titulo: 'Paracetamol 500 mg tabletas' })).statusCode).toBe(200)
    // Quitar y poner paciente
    const t = await recepcion.post('/api/registros', { tipo: 'tarea', titulo: 'Llamar a laboratorio', estado: 'abierta', datos: {} })
    expect((await recepcion.patch(`/api/registros/${t.data.id}`, { patientId: pid })).data.patientId).toBe(pid)
    const sinP = await recepcion.patch(`/api/registros/${t.data.id}`, { patientId: null })
    expect(sinP.statusCode).toBe(200)
    expect(sinP.data).not.toHaveProperty('patientId')
    for (let i = 0; i < 3; i++) await medico.post('/api/registros', { tipo: 'tarea', titulo: `T${i}`, datos: {} })
    const p1 = await medico.get('/api/registros?tipo=tarea&limit=2')
    expect(p1.data).toHaveLength(2)
    const p2 = await medico.get(`/api/registros?tipo=tarea&limit=2&cursor=${p1.headers['x-next-cursor']}`)
    expect(p2.data.length).toBeGreaterThan(0)
    expect(p2.data.some((r: any) => p1.data.some((x: any) => x.id === r.id))).toBe(false)
    const desde = new Date(Date.now() - 60_000).toISOString()
    const s = await recepcion.get(`/api/registros?desde=${encodeURIComponent(desde)}`)
    expect(s.headers['x-sync-desde']).toBeTruthy()
    expect(s.data.some((r: any) => r.id === inv.data.id)).toBe(true)
  })
})

describe('registros: matriz de permisos por tipo', () => {
  it('cada rol lee/escribe solo los tipos permitidos', async () => {
    // Un registro de cada tipo creado por un rol que puede escribirlo.
    const ids: Record<string, string> = {}
    for (const [tipo, p] of Object.entries(REGISTROS_PERMISOS)) {
      const writer = cli()[p.write[0]]
      const r = await writer.post('/api/registros', { patientId: tipo === 'inventario' ? undefined : pid, tipo, titulo: tipo, datos: { n: 1 } })
      expect(r.statusCode, `${p.write[0]} crea ${tipo}`).toBe(201)
      ids[tipo] = r.data.id
    }
    for (const rol of ROLES) {
      const c = cli()[rol]
      const lista: any[] = (await c.get('/api/registros')).data
      for (const [tipo, p] of Object.entries(REGISTROS_PERMISOS)) {
        const puedeLeer = p.read.includes(rol)
        const puedeEscribir = p.write.includes(rol)
        expect(lista.some((r) => r.id === ids[tipo]), `${rol} lista ${tipo}`).toBe(puedeLeer)
        expect(lista.some((r) => r.tipo === tipo && !p.read.includes(rol)), `${rol} no ve ${tipo}`).toBe(false)
        expect((await c.get(`/api/registros/${ids[tipo]}`)).statusCode, `${rol} GET ${tipo}`).toBe(puedeLeer ? 200 : 403)
        expect((await c.get(`/api/registros?tipo=${tipo}`)).statusCode, `${rol} ?tipo=${tipo}`).toBe(puedeLeer ? 200 : 403)
        const cr = await c.post('/api/registros', { patientId: pid, tipo, datos: {} })
        expect(cr.statusCode, `${rol} crea ${tipo}`).toBe(puedeEscribir ? 201 : 403)
        if (tipo !== 'movimiento-inventario') {
          const pa = await c.patch(`/api/registros/${ids[tipo]}`, { titulo: `${tipo} ${rol}` })
          expect(pa.statusCode, `${rol} modifica ${tipo}`).toBe(puedeEscribir ? 200 : 403)
        }
        if (puedeEscribir && cr.statusCode === 201 && tipo !== 'movimiento-inventario') expect((await c.del(`/api/registros/${cr.data.id}`)).statusCode).toBe(204)
      }
    }
  })

  it('recepción no lee registros clínicos ni en la sincronización ni en el expediente', async () => {
    const clin = await medico.post('/api/registros', { patientId: pid, tipo: 'triaje', titulo: 'Triaje rojo', datos: { prioridad: 'rojo' } })
    const lista = (await recepcion.get(`/api/registros?patientId=${pid}`)).data
    expect(lista.find((r: any) => r.id === clin.data.id)).toBeUndefined()
    expect(lista.every((r: any) => ['inventario', 'movimiento-inventario', 'tarea', 'encuesta'].includes(r.tipo))).toBe(true)
    const desde = new Date(Date.now() - 60_000).toISOString()
    expect((await recepcion.get(`/api/registros?desde=${encodeURIComponent(desde)}`)).data.find((r: any) => r.id === clin.data.id)).toBeUndefined()
    expect((await recepcion.del(`/api/registros/${clin.data.id}`)).statusCode).toBe(403)
    // enfermería no ve encuestas
    const enc = await recepcion.post('/api/registros', { patientId: pid, tipo: 'encuesta', titulo: 'Satisfacción', datos: { nps: 9 } })
    expect(enc.statusCode).toBe(201)
    expect((await enfermeria.get('/api/registros')).data.find((r: any) => r.id === enc.data.id)).toBeUndefined()
  })
})

describe('registros: reglas de negocio', () => {
  it('certificado/referencia emitidos: inmutables salvo cancelación por médico', async () => {
    const borrador = await medico.post('/api/registros', { patientId: pid, tipo: 'certificado', estado: 'borrador', titulo: 'Certificado médico', datos: { texto: 'a' } })
    expect((await medico.patch(`/api/registros/${borrador.data.id}`, { datos: { texto: 'b' } })).statusCode).toBe(200)
    const emit = await medico.patch(`/api/registros/${borrador.data.id}`, { estado: 'emitido' })
    expect(emit.statusCode).toBe(200)
    const id = emit.data.id
    const r1 = await medico.patch(`/api/registros/${id}`, { datos: { texto: 'c' } })
    expect(r1.statusCode).toBe(409)
    expect(r1.data.error).toBe('documento_emitido')
    expect((await medico.patch(`/api/registros/${id}`, { estado: 'borrador' })).data.error).toBe('documento_emitido')
    expect((await medico.del(`/api/registros/${id}`)).data.error).toBe('documento_emitido')
    expect((await enfermeria.patch(`/api/registros/${id}`, { estado: 'cancelado', datos: { motivoCancelacion: 'x' } })).statusCode).toBe(403)
    expect((await admin.patch(`/api/registros/${id}`, { estado: 'cancelado', datos: { motivoCancelacion: 'x' } })).statusCode).toBe(403)
    expect((await medico.patch(`/api/registros/${id}`, { estado: 'cancelado', datos: {} })).statusCode).toBe(400)
    expect((await medico.patch(`/api/registros/${id}`, { estado: 'cancelado', titulo: 'otro', datos: { motivoCancelacion: 'x' } })).data.error).toBe('documento_emitido')
    const c = await medico.patch(`/api/registros/${id}`, { estado: 'cancelado', datos: { motivoCancelacion: 'Error en fecha' } })
    expect(c.statusCode).toBe(200)
    expect(c.data).toMatchObject({ estado: 'cancelado', titulo: 'Certificado médico', datos: { texto: 'b', motivoCancelacion: 'Error en fecha', canceladoEn: expect.any(String), canceladoPor: expect.any(String) } })
    expect((await medico.patch(`/api/registros/${id}`, { estado: 'emitido' })).data.error).toBe('documento_emitido')
    expect((await medico.del(`/api/registros/${id}`)).data.error).toBe('documento_emitido')
    // Una referencia creada directamente como emitida
    const ref = await medico.post('/api/registros', { patientId: pid, tipo: 'referencia', estado: 'emitido', titulo: 'Referencia a cardiología', datos: {} })
    expect((await medico.patch(`/api/registros/${ref.data.id}`, { titulo: 'x' })).data.error).toBe('documento_emitido')
  })

  it('movimientos de inventario: solo se agregan', async () => {
    const m = await enfermeria.post('/api/registros', { tipo: 'movimiento-inventario', titulo: 'Entrada', datos: { itemId: 'x', cantidad: 10 } })
    expect(m.statusCode).toBe(201)
    const p = await enfermeria.patch(`/api/registros/${m.data.id}`, { datos: { cantidad: 100 } })
    expect(p.statusCode).toBe(409)
    expect(p.data.error).toBe('movimiento_inmutable')
    expect((await admin.del(`/api/registros/${m.data.id}`)).data.error).toBe('movimiento_inmutable')
    expect((await recepcion.post('/api/registros', { tipo: 'movimiento-inventario', datos: {} })).statusCode).toBe(403)
  })

  it('bloqueo ARCO: oculto y sin escrituras; expediente y respaldo incluyen registros', async () => {
    const p = (await medico.post('/api/patients', samplePatient({ nombre: 'Bloq' }))).data.id
    const r = await medico.post('/api/registros', { patientId: p, tipo: 'vacuna', titulo: 'SRP', datos: { dosis: 1 } })
    const tarea = await recepcion.post('/api/registros', { patientId: p, tipo: 'tarea', titulo: 'Llamar', datos: {} })
    const exp = await medico.get(`/api/patients/${p}/expediente`)
    expect(exp.data.registros.map((x: any) => x.id).sort()).toEqual([r.data.id, tarea.data.id].sort())
    expect((await admin.post(`/api/patients/${p}/bloqueo`, { motivo: 'ARCO' })).statusCode).toBe(200)
    expect((await medico.get(`/api/registros/${r.data.id}`)).statusCode).toBe(404)
    expect((await medico.get('/api/registros')).data.find((x: any) => x.id === r.data.id)).toBeUndefined()
    expect((await medico.post('/api/registros', { patientId: p, tipo: 'vacuna', datos: {} })).data.error).toBe('paciente_bloqueado')
    expect((await admin.patch(`/api/registros/${tarea.data.id}`, { titulo: 'x' })).data.error).toBe('paciente_bloqueado')
    expect((await admin.del(`/api/registros/${tarea.data.id}`)).data.error).toBe('paciente_bloqueado')
    // mover un registro a un paciente bloqueado
    const libre = await recepcion.post('/api/registros', { tipo: 'tarea', titulo: 'Sin paciente', datos: {} })
    expect((await recepcion.patch(`/api/registros/${libre.data.id}`, { patientId: p })).data.error).toBe('paciente_bloqueado')
    const desde = new Date(Date.now() - 60_000).toISOString()
    expect((await medico.get(`/api/registros?desde=${encodeURIComponent(desde)}`)).data.find((x: any) => x.id === r.data.id)).toEqual({ id: r.data.id, eliminado: true, actualizadoEn: expect.any(String) })
    expect((await admin.get(`/api/registros/${r.data.id}`)).statusCode).toBe(200)
    const exp2 = await admin.get(`/api/patients/${p}/expediente`)
    expect(exp2.data.registros).toHaveLength(2)
    const resp = await admin.get('/api/export')
    expect(resp.statusCode).toBe(200)
    expect(Array.isArray(resp.data.registros)).toBe(true)
    expect(resp.data.registros.some((x: any) => x.id === r.data.id)).toBe(true)
    expect(resp.data.registros.some((x: any) => !x.patientId)).toBe(true)
  })

  it('aislamiento entre organizaciones', async () => {
    const mine = await medico.post('/api/registros', { tipo: 'tarea', titulo: 'Privada A', datos: {} })
    const mineInv = await enfermeria.post('/api/registros', { tipo: 'inventario', titulo: 'Gasas', datos: {} })
    await createOtherOrg(env.pool, 'admin-reg@clinica-b.mx')
    const b = await loginAs(env.app, 'admin-reg@clinica-b.mx', PASSWORD)
    expect((await b.get('/api/registros')).data).toEqual([])
    expect((await b.get(`/api/registros/${mine.data.id}`)).statusCode).toBe(404)
    expect((await b.patch(`/api/registros/${mineInv.data.id}`, { titulo: 'x' })).statusCode).toBe(404)
    expect((await b.del(`/api/registros/${mineInv.data.id}`)).statusCode).toBe(404)
    expect((await b.post('/api/registros', { patientId: pid, tipo: 'tarea', datos: {} })).data.error).toBe('paciente_no_encontrado')
    // mismo id en otra org es independiente
    const dup = await b.post('/api/registros', { id: mine.data.id, tipo: 'tarea', titulo: 'B', datos: {} })
    expect(dup.statusCode).toBe(201)
    expect((await medico.get(`/api/registros/${mine.data.id}`)).data.titulo).toBe('Privada A')
  })
})
