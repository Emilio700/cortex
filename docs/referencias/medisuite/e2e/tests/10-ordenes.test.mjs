import { test, after } from 'node:test'
import { api, assert, campo, cerrarNavegador, conSesion, esperarServidor, ir, pacienteActivo, pestana, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('órdenes: médico crea una orden, descarga el PDF y la avanza a muestra tomada', conSesion('medico', 'ordenes', async (page) => {
  await ir(page, 'ordenes', 'Órdenes de estudios')
  await pacienteActivo(page, 'p1')
  await pestana(page, 'Nueva orden')
  await page.getByLabel('Buscar estudio').fill('hemoglobina glucosilada')
  await page.locator('main ul li label input[type=checkbox]').first().check()
  const indic = `Ayuno de 8 horas, enviar por correo E2E ${RUN}`
  await campo(page, 'Indicaciones / datos para el laboratorio').fill(indic)
  await page.getByRole('button', { name: 'Crear orden' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=orden&patientId=p1&limit=1000', (x) => x.datos?.indicaciones === indic, { msg: 'orden' })
  assert.equal(r.estado, 'pendiente')
  assert.match(r.datos.folio, /^OR-/)
  // Emitir: PDF de la solicitud.
  const tarjeta = page.locator('main li, main article').filter({ hasText: r.datos.folio }).first()
  const [descarga] = await Promise.all([page.waitForEvent('download'), tarjeta.getByRole('button', { name: 'PDF', exact: true }).click()])
  assert.match(descarga.suggestedFilename(), /\.pdf$/)
  await tarjeta.getByRole('button', { name: 'Muestra tomada' }).click()
  await esperarServidor(page, `/api/registros/${r.id}`, (x) => x.datos?.fase === 'muestra', { msg: 'orden en muestra' })
  await recargar(page, 'Órdenes de estudios')
  await pacienteActivo(page, 'p1')
  await page.locator('main').filter({ hasText: r.datos.folio }).first().waitFor()
  assert.match(await page.locator('main li, main article').filter({ hasText: r.datos.folio }).first().innerText(), /Resultado recibido/)

  // Umbral de alerta de la clínica (preferencia de organización) persiste en el servidor.
  await pestana(page, 'Pendientes de la clínica')
  await campo(page, 'Alertar si no hay resultado tras (días)').fill('5')
  await page.waitForTimeout(1500)
  const pref = await api(page, 'GET', '/api/preferencias/ordenes.alerta-dias?scope=org')
  assert.equal(pref.status, 200)
  assert.equal(pref.data.valor, 5)
  await recargar(page, 'Órdenes de estudios')
  await pestana(page, 'Pendientes de la clínica')
  assert.equal(await campo(page, 'Alertar si no hay resultado tras (días)').inputValue(), '5')
}))
