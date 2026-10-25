import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { receptorProblem } from '../src/facturapi.js'
import { ADMIN, Client, loginAs, mockFetch, samplePatient, setupEnv, userClient, type TestEnv } from './helpers.js'

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
const XML = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0"/>')
let env: TestEnv
let admin: Client, recepcion: Client, medico: Client, enfermeria: Client
let pid: string
let n = 0
let rechazar = false
let pdfFalla = false

const pac = mockFetch((call) => {
  const path = call.url.pathname.replace(/^\/v2/, '')
  if (call.method === 'POST' && path === '/invoices') {
    if (rechazar) return { status: 400, json: { message: 'El RFC del receptor no está en la lista de RFC inscritos no cancelados en el SAT' } }
    const b = JSON.parse(call.body!)
    n++
    return {
      json: { id: `inv_${n}`, uuid: `1A2B3C4D-0000-4000-8000-00000000000${n}`, series: 'A', folio_number: 100 + n, status: 'valid', total: b.items[0].product.price, livemode: false },
    }
  }
  let m = /^\/invoices\/([^/]+)\/(pdf|xml)$/.exec(path)
  if (call.method === 'GET' && m) {
    if (m[2] === 'pdf' && pdfFalla) return { status: 500, json: { message: 'temporal' } }
    return { body: m[2] === 'pdf' ? PDF : XML, type: m[2] === 'pdf' ? 'application/pdf' : 'application/xml' }
  }
  m = /^\/invoices\/([^/]+)$/.exec(path)
  if (call.method === 'DELETE' && m) return { json: { id: m[1], status: 'canceled', cancellation_status: 'accepted' } }
  m = /^\/invoices\/([^/]+)\/email$/.exec(path)
  if (call.method === 'POST' && m) return { json: { ok: true } }
  return { status: 404, json: { message: 'no encontrado' } }
})

const receptor = { rfc: 'PEGJ800512AB1', nombre: 'JUANA PEREZ GOMEZ', regimenFiscal: '605', codigoPostal: '06700', usoCfdi: 'D01', email: 'juana@example.mx' }

async function pago(monto = 850) {
  const r = await recepcion.post('/api/payments', { patientId: pid, concepto: 'Consulta de especialidad', monto, metodo: 'tarjeta' })
  expect(r.statusCode).toBe(201)
  return r.data.id as string
}

beforeAll(async () => {
  env = await setupEnv({ FACTURAPI_KEY: 'sk_test_abc', FACTURAPI_BASE: 'https://pac.test/v2' }, { fetch: pac })
  admin = await loginAs(env.app, ADMIN.email, ADMIN.password)
  recepcion = await userClient(env.app, admin, 'recepcion')
  medico = await userClient(env.app, admin, 'medico')
  enfermeria = await userClient(env.app, admin, 'enfermeria')
  pid = (await medico.post('/api/patients', samplePatient())).data.id
})
afterAll(async () => env.close())

describe('reglas del receptor (CFDI 4.0)', () => {
  it('RFC/régimen/uso coherentes', () => {
    expect(receptorProblem({ rfc: 'PEGJ800512AB1', regimenFiscal: '605', usoCfdi: 'D01' })).toBeNull()
    expect(receptorProblem({ rfc: 'PEGJ800512AB1', regimenFiscal: '601', usoCfdi: 'G03' })).toMatch(/persona física/)
    expect(receptorProblem({ rfc: 'ABC010101AB1', regimenFiscal: '601', usoCfdi: 'G03' })).toBeNull()
    expect(receptorProblem({ rfc: 'ABC010101AB1', regimenFiscal: '612', usoCfdi: 'G03' })).toMatch(/persona moral/)
    expect(receptorProblem({ rfc: 'ABC010101AB1', regimenFiscal: '601', usoCfdi: 'D01' })).toMatch(/personas físicas/)
    expect(receptorProblem({ rfc: 'XAXX010101000', regimenFiscal: '616', usoCfdi: 'S01' })).toBeNull()
    expect(receptorProblem({ rfc: 'XAXX010101000', regimenFiscal: '616', usoCfdi: 'G03' })).toMatch(/S01/)
  })
})

describe('timbrado', () => {
  it('crea la factura, guarda PDF/XML y marca el pago', async () => {
    const paymentId = await pago()
    pac.calls.length = 0
    const r = await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '04' })
    expect(r.statusCode).toBe(201)
    expect(r.data).toMatchObject({
      paymentId,
      patientId: pid,
      pacId: 'inv_1',
      uuid: expect.any(String),
      serie: 'A',
      folio: '101',
      status: 'valid',
      total: 850,
      usoCfdi: 'D01',
      formaPago: '04',
      pdfUrl: `/api/facturas/${r.data.id}/pdf`,
      xmlUrl: `/api/facturas/${r.data.id}/xml`,
    })
    const crear = pac.calls[0]
    expect(crear.url.href).toBe('https://pac.test/v2/invoices')
    expect(crear.headers.authorization).toBe('Bearer sk_test_abc')
    const body = JSON.parse(crear.body!)
    expect(body).toEqual({
      customer: { legal_name: 'JUANA PEREZ GOMEZ', tax_id: 'PEGJ800512AB1', tax_system: '605', email: 'juana@example.mx', address: { zip: '06700' } },
      items: [
        {
          quantity: 1,
          product: {
            description: 'Consulta de especialidad',
            product_key: '85121600',
            unit_key: 'E48',
            price: 850,
            tax_included: false,
            taxability: '02',
            taxes: [{ type: 'IVA', rate: 0, factor: 'Exento', withholding: false }],
          },
        },
      ],
      payment_form: '04',
      payment_method: 'PUE',
      use: 'D01',
      external_id: paymentId,
    })
    expect(pac.calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual(['POST /v2/invoices', 'GET /v2/invoices/inv_1/pdf', 'GET /v2/invoices/inv_1/xml'])

    const p = (await recepcion.get(`/api/payments/${paymentId}`)).data
    expect(p).toMatchObject({ facturado: true, rfc: 'PEGJ800512AB1', facturaId: r.data.id })

    // Archivos: descarga y documentos del paciente tipo factura
    const pdf = await recepcion.get(`/api/facturas/${r.data.id}/pdf`)
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.headers['content-disposition']).toMatch(/^attachment; filename="Factura A-101.pdf"/)
    expect(pdf.rawPayload.equals(PDF)).toBe(true)
    const xml = await medico.get(`/api/facturas/${r.data.id}/xml`)
    expect(xml.headers['content-type']).toBe('application/xml; charset=utf-8')
    const docs = (await recepcion.get(`/api/documents?patientId=${pid}`)).data
    expect(docs.filter((d: any) => d.tipo === 'factura').map((d: any) => d.mime).sort()).toEqual(['application/pdf', 'application/xml'])
    expect(pac.calls).toHaveLength(3) // sin volver a descargar

    // Doble facturación
    expect((await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '04' })).data.error).toBe('ya_facturado')
    const lista = await recepcion.get(`/api/facturas?paymentId=${paymentId}`)
    expect(lista.data).toHaveLength(1)
    expect((await medico.get('/api/facturas')).statusCode).toBe(200)
    expect((await enfermeria.get('/api/facturas')).statusCode).toBe(403)
    expect((await medico.post('/api/facturas', { paymentId, receptor, formaPago: '04' })).statusCode).toBe(403)
  })

  it('validación local: RFC, régimen, uso, motivo', async () => {
    const paymentId = await pago()
    const bad = await recepcion.post('/api/facturas', { paymentId, receptor: { ...receptor, rfc: 'NOESRFC' }, formaPago: '04' })
    expect(bad.statusCode).toBe(400)
    expect(bad.data.error).toBe('validacion')
    expect((await recepcion.post('/api/facturas', { paymentId, receptor: { ...receptor, regimenFiscal: '601' }, formaPago: '04' })).data.error).toBe('receptor_invalido')
    expect((await recepcion.post('/api/facturas', { paymentId, receptor: { ...receptor, usoCfdi: 'Z99' }, formaPago: '04' })).statusCode).toBe(400)
    expect((await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '77' })).statusCode).toBe(400)
    expect((await recepcion.post('/api/facturas', { paymentId: 'no-existe', receptor, formaPago: '04' })).statusCode).toBe(404)
    // RFC en minúsculas se normaliza
    const ok = await recepcion.post('/api/facturas', { paymentId, receptor: { ...receptor, rfc: 'pegj800512ab1' }, formaPago: '28', claveProdServ: '85121800', descripcion: 'Estudio' })
    expect(ok.statusCode).toBe(201)
    expect(ok.data.receptor.rfc).toBe('PEGJ800512AB1')
  })

  it('rechazo del PAC → 422 y factura en error; el pago se puede reintentar', async () => {
    const paymentId = await pago(500)
    rechazar = true
    const r = await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '01' })
    rechazar = false
    expect(r.statusCode).toBe(422)
    expect(r.data.error).toBe('pac_rechazo')
    expect(r.data.message).toContain('RFC del receptor')
    const err = (await recepcion.get(`/api/facturas?paymentId=${paymentId}`)).data[0]
    expect(err).toMatchObject({ status: 'error', error: expect.stringContaining('RFC') })
    expect((await recepcion.get(`/api/payments/${paymentId}`)).data.facturado).toBe(false)
    expect((await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '01' })).statusCode).toBe(201)
  })

  it('si falla la descarga del PDF se obtiene al pedirlo', async () => {
    const paymentId = await pago(300)
    pdfFalla = true
    const r = await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '03' })
    pdfFalla = false
    expect(r.statusCode).toBe(201)
    const pdf = await recepcion.get(`/api/facturas/${r.data.id}/pdf`)
    expect(pdf.statusCode).toBe(200)
    expect(pdf.rawPayload.equals(PDF)).toBe(true)
  })

  it('cancelación (motivos SAT) y reenvío por correo', async () => {
    const paymentId = await pago(1000)
    const f = (await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '04' })).data
    expect((await recepcion.post(`/api/facturas/${f.id}/cancelar`, { motivo: '05' })).statusCode).toBe(400)
    const sinSust = await recepcion.post(`/api/facturas/${f.id}/cancelar`, { motivo: '01' })
    expect(sinSust.statusCode).toBe(400)
    expect(sinSust.data.detalles[0].campo).toBe('sustitucion')

    pac.calls.length = 0
    expect((await recepcion.post(`/api/facturas/${f.id}/enviar`, { email: 'otro@example.mx' })).statusCode).toBe(204)
    expect(pac.calls[0].url.pathname).toBe(`/v2/invoices/${f.pacId}/email`)
    expect(JSON.parse(pac.calls[0].body!)).toEqual({ email: 'otro@example.mx' })

    const c = await recepcion.post(`/api/facturas/${f.id}/cancelar`, { motivo: '02' })
    expect(c.statusCode).toBe(200)
    expect(c.data).toMatchObject({ status: 'canceled', cancellationStatus: 'accepted', cancelacion: { motivo: '02' } })
    const del = pac.calls.find((x) => x.method === 'DELETE')!
    expect(del.url.pathname).toBe(`/v2/invoices/${f.pacId}`)
    expect(del.url.searchParams.get('motive')).toBe('02')
    expect(del.url.searchParams.has('substitution')).toBe(false)
    const p = (await recepcion.get(`/api/payments/${paymentId}`)).data
    expect(p.facturado).toBe(false)
    expect(p.facturaId).toBeUndefined()
    expect((await recepcion.post(`/api/facturas/${f.id}/cancelar`, { motivo: '02' })).data.error).toBe('factura_no_vigente')
    // Se puede volver a facturar (sustitución)
    const f2 = await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '04' })
    expect(f2.statusCode).toBe(201)
    const audit = await admin.get('/api/audit?limit=50')
    expect(audit.data.some((a: any) => a.recurso === 'facturas' && a.detalle?.operacion === 'cancelar')).toBe(true)
  })

  it('sin FACTURAPI_KEY → 503 pac_no_configurado', async () => {
    const e2 = await setupEnv()
    try {
      const adm = await loginAs(e2.app, ADMIN.email, ADMIN.password)
      const r = await adm.post('/api/facturas', { paymentId: 'x', receptor, formaPago: '04' })
      expect(r.statusCode).toBe(503)
      expect(r.data.error).toBe('pac_no_configurado')
      expect((await adm.get('/api/facturas')).data).toEqual([])
      expect((await new Client(e2.app).get('/api/health')).data.servicios.pac).toBe(false)
    } finally {
      await e2.close()
    }
  })
})

describe('integridad de pagos facturados (revisión de seguridad)', () => {
  it('el cliente no fija facturaId ni des-factura, cambia el monto o borra un pago con CFDI vigente', async () => {
    // facturaId lo fija solo el servidor
    const falso = await recepcion.post('/api/payments', { patientId: pid, concepto: 'Consulta', monto: 500, metodo: 'efectivo', facturaId: 'inventada' })
    expect(falso.statusCode).toBe(201)
    expect(falso.data.facturaId).toBeUndefined()
    expect((await recepcion.patch(`/api/payments/${falso.data.id}`, { facturaId: 'inventada' })).data.facturaId).toBeUndefined()
    // Sin CFDI, marcar como facturado a mano sigue permitido (factura emitida fuera del sistema)
    expect((await recepcion.patch(`/api/payments/${falso.data.id}`, { facturado: true, rfc: 'PEGJ800512AB1' })).data.facturado).toBe(true)

    const paymentId = await pago(1200)
    const f = (await recepcion.post('/api/facturas', { paymentId, receptor, formaPago: '04' })).data
    const monto = await recepcion.patch(`/api/payments/${paymentId}`, { monto: 1 })
    expect(monto.statusCode).toBe(409)
    expect(monto.data.error).toBe('pago_facturado')
    const desfactura = await recepcion.patch(`/api/payments/${paymentId}`, { facturado: false, facturaId: null, concepto: 'Consulta (corregida)' })
    expect(desfactura.statusCode).toBe(200)
    expect(desfactura.data).toMatchObject({ facturado: true, facturaId: f.id, concepto: 'Consulta (corregida)', monto: 1200 })
    expect((await recepcion.del(`/api/payments/${paymentId}`)).data.error).toBe('pago_facturado')
    // Tras cancelar la factura, el pago vuelve a ser editable
    expect((await recepcion.post(`/api/facturas/${f.id}/cancelar`, { motivo: '02' })).statusCode).toBe(200)
    expect((await recepcion.patch(`/api/payments/${paymentId}`, { monto: 1100 })).statusCode).toBe(200)
  })

  it('facturas de un paciente bloqueado (ARCO): ocultas para no admin y sin escrituras', async () => {
    const p2 = (await medico.post('/api/patients', samplePatient({ nombre: 'Bloqueable' }))).data.id
    const r = await recepcion.post('/api/payments', { patientId: p2, concepto: 'Consulta', monto: 700, metodo: 'tarjeta' })
    const f = (await recepcion.post('/api/facturas', { paymentId: r.data.id, receptor, formaPago: '04' })).data
    expect((await admin.post(`/api/patients/${p2}/bloqueo`, { motivo: 'Oposición del titular' })).statusCode).toBe(200)
    expect((await recepcion.get(`/api/facturas/${f.id}`)).statusCode).toBe(404)
    expect((await recepcion.post(`/api/facturas/${f.id}/enviar`, {})).statusCode).toBe(404)
    expect((await recepcion.post(`/api/facturas/${f.id}/cancelar`, { motivo: '02' })).statusCode).toBe(404)
    expect((await admin.get(`/api/facturas/${f.id}`)).statusCode).toBe(200)
    expect((await admin.post(`/api/facturas/${f.id}/enviar`, {})).data.error).toBe('paciente_bloqueado')
    expect((await admin.post(`/api/patients/${p2}/bloqueo`, {})).statusCode).toBe(400)
    await admin.del(`/api/patients/${p2}/bloqueo`)
    // El reenvío deja en la bitácora el destino
    expect((await recepcion.post(`/api/facturas/${f.id}/enviar`, { email: 'contabilidad@example.mx' })).statusCode).toBe(204)
    const audit = await admin.get('/api/audit?limit=20')
    expect(audit.data.some((a: any) => a.recursoId === f.id && a.detalle?.operacion === 'enviar_correo' && a.detalle?.destino === 'contabilidad@example.mx')).toBe(true)
  })
})
