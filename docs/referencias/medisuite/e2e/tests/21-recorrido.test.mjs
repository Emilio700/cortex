// Recorrido de humo: cada rol abre cada módulo que su menú le muestra, sin errores de JavaScript ni de la API.
import { test, after } from 'node:test'
import { assert, BASE, cerrarNavegador, conSesion } from '../lib.mjs'

after(cerrarNavegador)

const MODULOS = {
  triaje: 'Triaje', enfermeria: 'Hoja de enfermería', prenatal: 'Control prenatal', vacunacion: 'Vacunación', desarrollo: 'Desarrollo infantil',
  vision: 'Agudeza visual', audiometria: 'Audiometría', nutricion: 'Nutrición', tamizajes: 'Prevención', ordenes: 'Órdenes de estudios',
  certificados: 'Certificados', inventario: 'Inventario', tareas: 'Tareas', encuestas: 'Satisfacción', interoperabilidad: 'Interoperabilidad',
}

for (const rol of ['admin', 'medico', 'enfermeria', 'recepcion']) {
  test(`recorrido ${rol}: abre sus módulos sin errores`, conSesion(rol, 'recorrido-' + rol, async (page) => {
    const menu = (await page.locator('aside').first().innerText()).split('\n').map((s) => s.trim())
    const visibles = Object.entries(MODULOS).filter(([, l]) => menu.includes(l))
    assert.ok(visibles.length >= 3, `${rol} ve al menos 3 módulos nuevos`)
    for (const [ruta] of visibles) {
      await page.goto(BASE + '#/' + ruta)
      await page.locator('main h1').first().waitFor()
      assert.notEqual(await page.locator('main h1').first().innerText(), 'Sin permiso', `${rol} → ${ruta}`)
      await page.waitForTimeout(800)
    }
  }))
}
