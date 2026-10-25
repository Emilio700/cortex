// Generación del PDF de la receta con jsPDF + QR verificable.
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { Patient, Prescription, Settings } from '../../lib/types'
import { edad, nombreCompleto } from '../../lib/utils'

export type Formato = 'media-carta' | 'carta'

export function urlVerificacion(jws: string) {
  return `${location.origin}${location.pathname}#/verificar?t=${jws}`
}

export async function recetaPDF(rx: Prescription, p: Patient, s: Settings, peso: number | null, formato: Formato = 'media-carta'): Promise<Blob> {
  // Media carta horizontal: 215.9 × 139.7 mm. Carta vertical: 215.9 × 279.4 mm.
  const doc = formato === 'carta' ? new jsPDF({ unit: 'mm', format: 'letter' }) : new jsPDF({ unit: 'mm', format: [139.7, 215.9], orientation: 'landscape' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 10
  const brand: [number, number, number] = [15, 118, 110]
  const d = s.doctor
  doc.setProperties({ title: `Receta ${rx.folio}`, author: d.nombre, subject: 'Receta médica', creator: 'MediSuite' })

  const encabezado = () => {
    let y = M + 4
    doc.setTextColor(20)
    doc.setFont('helvetica', 'bold').setFontSize(13).text(d.nombre, M, y)
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(70)
    y += 4.5
    doc.text(d.especialidad, M, y)
    y += 3.8
    doc.text(d.universidad, M, y)
    y += 3.8
    doc.text(`Cédula profesional: ${d.cedula}${d.cedulaEspecialidad ? `   ·   Cédula de especialidad: ${d.cedulaEspecialidad}` : ''}`, M, y)
    // Derecha: clínica y contacto
    const xr = W - M
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...brand)
    doc.text(s.clinica, xr, M + 4, { align: 'right' })
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(70)
    const dir = doc.splitTextToSize(d.direccion, 80) as string[]
    dir.forEach((l, i) => doc.text(l, xr, M + 8.3 + i * 3.4, { align: 'right' }))
    doc.text(`Tel. ${d.telefono}${d.email ? '  ·  ' + d.email : ''}`, xr, M + 8.3 + dir.length * 3.4, { align: 'right' })
    y = Math.max(y, M + 8.3 + dir.length * 3.4) + 3
    doc.setDrawColor(...brand).setLineWidth(0.6).line(M, y, W - M, y)
    return y + 5
  }

  let y = encabezado()

  // Datos del paciente
  const fecha = new Date(rx.fecha)
  doc.setFillColor(241, 245, 244).roundedRect(M, y - 4, W - 2 * M, 10, 1.5, 1.5, 'F')
  doc.setFontSize(8.5).setTextColor(40)
  const campos: [string, string][] = [
    ['Paciente', nombreCompleto(p)],
    ['Edad', edad(p.fechaNac, fecha).texto],
    ['Peso', peso ? `${peso} kg` : '—'],
    ['Fecha', fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })],
    ['Folio', rx.folio],
  ]
  const anchos = [0.38, 0.12, 0.1, 0.24, 0.16]
  let x = M + 2
  campos.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal').setTextColor(110).setFontSize(6.8).text(k.toUpperCase(), x, y - 0.6)
    doc.setFont('helvetica', 'bold').setTextColor(25).setFontSize(8.8)
    const w = (W - 2 * M - 4) * anchos[i] - 2
    doc.text((doc.splitTextToSize(v, w) as string[])[0], x, y + 3.6)
    x += (W - 2 * M - 4) * anchos[i]
  })
  y += 11
  if (p.alergias.length) {
    doc.setFont('helvetica', 'bold').setFontSize(7.8).setTextColor(200, 30, 30).text(`Alergias: ${p.alergias.join(', ')}`, M, y)
    y += 4.5
  }

  // Rx
  doc.setFont('times', 'bolditalic').setFontSize(20).setTextColor(...brand).text('Rx', M, y + 4)
  y += 3
  const footerH = 34
  const xi = M + 12
  const wi = W - M - xi
  const salto = (need: number) => {
    if (y + need > H - footerH) {
      doc.addPage()
      y = encabezado()
    }
  }
  rx.items.forEach((it, i) => {
    const t1 = `${i + 1}. ${it.medicamento}${it.presentacion ? ` — ${it.presentacion}` : ''}`
    const t2 = [it.dosis, it.via && `vía ${it.via.toLowerCase()}`, it.frecuencia?.toLowerCase(), it.duracion && `durante ${it.duracion}`].filter(Boolean).join(', ')
    doc.setFont('helvetica', 'bold').setFontSize(9.5)
    const l1 = doc.splitTextToSize(t1, wi) as string[]
    doc.setFont('helvetica', 'normal').setFontSize(8.8)
    const l2 = doc.splitTextToSize(t2 ? t2.charAt(0).toUpperCase() + t2.slice(1) + '.' : '', wi - 4) as string[]
    const l3 = it.indicaciones ? (doc.splitTextToSize(it.indicaciones, wi - 4) as string[]) : []
    salto(l1.length * 4 + l2.length * 3.8 + l3.length * 3.6 + 3)
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(20).text(l1, xi, y)
    y += l1.length * 4
    doc.setFont('helvetica', 'normal').setFontSize(8.8).setTextColor(50).text(l2, xi + 4, y)
    y += l2.length * 3.8
    if (l3.length) {
      doc.setFont('helvetica', 'italic').setFontSize(8.3).setTextColor(90).text(l3, xi + 4, y)
      y += l3.length * 3.6
    }
    y += 2.2
  })
  if (rx.indicaciones) {
    const l = doc.splitTextToSize(rx.indicaciones, W - 2 * M) as string[]
    salto(l.length * 3.8 + 6)
    y += 1
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...brand).text('Indicaciones generales', M, y)
    y += 4
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(50).text(l, M, y)
  }

  // Pie: firma + QR (última página)
  const fy = H - M
  const qrS = 26
  if (rx.firma) {
    const qr = await QRCode.toDataURL(urlVerificacion(rx.firma), { errorCorrectionLevel: 'L', margin: 0, width: 300 })
    doc.addImage(qr, 'PNG', W - M - qrS, fy - qrS - 3, qrS, qrS, undefined, 'FAST')
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(110)
    doc.text('Escanee para verificar', W - M - qrS / 2, fy, { align: 'center' })
  }
  const sx = W / 2
  doc.setDrawColor(60).setLineWidth(0.3).line(sx - 32, fy - 9, sx + 32, fy - 9)
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(30).text(d.nombre, sx, fy - 5.5, { align: 'center' })
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(90).text(`Firma · Céd. Prof. ${d.cedula}`, sx, fy - 2.3, { align: 'center' })
  doc.setFontSize(6.3).setTextColor(130)
  const nota = doc.splitTextToSize(
    rx.firma ? `Receta firmada electrónicamente (ES256). Folio ${rx.folio}. Cualquier alteración invalida la verificación.` : `Folio ${rx.folio}.`,
    sx - 32 - M - 4,
  ) as string[]
  doc.text(nota, M, fy - 5)
  const pages = doc.getNumberOfPages()
  if (pages > 1)
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i)
      doc.setFontSize(6.5).setTextColor(130).text(`Página ${i} de ${pages}`, W - M, M, { align: 'right' })
    }
  return doc.output('blob')
}

/** Imprime un PDF usando un iframe oculto (con respaldo a pestaña nueva). */
export function imprimirPDF(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  f.src = url
  f.onload = () => {
    try {
      f.contentWindow?.focus()
      f.contentWindow?.print()
    } catch {
      window.open(url, '_blank')
    }
    setTimeout(() => {
      f.remove()
      URL.revokeObjectURL(url)
    }, 60000)
  }
  document.body.appendChild(f)
}
