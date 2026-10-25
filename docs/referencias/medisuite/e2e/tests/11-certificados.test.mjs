import { test, after } from 'node:test'
import { api, assert, campo, cerrarNavegador, conSesion, esperarServidor, ir, pacienteActivo, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('certificados: médico emite y cancela una constancia', conSesion('medico', 'certificados', async (page) => {
  await ir(page, 'certificados', 'Certificados y referencias')
  await pacienteActivo(page, 'p4')
  await page.getByRole('button', { name: /Constancia de asistencia a consulta/ }).click()
  const motivo = `Valoración de rodilla E2E ${RUN}`
  await campo(page, 'Motivo (genérico)').fill(motivo)
  await page.getByRole('button', { name: 'Emitir', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Emitir', exact: true }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=certificado&patientId=p4&limit=1000', (x) => x.estado === 'emitido' && JSON.stringify(x.datos).includes(motivo), { msg: 'certificado emitido' })
  assert.match(r.datos.folio, /^CM-/)
  assert.ok(r.datos.hash)
  // Emitido: el servidor ya no permite modificarlo.
  assert.equal((await api(page, 'PATCH', `/api/registros/${r.id}`, { titulo: 'otro' })).status, 409)

  await recargar(page, 'Certificados y referencias')
  await pacienteActivo(page, 'p4')
  await page.getByRole('button', { name: `Cancelar ${r.datos.folio}` }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('textbox').fill('Error en la fecha de atención')
  await dlg.getByRole('button', { name: 'Cancelar documento' }).click()
  const c = await esperarServidor(page, `/api/registros/${r.id}`, (x) => x.estado === 'cancelado', { msg: 'certificado cancelado' })
  assert.equal(c.datos.motivoCancelacion, 'Error en la fecha de atención')
  assert.ok(c.datos.canceladoPor)
  assert.equal(c.datos.hash, r.datos.hash)
  await recargar(page, 'Certificados y referencias')
  await pacienteActivo(page, 'p4')
  await page.getByText('Cancelado: Error en la fecha de atención').first().waitFor()
}))
