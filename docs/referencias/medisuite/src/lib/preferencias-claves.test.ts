// Toda clave literal de usePreferencia/leerPreferencia debe cumplir el alfabeto del servidor (si no, el API responde 400).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PREF_CLAVE_RE } from './preferencias'

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f)
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : []
  })
}

describe('claves de preferencias', () => {
  it('las claves literales cumplen [a-z0-9._-]{1,64}', () => {
    const malas: string[] = []
    let total = 0
    for (const f of archivos(path.resolve(__dirname, '..'))) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/(?:usePreferencia|leerPreferencia)(?:<[^>(]*>)?\(\s*'([^']+)'/g)) {
        total++
        if (!PREF_CLAVE_RE.test(m[1])) malas.push(`${path.relative(process.cwd(), f)}: ${m[1]}`)
      }
    }
    expect(total).toBeGreaterThan(5)
    expect(malas).toEqual([])
  })
})
