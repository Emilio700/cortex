// Utilidades de las pruebas E2E (Playwright como biblioteca; no requiere @playwright/test).
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASE = process.env.E2E_BASE ?? 'http://localhost:5398/'
export const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'MediSuite2026!'
export const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
export const USUARIOS = { admin: 'admin@demo.mx', medico: 'medico@demo.mx', recepcion: 'recepcion@demo.mx', enfermeria: 'enfermeria@demo.mx' }
/** Sufijo único por corrida (los datos se acumulan si se reutiliza la BD con E2E_EXTERNAL). */
export const RUN = Date.now().toString(36).slice(-5)

/** playwright: local, del proyecto o de la instalación global de npm. */
function cargarPlaywright() {
  const req = createRequire(import.meta.url)
  try {
    return req('playwright')
  } catch {
    const global = execSync('npm root -g', { encoding: 'utf8' }).trim()
    return createRequire(path.join(global, 'noop.js'))('playwright')
  }
}
export const { chromium } = cargarPlaywright()

let browser
export async function navegador() {
  browser ??= await chromium.launch()
  return browser
}
export async function cerrarNavegador() {
  await browser?.close()
  browser = undefined
}

/** Abre un contexto nuevo e inicia sesión con el formulario. Registra errores de página en page.errores. */
export async function entrar(rol, { ancho = 1366 } = {}) {
  const b = await navegador()
  const ctx = await b.newContext({ viewport: { width: ancho, height: 900 }, acceptDownloads: true })
  const page = await ctx.newPage()
  page.errores = []
  page.on('pageerror', (e) => page.errores.push(e.message))
  // Respuestas de error de la API pedidas por la propia app (no por el helper api(), que marca x-e2e).
  page.on('response', (r) => {
    const u = new URL(r.url())
    if (!u.pathname.startsWith('/api/') || r.status() < 400 || r.request().headers()['x-e2e']) return
    if (u.pathname === '/api/auth/me' && r.status() === 401) return // antes de iniciar sesión
    page.errores.push(`API ${r.request().method()} ${u.pathname}${u.search} → ${r.status()}`)
  })
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // 401 del /me inicial antes de iniciar sesión y 403/404 esperados se reportan como recursos fallidos: se ignoran.
    if (/Failed to load resource/.test(t)) return
    page.errores.push(t)
  })
  await page.goto(BASE)
  await page.getByPlaceholder('nombre@clinica.mx').fill(USUARIOS[rol])
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.locator('nav, aside').first().waitFor()
  await page.getByPlaceholder('nombre@clinica.mx').waitFor({ state: 'detached' })
  page.rol = rol
  return page
}

/** Navega a una ruta hash (#/ruta) y espera el título del módulo. */
export async function ir(page, ruta, titulo) {
  await page.goto(BASE + '#/' + ruta)
  if (titulo) await page.locator('main h1').filter({ hasText: titulo }).first().waitFor({ timeout: 20000 })
}

/** Recarga la página (los datos vuelven a bajar del servidor) y espera el título. */
export async function recargar(page, titulo) {
  await page.reload()
  if (titulo) await page.locator('main h1').filter({ hasText: titulo }).first().waitFor({ timeout: 20000 })
}

/** Llamada a la API con la cookie de la sesión de la página. */
export async function api(page, method, url, body) {
  return page.evaluate(
    async ([method, url, body]) => {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'MediSuite', 'x-e2e': '1' }, body: body ? JSON.stringify(body) : undefined })
      const t = await res.text()
      let data = null
      try {
        data = t ? JSON.parse(t) : null
      } catch {
        data = t
      }
      return { status: res.status, data }
    },
    [method, url, body],
  )
}

/** Registros de un tipo según el servidor. */
export async function registros(page, tipo, extra = '') {
  const r = await api(page, 'GET', `/api/registros?tipo=${tipo}&limit=1000${extra}`)
  assert.equal(r.status, 200, `GET registros ${tipo}: ${r.status} ${JSON.stringify(r.data)}`)
  return r.data
}

/** Espera (sondeo) a que el servidor tenga un elemento que cumpla pred: la escritura del frontend es asíncrona. */
export async function esperarServidor(page, url, pred, { ms = 15000, msg = url } = {}) {
  const fin = Date.now() + ms
  let ultimo
  while (Date.now() < fin) {
    const r = await api(page, 'GET', url)
    ultimo = r
    if (r.status === 200) {
      const xs = Array.isArray(r.data) ? r.data : [r.data]
      const x = xs.find(pred)
      if (x) return x
    }
    await page.waitForTimeout(400)
  }
  assert.fail(`No apareció en el servidor: ${msg} (último ${ultimo?.status} ${JSON.stringify(ultimo?.data)?.slice(0, 300)})`)
}

export async function foto(page, nombre) {
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, nombre + '.png') })
}

/** Falla si hubo errores de JavaScript en la página. */
export function sinErrores(page) {
  assert.deepEqual(page.errores, [], `errores en la página (${page.rol}): ${page.errores.join(' | ')}`)
}

/** Cierra el contexto de la página. */
export async function salir(page) {
  await page.context().close()
}

export { assert }

/** Selecciona el paciente activo con el selector común (PatientPicker). */
export async function pacienteActivo(page, id) {
  await page.getByLabel('Paciente activo').first().selectOption(id)
}

/** Espera un toast con el texto. */
export async function toastCon(page, texto) {
  await page.getByText(texto).first().waitFor({ timeout: 10000 })
}

/** Control (input/select/textarea) dentro de un <Field label="…"> con ese texto exacto (o regex). */
export function campo(scope, etiqueta) {
  const page = typeof scope.page === 'function' ? scope.page() : scope
  const texto = typeof etiqueta === 'string' ? new RegExp('^' + etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') : etiqueta
  return scope.locator('label', { has: page.locator('xpath=./span[1]', { hasText: texto }) }).locator('input, select, textarea').first()
}

/**
 * Envoltura de una prueba con sesión: abre la sesión del rol, ejecuta fn(page), guarda captura si falla
 * (e2e/shots/FALLO-<archivo>.png), verifica que no hubo errores de JavaScript y cierra el contexto.
 */
export function conSesion(rol, nombre, fn, opts) {
  return async () => {
    const page = await entrar(rol, opts)
    try {
      await fn(page)
      sinErrores(page)
    } catch (e) {
      await foto(page, 'FALLO-' + nombre).catch(() => {})
      throw e
    } finally {
      await salir(page)
    }
  }
}

/** Pestaña (componente Tabs) dentro de main, por nombre inicial (las pestañas pueden llevar un contador). */
export async function pestana(page, nombre) {
  await page.getByRole('main').getByRole('button', { name: new RegExp('^' + nombre) }).first().click()
}
