import { after, test } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, foto, ir, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('triaje: enfermería registra un triaje que persiste en el servidor', conSesion('enfermeria', 'triaje', async (page) => {
  await ir(page, 'triaje', 'Triaje')
  await page.getByRole('main').getByRole('button', { name: 'Nuevo triaje' }).first().click()
  const motivo = `Dolor torácico opresivo E2E ${RUN}`
  await campo(page, 'Paciente').selectOption('p6')
  await campo(page, 'Motivo de consulta (queja principal)').fill(motivo)
  await campo(page, /^FC /).fill('118')
  await page.getByText('Situación de alto riesgo').click()
  await page.getByRole('button', { name: 'Enviar a sala de espera' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=triaje&limit=1000', (x) => x.datos?.motivo === motivo, { msg: 'triaje ' + motivo })
  assert.equal(r.patientId, 'p6')
  assert.equal(r.estado, 'espera')
  assert.equal(r.datos.nivel, 2)
  // El FC se guarda también como observación del paciente.
  await esperarServidor(page, '/api/observations?patientId=p6&limit=1000', (o) => o.etiqueta === 'Triaje' && o.codigo === 'fc' && o.valor === 118)
  await recargar(page, 'Triaje')
  await page.getByText(motivo.slice(0, 30)).first().waitFor()
  await foto(page, 'triaje-enfermeria')
}))
