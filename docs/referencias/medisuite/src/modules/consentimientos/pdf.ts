// PDF del consentimiento con pdf-lib: texto con ajuste de línea, firmas PNG y hash SHA-256 en el pie.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

// Las fuentes estándar usan WinAnsi: reemplazamos caracteres no representables.
const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
export function winAnsi(s: string) {
  return s
    .replace(/[‐-‒]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/[^\n\x20-\x7e¡-ÿ]/g, (c) => (EXTRA.includes(c) ? c : '?'))
}

export async function sha256Hex(data: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function envolver(texto: string, font: PDFFont, size: number, ancho: number) {
  const lineas: string[] = []
  for (const parrafo of texto.split('\n')) {
    if (!parrafo.trim()) {
      lineas.push('')
      continue
    }
    let actual = ''
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = actual ? actual + ' ' + palabra : palabra
      if (font.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba
      else {
        if (actual) lineas.push(actual)
        actual = palabra
      }
    }
    lineas.push(actual)
  }
  return lineas
}

export interface FirmaPDF {
  rol: string
  nombre: string
  png: string // dataURL
}

export async function consentimientoPDF(opts: {
  clinica: string
  titulo: string
  texto: string
  firmas: FirmaPDF[]
  fecha: Date
  hash: string
  folio: string
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(winAnsi(opts.titulo))
  pdf.setCreator('MediSuite')
  pdf.setSubject(`SHA-256 ${opts.hash}`)
  const f = await pdf.embedFont(StandardFonts.Helvetica)
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold)
  const [W, H] = [612, 792] // carta
  const M = 54
  const brand = rgb(15 / 255, 118 / 255, 110 / 255)
  const gris = rgb(0.35, 0.35, 0.35)
  const paginas: PDFPage[] = []
  let page!: PDFPage
  let y = 0

  const nueva = () => {
    page = pdf.addPage([W, H])
    paginas.push(page)
    page.drawText(winAnsi(opts.clinica), { x: M, y: H - 40, size: 9, font: fb, color: brand })
    page.drawText(winAnsi(`Folio ${opts.folio}`), { x: W - M - f.widthOfTextAtSize(`Folio ${opts.folio}`, 8), y: H - 40, size: 8, font: f, color: gris })
    page.drawLine({ start: { x: M, y: H - 46 }, end: { x: W - M, y: H - 46 }, thickness: 1, color: brand })
    y = H - 72
  }
  const espacio = (h: number) => {
    if (y - h < 70) nueva()
  }

  nueva()
  for (const l of envolver(winAnsi(opts.titulo.toUpperCase()), fb, 13, W - 2 * M)) {
    page.drawText(l, { x: M, y, size: 13, font: fb })
    y -= 18
  }
  y -= 6
  const size = 10.5
  const lh = 14.5
  for (const l of envolver(winAnsi(opts.texto), f, size, W - 2 * M)) {
    espacio(lh)
    if (l) {
      // títulos en mayúsculas seguidos de ":" en negritas
      const m = l.match(/^([A-ZÁÉÍÓÚÑ ]{4,}:)(.*)$/)
      if (m) {
        page.drawText(m[1], { x: M, y, size, font: fb })
        page.drawText(m[2], { x: M + fb.widthOfTextAtSize(m[1], size), y, size, font: f })
      } else page.drawText(l, { x: M, y, size, font: f })
    }
    y -= l ? lh : lh * 0.6
  }

  // Firmas en cuadrícula de 2 columnas
  y -= 16
  const colW = (W - 2 * M - 30) / 2
  const sigH = 70
  for (let i = 0; i < opts.firmas.length; i += 2) {
    espacio(sigH + 40)
    for (let j = 0; j < 2 && i + j < opts.firmas.length; j++) {
      const fi = opts.firmas[i + j]
      const x = M + j * (colW + 30)
      const img = await pdf.embedPng(fi.png)
      const esc = Math.min(colW / img.width, sigH / img.height)
      const iw = img.width * esc
      page.drawImage(img, { x: x + (colW - iw) / 2, y: y - sigH, width: iw, height: img.height * esc })
      page.drawLine({ start: { x, y: y - sigH - 4 }, end: { x: x + colW, y: y - sigH - 4 }, thickness: 0.7, color: gris })
      page.drawText(winAnsi(fi.nombre), { x, y: y - sigH - 16, size: 9, font: fb, maxWidth: colW })
      page.drawText(winAnsi(fi.rol), { x, y: y - sigH - 27, size: 8, font: f, color: gris })
    }
    y -= sigH + 44
  }
  espacio(20)
  const ts = opts.fecha.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'medium' })
  page.drawText(winAnsi(`Firmado electrónicamente el ${ts} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`), { x: M, y, size: 8.5, font: f, color: gris })

  // Pie con hash en todas las páginas
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 50 }, end: { x: W - M, y: 50 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
    p.drawText(`SHA-256 del contenido: ${opts.hash}`, { x: M, y: 38, size: 6.8, font: f, color: gris })
    p.drawText(`Página ${i + 1} de ${paginas.length}`, { x: W - M - 50, y: 26, size: 7, font: f, color: gris })
    p.drawText(winAnsi('Integridad: el hash se calcula sobre el texto, los firmantes, la fecha y las imágenes de firma.'), { x: M, y: 26, size: 6.5, font: f, color: gris })
  })
  return pdf.save()
}
