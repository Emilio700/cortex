// Procesamiento de señal para rPPG: remuestreo, POS (Wang et al. 2017), filtro pasa-banda por FFT y periodograma.

export type Muestra = { t: number; r: number; g: number; b: number } // t en ms

/** Remuestrea por interpolación lineal a frecuencia fija. */
export function remuestrear(s: Muestra[], fs: number): number[][] {
  if (s.length < 2) return [[], [], []]
  const t0 = s[0].t, t1 = s[s.length - 1].t
  const n = Math.floor(((t1 - t0) / 1000) * fs)
  const out: number[][] = [[], [], []]
  let j = 0
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / fs
    while (j < s.length - 2 && s[j + 1].t < t) j++
    const a = s[j], b = s[j + 1]
    const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
    out[0].push(a.r + (b.r - a.r) * k)
    out[1].push(a.g + (b.g - a.g) * k)
    out[2].push(a.b + (b.b - a.b) * k)
  }
  return out
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
const std = (a: number[]) => {
  const m = mean(a)
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length || 1))
}

/** Plane-Orthogonal-to-Skin (POS). C = [R, G, B] uniformes. */
export function pos([R, G, B]: number[][], fs: number): number[] {
  const N = G.length
  const l = Math.max(2, Math.round(1.6 * fs))
  const H = new Array(N).fill(0)
  for (let m = 0; m + l <= N; m++) {
    const n = m + l
    const mr = mean(R.slice(m, n)), mg = mean(G.slice(m, n)), mb = mean(B.slice(m, n))
    if (!mr || !mg || !mb) continue
    const s1: number[] = [], s2: number[] = []
    for (let i = m; i < n; i++) {
      const r = R[i] / mr, g = G[i] / mg, b = B[i] / mb
      s1.push(g - b)
      s2.push(-2 * r + g + b)
    }
    const a = std(s1) / (std(s2) || 1)
    const h = s1.map((x, i) => x + a * s2[i])
    const mh = mean(h)
    for (let i = 0; i < l; i++) H[m + i] += h[i] - mh
  }
  return H
}

/** FFT radix-2 in situ (re, im de longitud potencia de 2). */
export function fft(re: Float64Array, im: Float64Array, inv = false) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr; im[a] += xi
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
}

const pow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)))

/** Pasa-banda por enmascaramiento en frecuencia. */
export function pasaBanda(x: number[], fs: number, lo = 0.7, hi = 3.0): number[] {
  const n = pow2(x.length * 2)
  const m = mean(x)
  const re = new Float64Array(n), im = new Float64Array(n)
  x.forEach((v, i) => (re[i] = v - m))
  fft(re, im)
  for (let k = 0; k < n; k++) {
    const f = (Math.min(k, n - k) * fs) / n
    if (f < lo || f > hi) { re[k] = 0; im[k] = 0 }
  }
  fft(re, im, true)
  return Array.from(re.subarray(0, x.length))
}

/** Pico del periodograma en la banda → lpm; sqi = fracción de potencia alrededor del pico (y su armónico). */
export function estimarFC(x: number[], fs: number, lo = 0.7, hi = 3.0) {
  const n = Math.max(2048, pow2(x.length * 4))
  const re = new Float64Array(n), im = new Float64Array(n)
  const m = mean(x)
  x.forEach((v, i) => (re[i] = (v - m) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1))))) // Hann
  fft(re, im)
  const P = (k: number) => re[k] * re[k] + im[k] * im[k]
  const k0 = Math.ceil((lo * n) / fs), k1 = Math.floor((hi * n) / fs)
  let kp = k0, tot = 0
  for (let k = k0; k <= k1; k++) {
    tot += P(k)
    if (P(k) > P(kp)) kp = k
  }
  // interpolación parabólica
  const a = P(kp - 1), b = P(kp), c = P(kp + 1)
  const d = a - 2 * b + c ? (0.5 * (a - c)) / (a - 2 * b + c) : 0
  const f = ((kp + d) * fs) / n
  const anchoK = Math.round((0.1 * n) / fs) // ±0.1 Hz
  let pico = 0
  for (const kc of [kp, 2 * kp]) for (let k = kc - anchoK; k <= kc + anchoK; k++) if (k >= k0 && k <= k1) pico += P(k)
  return { bpm: f * 60, sqi: tot ? pico / tot : 0 }
}

export function analizar(muestras: Muestra[], fs = 30) {
  const C = remuestrear(muestras, fs)
  if (C[1].length < fs * 4) return null
  const h = pos(C, fs)
  const filt = pasaBanda(h, fs)
  return { ...estimarFC(filt, fs), filt }
}

export const mediana = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN
}
