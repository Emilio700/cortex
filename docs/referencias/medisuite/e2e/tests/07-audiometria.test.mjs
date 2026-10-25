import { after, test } from 'node:test'
import { assert, campo, cerrarNavegador, conSesion, esperarServidor, foto, ir, pacienteActivo, pestana, recargar, RUN } from '../lib.mjs'

after(cerrarNavegador)

test('audiometría: médico captura y guarda un audiograma', conSesion('medico', 'audiometria', async (page) => {
  await ir(page, 'audiometria', 'Audiometría')
  await pacienteActivo(page, 'p2')
  const umbrales = { der: { 500: 20, 1000: 25, 2000: 35, 4000: 50 }, izq: { 500: 15, 1000: 20, 2000: 30, 4000: 45 } }
  for (const oido of ['der', 'izq']) {
    await page.getByRole('radio', { name: oido === 'der' ? 'Derecho (rojo)' : 'Izquierdo (azul)' }).click()
    for (const [f, db] of Object.entries(umbrales[oido])) {
      await campo(page, 'Frecuencia').selectOption(f)
      await campo(page, 'Umbral (dB HL)').selectOption(String(db))
    }
  }
  const nota = `Otoscopia normal bilateral E2E ${RUN}`
  await campo(page, 'Notas').fill(nota)
  await page.getByRole('button', { name: 'Guardar en expediente' }).click()
  const r = await esperarServidor(page, '/api/registros?tipo=audiometria&patientId=p2&limit=1000', (x) => x.datos?.notas === nota, { msg: 'audiometría' })
  assert.equal(r.datos.umbrales.der.aerea['2000'].db, 35)
  assert.ok(r.datos.pta.der > 0)
  // La imagen del audiograma se guarda en documentos del paciente.
  await esperarServidor(page, '/api/documents?patientId=p2&limit=1000', (d) => /^Audiograma/.test(d.nombre), { msg: 'documento audiograma' })
  await recargar(page, 'Audiometría')
  await pestana(page, 'Historial')
  await page.getByText(r.titulo).first().waitFor()
  await foto(page, 'audiometria')
}))
