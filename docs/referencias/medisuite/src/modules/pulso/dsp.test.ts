import { describe, expect, it } from 'vitest'
import { analizar, estimarFC, fft, mediana, pasaBanda, remuestrear, type Muestra } from './dsp'

/** Muestras RGB de piel sintéticas: pulso con firma de color realista + variación de iluminación + ruido,
 *  a ~30 fps con jitter (como requestVideoFrameCallback). */
function piel(bpm: number, segundos: number, { mov = 0.05, ruido = 0.002, jitter = true, seed = 3 } = {}): Muestra[] {
  let s = seed
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const out: Muestra[] = []
  const f = bpm / 60
  for (let t = 0; t < segundos * 1000; t += jitter ? (1000 / 30) * (0.8 + 0.4 * r()) : 1000 / 30) {
    const ts = t / 1000, p = Math.sin(2 * Math.PI * f * ts), I = 1 + mov * Math.sin(2 * Math.PI * 0.25 * ts)
    out.push({
      t,
      r: 180 * I * (1 + 0.0033 * p) + ruido * 180 * (r() - 0.5),
      g: 120 * I * (1 + 0.0077 * p) + ruido * 120 * (r() - 0.5),
      b: 90 * I * (1 + 0.0053 * p) + ruido * 90 * (r() - 0.5),
    })
  }
  return out
}

describe('rPPG (POS) de punta a punta', () => {
  it.each([50, 72, 100, 140])('%i lpm', (bpm) => {
    const a = analizar(piel(bpm, 20))!
    expect(Math.abs(a.bpm - bpm)).toBeLessThan(1.5)
    expect(a.sqi).toBeGreaterThan(0.9)
  })
  it('resiste cambios de iluminación grandes (POS cancela la intensidad)', () => {
    const a = analizar(piel(80, 20, { mov: 0.3 }))!
    expect(Math.abs(a.bpm - 80)).toBeLessThan(2)
  })
  it('menos de 4 s de señal → null', () => {
    expect(analizar(piel(72, 3))).toBeNull()
    expect(analizar([])).toBeNull()
  })
})

describe('bloques DSP', () => {
  it('FFT de un coseno y su inversa', () => {
    const re = new Float64Array(8), im = new Float64Array(8)
    for (let i = 0; i < 8; i++) re[i] = Math.cos((2 * Math.PI * i) / 8)
    const orig = Array.from(re)
    fft(re, im)
    expect(re[1]).toBeCloseTo(4, 9)
    expect(re[7]).toBeCloseTo(4, 9)
    for (const k of [0, 2, 3, 4, 5, 6]) expect(Math.abs(re[k])).toBeLessThan(1e-9)
    fft(re, im, true)
    orig.forEach((v, i) => expect(re[i]).toBeCloseTo(v, 9))
  })
  it('remuestreo lineal a frecuencia fija', () => {
    const r = remuestrear([{ t: 0, r: 0, g: 0, b: 0 }, { t: 1000, r: 10, g: 20, b: 30 }], 4)
    expect(r).toEqual([[0, 2.5, 5, 7.5], [0, 5, 10, 15], [0, 7.5, 15, 22.5]])
    expect(remuestrear([{ t: 0, r: 1, g: 1, b: 1 }], 30)).toEqual([[], [], []])
  })
  it('pasa-banda elimina deriva y ruido alto; estimarFC encuentra 1.5 Hz', () => {
    const x = Array.from({ length: 300 }, (_, i) => Math.sin((2 * Math.PI * 1.5 * i) / 30) + 3 * Math.sin((2 * Math.PI * 0.1 * i) / 30) + Math.sin((2 * Math.PI * 8 * i) / 30))
    const e = estimarFC(pasaBanda(x, 30), 30)
    expect(e.bpm).toBeCloseTo(90, 0)
    expect(e.sqi).toBeGreaterThan(0.9)
  })
  it('mediana', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 2, 3])).toBe(2.5)
    expect(mediana([])).toBeNaN()
  })
})
