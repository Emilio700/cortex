// PATCH con null (v1.1), sincronización incremental y utilidades de preferencias/contraseñas.
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('fetch', () => Promise.reject(new Error('sin red en pruebas')))
const { patchBody, applyDelta } = await import('./store')
const { claveSegura } = await import('./preferencias')
const { fuerzaPassword } = await import('../components/PasswordStrength')

describe('patchBody (PATCH null)', () => {
  it('convierte en null los campos que se vaciaron y tenían valor', () => {
    expect(patchBody('patients', { telefono: undefined, email: 'a@b.mx' }, { telefono: '5512345678' })).toEqual({ telefono: null, email: 'a@b.mx' })
  })
  it('no envía null para campos que ya estaban vacíos', () => {
    expect(patchBody('patients', { telefono: undefined, curp: undefined, nombre: 'Ana' }, { nombre: 'Ana' })).toEqual({ nombre: 'Ana' })
  })
  it('nunca envía el id y respeta las reglas de documentos', () => {
    expect(patchBody('documents', { id: 'x', nombre: 'n', meta: undefined, tipo: 'otro' }, { meta: { a: 1 } })).toEqual({ nombre: 'n', meta: null })
  })
})

describe('applyDelta (?desde=)', () => {
  const a = { id: 'a', v: 1 }
  const b = { id: 'b', v: 1 }
  it('agrega, reemplaza y quita (eliminado:true)', () => {
    const out = applyDelta([a, b], [{ id: 'a', v: 2 }, { id: 'b', eliminado: true }, { id: 'c', v: 1 }], () => false)
    expect(out).toEqual([{ id: 'a', v: 2 }, { id: 'c', v: 1 }])
  })
  it('es idempotente (traslape de 5 s) y conserva la identidad si no hay cambios', () => {
    const local = [a, b]
    expect(applyDelta(local, [{ id: 'a', v: 1 }], () => false)).toBe(local)
    expect(applyDelta(local, [{ id: 'z', eliminado: true }], () => false)).toBe(local)
  })
  it('no toca registros con escrituras locales pendientes', () => {
    expect(applyDelta([a], [{ id: 'a', eliminado: true }], (id) => id === 'a')).toEqual([a])
  })
})

describe('claveSegura', () => {
  it('deja intactos los ids válidos y normaliza los demás sin colisiones', () => {
    expect(claveSegura('p1abc')).toBe('p1abc')
    expect(claveSegura('P1ABC')).not.toBe(claveSegura('p1abc'))
    expect(claveSegura('P1ABC')).toMatch(/^[a-z0-9._-]+$/)
    expect(claveSegura('x'.repeat(64)).length).toBeLessThanOrEqual(40)
  })
})

describe('fuerzaPassword', () => {
  it('califica de débil a muy fuerte', () => {
    expect(fuerzaPassword('corta').score).toBeLessThanOrEqual(1)
    expect(fuerzaPassword('password1234').score).toBeLessThanOrEqual(1)
    expect(fuerzaPassword('Caballo Bateria Grapa 2026!').score).toBe(4)
  })
})
