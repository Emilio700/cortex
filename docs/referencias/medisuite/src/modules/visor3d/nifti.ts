// Construcción de NIfTI-1 en memoria: fantoma 3D de demostración y conversión simple de series DICOM.
import { getFrame, type Series } from '../dicom/dicomlib'

type Arr = Float32Array | Int16Array | Uint8Array

/** srow: matriz afín 3×4 (vóxel → mm RAS). */
export function makeNifti(dims: [number, number, number], pix: [number, number, number], data: Arr, srow: number[][], calMin = 0, calMax = 0): ArrayBuffer {
  const bpv = data.BYTES_PER_ELEMENT
  const buf = new ArrayBuffer(352 + data.length * bpv)
  const dv = new DataView(buf)
  dv.setInt32(0, 348, true)
  ;[3, ...dims, 1, 1, 1, 1].forEach((v, i) => dv.setInt16(40 + i * 2, v, true))
  const dt = data instanceof Float32Array ? 16 : data instanceof Int16Array ? 4 : 2
  dv.setInt16(70, dt, true)
  dv.setInt16(72, bpv * 8, true)
  ;[1, ...pix, 1, 1, 1, 1].forEach((v, i) => dv.setFloat32(76 + i * 4, v, true))
  dv.setFloat32(108, 352, true)
  dv.setFloat32(112, 1, true)
  dv.setUint8(123, 2) // mm
  dv.setFloat32(124, calMax, true)
  dv.setFloat32(128, calMin, true)
  dv.setInt16(254, 1, true) // sform_code
  srow.forEach((r, k) => r.forEach((v, i) => dv.setFloat32(280 + k * 16 + i * 4, v, true)))
  new Uint8Array(buf, 344, 4).set([110, 43, 49, 0]) // "n+1\0"
  new Uint8Array(buf, 352).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  return buf
}

// Shepp-Logan 3D modificado (Kak & Slaney / Toft) + lesión esférica brillante.
const SL: number[][] = [
  // A, a, b, c, x0, y0, z0, phi(°)
  [1, 0.69, 0.92, 0.81, 0, 0, 0, 0],
  [-0.8, 0.6624, 0.874, 0.78, 0, -0.0184, 0, 0],
  [-0.2, 0.11, 0.31, 0.22, 0.22, 0, 0, -18],
  [-0.2, 0.16, 0.41, 0.28, -0.22, 0, 0, 18],
  [0.1, 0.21, 0.25, 0.41, 0, 0.35, -0.15, 0],
  [0.1, 0.046, 0.046, 0.05, 0, 0.1, 0.25, 0],
  [0.1, 0.046, 0.046, 0.05, 0, -0.1, 0.25, 0],
  [0.1, 0.046, 0.023, 0.05, -0.08, -0.605, 0, 0],
  [0.1, 0.023, 0.023, 0.02, 0, -0.606, 0, 0],
  [0.1, 0.023, 0.046, 0.02, 0.06, -0.605, 0, 0],
  [0.6, 0.08, 0.08, 0.08, -0.25, 0.3, 0.3, 0], // "lesión"
]

export function demoPhantom(N = 128): ArrayBuffer {
  const data = new Float32Array(N * N * N)
  const pre = SL.map(([A, a, b, c, x0, y0, z0, phi]) => {
    const r = (phi * Math.PI) / 180
    return { A, a2: a * a, b2: b * b, c2: c * c, x0, y0, z0, cs: Math.cos(r), sn: Math.sin(r) }
  })
  for (let k = 0; k < N; k++) {
    const z = (2 * k) / (N - 1) - 1
    for (let j = 0; j < N; j++) {
      const y = (2 * j) / (N - 1) - 1
      for (let i = 0; i < N; i++) {
        const x = (2 * i) / (N - 1) - 1
        let v = 0
        for (const e of pre) {
          const dx = x - e.x0, dy = y - e.y0, dz = z - e.z0
          const xr = dx * e.cs + dy * e.sn, yr = -dx * e.sn + dy * e.cs
          if ((xr * xr) / e.a2 + (yr * yr) / e.b2 + (dz * dz) / e.c2 <= 1) v += e.A
        }
        data[(k * N + j) * N + i] = Math.max(0, v) * 1000
      }
    }
  }
  const s = 1.5, o = (-(N - 1) / 2) * s
  return makeNifti([N, N, N], [s, s, s], data, [[s, 0, 0, o], [0, s, 0, o], [0, 0, s, o]], 0, 1100)
}

/** Serie DICOM (sin compresión o soportada por el visor 2D) → NIfTI float32. */
export async function seriesToNifti(se: Series): Promise<ArrayBuffer> {
  const imgs = se.images
  const first = imgs[0].inst
  const nx = first.cols, ny = first.rows, nz = imgs.length
  if (imgs.some((x) => x.inst.cols !== nx || x.inst.rows !== ny)) throw new Error('Los cortes tienen tamaños distintos')
  const data = new Float32Array(nx * ny * nz)
  for (let k = 0; k < nz; k++) {
    const f = await getFrame(imgs[k].inst, imgs[k].frame)
    if (f.kind !== 'gray') throw new Error('Solo series en escala de grises')
    data.set(f.data, k * nx * ny)
  }
  const sp = first.spacing ?? [1, 1]
  const o = first.orientation ?? [1, 0, 0, 0, 1, 0]
  const p0 = first.position ?? [0, 0, 0]
  const pl = imgs[nz - 1].inst.position
  const th = first.ds.floatString('x00180088') ?? first.ds.floatString('x00180050') ?? 1
  let sd: number[]
  if (pl && nz > 1 && imgs[nz - 1].inst !== first) sd = [0, 1, 2].map((i) => (pl[i] - p0[i]) / (nz - 1))
  else sd = [o[1] * o[5] - o[2] * o[4], o[2] * o[3] - o[0] * o[5], o[0] * o[4] - o[1] * o[3]].map((v) => v * th)
  // LPS (DICOM) → RAS (NIfTI): negar x e y
  const col = [0, 1, 2].map((i) => o[i] * sp[1]), row = [0, 1, 2].map((i) => o[3 + i] * sp[0])
  const srow = [0, 1, 2].map((a) => {
    const sg = a < 2 ? -1 : 1
    return [sg * col[a], sg * row[a], sg * sd[a], sg * p0[a]]
  })
  const dz = Math.hypot(sd[0], sd[1], sd[2]) || th
  return makeNifti([nx, ny, nz], [sp[1], sp[0], dz], data, srow)
}
