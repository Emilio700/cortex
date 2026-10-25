import { test, after } from 'node:test'
import { api, assert, BASE, cerrarNavegador, conSesion, registros } from '../lib.mjs'

after(cerrarNavegador)

const CLINICOS = ['Triaje', 'Hoja de enfermería', 'Control prenatal', 'Vacunación', 'Desarrollo infantil', 'Agudeza visual', 'Audiometría', 'Nutrición', 'Prevención', 'Órdenes de estudios', 'Certificados', 'Interoperabilidad']
const RUTAS_CLINICAS = ['triaje', 'enfermeria', 'prenatal', 'vacunacion', 'desarrollo', 'vision', 'audiometria', 'nutricion', 'tamizajes', 'ordenes', 'certificados', 'interoperabilidad']

const menu = async (page) => (await page.locator('aside').first().innerText()).split('\n').map((s) => s.trim())

async function sinPermiso(page, ruta) {
  await page.goto(BASE + '#/' + ruta)
  await page.getByRole('heading', { name: 'Sin permiso' }).waitFor({ timeout: 10000 })
}

test('recepción: sin módulos clínicos en el menú, «Sin permiso» por URL y 403 en registros clínicos', conSesion('recepcion', 'permisos-recepcion', async (page) => {
  const m = await menu(page)
  for (const l of CLINICOS) assert.ok(!m.includes(l), `recepción no debe ver «${l}» en el menú`)
  for (const l of ['Inventario', 'Tareas', 'Satisfacción']) assert.ok(m.includes(l), `recepción debe ver «${l}»`)
  for (const r of RUTAS_CLINICAS) await sinPermiso(page, r)
  for (const tipo of ['triaje', 'enfermeria', 'prenatal', 'vacuna', 'orden', 'certificado']) {
    assert.equal((await api(page, 'GET', `/api/registros?tipo=${tipo}`)).status, 403, `GET ${tipo}`)
    assert.equal((await api(page, 'POST', '/api/registros', { patientId: 'p1', tipo, datos: {} })).status, 403, `POST ${tipo}`)
  }
  const todos = (await api(page, 'GET', '/api/registros?limit=1000')).data
  assert.deepEqual([...new Set(todos.map((r) => r.tipo))].sort(), ['encuesta', 'inventario', 'movimiento-inventario', 'tarea'])
  // Puede abrir los operativos.
  await page.goto(BASE + '#/tareas')
  await page.getByRole('heading', { name: 'Tareas del equipo' }).waitFor()
}))

test('enfermería: triaje y hoja de enfermería sí; certificados, interoperabilidad y satisfacción no', conSesion('enfermeria', 'permisos-enfermeria', async (page) => {
  const m = await menu(page)
  for (const l of ['Triaje', 'Hoja de enfermería', 'Vacunación', 'Órdenes de estudios']) assert.ok(m.includes(l), `enfermería debe ver «${l}»`)
  for (const l of ['Certificados', 'Interoperabilidad', 'Satisfacción']) assert.ok(!m.includes(l), `enfermería no debe ver «${l}»`)
  for (const r of ['certificados', 'interoperabilidad', 'encuestas']) await sinPermiso(page, r)
  assert.ok((await registros(page, 'certificado')).length > 0, 'enfermería lee certificados')
  assert.equal((await api(page, 'POST', '/api/registros', { patientId: 'p1', tipo: 'certificado', estado: 'borrador', datos: {} })).status, 403)
  assert.equal((await api(page, 'POST', '/api/registros', { patientId: 'p1', tipo: 'referencia', datos: {} })).status, 403)
  const t = await api(page, 'POST', '/api/registros', { patientId: 'p1', tipo: 'triaje', estado: 'espera', datos: { motivo: 'API' } })
  assert.equal(t.status, 201)
  assert.equal((await api(page, 'DELETE', `/api/registros/${t.data.id}`)).status, 204)
}))
