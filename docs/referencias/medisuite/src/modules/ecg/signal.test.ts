import { describe, expect, it } from 'vitest'
import { PRESETS, generate, hrv, panTompkins, parseCSV, toCSV, type Preset } from './signal'

/** Sensibilidad y falsos positivos contra los latidos verdaderos del generador (tolerancia ±50 ms). */
function evaluar(preset: Preset, noise: number, fs: number, seconds = 30) {
  const p = PRESETS[preset]
  const s = generate({ preset, hr: p.hr, hrv: p.hrv, noise, seconds, fs, twelve: false, seed: 7 })
  const { peaks } = panTompkins(s.leads[0].data, fs)
  const truth = s.truth.map((t) => Math.round(t * fs))
  const tol = Math.round(0.05 * fs)
  const usados = new Set<number>()
  let tp = 0
  for (const t of truth) {
    const m = peaks.find((q) => Math.abs(q - t) <= tol && !usados.has(q))
    if (m !== undefined) {
      tp++
      usados.add(m)
    }
  }
  return { truth: truth.length, tp, fp: peaks.length - tp, peaks }
}

describe('Pan-Tompkins sobre ECG sintético', () => {
  const casos: [Preset, number, number][] = []
  for (const preset of Object.keys(PRESETS) as Preset[]) for (const noise of [0, 1, 2]) for (const fs of [250, 500]) casos.push([preset, noise, fs])
  it.each(casos)('%s ruido=%d fs=%d: detecta todos los QRS sin falsos positivos', (preset, noise, fs) => {
    const r = evaluar(preset, noise, fs)
    expect(r.truth).toBeGreaterThan(20)
    expect(r.tp).toBe(r.truth)
    expect(r.fp).toBe(0)
  })
  it('señal menor a 1 s no produce picos', () => {
    expect(panTompkins(new Float32Array(100), 250).peaks).toEqual([])
  })
  it('línea plana no produce picos', () => {
    expect(panTompkins(new Float32Array(2500), 250).peaks.length).toBeLessThanOrEqual(1)
  })
})

describe('VFC', () => {
  const fc = (preset: Preset) => {
    const p = PRESETS[preset]
    const s = generate({ preset, hr: p.hr, hrv: p.hrv, noise: 1, seconds: 60, fs: 250, twelve: false, seed: 3 })
    return hrv(panTompkins(s.leads[0].data, 250).peaks, 250)!
  }
  it('frecuencia y regularidad por ritmo', () => {
    const sin = fc('sinusal'), taq = fc('taquicardia'), bra = fc('bradicardia'), fa = fc('fa'), ext = fc('extrasistoles')
    expect(sin.hr).toBeCloseTo(72, 0)
    expect(sin.flags.map((f) => f.tone)).toEqual(['ok', 'ok'])
    expect(taq.hr).toBeGreaterThan(100)
    expect(taq.flags[0].text).toMatch(/Taquicardia/)
    expect(bra.hr).toBeLessThan(60)
    expect(bra.flags[0].text).toMatch(/Bradicardia/)
    expect(fa.flags[1].tone).toBe('danger')
    expect(ext.flags[1].tone).toBe('danger')
  })
  it('métricas con RR conocidos', () => {
    // RR: 1000, 800, 1000, 800 ms a fs=1000
    const h = hrv([0, 1000, 1800, 2800, 3600], 1000)!
    expect(h.rr).toEqual([1000, 800, 1000, 800])
    expect(h.meanRR).toBe(900)
    expect(h.hr).toBeCloseTo(66.67, 2)
    expect(h.rmssd).toBe(200)
    expect(h.pnn50).toBe(100)
    expect(h.sdnn).toBeCloseTo(Math.sqrt((4 * 100 ** 2) / 3), 6)
  })
  it('menos de 2 intervalos válidos → null', () => {
    expect(hrv([0, 250], 250)).toBeNull()
    expect(hrv([0, 10, 20], 250)).toBeNull() // RR < 250 ms se descartan
  })
})

describe('12 derivaciones', () => {
  const s = generate({ preset: 'sinusal', hr: 72, hrv: 40, noise: 0.5, seconds: 5, fs: 250, twelve: true, seed: 1 })
  const L = Object.fromEntries(s.leads.map((l) => [l.name, l.data]))
  it('orden estándar', () => {
    expect(s.leads.map((l) => l.name)).toEqual(['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'])
  })
  it('Einthoven (III = II − I) y Goldberger (aVR + aVL + aVF = 0)', () => {
    let e1 = 0, e2 = 0
    for (let i = 0; i < L.I.length; i++) {
      e1 = Math.max(e1, Math.abs(L.III[i] - (L.II[i] - L.I[i])))
      e2 = Math.max(e2, Math.abs(L.aVR[i] + L.aVL[i] + L.aVF[i]))
    }
    expect(e1).toBeLessThan(1e-5)
    expect(e2).toBeLessThan(1e-5)
  })
  it('es determinista con la misma semilla', () => {
    const b = generate({ preset: 'sinusal', hr: 72, hrv: 40, noise: 0.5, seconds: 5, fs: 250, twelve: true, seed: 1 })
    expect(Array.from(b.leads[1].data)).toEqual(Array.from(L.II))
  })
})

describe('CSV', () => {
  it('toCSV → parseCSV ida y vuelta con columna de tiempo', () => {
    const s = generate({ preset: 'sinusal', hr: 72, hrv: 40, noise: 0.5, seconds: 4, fs: 250, twelve: false, seed: 1 })
    const p = parseCSV(toCSV(s))
    expect(p.names).toEqual(['tiempo_s', 'II'])
    expect(p.timeCol).toBe(0)
    expect(p.fsGuess).toBe(250)
    expect(p.cols[1].length).toBe(1000)
    expect(p.cols[1][123]).toBeCloseTo(s.leads[0].data[123], 3)
  })
  it('punto y coma, tiempo en ms y comentarios', () => {
    const filas = Array.from({ length: 20 }, (_, i) => `${i * 2};${Math.sin(i)};${Math.cos(i)}`)
    const p = parseCSV(['# exportado por equipo', 'ms;V1;V2', ...filas].join('\n'))
    expect(p.names).toEqual(['ms', 'V1', 'V2'])
    expect(p.fsGuess).toBe(500)
  })
  it('sin encabezado y una sola columna', () => {
    const p = parseCSV(Array.from({ length: 15 }, (_, i) => String(i % 3)).join('\n'))
    expect(p.names).toEqual(['Canal 1'])
    expect(p.timeCol).toBe(-1)
    expect(p.cols[0].length).toBe(15)
  })
  it('errores claros', () => {
    expect(() => parseCSV('')).toThrow(/vacío/)
    expect(() => parseCSV('a,b\n1,2\n3,4')).toThrow(/suficientes filas/)
  })
})
