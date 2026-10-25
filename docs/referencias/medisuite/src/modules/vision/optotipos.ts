// Cálculos puros de agudeza visual: tamaño de optotipos, conversiones y puntuación letra por letra.
//
// Referencias:
// - ISO 8596:2017 / ICO Visual Acuity Measurement Standard (1984): el optotipo de referencia mide 5′ de arco
//   cuando MAR = 1′ (detalle crítico = 1/5 de la altura).
// - Bailey IL, Lovie JE. New design principles for visual acuity letter charts. Am J Optom Physiol Opt 1976;53:740-5
//   (progresión logarítmica 0.1 logMAR, 5 letras por línea).
// - Ferris FL et al. New visual acuity charts for clinical research (ETDRS). Am J Ophthalmol 1982;94:91-6
//   (puntuación por letra: 0.02 logMAR por letra).
// - ISO/IEC 7810: tarjeta ID-1 = 85.60 × 53.98 mm (tarjetas bancarias, INE).

export const TARJETA_ID1 = { anchoMm: 85.6, altoMm: 53.98 }

/** Líneas logMAR de 1.0 a −0.3 en pasos de 0.1. */
export const LINEAS_LOGMAR: number[] = Array.from({ length: 14 }, (_, i) => r2(1 - i * 0.1))

export const LETRAS_SLOAN = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'] as const
export type LetraSloan = (typeof LETRAS_SLOAN)[number]
export const DIRECCIONES_E = ['derecha', 'abajo', 'izquierda', 'arriba'] as const
export type DireccionE = (typeof DIRECCIONES_E)[number]

export const DISTANCIAS = [
  { id: '6', m: 6, label: '6 m (lejos, estándar)' },
  { id: '4', m: 4, label: '4 m (lejos)' },
  { id: '3', m: 3, label: '3 m (consultorio pequeño)' },
  { id: '0.4', m: 0.4, label: '40 cm (cerca)' },
] as const

function r2(x: number) {
  return Math.round(x * 100) / 100
}

/** Píxeles por milímetro a partir del ancho en px que el usuario ajustó para igualar la tarjeta ID-1. */
export function pxPorMm(anchoTarjetaPx: number): number {
  return anchoTarjetaPx / TARJETA_ID1.anchoMm
}

/** MAR (minutos de arco) de un valor logMAR. */
export function mar(logmar: number): number {
  return Math.pow(10, logmar)
}

/**
 * Altura del optotipo (mm) a una distancia (m) para un logMAR dado:
 * h = 2 · d · tan(5′ · MAR / 2)
 */
export function alturaOptotipoMm(distanciaM: number, logmar: number): number {
  const arcmin = 5 * mar(logmar)
  const rad = (arcmin / 60) * (Math.PI / 180)
  return 2 * distanciaM * 1000 * Math.tan(rad / 2)
}

export function alturaOptotipoPx(distanciaM: number, logmar: number, pxmm: number): number {
  return alturaOptotipoMm(distanciaM, logmar) * pxmm
}

/** Un optotipo de 5×5 necesita al menos ~5 px de alto para dibujar trazos de 1 px. */
export const MIN_PX = 5
export function renderizable(distanciaM: number, logmar: number, pxmm: number): boolean {
  return alturaOptotipoPx(distanciaM, logmar, pxmm) >= MIN_PX
}

// ---------- Conversiones ----------
export function logmarADecimal(logmar: number): number {
  return Math.pow(10, -logmar)
}
export function decimalALogmar(dec: number): number {
  return -Math.log10(dec)
}
/** Denominador Snellen para un numerador dado (20 pies o 6 m): 20/x, x = 20 · 10^logMAR. */
export function snellenDenominador(logmar: number, numerador: 20 | 6 = 20): number {
  return numerador * Math.pow(10, logmar)
}
/** Redondeo a los denominadores convencionales de las cartillas. */
const DEN_20 = [10, 12.5, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400]
const DEN_6 = [3, 3.8, 4.8, 6, 7.5, 9.5, 12, 15, 19, 24, 30, 38, 48, 60, 75, 95, 120]
function cercano(arr: number[], v: number) {
  return arr.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a))
}
export function snellen(logmar: number, numerador: 20 | 6 = 20): string {
  const d = snellenDenominador(logmar, numerador)
  const arr = numerador === 20 ? DEN_20 : DEN_6
  const c = cercano(arr, d)
  // si el valor cae lejos de una línea (puntuación por letra), se muestra el valor exacto
  const den = Math.abs(Math.log10(c / d)) <= 0.011 ? c : numerador === 20 ? Math.round(d) : Math.round(d * 10) / 10
  return `${numerador}/${fmtNum(den)}`
}
function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

/** Interpreta "20/40", "6/12" o decimal "0.5" → logMAR. Devuelve null si no es válido. */
export function parseAgudeza(txt: string): number | null {
  const t = txt.trim().replace(',', '.')
  const m = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (m) {
    const n = Number(m[1])
    const d = Number(m[2])
    if (n > 0 && d > 0) return r2(Math.log10(d / n))
    return null
  }
  const v = Number(t)
  if (Number.isFinite(v) && v > 0 && v <= 4) return r2(decimalALogmar(v))
  return null
}

export function fmtLogmar(l: number): string {
  const v = r2(l)
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2)
}

// ---------- Puntuación ----------
/**
 * Puntuación letra por letra (ETDRS): a partir de la línea más grande evaluada (se asume que todas las
 * letras de líneas mayores se leerían), logMAR = L₀ + 0.1 − 0.02 × letras correctas totales.
 * `lineas`: logMAR de la línea → letras correctas (de 5).
 * Equivale a «logMAR de la última línea completa − 0.02 por cada letra leída en líneas más pequeñas».
 */
export function puntuarLetras(lineas: Record<string, number>, letrasPorLinea = 5): number | null {
  const ks = Object.keys(lineas).map(Number).filter((k) => Number.isFinite(k))
  if (!ks.length) return null
  const l0 = Math.max(...ks)
  const total = ks.reduce((s, k) => s + Math.max(0, Math.min(letrasPorLinea, lineas[String(k)] ?? 0)), 0)
  const porLetra = 0.1 / letrasPorLinea
  return r2(l0 + 0.1 - porLetra * total)
}

/** Categoría de deterioro visual (CIE-11 9D90, OMS) según la agudeza de lejos en el mejor ojo (logMAR). */
export function categoriaOMS(logmar: number): { grado: string; tono: 'ok' | 'warn' | 'danger' } {
  // 6/12 = 0.30 · 6/18 = 0.48 · 6/60 = 1.00 · 3/60 = 1.30 logMAR
  const l = logmar - 1e-6
  if (l <= 0.3) return { grado: 'Sin deterioro (≥ 6/12)', tono: 'ok' }
  if (l <= Math.log10(3)) return { grado: 'Deterioro leve (< 6/12 a 6/18)', tono: 'warn' }
  if (l <= 1) return { grado: 'Deterioro moderado (< 6/18 a 6/60)', tono: 'danger' }
  if (l <= Math.log10(20)) return { grado: 'Deterioro grave (< 6/60 a 3/60)', tono: 'danger' }
  return { grado: 'Ceguera (< 3/60)', tono: 'danger' }
}

// ---------- Secuencias aleatorias ----------
/** Línea de `n` letras Sloan sin repetir letras contiguas (y sin repetir dentro de la línea si n ≤ 10). */
export function lineaSloan(n = 5, rnd: () => number = Math.random): LetraSloan[] {
  const pool = [...LETRAS_SLOAN]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(n, pool.length))
}
/** Línea de `n` orientaciones de E sin dos iguales seguidas. */
export function lineaE(n = 5, rnd: () => number = Math.random): DireccionE[] {
  const out: DireccionE[] = []
  for (let i = 0; i < n; i++) {
    let d: DireccionE
    do d = DIRECCIONES_E[Math.floor(rnd() * 4)]
    while (out.length && out[out.length - 1] === d)
    out.push(d)
  }
  return out
}

// ---------- Rejilla de Amsler ----------
/** Rejilla estándar: 10 cm × 10 cm, 20 × 20 cuadros de 5 mm, vista a 30–33 cm (cada cuadro ≈ 1°). */
export const AMSLER = { ladoMm: 100, cuadros: 20, distanciaCm: 30 }
/** Ángulo (grados) que subtiende un cuadro de `mm` a `cm` de distancia. */
export function anguloGrados(mm: number, cm: number): number {
  return (2 * Math.atan(mm / 2 / (cm * 10)) * 180) / Math.PI
}
