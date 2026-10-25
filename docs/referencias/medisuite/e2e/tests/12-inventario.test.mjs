import { test, after } from 'node:test'
import { api, assert, campo, cerrarNavegador, conSesion, entrar, esperarServidor, ir, pestana, recargar, registros, RUN, salir } from '../lib.mjs'

after(cerrarNavegador)

test('inventario: enfermería registra entrada y salida; kárdex y exportación auditada', conSesion('enfermeria', 'inventario', async (page) => {
  await ir(page, 'inventario', 'Inventario')
  const prod = (await registros(page, 'inventario')).find((r) => r.estado === 'activo')
  assert.ok(prod, 'hay productos demo')
  const lote = `E2E${RUN}`.toUpperCase()
  await pestana(page, 'Registrar movimiento')
  await campo(page, 'Producto').selectOption(prod.id)
  await page.getByRole('radio', { name: 'Entrada' }).click()
  await campo(page, /^Cantidad \(/).fill('20')
  await campo(page, 'Lote').fill(lote)
  await campo(page, 'Caducidad').fill('2028-12-31')
  await page.getByRole('button', { name: 'Registrar entrada' }).click()
  const ent = await esperarServidor(page, '/api/registros?tipo=movimiento-inventario&limit=1000', (x) => x.datos?.lote === lote && x.datos?.tipo === 'entrada', { msg: 'entrada' })
  assert.equal(ent.datos.cantidad, 20)
  assert.equal(ent.datos.productoId, prod.id)

  await page.getByRole('radio', { name: 'Salida' }).click()
  await campo(page, /^Cantidad \(/).fill('5')
  await campo(page, 'Lote').selectOption(lote)
  await page.getByRole('button', { name: 'Registrar salida' }).click()
  const sal = await esperarServidor(page, '/api/registros?tipo=movimiento-inventario&limit=1000', (x) => x.datos?.lote === lote && x.datos?.tipo === 'salida', { msg: 'salida' })
  assert.equal(sal.datos.cantidad, 5)
  // Los movimientos son inmutables en el servidor.
  assert.equal((await api(page, 'PATCH', `/api/registros/${sal.id}`, { titulo: 'x' })).status, 409)

  await recargar(page, 'Inventario')
  await pestana(page, 'Kárdex')
  await campo(page, 'Producto').selectOption(prod.id)
  const kardex = page.getByRole('main')
  await kardex.getByText(lote).first().waitFor()
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()])
  assert.match(descarga.suggestedFilename(), /^kardex-.*\.csv$/)

  // La exportación quedó en la bitácora (la consulta el administrador).
  const admin = await entrar('admin')
  try {
    await esperarServidor(admin, '/api/audit?limit=200', (a) => a.accion === 'exportar' && a.recurso === 'inventario' && a.detalle?.origen === 'navegador' && a.detalle?.formato === 'csv', { msg: 'bitácora de exportación de inventario' })
  } finally {
    await salir(admin)
  }
}))

test('inventario: recepción consulta existencias pero no registra movimientos', conSesion('recepcion', 'inventario-recepcion', async (page) => {
  await ir(page, 'inventario', 'Inventario')
  await page.getByRole('main').getByRole('button', { name: /^Existencias/ }).waitFor()
  assert.equal(await page.getByRole('main').getByRole('button', { name: /^Registrar movimiento/ }).count(), 0)
  assert.equal((await api(page, 'POST', '/api/registros', { tipo: 'movimiento-inventario', datos: { tipo: 'entrada', cantidad: 1 } })).status, 403)
}))
