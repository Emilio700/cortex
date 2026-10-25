import { describe, expect, it } from 'vitest'
import { RAICES } from './columna'
import {
  ALTO_SILUETA,
  ANCHO_SILUETA,
  CONTORNO,
  DERMATOMAS,
  dermatomaDeRaiz,
  reflejar,
  reflejarPara,
  sinDermatoma,
} from './dermatomas'

describe('dermatomas', () => {
  it('hay uno por raíz de C2 a S3, más S4-S5 juntos como en la hoja de ASIA', () => {
    const esperados = RAICES.map((r) => r.id).filter((id) => !['C1', 'S4', 'S5', 'Co'].includes(id))
    expect(DERMATOMAS.map((d) => d.id)).toEqual([...esperados, 'S4-S5'])
  })

  it('cada uno tiene zona, punto clave y al menos una región dentro de la silueta', () => {
    for (const d of DERMATOMAS) {
      expect(d.zona.trim(), d.id).not.toBe('')
      expect(d.puntoClave.trim(), d.id).not.toBe('')
      const poligonos = [...(d.regiones.anterior ?? []), ...(d.regiones.posterior ?? [])]
      expect(poligonos.length, d.id).toBeGreaterThan(0)
      for (const p of poligonos) {
        expect(p.length, d.id).toBeGreaterThanOrEqual(3)
        for (const [x, y] of p) {
          // Se dibujan en la mitad izquierda de la imagen; la otra se refleja.
          expect(x, d.id).toBeGreaterThanOrEqual(0)
          expect(x, d.id).toBeLessThanOrEqual(ANCHO_SILUETA / 2)
          expect(y, d.id).toBeGreaterThanOrEqual(0)
          expect(y, d.id).toBeLessThanOrEqual(ALTO_SILUETA)
        }
      }
      const vista = d.regiones[d.punto.vista]
      expect(d.punto.x, d.id).toBeLessThanOrEqual(ANCHO_SILUETA / 2)
      expect(vista ?? d.regiones.anterior ?? d.regiones.posterior, d.id).toBeDefined()
    }
  })

  it('los puntos clave de ASIA que más se usan en la consulta', () => {
    expect(dermatomaDeRaiz('C6')!.puntoClave).toMatch(/pulgar/)
    expect(dermatomaDeRaiz('C7')!.puntoClave).toMatch(/dedo medio/)
    expect(dermatomaDeRaiz('C8')!.puntoClave).toMatch(/meñique/)
    expect(dermatomaDeRaiz('T4')!.puntoClave).toMatch(/pezón/)
    expect(dermatomaDeRaiz('T10')!.puntoClave).toMatch(/ombligo/)
    expect(dermatomaDeRaiz('L4')!.puntoClave).toMatch(/[Mm]aléolo interno/)
    expect(dermatomaDeRaiz('L5')!.puntoClave).toMatch(/tercera articulación metatarsofalángica/)
    expect(dermatomaDeRaiz('S1')!.puntoClave).toMatch(/talón/)
  })

  it('S4 y S5 comparten dermatoma; C1 y la coccígea lo explican en vez de pintar nada', () => {
    expect(dermatomaDeRaiz('S4')!.id).toBe('S4-S5')
    expect(dermatomaDeRaiz('S5')!.id).toBe('S4-S5')
    expect(dermatomaDeRaiz('C1')).toBeUndefined()
    expect(sinDermatoma('C1')).toMatch(/motora/)
    expect(sinDermatoma('Co')).toMatch(/ASIA/)
    expect(sinDermatoma('L5')).toBeNull()
  })

  it('el lado derecho se ve a la izquierda de la imagen de frente, y a la derecha por detrás', () => {
    expect(reflejarPara('anterior', 'derecho')).toBe(false)
    expect(reflejarPara('anterior', 'izquierdo')).toBe(true)
    expect(reflejarPara('posterior', 'izquierdo')).toBe(false)
    expect(reflejarPara('posterior', 'derecho')).toBe(true)
    expect(reflejar([[10, 5]])).toEqual([[190, 5]])
  })

  it('el contorno es simétrico y cerrado sobre la línea media', () => {
    const n = CONTORNO.length
    expect(n % 2).toBe(0)
    for (let i = 0; i < n / 2; i++) {
      const [x1, y1] = CONTORNO[i]
      const [x2, y2] = CONTORNO[n - 1 - i]
      expect(x1 + x2).toBe(ANCHO_SILUETA)
      expect(y1).toBe(y2)
    }
  })
})
