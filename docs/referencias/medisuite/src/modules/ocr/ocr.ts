// Tesseract.js 100% local: worker, núcleo WASM y datos del idioma español se sirven desde /public.
import { createWorker, type Worker } from 'tesseract.js'
import { asset } from '../../lib/utils'

export type Progreso = { status: string; progress: number }
let onProgress: (p: Progreso) => void = () => {}
let workerP: Promise<Worker> | null = null

function getWorker() {
  if (!workerP) {
    workerP = createWorker('spa', 1, {
      workerPath: asset('tesseract/worker.min.js'),
      corePath: asset('tesseract'), // directorio: elige la variante lstm (relaxedsimd/simd/básica) según el navegador
      langPath: asset('tessdata'),
      gzip: true,
      logger: (m: Progreso) => onProgress(m),
    }).then(async (w) => {
      await w.setParameters({ preserve_interword_spaces: '1' })
      return w
    })
    workerP.catch(() => (workerP = null))
  }
  return workerP
}

export async function reconocer(img: HTMLCanvasElement, progress: (p: Progreso) => void) {
  onProgress = progress
  const w = await getWorker()
  const { data } = await w.recognize(img)
  return { texto: data.text, confianza: data.confidence }
}

export interface Prepro {
  gris: boolean
  contraste: number // -100..100
  umbral: boolean
  nivel: number // 0..255
  rotacion: number // grados
}

export const PREPRO_INICIAL: Prepro = { gris: true, contraste: 20, umbral: false, nivel: 160, rotacion: 0 }

/** Dibuja la imagen en un canvas aplicando rotación, escala, escala de grises, contraste y umbral. */
export function preprocesar(src: CanvasImageSource & { width: number; height: number }, p: Prepro): HTMLCanvasElement {
  const lado = Math.max(src.width, src.height)
  const esc = lado < 1600 ? 1600 / lado : lado > 3200 ? 3200 / lado : 1
  const w = Math.round(src.width * esc), h = Math.round(src.height * esc)
  const rot = ((p.rotacion % 360) + 360) % 360
  const c = document.createElement('canvas')
  c.width = rot % 180 ? h : w
  c.height = rot % 180 ? w : h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.translate(c.width / 2, c.height / 2)
  g.rotate((rot * Math.PI) / 180)
  g.drawImage(src, -w / 2, -h / 2, w, h)
  g.setTransform(1, 0, 0, 1, 0, 0)
  if (!p.gris && !p.contraste && !p.umbral) return c
  const im = g.getImageData(0, 0, c.width, c.height)
  const d = im.data
  const C = p.contraste * 2.55
  const f = (259 * (C + 255)) / (255 * (259 - C))
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], gg = d[i + 1], b = d[i + 2]
    if (p.gris || p.umbral) r = gg = b = 0.299 * r + 0.587 * gg + 0.114 * b
    if (C) {
      r = f * (r - 128) + 128
      gg = f * (gg - 128) + 128
      b = f * (b - 128) + 128
    }
    if (p.umbral) r = gg = b = r > p.nivel ? 255 : 0
    d[i] = r
    d[i + 1] = gg
    d[i + 2] = b
  }
  g.putImageData(im, 0, 0)
  return c
}

export function cargarImagen(f: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('No se pudo abrir la imagen'))
    img.src = url
  })
}
