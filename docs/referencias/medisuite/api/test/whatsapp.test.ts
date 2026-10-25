import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runSchedulerOnce, SCHEDULER_LOCK } from '../src/scheduler.js'
import { normalizePhoneMx } from '../src/whatsapp.js'
import { ADMIN, Client, loginAs, mockFetch, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

const APP_SECRET = 'secreto-de-la-app'
const VERIFY = 'token-verificacion'
let env: TestEnv
let admin: Client, recepcion: Client, enfermeria: Client, medico: Client
let n = 0
let failNext = false
const graph = mockFetch((call) => {
  if (failNext) {
    failNext = false
    return { status: 400, json: { error: { message: 'Invalid parameter', code: 131008, error_data: { details: 'Template param missing' } } } }
  }
  const body = JSON.parse(call.body!)
  return { json: { messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: `wamid.TEST${++n}` }] } }
})

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

async function cita(c: Client, patientId: string, h: number, estado = 'agendada') {
  const inicio = inHours(h)
  const r = await c.post('/api/appointments', { patientId, inicio, fin: new Date(new Date(inicio).getTime() + 1800_000).toISOString(), tipo: 'subsecuente', estado })
  expect(r.statusCode).toBe(201)
  return r.data.id as string
}

function webhook(body: unknown, secret = APP_SECRET) {
  const raw = JSON.stringify(body)
  const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
  return env.app.inject({ method: 'POST', url: '/api/webhooks/whatsapp', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, payload: raw })
}

const buttonReply = (from: string, payload: string, contextId?: string) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: '1234567890' },
            messages: [{ from, id: 'wamid.IN' + Math.random(), timestamp: '1760000000', type: 'button', button: { text: 'Confirmar', payload }, ...(contextId ? { context: { from: '5215550000000', id: contextId } } : {}) }],
          },
        },
      ],
    },
  ],
})

const statusUpdate = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '525512345678', ...extra }] } }] }],
})

beforeAll(async () => {
  env = await setupEnv(
    {
      WHATSAPP_TOKEN: 'tok-123',
      WHATSAPP_PHONE_NUMBER_ID: '1234567890',
      WHATSAPP_TEMPLATE: 'recordatorio_cita',
      WHATSAPP_VERIFY_TOKEN: VERIFY,
      WHATSAPP_APP_SECRET: APP_SECRET,
      WHATSAPP_API_BASE: 'https://graph.test/v21.0',
      RECORDATORIO_HORAS: '24,2',
    },
    { fetch: graph },
  )
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  recepcion = await userClient(env.app, admin, 'recepcion')
  enfermeria = await userClient(env.app, admin, 'enfermeria')
  medico = await userClient(env.app, admin, 'medico')
})
afterAll(async () => env.close())

describe('normalización de teléfonos MX', () => {
  it('a E.164 +52', () => {
    expect(normalizePhoneMx('55 1234 5678')).toBe('+525512345678')
    expect(normalizePhoneMx('(55) 1234-5678')).toBe('+525512345678')
    expect(normalizePhoneMx('+52 55 1234 5678')).toBe('+525512345678')
    expect(normalizePhoneMx('+52 1 55 1234 5678')).toBe('+525512345678')
    expect(normalizePhoneMx('5215512345678')).toBe('+525512345678')
    expect(normalizePhoneMx('044 55 1234 5678')).toBe('+525512345678')
    expect(normalizePhoneMx('0052 33 1234 5678')).toBe('+523312345678')
    expect(normalizePhoneMx('12345')).toBeNull()
    expect(normalizePhoneMx('+1 415 555 1234')).toBeNull()
    expect(normalizePhoneMx('')).toBeNull()
    expect(normalizePhoneMx(undefined)).toBeNull()
  })
})

describe('programador de recordatorios', () => {
  it('envía la plantilla una sola vez por cita y anticipación', async () => {
    const pid = (await recepcion.post('/api/patients', samplePatient({ nombre: 'Ana', apellidos: 'López', telefono: '55 1234 5678' }))).data.id
    const sinTel = (await recepcion.post('/api/patients', samplePatient({ nombre: 'Sin', apellidos: 'Teléfono' }))).data.id
    const a24 = await cita(recepcion, pid, 23)
    const a2 = await cita(recepcion, pid, 1.5)
    await cita(recepcion, pid, 30) // fuera de ventana
    await cita(recepcion, pid, 5, 'cancelada')
    await cita(recepcion, sinTel, 3)
    await cita(recepcion, pid, -1) // ya pasó
    graph.calls.length = 0
    expect(await runSchedulerOnce(env.app.ctx)).toBe(2)
    expect(graph.calls).toHaveLength(2)
    const c = graph.calls[0]
    expect(c.method).toBe('POST')
    expect(c.url.href).toBe('https://graph.test/v21.0/1234567890/messages')
    expect(c.headers.authorization).toBe('Bearer tok-123')
    const body = JSON.parse(c.body!)
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '525512345678', type: 'template', template: { name: 'recordatorio_cita', language: { code: 'es_MX' } } })
    const comps = body.template.components
    expect(comps[0].type).toBe('body')
    expect(comps[0].parameters.map((p: any) => p.text)[0]).toBe('Ana López')
    expect(comps[0].parameters[3].text).toBe('Clínica A')
    expect(comps[0].parameters[2].text).toMatch(/^\d{2}:\d{2}$/)
    const payloads = comps.filter((x: any) => x.type === 'button').map((x: any) => [x.sub_type, x.index, x.parameters[0].payload])
    const ids = graph.calls.map((k) => JSON.parse(k.body!).template.components[1].parameters[0].payload.split(':')[1])
    expect(ids.sort()).toEqual([a24, a2].sort())
    expect(payloads[0][0]).toBe('quick_reply')
    expect(payloads.map((p: any) => p[1])).toEqual(['0', '1'])
    expect(payloads[0][2]).toMatch(/^CONFIRMAR:/)
    expect(payloads[1][2]).toMatch(/^REAGENDAR:/)

    // Idempotente
    expect(await runSchedulerOnce(env.app.ctx)).toBe(0)
    expect(graph.calls).toHaveLength(2)
    const ms = await admin.get(`/api/mensajes?appointmentId=${a2}`)
    expect(ms.data).toHaveLength(1)
    expect(ms.data[0]).toMatchObject({ canal: 'whatsapp', tipo: 'recordatorio', horas: 2, estado: 'enviado', destino: '+525512345678', waId: expect.stringMatching(/^wamid\./) })
    expect((await admin.get(`/api/mensajes?appointmentId=${a24}`)).data[0].horas).toBe(24)
    expect(env.app.ctx.scheduler.lastRun).toBeTypeOf('string')
  })

  it('candado consultivo: otra instancia con el candado → se omite la pasada', async () => {
    const c = await env.pool.connect()
    try {
      await c.query('SELECT pg_advisory_lock($1)', [SCHEDULER_LOCK])
      expect(await runSchedulerOnce(env.app.ctx)).toBeNull()
    } finally {
      await c.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK])
      c.release()
    }
    expect(await runSchedulerOnce(env.app.ctx)).toBe(0)
  })

  it('falla del proveedor queda registrada como fallido (sin reintento automático)', async () => {
    const pid = (await recepcion.post('/api/patients', samplePatient({ telefono: '3312345678' }))).data.id
    const a = await cita(recepcion, pid, 10)
    failNext = true
    expect(await runSchedulerOnce(env.app.ctx)).toBe(1)
    const m = (await admin.get(`/api/mensajes?appointmentId=${a}`)).data[0]
    expect(m.estado).toBe('fallido')
    expect(m.error).toContain('Template param missing')
    expect((await admin.get('/api/mensajes?estado=fallido')).data.length).toBeGreaterThanOrEqual(1)
  })
})

describe('webhook', () => {
  it('GET verificación del suscriptor', async () => {
    const ok = await env.app.inject({ method: 'GET', url: `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345` })
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toBe('12345')
    const bad = await env.app.inject({ method: 'GET', url: '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1' })
    expect(bad.statusCode).toBe(403)
  })

  it('POST exige firma válida (sin sesión ni CSRF)', async () => {
    const body = statusUpdate('wamid.nada', 'delivered')
    expect((await webhook(body, 'otro-secreto')).statusCode).toBe(401)
    const sinFirma = await env.app.inject({ method: 'POST', url: '/api/webhooks/whatsapp', headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) })
    expect(sinFirma.statusCode).toBe(401)
    expect(JSON.parse(sinFirma.body).error).toBe('firma_invalida')
    expect((await webhook(body)).statusCode).toBe(200)
  })

  it('CONFIRMAR confirma la cita; REAGENDAR marca la bandera; estados de entrega', async () => {
    const pid = (await recepcion.post('/api/patients', samplePatient({ telefono: '8112345678' }))).data.id
    const a = await cita(recepcion, pid, 20)
    const b = await cita(recepcion, pid, 22, 'confirmada')
    await runSchedulerOnce(env.app.ctx)
    const ma = (await admin.get(`/api/mensajes?appointmentId=${a}`)).data[0]
    const mb = (await admin.get(`/api/mensajes?appointmentId=${b}`)).data[0]

    // Estados (desordenados: read antes que delivered no retrocede)
    expect((await webhook(statusUpdate(ma.waId, 'read'))).statusCode).toBe(200)
    await webhook(statusUpdate(ma.waId, 'delivered'))
    let m = (await admin.get(`/api/mensajes?appointmentId=${a}`)).data[0]
    expect(m.estado).toBe('leido')
    expect(m.entregadoEn).toBeTypeOf('string')
    expect(m.leidoEn).toBeTypeOf('string')

    // Remitente distinto: se ignora
    await webhook(buttonReply('525599999999', `CONFIRMAR:${a}`))
    expect((await recepcion.get(`/api/appointments/${a}`)).data.estado).toBe('agendada')

    // Botón con contexto
    await webhook(buttonReply('528112345678', `CONFIRMAR:${a}`, ma.waId))
    const ca = (await recepcion.get(`/api/appointments/${a}`)).data
    expect(ca.estado).toBe('confirmada')
    expect(ca.confirmacion).toMatchObject({ canal: 'whatsapp' })
    m = (await admin.get(`/api/mensajes?appointmentId=${a}`)).data[0]
    expect(m).toMatchObject({ estado: 'respondido', respuesta: 'CONFIRMAR' })

    // Sin contexto (búsqueda por cita + teléfono)
    await webhook(buttonReply('528112345678', `REAGENDAR:${b}`))
    const cb = (await recepcion.get(`/api/appointments/${b}`)).data
    expect(cb.reagendar).toBe(true)
    expect(cb.estado).toBe('confirmada')
    expect(cb.notas).toContain('reagendar')

    // Fallo de entrega
    const pid2 = (await recepcion.post('/api/patients', samplePatient({ telefono: '9991234567' }))).data.id
    const c = await cita(recepcion, pid2, 21)
    await runSchedulerOnce(env.app.ctx)
    const mc = (await admin.get(`/api/mensajes?appointmentId=${c}`)).data[0]
    await webhook(statusUpdate(mc.waId, 'failed', { errors: [{ code: 131026, title: 'Message undeliverable' }] }))
    expect((await admin.get(`/api/mensajes?appointmentId=${c}`)).data[0]).toMatchObject({ estado: 'fallido', error: '131026 Message undeliverable' })

    const audit = await admin.get('/api/audit?limit=50')
    expect(audit.data.some((x: any) => x.detalle?.operacion === 'confirmar_whatsapp' && x.recursoId === a && x.userNombre === 'WhatsApp (paciente)')).toBe(true)
    void mb
  })
})

describe('endpoints de mensajes', () => {
  it('prueba (admin) y envío inmediato (roles que escriben citas)', async () => {
    expect((await medico.post('/api/mensajes/prueba', { telefono: '5512345678' })).statusCode).toBe(403)
    expect((await admin.post('/api/mensajes/prueba', { telefono: '123' })).data.error).toBe('telefono_invalido')
    const p = await admin.post('/api/mensajes/prueba', { telefono: '55 8765 4321' })
    expect(p.statusCode).toBe(201)
    expect(p.data).toMatchObject({ tipo: 'prueba', canal: 'whatsapp', destino: '+525587654321', estado: 'enviado' })

    const pid = (await recepcion.post('/api/patients', samplePatient({ telefono: '5511112222' }))).data.id
    const a = await cita(recepcion, pid, 72)
    expect((await enfermeria.post(`/api/appointments/${a}/recordatorio`)).statusCode).toBe(403)
    const r = await recepcion.post(`/api/appointments/${a}/recordatorio`)
    expect(r.statusCode).toBe(201)
    expect(r.data).toMatchObject({ tipo: 'manual', appointmentId: a, estado: 'enviado' })
    // Manual no bloquea el automático ni a otro manual
    expect((await recepcion.post(`/api/appointments/${a}/recordatorio`)).statusCode).toBe(201)
    failNext = true
    const f = await recepcion.post(`/api/appointments/${a}/recordatorio`)
    expect(f.statusCode).toBe(502)
    expect(f.data.error).toBe('envio_fallido')
    const sinTel = (await recepcion.post('/api/patients', samplePatient())).data.id
    const a2 = await cita(recepcion, sinTel, 72)
    expect((await recepcion.post(`/api/appointments/${a2}/recordatorio`)).data.error).toBe('sin_contacto')
    expect((await recepcion.post('/api/appointments/no-existe/recordatorio')).statusCode).toBe(404)
    expect((await enfermeria.get('/api/mensajes')).statusCode).toBe(403)
    expect((await recepcion.get(`/api/mensajes?appointmentId=${a}`)).data).toHaveLength(3)
  })
})

describe('sin configuración de WhatsApp', () => {
  it('503 whatsapp_no_configurado y programador inactivo', async () => {
    const e2 = await setupEnv()
    try {
      const adm = await loginAs(e2.app, ADMIN.email, ADMIN.password)
      expect((await adm.post('/api/mensajes/prueba', { telefono: '5512345678' })).data.error).toBe('whatsapp_no_configurado')
      const pid = (await adm.post('/api/patients', samplePatient({ telefono: '5512345678' }))).data.id
      const a = await adm.post('/api/appointments', { patientId: pid, inicio: inHours(5), fin: inHours(6), tipo: 'subsecuente', estado: 'agendada' })
      const r = await adm.post(`/api/appointments/${a.data.id}/recordatorio`)
      expect(r.statusCode).toBe(503)
      expect(r.data.error).toBe('whatsapp_no_configurado')
      expect((await e2.app.inject({ method: 'GET', url: '/api/webhooks/whatsapp?hub.mode=subscribe' })).statusCode).toBe(503)
      expect((await new Client(e2.app).get('/api/health')).data.scheduler.activo).toBe(false)
      expect((await adm.get('/api/mensajes')).data).toEqual([])
    } finally {
      await e2.close()
    }
  })
})
