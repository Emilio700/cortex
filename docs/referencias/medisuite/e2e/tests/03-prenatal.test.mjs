import { after, test } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, foto, ir, pacienteActivo, pestana, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('control prenatal: médico agrega una consulta al embarazo en curso', conSesion('medico', 'prenatal', async (page) => {
  await ir(page, 'prenatal', 'Control prenatal')
  await pacienteActivo(page, 'p5')
  await pestana(page, 'Consultas')
  await page.getByText('Nueva consulta prenatal').waitFor()
  const nota = `Sin datos de alarma obstétrica E2E ${RUN}`
  await campo(page, 'Peso (kg)').fill('68.5')
  await campo(page, 'Altura uterina (cm)').fill('22')
  await campo(page, 'TA sistólica (mmHg)').fill('112')
  await campo(page, 'TA diastólica (mmHg)').fill('70')
  await campo(page, 'FCF (lpm)').fill('145')
  await campo(page.locator('section, div').filter({ hasText: 'Nueva consulta prenatal' }).last(), 'Notas').fill(nota)
  await page.getByRole('button', { name: 'Guardar consulta' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=prenatal&patientId=p5&limit=1000', (x) => x.datos?.notas === nota, { msg: 'consulta prenatal' })
  assert.equal(r.datos.clase, 'consulta')
  assert.equal(r.datos.au, 22)
  assert.ok(r.datos.embarazoId)
  await esperarServidor(page, '/api/observations?patientId=p5&limit=1000', (o) => o.etiqueta === 'Control prenatal' && o.codigo === 'peso' && o.valor === 68.5)
  await recargar(page, 'Control prenatal')
  await pestana(page, 'Consultas')
  await page.getByText(nota).first().waitFor()
  await foto(page, 'prenatal')
}))
