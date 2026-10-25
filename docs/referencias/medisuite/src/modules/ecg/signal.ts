// ECG: generador sintético (suma de gaussianas por latido, estilo ECGSYN simplificado),
// detector de picos R Pan-Tompkins, métricas de VFC y lector de CSV/TXT.

export interface Lead { name: string; data: Float32Array }
export interface Signal { fs: number; leads: Lead[]; source: string }

export const LEADS12 = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']

export type Preset = 'sinusal' | 'taquicardia' | 'bradicardia' | 'fa' | 'extrasistoles'
export const PRESETS: Record<Preset, { label: string; hr: number; hrv: number }> = {
  sinusal: { label: 'Ritmo sinusal', hr: 72, hrv: 40 },
  taquicardia: { label: 'Taquicardia sinusal', hr: 125, hrv: 8 },
  bradicardia: { label: 'Bradicardia sinusal', hr: 48, hrv: 35 },
  fa: { label: 'Fibrilación auricular', hr: 95, hrv: 0 },
  extrasistoles: { label: 'Extrasístoles ventriculares', hr: 75, hrv: 25 },
}

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())
}

// Multiplicadores por derivación para [P, Q, R, S, T]; III, aVR, aVL, aVF se derivan de I y II (Einthoven/Goldberger).
const MULT: Record<string, number[]> = {
  I: [0.6, 0.5, 0.7, 0.3, 0.6],
  II: [1, 0.6, 1.2, 0.4, 0.9],
  V1: [0.5, 0, 0.3, 1.6, -0.25],
  V2: [0.6, 0, 0.6, 1.8, 0.8],
  V3: [0.6, 0.2, 1.0, 1.2, 0.9],
  V4: [0.6, 0.4, 1.5, 0.8, 1.0],
  V5: [0.6, 0.5, 1.4, 0.4, 0.8],
  V6: [0.6, 0.5, 1.1, 0.2, 0.7],
}

interface Beat { t: number; rr: number; ectopic: boolean }

export function generate(opts: { preset: Preset; hr: number; hrv: number; noise: number; seconds: number; fs?: number; twelve: boolean; seed?: number }): Signal & { truth: number[] } {
  const fs = opts.fs ?? 500
  const N = Math.round(opts.seconds * fs)
  const r = rng(opts.seed ?? 12345)
  const mean = 60 / opts.hr
  const sd = opts.hrv / 1000
  // serie RR
  const beats: Beat[] = []
  let t = 0.35
  let k = 0
  while (t < opts.seconds + 1) {
    let rr: number
    let ectopic = false
    if (opts.preset === 'fa') rr = mean * (0.55 + 0.9 * r())
    else {
      rr = mean + sd * (0.9 * Math.sin(2 * Math.PI * 0.25 * t) + 0.6 * Math.sin(2 * Math.PI * 0.1 * t + 1) + 0.5 * gauss(r)) / 1.2
      if (opts.preset === 'extrasistoles' && k > 2 && r() < 0.14 && !beats[beats.length - 1]?.ectopic) ectopic = true
    }
    if (ectopic) {
      beats.push({ t: t - mean + mean * 0.6, rr: mean * 0.6, ectopic: true }) // prematuro
      t += mean * 2 - mean // pausa compensadora completa: siguiente sinusal a 2·RR del previo
      k++
      continue
    }
    beats.push({ t, rr: Math.max(0.25, rr), ectopic })
    t += Math.max(0.25, rr)
    k++
  }
  const names = opts.twelve ? ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] : ['II']
  const base: Record<string, Float32Array> = {}
  for (const name of names) base[name] = new Float32Array(N)
  for (const b of beats) {
    const q = Math.sqrt(Math.min(1.6, Math.max(0.35, b.rr)))
    // [centro s, sigma s, amplitud mV]
    const waves: number[][] = b.ectopic
      ? [
          [0, 0, 0],
          [-0.04, 0.02, -0.15],
          [0, 0.03, 1.5],
          [0.06, 0.03, -0.5],
          [0.3 * q, 0.07, -0.45],
        ]
      : [
          [-0.16, 0.025, opts.preset === 'fa' ? 0 : 0.13],
          [-0.035, 0.01, -0.1],
          [0, 0.011, 1.1],
          [0.035, 0.012, -0.25],
          [0.27 * q, 0.055, 0.3],
        ]
    const i0 = Math.max(0, Math.floor((b.t - 0.4) * fs)), i1 = Math.min(N, Math.ceil((b.t + 0.7) * fs))
    for (const name of names) {
      const m = MULT[name], d = base[name]
      for (let i = i0; i < i1; i++) {
        const tt = i / fs - b.t
        let v = 0
        for (let w = 0; w < 5; w++) {
          const [c, s, a] = waves[w]
          if (!a) continue
          // en ectópicos el vector se invierte en precordiales derechas
          const mul = b.ectopic && (name === 'V1' || name === 'V2') ? -m[w] : m[w]
          const z = (tt - c) / s
          if (z > -5 && z < 5) v += a * mul * Math.exp(-0.5 * z * z)
        }
        d[i] += v
      }
    }
  }
  // ruido: línea base (respiración), 60 Hz, ruido blanco; fibrilación auricular: ondas f
  const ph = Array.from({ length: 6 }, () => r() * Math.PI * 2)
  for (const name of names) {
    const d = base[name]
    const g = rng(name.charCodeAt(0) * 31 + name.length)
    for (let i = 0; i < N; i++) {
      const tt = i / fs
      let n = opts.noise * (0.15 * Math.sin(2 * Math.PI * 0.3 * tt + ph[0]) + 0.02 * Math.sin(2 * Math.PI * 60 * tt) + 0.025 * gauss(g))
      if (opts.preset === 'fa') n += 0.05 * (Math.sin(2 * Math.PI * 5.7 * tt + ph[1]) + 0.7 * Math.sin(2 * Math.PI * 7.1 * tt + ph[2]) + 0.5 * Math.sin(2 * Math.PI * 4.3 * tt + ph[3]))
      d[i] += n
    }
  }
  let leads: Lead[]
  if (opts.twelve) {
    const I = base.I, II = base.II
    const derive = (f: (a: number, b: number) => number) => {
      const o = new Float32Array(N)
      for (let i = 0; i < N; i++) o[i] = f(I[i], II[i])
      return o
    }
    const all: Record<string, Float32Array> = {
      ...base,
      III: derive((a, b) => b - a),
      aVR: derive((a, b) => -(a + b) / 2),
      aVL: derive((a, b) => a - b / 2),
      aVF: derive((a, b) => b - a / 2),
    }
    leads = LEADS12.map((n) => ({ name: n, data: all[n] }))
  } else leads = [{ name: 'II', data: base.II }]
  return { fs, leads, source: `Sintético · ${PRESETS[opts.preset].label}`, truth: beats.filter((b) => b.t < opts.seconds).map((b) => b.t) }
}

// ---------- filtros ----------
function biquad(x: Float32Array, b: number[], a: number[]): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = x[0], x2 = x[0], y1 = 0, y2 = 0
  // inicio en estado estacionario aproximado
  const dc = (b[0] + b[1] + b[2]) / (1 + a[1] + a[2])
  y1 = y2 = x[0] * dc
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    x2 = x1
    x1 = x[i]
    y2 = y1
    y1 = v
    y[i] = v
  }
  return y
}
function coeffs(type: 'lp' | 'hp', f: number, fs: number) {
  const w = (2 * Math.PI * f) / fs, cs = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2)
  const a0 = 1 + al
  const b = type === 'lp' ? [(1 - cs) / 2, 1 - cs, (1 - cs) / 2] : [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2]
  return { b: b.map((v) => v / a0), a: [1, (-2 * cs) / a0, (1 - al) / a0] }
}
/** Filtro de fase cero (adelante-atrás). */
export function filtfilt(x: Float32Array, type: 'lp' | 'hp', f: number, fs: number) {
  const { b, a } = coeffs(type, f, fs)
  const y = biquad(x, b, a).reverse()
  return biquad(y, b, a).reverse()
}
export function bandpass(x: Float32Array, lo: number, hi: number, fs: number) {
  return filtfilt(filtfilt(x, 'hp', lo, fs), 'lp', Math.min(hi, fs * 0.45), fs)
}

// ---------- Pan-Tompkins ----------
export interface Detection { peaks: number[]; mwi: Float32Array }

export function panTompkins(x: Float32Array, fs: number): Detection {
  const N = x.length
  if (N < fs) return { peaks: [], mwi: new Float32Array(N) }
  const bp = bandpass(x, 5, 15, fs)
  // derivada de 5 puntos (centrada), cuadrado
  const sq = new Float32Array(N)
  for (let i = 2; i < N - 2; i++) {
    const d = ((-bp[i - 2] - 2 * bp[i - 1] + 2 * bp[i + 1] + bp[i + 2]) * fs) / 8
    sq[i] = d * d
  }
  // integración en ventana móvil de 150 ms (centrada)
  const W = Math.max(1, Math.round(0.15 * fs)), h = W >> 1
  const mwi = new Float32Array(N)
  let acc = 0
  for (let i = 0; i < N + h; i++) {
    if (i < N) acc += sq[i]
    if (i - W >= 0) acc -= sq[i - W]
    if (i - h >= 0 && i - h < N) mwi[i - h] = acc / W
  }
  // picos locales candidatos (separación mínima 200 ms)
  const ref = Math.round(0.2 * fs)
  const cands: number[] = []
  for (let i = 1; i < N - 1; i++) {
    if (mwi[i] > mwi[i - 1] && mwi[i] >= mwi[i + 1]) {
      const last = cands[cands.length - 1]
      if (last !== undefined && i - last < ref) {
        if (mwi[i] > mwi[last]) cands[cands.length - 1] = i
      } else cands.push(i)
    }
  }
  // umbrales adaptativos (fase de aprendizaje: 2 s)
  const L = Math.min(N, 2 * fs)
  let mx = 0, mean = 0
  for (let i = 0; i < L; i++) (mx = Math.max(mx, mwi[i])), (mean += mwi[i] / L)
  let spki = 0.25 * mx, npki = 0.5 * mean
  const thr = () => npki + 0.25 * (spki - npki)
  const qrs: number[] = []
  const rrs: number[] = []
  const slope = (i: number) => {
    let m = 0
    for (let k = Math.max(1, i - Math.round(0.075 * fs)); k <= Math.min(N - 1, i); k++) m = Math.max(m, Math.abs(bp[k] - bp[k - 1]))
    return m
  }
  let lastSlope = 0
  for (let c = 0; c < cands.length; c++) {
    const i = cands[c], pk = mwi[i]
    const prev = qrs[qrs.length - 1]
    // búsqueda hacia atrás si falta un latido
    if (prev !== undefined && rrs.length >= 2) {
      const rrAvg = rrs.slice(-8).reduce((a, b) => a + b, 0) / Math.min(8, rrs.length)
      if (i - prev > 1.66 * rrAvg) {
        let best = -1
        for (let d = c - 1; d >= 0 && cands[d] > prev; d--) if (cands[d] - prev > ref && mwi[cands[d]] > 0.5 * thr() && (best < 0 || mwi[cands[d]] > mwi[best])) best = cands[d]
        if (best > 0) {
          qrs.push(best)
          rrs.push(best - prev)
          spki = 0.25 * mwi[best] + 0.75 * spki
        }
      }
    }
    const p2 = qrs[qrs.length - 1]
    if (pk > thr()) {
      // discriminación de onda T (< 360 ms y pendiente baja)
      if (p2 !== undefined && i - p2 < 0.36 * fs && slope(i) < 0.5 * lastSlope) {
        npki = 0.125 * pk + 0.875 * npki
        continue
      }
      if (p2 !== undefined) rrs.push(i - p2)
      qrs.push(i)
      lastSlope = slope(i)
      spki = 0.125 * pk + 0.875 * spki
    } else npki = 0.125 * pk + 0.875 * npki
  }
  // ubicar el pico R real en la señal filtrada (polaridad dominante)
  const win = Math.round(0.1 * fs)
  let pol = 0
  for (const q of qrs) {
    let bi = q
    for (let k = Math.max(0, q - win); k < Math.min(N, q + win); k++) if (Math.abs(bp[k]) > Math.abs(bp[bi])) bi = k
    pol += bp[bi]
  }
  const sgn = pol >= 0 ? 1 : -1
  const hp = filtfilt(x, 'hp', 0.5, fs)
  const peaks = qrs.map((q) => {
    let bi = q
    for (let k = Math.max(0, q - win); k < Math.min(N, q + win); k++) if (sgn * hp[k] > sgn * hp[bi]) bi = k
    return bi
  })
  return { peaks: [...new Set(peaks)].sort((a, b) => a - b), mwi }
}

// ---------- VFC ----------
export interface HRV { n: number; hr: number; rr: number[]; meanRR: number; sdnn: number; rmssd: number; pnn50: number; cv: number; flags: { text: string; tone: 'ok' | 'warn' | 'danger' }[] }

export function hrv(peaks: number[], fs: number): HRV | null {
  const rr = peaks.slice(1).map((p, i) => ((p - peaks[i]) / fs) * 1000).filter((v) => v > 250 && v < 2500)
  if (rr.length < 2) return null
  const meanRR = rr.reduce((a, b) => a + b, 0) / rr.length
  const sdnn = Math.sqrt(rr.reduce((a, b) => a + (b - meanRR) ** 2, 0) / (rr.length - 1))
  const d = rr.slice(1).map((v, i) => v - rr[i])
  const rmssd = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / Math.max(1, d.length))
  const pnn50 = (100 * d.filter((x) => Math.abs(x) > 50).length) / Math.max(1, d.length)
  const hr = 60000 / meanRR
  const cv = sdnn / meanRR
  const flags: HRV['flags'] = []
  if (hr < 60) flags.push({ text: 'Bradicardia (< 60 lpm)', tone: 'warn' })
  else if (hr > 100) flags.push({ text: 'Taquicardia (> 100 lpm)', tone: 'warn' })
  else flags.push({ text: 'Frecuencia normal (60–100 lpm)', tone: 'ok' })
  if (cv > 0.12 || (pnn50 > 40 && rmssd > 100)) flags.push({ text: `RR irregular (CV ${(cv * 100).toFixed(0)}%): descartar FA / extrasístoles`, tone: 'danger' })
  else flags.push({ text: `RR regular (CV ${(cv * 100).toFixed(0)}%)`, tone: 'ok' })
  return { n: peaks.length, hr, rr, meanRR, sdnn, rmssd, pnn50, cv, flags }
}

// ---------- CSV / TXT ----------
export interface Parsed { names: string[]; cols: Float32Array[]; timeCol: number; fsGuess?: number }

export function parseCSV(text: string): Parsed {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l))
  if (!lines.length) throw new Error('Archivo vacío')
  const delim = [',', ';', '\t'].find((d) => lines[Math.min(1, lines.length - 1)].includes(d)) ?? /\s+/
  const split = (l: string) => l.trim().split(delim).map((s) => s.trim().replace(/^"|"$/g, ''))
  const first = split(lines[0])
  const hasHeader = first.some((s) => s !== '' && isNaN(Number(s)))
  const names = hasHeader ? first : first.map((_, i) => `Canal ${i + 1}`)
  const rows = (hasHeader ? lines.slice(1) : lines).map(split)
  const nc = names.length
  const cols = Array.from({ length: nc }, () => new Float32Array(rows.length))
  let n = 0
  for (const r of rows) {
    if (r.length < nc) continue
    let ok = true
    for (let c = 0; c < nc; c++) {
      const v = Number(r[c])
      if (isNaN(v)) ok = false
      cols[c][n] = v
    }
    if (ok) n++
  }
  if (n < 10) throw new Error('No se encontraron suficientes filas numéricas')
  const trimmed = cols.map((c) => c.slice(0, n))
  // ¿primera columna = tiempo? (monótona y uniforme)
  let timeCol = -1
  let fsGuess: number | undefined
  const t = trimmed[0]
  if (nc > 1 || /time|tiempo|^t$|sec|ms/i.test(names[0])) {
    const dts: number[] = []
    for (let i = 1; i < Math.min(n, 200); i++) dts.push(t[i] - t[i - 1])
    const dt = dts.sort((a, b) => a - b)[dts.length >> 1]
    if (dt > 0 && dts.every((d) => Math.abs(d - dt) < dt * 0.1 + 1e-9)) {
      timeCol = 0
      const ms = /ms/i.test(names[0]) || dt >= 1
      fsGuess = Math.round(1 / (ms ? dt / 1000 : dt))
    }
  }
  return { names, cols: trimmed, timeCol, fsGuess }
}

export function toCSV(s: Signal): string {
  const N = s.leads[0].data.length
  const out = ['tiempo_s,' + s.leads.map((l) => l.name).join(',')]
  for (let i = 0; i < N; i++) out.push(`${(i / s.fs).toFixed(4)},${s.leads.map((l) => l.data[i].toFixed(4)).join(',')}`)
  return out.join('\n')
}
