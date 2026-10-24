/**
 * Genera los íconos PNG de la app instalada desde el emblema en vectores
 * (`src/components/EmblemaGems.tsx`), para que el teléfono, el menú y el
 * login muestren exactamente la misma marca (plan 32, punto 1).
 *
 * Uso, desde frontend/:  npm run iconos
 *
 * Sólo usa dependencias de desarrollo (@resvg/resvg-js y el vite-node que trae
 * vitest): nada de esto entra al paquete de producción. El favicon.ico no se
 * regenera (resvg no escribe .ico); se queda el que hay.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import EmblemaGems from '../src/components/EmblemaGems'

// El azul profundo del arranque de la app (manifest.json, theme-color).
const FONDO = '#0B1640'

/** El emblema a `tamano` px; con `fondo`, centrado a `escala` sobre ese color. */
function png(tamano: number, opciones: { fondo?: string; escala?: number } = {}): Buffer {
  const { fondo, escala = 1 } = opciones
  // Sin animación: el ícono es el estado final, quieto.
  const emblema = renderToStaticMarkup(<EmblemaGems size={512} />)
    .replace(/class="[^"]*"/g, '')
    .replace('<svg ', `<svg x="${(512 * (1 - escala)) / 2}" y="${(512 * (1 - escala)) / 2}" `)
    .replace('width="512" height="512"', `width="${512 * escala}" height="${512 * escala}"`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${
    fondo ? `<rect width="512" height="512" fill="${fondo}"/>` : ''
  }${emblema}</svg>`
  return new Resvg(svg, { fitTo: { mode: 'width', value: tamano } }).render().asPng()
}

const destino = (nombre: string) => resolve(__dirname, '../public/icons', nombre)

const ICONOS: [string, Buffer][] = [
  // «any»: el emblema solo, sin fondo, como lo muestra el login.
  ['icon-192.png', png(192, { escala: 0.94 })],
  ['icon-512.png', png(512, { escala: 0.94 })],
  // «maskable»: el sistema recorta en círculo o en gota; el emblema queda
  // dentro de la zona segura (80 % central) sobre el azul de arranque.
  ['icon-maskable-512.png', png(512, { fondo: FONDO, escala: 0.72 })],
  // iOS pinta de negro lo transparente: lleva el mismo fondo.
  ['apple-touch-icon.png', png(180, { fondo: FONDO, escala: 0.8 })],
  ['favicon-32.png', png(32)],
  ['favicon-16.png', png(16)],
]

for (const [nombre, datos] of ICONOS) {
  writeFileSync(destino(nombre), datos)
  console.log(`✓ public/icons/${nombre}`)
}
