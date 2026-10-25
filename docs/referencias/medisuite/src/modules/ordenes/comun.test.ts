import { describe, expect, it } from 'vitest'
import { canonico, diasTranscurridos, sha256Hex, siguienteFolio, telWhatsApp } from './comun'

describe('siguienteFolio', () => {
  it('inicia en 000001 y sigue el máximo existente', () => {
    expect(siguienteFolio('OR', [])).toBe('OR-000001')
    expect(siguienteFolio('OR', ['OR-000003', 'OR-000010', 'CM-000099', undefined, 'basura'])).toBe('OR-000011')
  })
  it('no confunde prefijos parecidos', () => {
    expect(siguienteFolio('CM', ['CMX-000050', 'CM-000002'])).toBe('CM-000003')
  })
})

describe('sha256Hex (vectores FIPS 180-4 / NIST)', () => {
  it('cadena vacía', () => expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'))
  it('"abc"', () => expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'))
  it('mensaje de 448 bits (dos bloques)', () =>
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'))
  it('UTF-8', () => expect(sha256Hex('ñ')).toBe(sha256Hex('ñ')))
})

describe('canonico', () => {
  it('ordena claves y omite undefined', () => {
    expect(canonico({ b: 1, a: { d: [1, undefined], c: 'x' }, z: undefined })).toBe('{"a":{"c":"x","d":[1,null]},"b":1}')
  })
})

describe('otros', () => {
  it('telWhatsApp agrega 52 a números de 10 dígitos', () => {
    expect(telWhatsApp('55 1234 5678')).toBe('525512345678')
    expect(telWhatsApp('+52 55 1234 5678')).toBe('525512345678')
  })
  it('diasTranscurridos', () => {
    const t = Date.parse('2026-01-10T12:00:00Z')
    expect(diasTranscurridos('2026-01-01T12:00:00Z', t)).toBe(9)
    expect(diasTranscurridos('2026-02-01T12:00:00Z', t)).toBe(0)
  })
})
