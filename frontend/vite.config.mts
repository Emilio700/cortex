/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import autoprefixer from 'autoprefixer'
import type{ DeprecationOrId } from 'sass'
import { readFileSync } from 'node:fs'

// La versión sale de un solo lugar, package.json, y entra al código en el
// build (plan 32). Antes el pie, el panel y el menú de ajustes la traían
// escrita a mano y se quedaron en 1.0.0 después de la 1.1.0.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    base: './',
    build: {
      outDir: 'build',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            // Sólo React y su enrutador. Antes se buscaba «/react/» en la ruta, y
            // eso también atrapaba a @fullcalendar/react: FullCalendar (y
            // preact, que trae dentro) viajaba en el paquete inicial de todas
            // las pantallas aunque sólo lo use la Agenda (plan 29, lote 6).
            if (/[\/]node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/.test(id)) return 'vendor-react'
            if (id.includes('@coreui/icons')) return 'vendor-icons'
            if (id.includes('@coreui/react')) return 'vendor-coreui-react'
            if (id.includes('@coreui/') || id.includes('@popperjs/')) return 'vendor-coreui'
            if (id.includes('i18next')) return 'vendor-i18n'
            if (id.includes('axios')) return 'vendor-http'
            // El motor del visor solo lo descarga quien abre un estudio, pero
            // cuando lo abre llega entero: en su propio paquete para que no
            // arrastre al resto de la aplicación.
            if (id.includes('@cornerstonejs')) return 'vendor-cornerstone'
            // Atlas Neuro 3D (tramo C): three.js sólo lo descarga quien abre el
            // atlas, y llega en un solo paquete aparte.
            if (/[\/]node_modules[\/]three[\/]/.test(id)) return 'vendor-three'
            return undefined
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Only pick up our unit tests, not CoreUI template files.
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      css: false,
    },
    css: {
      postcss: {
        plugins: [
          autoprefixer({}), // add options if needed
        ],
      },
    },
    define: {
      __CORTEX_VERSION__: JSON.stringify(version),
    },
    // El cargador DICOM crea sus propios workers con `new Worker(new URL(...))`.
    // Si Vite lo pre-empaqueta, la URL del worker se rompe y el visor no
    // decodifica nada: se excluye del optimizador y se dejan los workers en ESM.
    //
    // Pero al excluirlo, sus códecs —`@cornerstonejs/codec-*` son CommonJS y el
    // cargador los importa con `import factory from '.../decodewasmjs'`— también
    // quedaban fuera: Vite los servía tal cual, sin `default`, y el visor moría
    // con «does not provide an export named 'default'». Se pre-empaquetan sólo
    // ellos, que es lo que los convierte a ESM con su export por omisión.
    //
    // Solo para servir y compilar: dentro de vitest estas dos opciones no hacen
    // falta y volvían la suite tres veces más lenta (las pruebas de otras
    // pantallas empezaban a agotar su tiempo de espera).
    ...(process.env.VITEST
      ? {}
      : {
          optimizeDeps: {
            exclude: ['@cornerstonejs/dicom-image-loader'],
            // Los códecs, más los ayudantes CommonJS que también viajan detrás
            // del cargador: al no pre-empaquetarlos, Vite los sirve crudos y
            // mueren con «no exporta `default`» (los códecs) o con «no se puede
            // leer `zlib` de undefined» (`dicom-parser`, un UMD que en modo
            // módulo pierde `this`).
            include: [
              '@cornerstonejs/codec-charls/decodewasmjs',
              '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
              '@cornerstonejs/codec-libjxl/decodewasmjs',
              '@cornerstonejs/codec-openjpeg/decodewasmjs',
              '@cornerstonejs/codec-openjph/wasmjs',
              '@cornerstonejs/jpeg-lossless-decoder-js',
              'dicom-parser',
              'pako',
            ],
          },
          worker: {
            format: 'es' as const,
          },
        }),
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: 'src/',
          replacement: `${path.resolve(__dirname, 'src')}/`,
        },
      ],
      extensions: ['.mjs', '.mts', '.js', '.ts', '.jsx', '.tsx', '.json', '.scss'],
    },
    server: {
      // 3010 y no 3000: Cortex corre junto a GEMS en la misma máquina.
      port: 3010,
      proxy: {
        // https://vitejs.dev/config/server-options.html
      },
    },
  }
})
