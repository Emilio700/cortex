import { after, test } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, foto, ir, pacienteActivo, pestana, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('vacunación: enfermería registra una dosis aplicada', conSesion('enfermeria', 'vacunacion', async (page) => {
  await ir(page, 'vacunacion', 'Vacunación')
  await pacienteActivo(page, 'p3')
  await page.getByRole('button', { name: 'Registrar dosis' }).click()
  const dlg = page.getByRole('dialog', { name: 'Registrar dosis aplicada' })
  const lote = `L-E2E-${RUN}`
  await campo(dlg, 'Lote').fill(lote)
  await campo(dlg, 'Aplicador').fill('Enf. Pruebas')
  await dlg.getByRole('button', { name: 'Guardar' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=vacuna&patientId=p3&limit=1000', (x) => x.datos?.lote === lote, { msg: 'vacuna ' + lote })
  assert.equal(r.estado, 'aplicada')
  await recargar(page, 'Vacunación')
  await pestana(page, 'Dosis aplicadas')
  await page.getByText(lote).first().waitFor()
  await foto(page, 'vacunacion')
}))
