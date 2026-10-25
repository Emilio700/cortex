import { describe, expect, it } from 'vitest'
import { bootstrap } from '../src/bootstrap.js'
import { ConfigError, loadConfig } from '../src/config.js'
import { seedDB } from '../src/demo/seed.gen.js'
import { registroTipoAllowed } from '../src/permissions.js'
import { Client, loginAs, setupEnv } from './helpers.js'

describe('configuración de producción', () => {
  it('sin MASTER_KEY en producción no arranca', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })).toThrow(ConfigError)
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', MASTER_KEY: 'corta' })).toThrow(/32 bytes/)
    const c = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', MASTER_KEY: Buffer.alloc(32, 7).toString('base64') })
    expect(c.cookieSecure).toBe(true)
    expect(loadConfig({ DATABASE_URL: 'postgres://x' }).cookieSecure).toBe(false)
  })

  it('rechaza ADMIN_PASSWORD débil o ausente en producción', async () => {
    const env = await setupEnv()
    try {
      await env.pool.query('TRUNCATE users, sessions CASCADE') // simula BD vacía de usuarios
      const base = { NODE_ENV: 'production', DATABASE_URL: env.cfg.databaseUrl, MASTER_KEY: Buffer.alloc(32, 1).toString('base64') }
      const log = { info: () => {}, warn: () => {} }
      await expect(bootstrap(env.pool, loadConfig(base), log)).rejects.toThrow(/ADMIN_EMAIL/)
      await expect(bootstrap(env.pool, loadConfig({ ...base, ADMIN_EMAIL: 'a@b.mx', ADMIN_PASSWORD: '123' }), log)).rejects.toThrow(/no es segura/)
    } finally {
      await env.close()
    }
  })
})

describe('SEED_DEMO', () => {
  it('carga datos sintéticos y usuarios demo; la receta demo verifica', async () => {
    const env = await setupEnv({ SEED_DEMO: 'true', ADMIN_EMAIL: '', ADMIN_PASSWORD: '' })
    try {
      const pw = 'MediSuite2026!'
      for (const email of ['admin@demo.mx', 'medico@demo.mx', 'recepcion@demo.mx', 'enfermeria@demo.mx']) await loginAs(env.app, email, pw)
      const med = await loginAs(env.app, 'medico@demo.mx', pw)
      const patients = await med.get('/api/patients')
      expect(patients.data).toHaveLength(8)
      expect((await med.get('/api/observations')).data.length).toBeGreaterThan(100)
      const enc = (await med.get('/api/encounters')).data
      expect(enc.every((e: any) => e.firmada && e.firmadoPor)).toBe(true)
      const rxs = (await med.get('/api/prescriptions')).data
      expect(rxs.map((r: any) => r.id).sort()).toEqual(['rx1', 'rx2'])
      expect(rxs.find((r: any) => r.id === 'rx2')).toMatchObject({ patientId: 'p2', folio: 'RX-000102', firma: expect.any(String) })
      const rx = rxs.find((r: any) => r.id === 'rx1')
      expect(rx.folio).toBe('RX-000101')
      const v = await new Client(env.app).get('/api/public/verificar?t=' + encodeURIComponent(rx.firma))
      expect(v.data).toMatchObject({ valida: true, emisor: { clinica: 'Clínica Demo MediSuite', cedula: '12345678' } })
      const s = await med.get('/api/settings')
      expect(s.data.doctor).toMatchObject({ nombre: 'Dra. Andrea Morales Peña', email: 'consultorio@ejemplo.mx', rfc: 'MOPA800101AB1' })
      // Siguiente folio continúa después del demo.
      const nuevo = await med.post('/api/prescriptions', { patientId: 'p1', items: [{ medicamento: 'Losartán', dosis: '1', via: 'Oral', frecuencia: 'c/24h', duracion: '30 días' }] })
      expect(nuevo.data.folio).toBe('RX-000103')
    } finally {
      await env.close()
    }
  })

  it('carga los registros demo de los módulos (mismos datos que el frontend) respetando permisos por tipo', async () => {
    const env = await setupEnv({ SEED_DEMO: 'true', ADMIN_EMAIL: '', ADMIN_PASSWORD: '' })
    try {
      const pw = 'MediSuite2026!'
      const esperado = seedDB().registros ?? []
      const med = await loginAs(env.app, 'medico@demo.mx', pw)
      const todos = (await med.get('/api/registros?limit=1000')).data as any[]
      const tipos = new Set(todos.map((r) => r.tipo))
      for (const t of ['prenatal', 'vacuna', 'triaje', 'enfermeria', 'certificado', 'inventario', 'movimiento-inventario', 'tarea', 'encuesta']) expect(tipos.has(t)).toBe(true)
      expect(todos).toHaveLength(esperado.length)
      // Registros de la clínica sin paciente (inventario, encuestas…) con patient_id nulo.
      const sinPaciente = todos.filter((r) => !r.patientId)
      expect(sinPaciente.length).toBeGreaterThan(0)
      expect(sinPaciente.some((r) => r.tipo === 'inventario')).toBe(true)
      const { rows } = await env.pool.query("SELECT count(*)::int AS n FROM registros WHERE patient_id IS NULL")
      expect(rows[0].n).toBe(esperado.filter((r) => !r.patientId).length)
      // Observaciones extra de enfermería y visión, receta rx2.
      expect((await med.get('/api/observations?limit=1000')).data.length).toBe(seedDB().observations.length)

      const rec = await loginAs(env.app, 'recepcion@demo.mx', pw)
      const deRec = (await rec.get('/api/registros?limit=1000')).data as any[]
      const tiposRec = new Set(deRec.map((r) => r.tipo))
      expect([...tiposRec].sort()).toEqual(['encuesta', 'inventario', 'movimiento-inventario', 'tarea'])
      for (const t of tiposRec) expect(registroTipoAllowed('recepcion', t, 'read')).toBe(true)
      expect((await rec.get('/api/registros?tipo=triaje')).statusCode).toBe(403)
      const triaje = todos.find((r) => r.tipo === 'triaje')
      expect((await rec.get('/api/registros/' + triaje.id)).statusCode).toBe(403)
    } finally {
      await env.close()
    }
  })
})
