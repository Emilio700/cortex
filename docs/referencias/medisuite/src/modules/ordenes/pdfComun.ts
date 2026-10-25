// Piezas comunes de los PDF de Órdenes y Certificados (jsPDF, tamaño carta): encabezado del médico,
// bloque de paciente, párrafos con salto de página, firma con QR y marca de agua.
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { Patient, Settings } from '../../lib/types'
import { edad, nombreCompleto } from '../../lib/utils'

export const BRAND: [number, number, number] = [15, 118, 110]
export const M = 16 // margen (mm)

/** Sustituye caracteres que las fuentes estándar de jsPDF (WinAnsi) no pueden dibujar. */
export function pdfTexto(t: string): string {
  return t
    .replace(/β/g, 'beta')
    .replace(/≈/g, 'aprox. ')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\u0000-\u00ff\u2013\u2014\u2022\u20ac]/g, '')
}

export interface Ctx {
  doc: jsPDF
  W: number
  H: number
  y: number
  s: Settings
  titulo: string
  pieReservado: number
}

export function nuevoPDF(s: Settings, titulo: string, meta: { folio: string; asunto: string }): Ctx {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  doc.setProperties({ title: `${titulo} ${meta.folio}`, author: s.doctor.nombre, subject: meta.asunto, creator: 'MediSuite' })
  const c: Ctx = { doc, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight(), y: 0, s, titulo, pieReservado: 42 }
  encabezado(c)
  return c
}

export function encabezado(c: Ctx) {
  const { doc, W, s } = c
  const d = s.doctor
  let y = M + 2
  doc.setTextColor(20)
  doc.setFont('helvetica', 'bold').setFontSize(13).text(d.nombre || 'Médico tratante', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(70)
  for (const l of [d.especialidad, d.universidad, `Cédula profesional: ${d.cedula || '—'}${d.cedulaEspecialidad ? '   ·   Cédula de especialidad: ' + d.cedulaEspecialidad : ''}`].filter(Boolean)) {
    y += 4
    doc.text(l, M, y)
  }
  const xr = W - M
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...BRAND)
  if (s.clinica) doc.text(s.clinica, xr, M + 2, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(70)
  const dir = d.direccion ? (doc.splitTextToSize(d.direccion, 80) as string[]) : []
  dir.forEach((l, i) => doc.text(l, xr, M + 6.3 + i * 3.4, { align: 'right' }))
  const contacto = [d.telefono && `Tel. ${d.telefono}`, d.email].filter(Boolean).join('  ·  ')
  if (contacto) doc.text(contacto, xr, M + 6.3 + dir.length * 3.4, { align: 'right' })
  y = Math.max(y, M + 6.3 + dir.length * 3.4) + 3
  doc.setDrawColor(...BRAND).setLineWidth(0.6).line(M, y, W - M, y)
  y += 8
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...BRAND).text(c.titulo.toUpperCase(), W / 2, y, { align: 'center' })
  c.y = y + 7
}

/** Asegura espacio vertical; si no cabe, agrega página con encabezado. */
export function espacio(c: Ctx, need: number) {
  if (c.y + need > c.H - c.pieReservado) {
    c.doc.addPage()
    encabezado(c)
  }
}

/** Franja con datos de identificación del paciente. */
export function bloquePaciente(c: Ctx, p: Patient, fechaISO: string, folio: string, extra: [string, string][] = []) {
  const { doc, W } = c
  const fecha = new Date(fechaISO)
  const campos: [string, string][] = [
    ['Paciente', nombreCompleto(p)],
    ['Edad', edad(p.fechaNac, fecha).texto],
    ['Sexo', p.sexo === 'F' ? 'Femenino' : p.sexo === 'M' ? 'Masculino' : 'Otro'],
    ['Fecha', fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })],
    ['Folio', folio],
    ...extra,
  ]
  const porFila = 5
  const filas = Math.ceil(campos.length / porFila)
  const h = 10 * filas
  doc.setFillColor(241, 245, 244).roundedRect(M, c.y - 4, W - 2 * M, h, 1.5, 1.5, 'F')
  const anchos = [0.36, 0.13, 0.13, 0.22, 0.16]
  for (let f = 0; f < filas; f++) {
    let x = M + 2
    const y = c.y + f * 10
    campos.slice(f * porFila, f * porFila + porFila).forEach(([k, v], i) => {
      const w = (W - 2 * M - 4) * anchos[i]
      doc.setFont('helvetica', 'normal').setTextColor(110).setFontSize(6.8).text(k.toUpperCase(), x, y - 0.6)
      doc.setFont('helvetica', 'bold').setTextColor(25).setFontSize(8.8)
      doc.text((doc.splitTextToSize(pdfTexto(v || '—'), w - 2) as string[])[0], x, y + 3.6)
      x += w
    })
  }
  c.y += h + 2
  if (p.curp) {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(90).text(`CURP: ${p.curp}`, M, c.y)
    c.y += 4
  }
  c.y += 2
}

/** Subtítulo de sección. */
export function seccion(c: Ctx, t: string) {
  espacio(c, 12)
  c.doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...BRAND).text(pdfTexto(t), M, c.y)
  c.y += 5
}

/** Párrafo con ajuste de línea y salto de página. */
export function parrafo(c: Ctx, texto: string, opts: { size?: number; bold?: boolean; italic?: boolean; color?: number | [number, number, number]; indent?: number; gap?: number; align?: 'left' | 'justify' } = {}) {
  const { doc, W } = c
  const size = opts.size ?? 10
  const lh = size * 0.45
  const x = M + (opts.indent ?? 0)
  const w = W - M - x
  doc.setFont('helvetica', opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal').setFontSize(size)
  const color = () => (Array.isArray(opts.color) ? doc.setTextColor(...opts.color) : doc.setTextColor(opts.color ?? 35))
  color()
  for (const bloque of pdfTexto(texto).split('\n')) {
    const lineas = doc.splitTextToSize(bloque || ' ', w) as string[]
    for (let i = 0; i < lineas.length; i++) {
      espacio(c, lh + 1)
      doc.setFont('helvetica', opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal').setFontSize(size)
      color()
      const ultima = i === lineas.length - 1
      doc.text(lineas[i], x, c.y, opts.align === 'justify' && !ultima ? { maxWidth: w, align: 'justify' } : undefined)
      c.y += lh
    }
  }
  c.y += opts.gap ?? 2
}

/** Pie con línea de firma, QR y nota (en la última página). */
export async function pieFirma(c: Ctx, qrTexto: string, nota: string, leyendaQR = 'Escanee para verificar') {
  const { doc, W, H, s } = c
  const fy = H - M
  const qrS = 26
  const qr = await QRCode.toDataURL(qrTexto, { errorCorrectionLevel: 'M', margin: 0, width: 300 })
  doc.addImage(qr, 'PNG', W - M - qrS, fy - qrS - 3, qrS, qrS, undefined, 'FAST')
  doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(110).text(leyendaQR, W - M - qrS / 2, fy, { align: 'center' })
  const sx = W / 2
  doc.setDrawColor(60).setLineWidth(0.3).line(sx - 35, fy - 12, sx + 35, fy - 12)
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(30).text(s.doctor.nombre || 'Médico tratante', sx, fy - 8.3, { align: 'center' })
  doc.setFont('helvetica', 'normal').setFontSize(7.3).setTextColor(90).text(`Nombre y firma · Céd. Prof. ${s.doctor.cedula || '—'}`, sx, fy - 4.8, { align: 'center' })
  doc.setFontSize(6.3).setTextColor(120)
  doc.text(doc.splitTextToSize(pdfTexto(nota), sx - 35 - M - 4) as string[], M, fy - 18)
}

export function marcaAgua(c: Ctx, texto: string) {
  const { doc, W, H } = c
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'bold').setFontSize(70).setTextColor(220, 60, 60)
    doc.text(texto, W / 2, H / 2, { align: 'center', angle: 35 })
  }
}

export function numerar(c: Ctx) {
  const { doc, W } = c
  const n = doc.getNumberOfPages()
  if (n < 2) return
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(130).text(`Página ${i} de ${n}`, W - M, 8, { align: 'right' })
  }
}

/** Imprime un PDF desde un iframe oculto del mismo origen (sin scripts en línea; compatible con la CSP). */
export function imprimirPDF(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const f = document.createElement('iframe')
  f.setAttribute('aria-hidden', 'true')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  f.src = url
  f.onload = () => {
    try {
      f.contentWindow?.focus()
      f.contentWindow?.print()
    } catch {
      window.open(url, '_blank', 'noopener')
    }
    setTimeout(() => {
      f.remove()
      URL.revokeObjectURL(url)
    }, 60_000)
  }
  document.body.appendChild(f)
}

/** Comparte un PDF con Web Share (archivos). Devuelve false si el navegador no lo permite. */
export async function compartirPDF(blob: Blob, nombre: string, titulo: string): Promise<boolean> {
  const file = new File([blob], nombre, { type: 'application/pdf' })
  if (!navigator.canShare?.({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title: titulo, text: titulo })
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw e
  }
  return true
}
