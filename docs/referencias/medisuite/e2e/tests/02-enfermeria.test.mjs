import { after, test } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, foto, ir, pacienteActivo, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('hoja de enfermería: signos vitales y nota de turno persisten', conSesion('enfermeria', 'enfermeria', async (page) => {
  await ir(page, 'enfermeria', 'Hoja de enfermería')
  await pacienteActivo(page, 'p4')
  await page.getByRole('main').getByRole('button', { name: 'Registrar', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Registrar signos vitales' })
  await campo(dlg, 'FC (lpm)').fill('87')
  await campo(dlg, 'Temp. (°C)').fill('37.3')
  await dlg.getByRole('button', { name: 'Guardar' }).click()
  await esperarServidor(page, '/api/observations?patientId=p4&limit=1000', (o) => o.etiqueta === 'Hoja de enfermería' && o.codigo === 'fc' && o.valor === 87)
  await esperarServidor(page, '/api/observations?patientId=p4&limit=1000', (o) => o.etiqueta === 'Hoja de enfermería' && o.codigo === 'temp' && o.valor === 37.3)

  // Nota libre → crea/actualiza el registro 'enfermeria' del día.
  const nota = `Paciente tranquilo, deambula con muletas E2E ${RUN}`
  await page.getByRole('main').getByRole('button', { name: 'Notas', exact: true }).click()
  await page.getByRole('radio', { name: 'Libre' }).click()
  await campo(page, 'Nota').fill(nota)
  await page.getByRole('button', { name: 'Guardar nota' }).click()
  const hoja = await esperarServidor(page, '/api/registros?tipo=enfermeria&patientId=p4&limit=1000', (r) => (r.datos?.notas ?? []).some((n) => n.texto === nota), { msg: 'nota de enfermería' })
  assert.equal(hoja.tipo, 'enfermeria')

  await recargar(page, 'Hoja de enfermería')
  await pacienteActivo(page, 'p4')
  await page.getByRole('main').getByRole('button', { name: 'Notas', exact: true }).click()
  await page.getByText(nota).waitFor()
  await page.getByRole('main').getByRole('button', { name: 'Signos', exact: true }).click()
  await page.getByRole('main').getByText('87', { exact: true }).first().waitFor()
  await foto(page, 'enfermeria-signos')
}))
