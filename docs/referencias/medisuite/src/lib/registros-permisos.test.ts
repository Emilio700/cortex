import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REGISTROS_PERMISOS, REGISTRO_INFO, permisoRegistro } from './registros-permisos'

/** Lee la matriz del backend (api/src/permissions.ts) sin importarla (otro proyecto TypeScript). */
function matrizBackend(): Record<string, { read: string[]; write: string[] }> {
  const src = readFileSync(new URL('../../api/src/permissions.ts', import.meta.url), 'utf8')
  const ini = src.indexOf('const ROLES_TODOS')
  const fin = src.indexOf('\n}\n', src.indexOf('export const REGISTROS_PERMISOS')) + 2
  const js = src
    .slice(ini, fin)
    .replace(/export /g, '')
    .replace(/: Record<string, \{ read: Rol\[\]; write: Rol\[\] \}>/, '')
    .replace(/: Rol\[\]/g, '')
  return new Function(js + '\nreturn REGISTROS_PERMISOS')()
}

describe('matriz de permisos de registros', () => {
  it('coincide con la del servidor', () => {
    const back = matrizBackend()
    expect(Object.keys(back).length).toBeGreaterThan(10)
    const norm = (m: Record<string, { read: string[]; write: string[] }>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { read: [...v.read].sort(), write: [...v.write].sort() }]))
    expect(norm(REGISTROS_PERMISOS)).toEqual(norm(back))
  })
  it('reglas clave', () => {
    expect(permisoRegistro('recepcion', 'prenatal', 'read')).toBe(false)
    expect(permisoRegistro('admin', 'vacuna', 'read')).toBe(true)
    expect(permisoRegistro('admin', 'vacuna', 'write')).toBe(false)
    expect(permisoRegistro('enfermeria', 'certificado', 'write')).toBe(false)
    expect(permisoRegistro('medico', 'certificado', 'write')).toBe(true)
    expect(permisoRegistro('recepcion', 'inventario', 'read')).toBe(true)
    expect(permisoRegistro('recepcion', 'inventario', 'write')).toBe(false)
    expect(permisoRegistro('recepcion', 'tarea', 'write')).toBe(true)
    expect(permisoRegistro('enfermeria', 'encuesta', 'read')).toBe(false)
    expect(permisoRegistro('medico', 'desconocido', 'read')).toBe(false)
    expect(permisoRegistro('medico', 'toString', 'read')).toBe(false)
  })
  it('cada tipo tiene etiqueta y ruta', () => {
    for (const t of Object.keys(REGISTROS_PERMISOS)) expect(REGISTRO_INFO[t]?.ruta).toMatch(/^\//)
  })
})
