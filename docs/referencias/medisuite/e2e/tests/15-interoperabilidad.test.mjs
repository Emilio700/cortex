import { test, after } from 'node:test'
import { assert, cerrarNavegador, conSesion, entrar, esperarServidor, ir, pacienteActivo, salir } from '../lib.mjs'

after(cerrarNavegador)

test('interoperabilidad: médico exporta FHIR (JSON y NDJSON) y queda en la bitácora', conSesion('medico', 'interoperabilidad', async (page) => {
  await ir(page, 'interoperabilidad', 'Interoperabilidad FHIR R4')
  await pacienteActivo(page, 'p2')
  await page.getByRole('button', { name: 'Generar FHIR' }).click()
  await page.getByText('Bundle FHIR (JSON)').waitFor()
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.json' }).click()])
  assert.match(json.suggestedFilename(), /^medisuite-hern.*\.json$/)
  const bundle = JSON.parse(await (await import('node:fs/promises')).readFile(await json.path(), 'utf8'))
  assert.equal(bundle.resourceType, 'Bundle')
  const n = bundle.entry.length
  const [nd] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Patient\.ndjson/ }).click()])
  assert.equal(nd.suggestedFilename(), 'Patient.ndjson')

  const admin = await entrar('admin')
  try {
    const a = await esperarServidor(admin, '/api/audit?patientId=p2&limit=50', (x) => x.accion === 'exportar' && x.recurso === 'fhir' && x.detalle?.formato === 'fhir+json', { msg: 'bitácora FHIR json' })
    assert.equal(a.detalle.recursos, n)
    assert.equal(a.userNombre, 'Dra. Andrea Morales Peña')
    await esperarServidor(admin, '/api/audit?patientId=p2&limit=50', (x) => x.recurso === 'fhir' && x.detalle?.formato === 'fhir+ndjson' && x.detalle?.recursos === 1, { msg: 'bitácora FHIR ndjson' })
  } finally {
    await salir(admin)
  }
}))
