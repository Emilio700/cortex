import { test, after } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, ir, pacienteActivo, pestana, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('nutrición: médico guarda evaluación antropométrica y plan', conSesion('medico', 'nutricion', async (page) => {
  await ir(page, 'nutricion', 'Nutrición')
  await pacienteActivo(page, 'p6')
  await campo(page, 'Peso (kg)').fill('101.4')
  await campo(page, 'Talla (cm)').fill('174')
  await campo(page, 'Cintura (cm)').fill('108')
  const objetivo = `Reducir 5 % del peso en 6 meses E2E ${RUN}`
  await campo(page, 'Objetivo del plan').fill(objetivo)
  await page.getByRole('button', { name: 'Guardar consulta' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=nutricion&patientId=p6&limit=1000', (x) => x.datos?.objetivo === objetivo, { msg: 'plan de nutrición' })
  assert.equal(r.datos.antro.peso, '101.4')
  assert.ok(r.datos.resultados.imc > 33 && r.datos.resultados.imc < 34)
  await esperarServidor(page, '/api/observations?patientId=p6&limit=1000', (o) => o.etiqueta === 'Nutrición' && o.codigo === 'cintura' && o.valor === 108)
  await recargar(page, 'Nutrición')
  await pestana(page, 'Historial')
  await page.getByText(objetivo).first().waitFor()
}))
