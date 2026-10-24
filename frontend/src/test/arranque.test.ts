/**
 * Pantalla en blanco: la única salida que no depende de React.
 *
 * El sitio se quedó en blanco dos veces y no hubo mensaje que decirle a quien
 * estaba enfrente: una pantalla vacía no se puede diagnosticar. El guardia de
 * `index.html` vive fuera de React y de Vite justo para sobrevivir a ese caso,
 * así que aquí se ejecuta tal cual —el mismo texto que se sirve— contra un
 * documento limpio, en vez de revisar que las palabras estén escritas.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

// `import.meta.url` no sirve aquí: dentro de vitest apunta a http, no a un
// archivo. La suite se corre desde `frontend/`.
const rutaDelHtml = (): string => {
  const candidatas = [resolve(process.cwd(), 'index.html'), resolve(process.cwd(), 'frontend/index.html')]
  const encontrada = candidatas.find((ruta) => existsSync(ruta))
  if (!encontrada) throw new Error(`No encontré index.html en ${candidatas.join(' ni en ')}`)
  return encontrada
}

const html = readFileSync(rutaDelHtml(), 'utf-8')

/** El bloque del guardia: es el único `<script>` sin atributos del archivo. */
const codigoDelGuardia = (): string => {
  const encontrado = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!encontrado) throw new Error('index.html perdió el guardia de arranque')
  return encontrado[1]
}

const montar = () => {
  document.body.innerHTML = `
    <div id="root"></div>
    <div id="cortex-arranque">
      <p id="ca-titulo">Cargando el sistema…</p>
      <p id="ca-detalle"></p>
      <pre id="ca-error" hidden></pre>
      <button type="button" id="ca-recargar" hidden>Recargar la página</button>
    </div>
  `
  new Function(codigoDelGuardia())()
}

const esperarMicrotareas = () => new Promise((listo) => setTimeout(listo, 0))

const capa = () => document.getElementById('cortex-arranque')
const recargar = () => document.getElementById('ca-recargar') as HTMLButtonElement
const cajaDeError = () => document.getElementById('ca-error') as HTMLElement

describe('guardia de arranque', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('sigue en el HTML, después de React y antes del módulo', () => {
    expect(html).toContain('id="root"')
    expect(html).toContain('id="cortex-arranque"')
    // Si el módulo no carga, el guardia igual se ejecutó: por eso va antes.
    expect(html.indexOf('id="cortex-arranque"')).toBeLessThan(html.indexOf('/src/index.tsx'))
  })

  it('se retira sola en cuanto React pinta algo', async () => {
    montar()
    expect(capa()).not.toBeNull()

    document.getElementById('root')!.appendChild(document.createElement('div'))
    await esperarMicrotareas()

    expect(capa()).toBeNull()
  })

  it('si la aplicación no arranca, dice por qué y ofrece recargar', () => {
    montar()

    window.dispatchEvent(new ErrorEvent('error', { message: 'Falló el módulo de arranque' }))

    expect(cajaDeError().hidden).toBe(false)
    expect(cajaDeError().textContent).toContain('Falló el módulo de arranque')
    expect(recargar().hidden).toBe(false)
    expect(capa()!.textContent).toContain('CORTEX no terminó de abrir')
  })

  it('también cuenta una promesa rechazada antes de montar', () => {
    montar()

    const rechazo = Object.assign(new Event('unhandledrejection'), {
      reason: new Error('El servidor no respondió'),
    })
    window.dispatchEvent(rechazo)

    expect(cajaDeError().textContent).toContain('El servidor no respondió')
  })

  it('un recurso que no llega no asusta a nadie', () => {
    montar()

    // Los errores de recursos (una imagen, un ícono) llegan sin mensaje: no
    // impiden usar el sistema y no deben taparlo con un aviso de fallo.
    window.dispatchEvent(new Event('error'))

    expect(cajaDeError().hidden).toBe(true)
    expect(recargar().hidden).toBe(true)
  })
})
