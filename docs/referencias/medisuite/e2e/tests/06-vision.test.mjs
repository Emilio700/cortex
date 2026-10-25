import { after, test } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, foto, ir, pacienteActivo, pestana, recargar, registros } from '../lib.mjs'

after(cerrarNavegador)

test('agudeza visual: captura manual OD/OI y guardado en expediente', conSesion('medico', 'vision', async (page) => {
  await ir(page, 'vision', 'Agudeza visual')
  await pacienteActivo(page, 'p7')
  await pestana(page, 'Agudeza visual')
  const antes = (await registros(page, 'agudeza-visual', '&patientId=p7')).map((r) => r.id)
  for (const [ojo, val] of [['OD', '20/30'], ['OI', '20/50']]) {
    await page.getByRole('button', { name: 'Captura manual' }).click()
    const dlg = page.getByRole('dialog', { name: 'Captura manual (cartilla física)' })
    const sel = campo(dlg, 'Ojo')
    const opt = await sel.locator('option').evaluateAll((os, o) => os.find((x) => x.value === o || x.textContent.includes(o))?.value, ojo)
    await sel.selectOption(opt)
    await campo(dlg, 'Agudeza (20/x, 6/x o decimal)').fill(val)
    await dlg.getByRole('button', { name: 'Agregar' }).click()
  }
  await page.getByRole('button', { name: 'Guardar en expediente' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=agudeza-visual&patientId=p7&limit=1000', (x) => !antes.includes(x.id), { msg: 'agudeza visual' })
  assert.match(r.titulo, /OD 20\/30/)
  assert.match(r.titulo, /OI 20\/50/)
  await esperarServidor(page, '/api/observations?patientId=p7&limit=1000', (o) => o.codigo === 'agudeza-oi' && Math.abs(o.valor - 0.4) < 0.01)
  await recargar(page, 'Agudeza visual')
  await pestana(page, 'Historial')
  await page.getByText(r.titulo).first().waitFor()
  await foto(page, 'vision')
}))
