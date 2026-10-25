#!/usr/bin/env node
// Genera src/demo/seed.gen.ts empaquetando el seed del frontend (src/lib/seed.ts y los demo.ts de los módulos)
// en un único archivo autocontenido, para que los datos de SEED_DEMO del servidor no se desincronicen.
//   node scripts/gen-seed.mjs          → regenera (si el frontend no está presente, p. ej. en Docker, no hace nada)
//   node scripts/gen-seed.mjs --check  → falla si el archivo versionado difiere del que se generaría
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = resolve(apiDir, '..')
const entry = resolve(rootDir, 'src/lib/seed.ts')
const out = resolve(apiDir, 'src/demo/seed.gen.ts')
const check = process.argv.includes('--check')

if (!existsSync(entry)) {
  if (check) {
    console.error(`gen-seed: no se encontró ${entry}; no se puede verificar.`)
    process.exit(1)
  }
  console.log('gen-seed: frontend ausente; se usa el seed.gen.ts versionado.')
  process.exit(0)
}

// Import diferido: en Docker (sin frontend) no hace falta esbuild.
const { build } = await import('esbuild')
const res = await build({
  stdin: { contents: "export { seedDB as __seedDB } from './src/lib/seed.ts'", resolveDir: rootDir, sourcefile: 'seed-entry.ts', loader: 'ts' },
  absWorkingDir: rootDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2023',
  write: false,
  metafile: true,
  legalComments: 'none',
  resolveExtensions: ['.ts', '.js'],
  charset: 'utf8',
  logLevel: 'silent',
})

// El seed debe ser código puro: nada de dependencias npm ni del store/navegador.
const prohibidos = Object.keys(res.metafile.inputs).filter((f) => f.includes('node_modules') || /src\/lib\/(store|registros|api|db)\b/.test(f))
if (prohibidos.length) {
  console.error('gen-seed: el seed importa módulos no permitidos (usa solo código puro en demo.ts):\n  ' + prohibidos.join('\n  '))
  process.exit(1)
}

const m = /export \{\s*(\w+) as __seedDB\s*\};\s*$/.exec(res.outputFiles[0].text)
if (!m) {
  console.error('gen-seed: no se encontró la exportación de seedDB en el paquete generado.')
  process.exit(1)
}
const body = res.outputFiles[0].text.slice(0, m.index)
const contenido = `// @ts-nocheck
// ARCHIVO GENERADO por api/scripts/gen-seed.mjs a partir de src/lib/seed.ts — NO EDITAR A MANO.
// Regenerar: (cd api && npm run gen:seed). Verificar: npm run check:seed.
// Entradas: ${Object.keys(res.metafile.inputs).filter((f) => f !== 'seed-entry.ts').sort().join(', ')}
${body}
import type { DB } from './types.js'
/** Datos sintéticos de demostración (idénticos a los del modo demo del frontend). */
const __seedTipado: () => DB = ${m[1]} as unknown as () => DB
export { __seedTipado as seedDB }
`

const actual = existsSync(out) ? readFileSync(out, 'utf8') : ''
if (check) {
  if (actual !== contenido) {
    console.error(`gen-seed: ${relative(rootDir, out)} está desactualizado. Ejecuta: cd api && npm run gen:seed`)
    process.exit(1)
  }
  console.log('gen-seed: seed.gen.ts al día.')
} else if (actual !== contenido) {
  writeFileSync(out, contenido)
  console.log(`gen-seed: escrito ${relative(rootDir, out)} (${contenido.length} bytes).`)
}
