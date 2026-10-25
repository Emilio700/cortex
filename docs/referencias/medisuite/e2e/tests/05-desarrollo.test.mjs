import { after, test } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, foto, ir, pacienteActivo, pestana, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('desarrollo infantil: médico guarda una evaluación de hitos', conSesion('medico', 'desarrollo', async (page) => {
  await ir(page, 'desarrollo', 'Desarrollo infantil')
  await pacienteActivo(page, 'p3')
  const sis = page.locator('main fieldset label', { hasText: /^Sí$/ })
  await sis.first().waitFor()
  const n = await sis.count()
  for (let i = 0; i < n; i++) await sis.nth(i).click()
  const nota = `Desarrollo acorde, revalorar en 6 meses E2E ${RUN}`
  await campo(page, 'Notas del médico / plan').fill(nota)
  await page.getByRole('button', { name: 'Guardar evaluación' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=desarrollo&patientId=p3&limit=1000', (x) => x.datos?.notas === nota, { msg: 'evaluación desarrollo' })
  assert.ok(r.estado)
  await recargar(page, 'Desarrollo infantil')
  await pestana(page, 'Historial')
  // La evaluación más reciente aparece desplegada con todos los hitos en «sí».
  await page.getByRole('main').getByText(new RegExp(`· ${n}/${n} hitos sí`)).first().waitFor()
  await foto(page, 'desarrollo')
}))
