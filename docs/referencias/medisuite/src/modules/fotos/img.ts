import type { DocumentFile } from '../../lib/types'
import { add } from '../../lib/store'

export const ZONAS = [
  'Cara', 'Cuero cabelludo', 'Cuello', 'Tórax anterior', 'Espalda', 'Abdomen', 'Brazo derecho', 'Brazo izquierdo',
  'Mano derecha', 'Mano izquierda', 'Pierna derecha', 'Pierna izquierda', 'Pie derecho', 'Pie izquierdo', 'Genital / perineal', 'Boca', 'Otra',
]

export type FotoMeta = { zona: string; nota?: string; ancho: number; alto: number; origen: 'camara' | 'archivo' | 'anotada'; baseId?: string; mmPorPx?: number }
export const meta = (d: DocumentFile) => (d.meta ?? {}) as Partial<FotoMeta>

export const MAX_LADO = 1600

export function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('No se pudo leer la imagen'))
    i.src = src
  })
}

/** Dibuja en canvas (≤1600 px) y re-codifica como JPEG: elimina EXIF/GPS y comprime. */
export function recodificar(src: CanvasImageSource, w: number, h: number, calidad = 0.86) {
  const k = Math.min(1, MAX_LADO / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, 0, 0, c.width, c.height)
  return { dataUrl: c.toDataURL('image/jpeg', calidad), ancho: c.width, alto: c.height }
}

export async function archivoAJpeg(f: File) {
  // createImageBitmap respeta la orientación EXIF y luego la descartamos al re-codificar
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
  try {
    return recodificar(bmp, bmp.width, bmp.height)
  } finally {
    bmp.close()
  }
}

export function guardarFoto(patientId: string, img: { dataUrl: string; ancho: number; alto: number }, m: Omit<FotoMeta, 'ancho' | 'alto'>) {
  const f = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const sello = `${f.getFullYear()}-${p2(f.getMonth() + 1)}-${p2(f.getDate())} ${p2(f.getHours())}h${p2(f.getMinutes())}`
  const nombre = `${m.zona} ${sello}${m.origen === 'anotada' ? ' (anotada)' : ''}.jpg`
  return add('documents', { patientId, tipo: 'foto', nombre, mime: 'image/jpeg', dataUrl: img.dataUrl, meta: { ...m, ancho: img.ancho, alto: img.alto } })
}
