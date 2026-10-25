// Configuración de Vite para las pruebas E2E en modo servidor: la del proyecto + proxy /api a la API real.
// changeOrigin: false — la API compara Origin con Host en peticiones que modifican (si cambia el Host → 403).
// cacheDir propio para no chocar con otro `vite` corriendo en el mismo proyecto.
import { mergeConfig } from 'vite'
import base from '../vite.config.ts'

const apiPort = process.env.E2E_API_PORT ?? '3998'

export default mergeConfig(base, {
  cacheDir: process.env.E2E_VITE_CACHE ?? 'node_modules/.vite-e2e',
  clearScreen: false,
  server: {
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
})
