import { test, after } from 'node:test'
import { api, assert, campo, cerrarNavegador, conSesion, esperarServidor, ir, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('tareas: recepción crea una tarea asignada a enfermería y la mueve en el tablero', conSesion('recepcion', 'tareas', async (page) => {
  await ir(page, 'tareas', 'Tareas del equipo')
  // Usuarios asignables para cualquier rol (sin correos).
  const asig = await api(page, 'GET', '/api/users/asignables')
  assert.equal(asig.status, 200)
  const enf = asig.data.find((u) => u.rol === 'enfermeria')
  assert.ok(enf && !('email' in enf))
  assert.equal((await api(page, 'GET', '/api/users')).status, 403)

  await page.getByRole('button', { name: /Nueva tarea/ }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Nueva tarea' })
  const titulo = `Llamar a laboratorio por resultados E2E ${RUN}`
  await campo(dlg, 'Título *').fill(titulo)
  await campo(dlg, 'Asignada a').selectOption(enf.id)
  await dlg.getByRole('button', { name: 'Guardar' }).click()
  const t = await esperarServidor(page, '/api/registros?tipo=tarea&limit=1000', (x) => x.titulo === titulo, { msg: 'tarea' })
  assert.equal(t.datos.asignadoA, enf.id)
  assert.equal(t.datos.asignadoNombre, enf.nombre)
  assert.equal(t.estado, 'abierta')

  const asa = page.getByRole('button', { name: `Mover «${titulo}» (columna actual: Abierta)` })
  await asa.focus()
  await page.keyboard.press('ArrowRight')
  const movida = await esperarServidor(page, `/api/registros/${t.id}`, (x) => x.estado !== 'abierta', { msg: 'tarea movida' })
  await recargar(page, 'Tareas del equipo')
  await page.getByRole('button', { name: new RegExp(`^Mover «${titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}» \\(columna actual: En curso\\)`) }).waitFor()
  assert.equal(movida.estado, 'en-curso')
}))
