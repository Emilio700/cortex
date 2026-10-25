import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    // Una sola base de datos compartida: los archivos se ejecutan en serie.
    fileParallelism: false,
  },
})
