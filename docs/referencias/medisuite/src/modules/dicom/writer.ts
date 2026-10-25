// Escritura mínima de DICOM (Explicit VR Little Endian), estudio sintético, anonimización y ZIP sin compresión.
import type { Instance } from './dicomlib'

type Val = string | number[] | Uint8Array
interface El { g: number; e: number; vr: string; v: Val }

const LONG = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN', 'UC', 'UR', 'OD', 'OL', 'OV'])
const enc = new TextEncoder()

function valueBytes(vr: string, v: Val): Uint8Array {
  if (v instanceof Uint8Array) return v.length % 2 ? concat([v, new Uint8Array(1)]) : v
  if (typeof v === 'string') {
    const b = enc.encode(v)
    if (b.length % 2 === 0) return b
    const o = new Uint8Array(b.length + 1)
    o.set(b)
    o[b.length] = vr === 'UI' ? 0 : 32
    return o
  }
  const size = vr === 'US' || vr === 'SS' ? 2 : vr === 'FD' ? 8 : 4
  const o = new Uint8Array(v.length * size)
  const dv = new DataView(o.buffer)
  v.forEach((n, i) => {
    if (vr === 'US') dv.setUint16(i * 2, n, true)
    else if (vr === 'SS') dv.setInt16(i * 2, n, true)
    else if (vr === 'UL') dv.setUint32(i * 4, n, true)
    else if (vr === 'FL') dv.setFloat32(i * 4, n, true)
    else dv.setFloat64(i * 8, n, true)
  })
  return o
}

function encodeEl({ g, e, vr, v }: El): Uint8Array {
  const val = valueBytes(vr, v)
  const long = LONG.has(vr)
  const h = new Uint8Array(long ? 12 : 8)
  const dv = new DataView(h.buffer)
  dv.setUint16(0, g, true)
  dv.setUint16(2, e, true)
  h[4] = vr.charCodeAt(0)
  h[5] = vr.charCodeAt(1)
  if (long) dv.setUint32(8, val.length, true)
  else dv.setUint16(6, val.length, true)
  return concat([h, val])
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) out.set(p, o), (o += p.length)
  return out
}

export function writeDicom(els: El[]): Uint8Array {
  const sop = els.find((x) => x.g === 8 && x.e === 0x18)!.v as string
  const cls = els.find((x) => x.g === 8 && x.e === 0x16)!.v as string
  const meta = [
    { g: 2, e: 1, vr: 'OB', v: new Uint8Array([0, 1]) },
    { g: 2, e: 2, vr: 'UI', v: cls },
    { g: 2, e: 3, vr: 'UI', v: sop },
    { g: 2, e: 0x10, vr: 'UI', v: '1.2.840.10008.1.2.1' },
    { g: 2, e: 0x12, vr: 'UI', v: '1.2.826.0.1.3680043.10.1999.1' },
    { g: 2, e: 0x13, vr: 'SH', v: 'MEDISUITE' },
  ].map(encodeEl)
  const metaLen = meta.reduce((a, b) => a + b.length, 0)
  const pre = new Uint8Array(132)
  pre.set(enc.encode('DICM'), 128)
  const sorted = [...els].sort((a, b) => a.g - b.g || a.e - b.e)
  return concat([pre, encodeEl({ g: 2, e: 0, vr: 'UL', v: [metaLen] }), ...meta, ...sorted.map(encodeEl)])
}

// ---------- estudio sintético tipo TC (tórax-abdomen superior) ----------
const ROOT = '1.2.826.0.1.3680043.10.1999'

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function ell(x: number, y: number, cx: number, cy: number, a: number, b: number) {
  const dx = (x - cx) / a, dy = (y - cy) / b
  return dx * dx + dy * dy <= 1
}

/** HU en un punto (mm, sistema LPS) para la fracción axial t (0 = ápex torácico, 1 = abdomen superior). */
function phantomHU(x: number, y: number, t: number, vessels: number[][]): number {
  if (y > 148 && y < 156 && Math.abs(x) < 170) return 150 // mesa
  if (!ell(x, y, 0, 0, 160, 115)) return -1000
  // hueso
  if (ell(x, y, 0, 72, 19, 17)) return ell(x, y, 0, 72, 16, 14) ? 280 : 850
  if (ell(x, y, 0, 98, 9, 9)) return 15
  if (ell(x, y, 0, 102, 14, 15) || ell(x, y, 20, 95, 12, 6) || ell(x, y, -20, 95, 12, 6)) return 700
  if (t < 0.6 && ell(x, y, 0, -104, 16, 6)) return 600
  if (t < 0.78) {
    for (let k = 0; k < 20; k++) {
      const th = (k / 20) * 2 * Math.PI
      if (Math.abs(Math.sin(th)) > 0.93) continue // línea media (esternón / columna)
      if (ell(x, y, 140 * Math.cos(th), 98 * Math.sin(th) + 5, 7, 6)) return 750
    }
  }
  if (!ell(x, y, 0, 0, 150, 105)) return -100 // grasa subcutánea
  // aorta descendente
  if (ell(x, y, 26, 48, 12, 12)) return 190
  // pulmones
  const ls = t < 0.65 ? Math.min(1, 0.55 + t * 1.6) * (t > 0.45 ? 1 - (t - 0.45) * 2.5 : 1) : 0
  if (ls > 0.05) {
    for (const s of [1, -1]) {
      if (ell(x, y, s * 72, -2, 52 * ls + 8, 78 * ls + 5)) {
        for (const v of vessels) if ((x - v[0] * s) ** 2 + (y - v[1]) ** 2 < v[2] * v[2]) return 40
        return -860
      }
    }
  }
  // corazón
  if (t > 0.22 && t < 0.68 && ell(x, y, 12, -20, 58, 48)) return ell(x, y, 22, -14, 25, 20) ? 170 : 45
  // hígado y bazo
  const lv = t > 0.5 ? Math.min(1, (t - 0.5) * 3) : 0
  if (lv > 0 && ell(x, y, -55, 12, 85 * lv, 72 * lv)) return ell(x, y, -40, 30, 8, 8) ? 160 : 62
  if (t > 0.7 && ell(x, y, 95, 40, 30, 38)) return 50
  // estómago con nivel hidroaéreo
  if (t > 0.62 && ell(x, y, 55, -25, 40, 32)) return y < -38 ? -950 : 15
  // riñones
  if (t > 0.86 && (ell(x, y, 62, 62, 22, 30) || ell(x, y, -62, 62, 22, 30))) return 35
  // grasa visceral/mediastínica y músculo
  if (ell(x, y, 0, 0, 125, 88)) return t > 0.62 ? -90 : 30
  return 50
}

export function demoStudy(): Uint8Array[] {
  const N = 40, S = 256, PS = 360 / S, TH = 5
  const r = rng(42)
  const vessels = Array.from({ length: 26 }, () => [40 + r() * 60, -60 + r() * 110, 1.5 + r() * 3])
  const study = `${ROOT}.1.${Date.now()}`
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const common = (series: string, sop: string, num: number, desc: string): El[] => [
    { g: 8, e: 0x05, vr: 'CS', v: 'ISO_IR 192' },
    { g: 8, e: 0x16, vr: 'UI', v: '1.2.840.10008.5.1.4.1.1.2' },
    { g: 8, e: 0x18, vr: 'UI', v: sop },
    { g: 8, e: 0x20, vr: 'DA', v: today },
    { g: 8, e: 0x30, vr: 'TM', v: '101500' },
    { g: 8, e: 0x50, vr: 'SH', v: 'DEMO0001' },
    { g: 8, e: 0x60, vr: 'CS', v: 'CT' },
    { g: 8, e: 0x70, vr: 'LO', v: 'MediSuite (sintético)' },
    { g: 8, e: 0x80, vr: 'LO', v: 'Clínica Demo' },
    { g: 8, e: 0x90, vr: 'PN', v: 'DR^DEMO' },
    { g: 8, e: 0x1030, vr: 'LO', v: 'TC tórax-abdomen (fantoma)' },
    { g: 8, e: 0x103e, vr: 'LO', v: desc },
    { g: 0x10, e: 0x10, vr: 'PN', v: 'FANTOMA^DEMO' },
    { g: 0x10, e: 0x20, vr: 'LO', v: 'DEMO-001' },
    { g: 0x10, e: 0x30, vr: 'DA', v: '19800101' },
    { g: 0x10, e: 0x40, vr: 'CS', v: 'O' },
    { g: 0x18, e: 0x15, vr: 'CS', v: 'CHEST' },
    { g: 0x18, e: 0x50, vr: 'DS', v: String(TH) },
    { g: 0x18, e: 0x60, vr: 'DS', v: '120' },
    { g: 0x20, e: 0x0d, vr: 'UI', v: study },
    { g: 0x20, e: 0x0e, vr: 'UI', v: series },
    { g: 0x20, e: 0x10, vr: 'SH', v: '1' },
    { g: 0x20, e: 0x11, vr: 'IS', v: String(num) },
    { g: 0x28, e: 0x02, vr: 'US', v: [1] },
    { g: 0x28, e: 0x04, vr: 'CS', v: 'MONOCHROME2' },
    { g: 0x28, e: 0x100, vr: 'US', v: [16] },
    { g: 0x28, e: 0x101, vr: 'US', v: [12] },
    { g: 0x28, e: 0x102, vr: 'US', v: [11] },
    { g: 0x28, e: 0x103, vr: 'US', v: [0] },
    { g: 0x28, e: 0x1050, vr: 'DS', v: '40' },
    { g: 0x28, e: 0x1051, vr: 'DS', v: '400' },
    { g: 0x28, e: 0x1052, vr: 'DS', v: '-1024' },
    { g: 0x28, e: 0x1053, vr: 'DS', v: '1' },
  ]
  const vol = new Uint16Array(N * S * S)
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1)
    for (let i = 0; i < S; i++) {
      const y = -180 + (i + 0.5) * PS
      for (let j = 0; j < S; j++) {
        const x = -180 + (j + 0.5) * PS
        const hu = phantomHU(x, y, t, vessels)
        const noise = hu > -990 ? (r() + r() + r() - 1.5) * 14 : 0
        vol[k * S * S + i * S + j] = Math.max(0, Math.min(4095, Math.round(hu + noise + 1024)))
      }
    }
  }
  const axial = `${study}.2`
  const files: Uint8Array[] = []
  for (let k = 0; k < N; k++) {
    const px = new Uint8Array(vol.buffer, k * S * S * 2, S * S * 2)
    files.push(
      writeDicom([
        ...common(axial, `${axial}.${k + 1}`, 2, 'Axial 5 mm'),
        { g: 0x20, e: 0x13, vr: 'IS', v: String(k + 1) },
        { g: 0x20, e: 0x32, vr: 'DS', v: `-180\\-180\\${(-k * TH).toFixed(1)}` },
        { g: 0x20, e: 0x37, vr: 'DS', v: '1\\0\\0\\0\\1\\0' },
        { g: 0x20, e: 0x1041, vr: 'DS', v: (-k * TH).toFixed(1) },
        { g: 0x28, e: 0x10, vr: 'US', v: [S] },
        { g: 0x28, e: 0x11, vr: 'US', v: [S] },
        { g: 0x28, e: 0x30, vr: 'DS', v: `${PS}\\${PS}` },
        { g: 0x7fe0, e: 0x10, vr: 'OW', v: px },
      ]),
    )
  }
  // reconstrucción coronal (píxeles anisotrópicos: 5 mm × 1.4 mm)
  const cor = `${study}.3`
  const ys = [-40, 0, 40, 72]
  ys.forEach((ymm, n) => {
    const i = Math.round((ymm + 180) / PS - 0.5)
    const px = new Uint16Array(N * S)
    for (let k = 0; k < N; k++) for (let j = 0; j < S; j++) px[k * S + j] = vol[k * S * S + i * S + j]
    files.push(
      writeDicom([
        ...common(cor, `${cor}.${n + 1}`, 3, 'Coronal MPR'),
        { g: 0x20, e: 0x13, vr: 'IS', v: String(n + 1) },
        { g: 0x20, e: 0x32, vr: 'DS', v: `-180\\${ymm}\\0` },
        { g: 0x20, e: 0x37, vr: 'DS', v: '1\\0\\0\\0\\0\\-1' },
        { g: 0x28, e: 0x10, vr: 'US', v: [N] },
        { g: 0x28, e: 0x11, vr: 'US', v: [S] },
        { g: 0x28, e: 0x30, vr: 'DS', v: `${TH}\\${PS}` },
        { g: 0x7fe0, e: 0x10, vr: 'OW', v: new Uint8Array(px.buffer) },
      ]),
    )
  })
  return files
}

// ---------- anonimización (reemplazo en sitio, misma longitud) ----------
const ANON: Record<string, string> = {
  x00100010: 'ANONIMO', x00100020: 'ANON', x00100030: '', x00100032: '', x00101000: '', x00101001: '',
  x00101040: '', x00102154: '', x00101090: '', x00080080: '', x00080081: '', x00080090: '', x00081048: '',
  x00081050: '', x00081070: '', x00080050: '', x00321032: '', x00104000: '', x00102160: '', x00080092: '', x00080094: '',
}

export function anonymize(inst: Instance): Uint8Array {
  const out = inst.bytes.slice()
  for (const [tag, rep] of Object.entries(ANON)) {
    const el = inst.ds.elements[tag]
    if (!el || !el.length) continue
    const b = enc.encode(rep)
    for (let i = 0; i < el.length; i++) out[el.dataOffset + i] = i < b.length ? b[i] : 32
  }
  return out
}

// ---------- ZIP "store" (sin compresión) ----------
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(d: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let off = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const h = new Uint8Array(30 + name.length)
    const dv = new DataView(h.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, f.data.length, true)
    dv.setUint32(22, f.data.length, true)
    dv.setUint16(26, name.length, true)
    h.set(name, 30)
    const c = new Uint8Array(46 + name.length)
    const cv = new DataView(c.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, f.data.length, true)
    cv.setUint32(24, f.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, off, true)
    c.set(name, 46)
    parts.push(h, f.data)
    central.push(c)
    off += h.length + f.data.length
  }
  const cd = concat(central)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cd.length, true)
  ev.setUint32(16, off, true)
  return new Blob([...parts, cd, end] as BlobPart[], { type: 'application/zip' })
}
