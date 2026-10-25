import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'

// Archivos que NO se precargan al instalar el service worker: se guardan en caché la primera vez que se usan
// (WASM de IA/OCR, modelos y fragmentos muy grandes).
const LAZY_RE = /\.(wasm|onnx|task|tflite|traineddata|data|bin)$/i
const LAZY_BYTES = 500_000

/**
 * Escribe `precache-manifest.json` con los archivos de `assets/` del build (con hash) para que `public/sw.js`
 * precargue el «app shell». Los pesados quedan en `lazy` (caché bajo demanda, cache-first).
 */
function precacheManifest(): Plugin {
  return {
    name: 'medisuite-precache-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const assets: string[] = []
      const lazy: string[] = []
      for (const [fileName, out] of Object.entries(bundle)) {
        if (!fileName.startsWith('assets/')) continue
        const size = out.type === 'chunk' ? Buffer.byteLength(out.code) : typeof out.source === 'string' ? Buffer.byteLength(out.source) : out.source.byteLength
        if (fileName.endsWith('.map')) continue
        ;(LAZY_RE.test(fileName) || size > LAZY_BYTES ? lazy : assets).push(fileName)
      }
      assets.sort()
      lazy.sort()
      const version = createHash('sha256').update(JSON.stringify([assets, lazy])).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify({ version, assets, lazy }, null, 1) })
    },
  }
}

// base relativa: la app funciona en cualquier subruta (Vercel, Netlify, GitHub Pages, artifact)
// Identificador del build: registra un service worker nuevo en cada despliegue (sw.js?v=…)
const BUILD_ID = process.env.MEDISUITE_BUILD_ID || Date.now().toString(36)

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), tailwindcss(), precacheManifest()],
  build: { chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
})
