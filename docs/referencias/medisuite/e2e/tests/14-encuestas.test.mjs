import { test, after } from 'node:test'
import { assert, BASE, cerrarNavegador, conSesion, entrar, esperarServidor, ir, pestana, recargar, RUN, salir } from '../lib.mjs'

after(cerrarNavegador)

test('satisfacción: encuesta en modo kiosco y exportación CSV auditada', conSesion('recepcion', 'encuestas', async (page) => {
  await page.goto(BASE + '#/encuestas?kiosco=1')
  await page.getByRole('button', { name: 'Comenzar' }).click()
  const comentario = `Muy buena atención en recepción E2E ${RUN}`
  const progreso = page.getByRole('progressbar', { name: 'Progreso' })
  for (let paso = 0; paso < 30; paso++) {
    if (await page.getByRole('button', { name: 'Comenzar' }).isVisible().catch(() => false)) break
    if (!(await progreso.isVisible().catch(() => false))) {
      await page.waitForTimeout(300)
      continue
    }
    const n = await progreso.getAttribute('aria-valuenow')
    const texto = page.locator('#ktexto')
    if (await texto.isVisible()) await texto.fill(comentario)
    else {
      const radios = page.getByRole('radio')
      const k = await radios.count()
      if (k) await radios.nth(k === 11 ? 9 : k - 1).click() // NPS 9, escala 5, última opción
    }
    await page.waitForTimeout(700)
    if ((await progreso.getAttribute('aria-valuenow').catch(() => null)) === n) {
      const sig = page.getByRole('button', { name: /^(Siguiente|Enviar)$/ })
      if (await sig.isVisible()) await sig.click()
    }
    if (await page.getByText(/Gracias por su tiempo/).isVisible().catch(() => false)) break
  }
  const r = await esperarServidor(page, '/api/registros?tipo=encuesta&limit=1000', (x) => Object.values(x.datos?.respuestas ?? {}).includes(comentario), { msg: 'encuesta' })
  assert.equal(r.datos.respuestas.nps, 9)
  assert.equal(r.datos.canal, 'kiosco')

  await ir(page, 'encuestas', 'Satisfacción')
  await recargar(page)
  await pestana(page, 'Resultados')
  await page.getByText(comentario).first().waitFor()
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()])
  assert.match(descarga.suggestedFilename(), /^encuestas-.*\.csv$/)
  const admin = await entrar('admin')
  try {
    await esperarServidor(admin, '/api/audit?limit=200', (a) => a.accion === 'exportar' && a.recurso === 'encuestas' && a.detalle?.recursos > 0, { msg: 'bitácora de exportación de encuestas' })
  } finally {
    await salir(admin)
  }
}))
