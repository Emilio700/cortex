import { test, after } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, ir, pacienteActivo, recargar, registros, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('prevención: enfermería marca un tamizaje como realizado', conSesion('enfermeria', 'tamizajes', async (page) => {
  await ir(page, 'tamizajes', 'Prevención')
  await pacienteActivo(page, 'p1')
  const antes = (await registros(page, 'tamizaje', '&patientId=p1')).map((r) => r.id)
  const fila = page.locator('main li').filter({ has: page.getByRole('button', { name: 'Registrar' }) }).first()
  const regla = (await fila.locator('span.font-medium').first().innerText()).trim()
  await fila.getByRole('button', { name: 'Registrar' }).click()
  const dlg = page.getByRole('dialog', { name: `Registrar: ${regla}` })
  const nota = `Resultado normal, entregado al paciente E2E ${RUN}`
  await campo(dlg, 'Notas / resultado detallado').fill(nota)
  await dlg.getByRole('button', { name: 'Guardar' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=tamizaje&patientId=p1&limit=1000', (x) => !antes.includes(x.id) && x.datos?.notas === nota, { msg: 'tamizaje' })
  assert.equal(r.estado, 'realizado')
  await recargar(page, 'Prevención')
  await pacienteActivo(page, 'p1')
  const filaDespues = page.locator('main li').filter({ hasText: regla }).first()
  await filaDespues.getByText(/Último:/).waitFor()
  assert.match(await filaDespues.innerText(), /Al día|Próximo/)
}))
