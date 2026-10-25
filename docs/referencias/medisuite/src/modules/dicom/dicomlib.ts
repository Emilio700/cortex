// Lectura y decodificación de DICOM en el navegador (dicom-parser + canvas, sin Cornerstone).
import * as dicomParser from 'dicom-parser'
import type { DataSet } from 'dicom-parser'

export type Vec3 = [number, number, number]

export interface Instance {
  name: string
  bytes: Uint8Array
  ds: DataSet
  studyUID: string
  seriesUID: string
  sopUID: string
  instanceNumber: number
  position?: Vec3
  orientation?: [number, number, number, number, number, number]
  rows: number
  cols: number
  frames: number
  bitsAllocated: number
  bitsStored: number
  pixelRep: number
  spp: number
  planar: number
  photometric: string
  slope: number
  intercept: number
  wc?: number
  ww?: number
  spacing?: [number, number] // [fila, columna] mm
  ts: string
  modality: string
}

export interface Series {
  uid: string
  studyUID: string
  desc: string
  number: number
  modality: string
  images: { inst: Instance; frame: number }[]
}

export interface Study {
  uid: string
  desc: string
  date: string
  patient: string
  patientId: string
  series: Series[]
}

export type Frame =
  | { kind: 'gray'; w: number; h: number; data: Float32Array; min: number; max: number }
  | { kind: 'rgb'; w: number; h: number; rgba: Uint8ClampedArray }

export const TS_NAMES: Record<string, string> = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
  '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR LE',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless SV1',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
}
const NATIVE = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.2'])
export const SUPPORTED_TS = new Set([...NATIVE, '1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.5'])

export class UnsupportedError extends Error {}

function nums(ds: DataSet, tag: string, n: number): number[] | undefined {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const v = ds.floatString(tag, i)
    if (v === undefined || isNaN(v)) return undefined
    out.push(v)
  }
  return out
}

const utf8 = new TextDecoder('utf-8')
const latin1 = new TextDecoder('latin1')
/** Texto de un elemento respetando SpecificCharacterSet (UTF-8 / Latin-1). */
export function str(ds: DataSet, tag: string): string {
  const el = ds.elements[tag]
  if (!el || !el.length) return ''
  try {
    const cs = tag === 'x00080005' ? '' : (ds.string('x00080005') ?? '')
    const b = ds.byteArray.subarray(el.dataOffset, el.dataOffset + el.length)
    return (/192/.test(cs) ? utf8 : latin1).decode(b).replace(/[\0\s]+$/, '').replace(/^\s+/, '')
  } catch {
    return ''
  }
}

export function parseInstance(name: string, bytes: Uint8Array): Instance | null {
  let ds: DataSet
  try {
    ds = dicomParser.parseDicom(bytes)
  } catch {
    try {
      // archivos sin cabecera Part 10 (implícito LE)
      ds = dicomParser.parseDicom(bytes, { TransferSyntaxUID: '1.2.840.10008.1.2' })
      if (!ds.elements.x00080018 && !ds.elements.x7fe00010) return null
    } catch {
      return null
    }
  }
  if (!ds.elements.x7fe00010) return null // sin imagen (SR, PR, etc.)
  const ts = str(ds, 'x00020010') || '1.2.840.10008.1.2'
  return {
    name,
    bytes,
    ds,
    ts,
    studyUID: str(ds, 'x0020000d') || 'sin-estudio',
    seriesUID: str(ds, 'x0020000e') || 'sin-serie',
    sopUID: str(ds, 'x00080018') || name,
    instanceNumber: ds.intString('x00200013') ?? 0,
    position: nums(ds, 'x00200032', 3) as Vec3 | undefined,
    orientation: nums(ds, 'x00200037', 6) as Instance['orientation'],
    rows: ds.uint16('x00280010') ?? 0,
    cols: ds.uint16('x00280011') ?? 0,
    frames: ds.intString('x00280008') ?? 1,
    bitsAllocated: ds.uint16('x00280100') ?? 16,
    bitsStored: ds.uint16('x00280101') ?? ds.uint16('x00280100') ?? 16,
    pixelRep: ds.uint16('x00280103') ?? 0,
    spp: ds.uint16('x00280002') ?? 1,
    planar: ds.uint16('x00280006') ?? 0,
    photometric: (str(ds, 'x00280004') || 'MONOCHROME2').toUpperCase(),
    slope: ds.floatString('x00281053') ?? 1,
    intercept: ds.floatString('x00281052') ?? 0,
    wc: ds.floatString('x00281050'),
    ww: ds.floatString('x00281051'),
    spacing: (nums(ds, 'x00280030', 2) ?? nums(ds, 'x00181164', 2)) as [number, number] | undefined,
    modality: str(ds, 'x00080060'),
  }
}

function sortKey(i: Instance): number {
  if (i.position && i.orientation) {
    const [a, b, c, d, e, f] = i.orientation
    const n: Vec3 = [b * f - c * e, c * d - a * f, a * e - b * d]
    return n[0] * i.position[0] + n[1] * i.position[1] + n[2] * i.position[2]
  }
  return i.instanceNumber
}

export function groupStudies(insts: Instance[]): Study[] {
  const studies = new Map<string, Study>()
  const series = new Map<string, Series & { insts: Instance[] }>()
  for (const i of insts) {
    let st = studies.get(i.studyUID)
    if (!st) {
      const date = str(i.ds, 'x00080020')
      st = {
        uid: i.studyUID,
        desc: str(i.ds, 'x00081030') || 'Estudio',
        date: date.length === 8 ? `${date.slice(6, 8)}/${date.slice(4, 6)}/${date.slice(0, 4)}` : date,
        patient: (str(i.ds, 'x00100010') || 'Sin nombre').replace(/\^/g, ' ').trim(),
        patientId: str(i.ds, 'x00100020'),
        series: [],
      }
      studies.set(i.studyUID, st)
    }
    const key = i.studyUID + '|' + i.seriesUID
    let se = series.get(key)
    if (!se) {
      se = {
        uid: i.seriesUID,
        studyUID: i.studyUID,
        desc: str(i.ds, 'x0008103e') || 'Serie',
        number: i.ds.intString('x00200011') ?? 0,
        modality: i.modality,
        images: [],
        insts: [],
      }
      series.set(key, se)
      st.series.push(se)
    }
    if (!se.insts.some((x) => x.sopUID === i.sopUID)) se.insts.push(i)
  }
  for (const se of series.values()) {
    const usePos = se.insts.every((i) => i.position && i.orientation) && new Set(se.insts.map(sortKey)).size === se.insts.length
    se.insts.sort((a, b) => (usePos ? sortKey(a) - sortKey(b) : a.instanceNumber - b.instanceNumber) || a.name.localeCompare(b.name))
    // con posición: de pies a cabeza → mostramos de cabeza a pies (convención axial)
    if (usePos) se.insts.reverse()
    se.images = se.insts.flatMap((inst) => Array.from({ length: Math.max(1, inst.frames) }, (_, frame) => ({ inst, frame })))
    delete (se as Partial<typeof se>).insts
  }
  for (const st of studies.values()) st.series.sort((a, b) => a.number - b.number)
  return [...studies.values()]
}

// ---------- decodificación ----------
const cache = new WeakMap<Instance, Map<number, Promise<Frame>>>()

export function getFrame(inst: Instance, frame: number): Promise<Frame> {
  let m = cache.get(inst)
  if (!m) cache.set(inst, (m = new Map()))
  let p = m.get(frame)
  if (!p) {
    p = decode(inst, frame)
    m.set(frame, p)
    p.catch(() => m!.delete(frame))
  }
  return p
}

function grayFrame(inst: Instance, raw: ArrayLike<number>): Frame {
  const n = inst.rows * inst.cols
  const data = new Float32Array(n)
  let min = Infinity
  let max = -Infinity
  const { slope, intercept } = inst
  for (let i = 0; i < n; i++) {
    const v = raw[i] * slope + intercept
    data[i] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  return { kind: 'gray', w: inst.cols, h: inst.rows, data, min, max }
}

function rgbFrame(inst: Instance, src: Uint8Array, planar: number, ybr: boolean): Frame {
  const n = inst.rows * inst.cols
  const rgba = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    let r: number, g: number, b: number
    if (planar) [r, g, b] = [src[i], src[i + n], src[i + 2 * n]]
    else [r, g, b] = [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]
    if (ybr) {
      const y = r, cb = g - 128, cr = b - 128
      r = y + 1.402 * cr
      g = y - 0.344136 * cb - 0.714136 * cr
      b = y + 1.772 * cb
    }
    rgba[i * 4] = r
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = b
    rgba[i * 4 + 3] = 255
  }
  return { kind: 'rgb', w: inst.cols, h: inst.rows, rgba }
}

function nativeGray(inst: Instance, bytes: Uint8Array, bigEndian: boolean): Frame {
  const n = inst.rows * inst.cols
  const { bitsAllocated: ba, bitsStored: bs, pixelRep } = inst
  if (ba === 8) {
    const raw = pixelRep ? new Int8Array(bytes.buffer, bytes.byteOffset, n) : bytes.subarray(0, n)
    return grayFrame(inst, raw)
  }
  if (ba === 16 || ba === 32) {
    const bpp = ba / 8
    const dv = new DataView(bytes.buffer, bytes.byteOffset, n * bpp)
    const raw = new Float64Array(n)
    const mask = bs >= 32 ? 0xffffffff : (1 << bs) - 1
    const shift = 32 - bs
    for (let i = 0; i < n; i++) {
      let v = ba === 16 ? dv.getUint16(i * 2, !bigEndian) : dv.getUint32(i * 4, !bigEndian)
      if (bs < ba) v &= mask
      if (pixelRep) v = bs >= 32 ? v | 0 : (v << shift) >> shift
      raw[i] = v
    }
    return grayFrame(inst, raw)
  }
  throw new UnsupportedError(`BitsAllocated=${ba} no soportado`)
}

function decodeRLE(src: Uint8Array, inst: Instance): Uint8Array {
  // RLE Lossless (PS3.5 Anexo G): cabecera de 16 enteros, segmentos PackBits
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength)
  const nSeg = dv.getUint32(0, true)
  const n = inst.rows * inst.cols
  const bpp = inst.bitsAllocated / 8
  const out = new Uint8Array(n * bpp * inst.spp)
  for (let s = 0; s < nSeg; s++) {
    const start = dv.getUint32(4 + s * 4, true)
    const end = s + 1 < nSeg ? dv.getUint32(8 + s * 4, true) : src.length
    const seg = new Uint8Array(n)
    let p = start, o = 0
    while (p < end && o < n) {
      const c = (src[p++] << 24) >> 24
      if (c >= 0) {
        for (let k = 0; k <= c && o < n; k++) seg[o++] = src[p++]
      } else if (c > -128) {
        const v = src[p++]
        for (let k = 0; k <= -c && o < n; k++) seg[o++] = v
      }
    }
    // segmento s: componente = floor(s/bpp), byte = MSB primero
    const comp = Math.floor(s / bpp)
    const byteIdx = bpp - 1 - (s % bpp)
    if (inst.spp > 1) for (let i = 0; i < n; i++) out[i * 3 + comp] = seg[i] // salida intercalada (8 bit RGB)
    else for (let i = 0; i < n; i++) out[i * bpp + byteIdx] = seg[i] // little endian
  }
  return out
}

async function decodeJpeg(frag: Uint8Array, inst: Instance): Promise<Frame> {
  const bmp = await createImageBitmap(new Blob([frag.slice() as BlobPart], { type: 'image/jpeg' }))
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const fixed = { ...inst, cols: c.width, rows: c.height }
  if (inst.spp === 3) return { kind: 'rgb', w: c.width, h: c.height, rgba: img.data }
  const g = new Uint8Array(c.width * c.height)
  for (let i = 0; i < g.length; i++) g[i] = img.data[i * 4]
  return grayFrame(fixed, g)
}

async function decode(inst: Instance, frame: number): Promise<Frame> {
  const { ds, ts } = inst
  const el = ds.elements.x7fe00010
  if (!SUPPORTED_TS.has(ts)) {
    throw new UnsupportedError(`Formato comprimido no soportado en navegador (${TS_NAMES[ts] ?? ts}): usa Orthanc/OHIF`)
  }
  if (inst.photometric.startsWith('PALETTE')) throw new UnsupportedError('PALETTE COLOR no soportado')
  const n = inst.rows * inst.cols
  if (NATIVE.has(ts)) {
    const fsize = (n * inst.spp * inst.bitsAllocated) / 8
    const off = el.dataOffset + fsize * frame
    if (off + fsize > ds.byteArray.length) throw new Error('Datos de píxel incompletos')
    const bytes = new Uint8Array(ds.byteArray.buffer, ds.byteArray.byteOffset + off, fsize)
    if (inst.spp === 3) return rgbFrame(inst, bytes, inst.planar, inst.photometric === 'YBR_FULL')
    return nativeGray(inst, bytes, ts === '1.2.840.10008.1.2.2')
  }
  // encapsulado
  const frags = el.fragments ?? []
  const frag =
    inst.frames <= 1
      ? dicomParser.readEncapsulatedPixelDataFromFragments(ds, el, 0, frags.length)
      : el.basicOffsetTable?.length
        ? dicomParser.readEncapsulatedImageFrame(ds, el, frame)
        : frags.length === inst.frames
          ? dicomParser.readEncapsulatedPixelDataFromFragments(ds, el, frame, 1)
          : dicomParser.readEncapsulatedImageFrame(ds, el, frame, dicomParser.createJPEGBasicOffsetTable(ds, el))
  const fragU8 = new Uint8Array(frag.buffer, frag.byteOffset, frag.byteLength)
  if (ts.endsWith('.4.50')) return decodeJpeg(fragU8, inst)
  const raw = decodeRLE(fragU8, inst)
  if (inst.spp === 3) return rgbFrame(inst, raw, 0, inst.photometric === 'YBR_FULL')
  return nativeGray(inst, raw, false)
}

/** Pinta un cuadro en ImageData con ventana/nivel (función lineal DICOM). */
export function renderFrame(f: Frame, wc: number, ww: number, invert: boolean, out?: ImageData): ImageData {
  const img = out && out.width === f.w && out.height === f.h ? out : new ImageData(f.w, f.h)
  const d = img.data
  if (f.kind === 'rgb') {
    d.set(f.rgba)
    if (invert) for (let i = 0; i < d.length; i += 4) (d[i] = 255 - d[i]), (d[i + 1] = 255 - d[i + 1]), (d[i + 2] = 255 - d[i + 2])
    return img
  }
  const w = Math.max(1, ww)
  const lo = wc - 0.5 - (w - 1) / 2
  const k = 255 / Math.max(1e-6, w - 1)
  const src = f.data
  for (let i = 0, j = 0; i < src.length; i++, j += 4) {
    let v = (src[i] - lo) * k
    v = v < 0 ? 0 : v > 255 ? 255 : v
    if (invert) v = 255 - v
    d[j] = d[j + 1] = d[j + 2] = v
    d[j + 3] = 255
  }
  return img
}

export function defaultWL(inst: Instance, f: Frame): [number, number] {
  if (inst.wc !== undefined && inst.ww !== undefined && inst.ww > 0) return [inst.wc, inst.ww]
  if (f.kind === 'gray') return [(f.max + f.min) / 2, Math.max(1, f.max - f.min)]
  return [128, 256]
}

// ---------- lectura de archivos y carpetas ----------
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[]
  if (!entries.length) return [...dt.files]
  const out: File[] = []
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)))
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (!batch.length) break
        for (const c of batch) await walk(c)
      }
    }
  }
  for (const e of entries) await walk(e)
  return out
}

export async function readInstances(files: File[], onProgress?: (done: number, total: number) => void): Promise<{ insts: Instance[]; skipped: number }> {
  const insts: Instance[] = []
  let skipped = 0
  let i = 0
  for (const f of files) {
    i++
    if (f.size < 132 || /\.(jpe?g|png|txt|xml|json|html?|pdf|exe|zip)$/i.test(f.name) || f.name === 'DICOMDIR') {
      skipped++
      continue
    }
    const inst = parseInstance((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, new Uint8Array(await f.arrayBuffer()))
    if (inst) insts.push(inst)
    else skipped++
    if (i % 20 === 0) {
      onProgress?.(i, files.length)
      await new Promise((r) => setTimeout(r))
    }
  }
  return { insts, skipped }
}
