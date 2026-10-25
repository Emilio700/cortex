// Pruebas unitarias del frontend (lógica pura). La API tiene su propia configuración en api/.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Fechas deterministas en pruebas que usan la zona horaria local.
    env: { TZ: 'America/Mexico_City' },
  },
})
