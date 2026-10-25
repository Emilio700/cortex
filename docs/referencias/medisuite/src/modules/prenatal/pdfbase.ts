// Utilidades jsPDF compartidas por los módulos de prenatal, vacunación y desarrollo.
import type { jsPDF } from 'jspdf'
import type { Patient, Settings } from '../../lib/types'
import { edad, nombreCompleto } from '../../lib/utils'

/** Las fuentes estándar de jsPDF (WinAnsi) no tienen ≤, ≥, ±, flechas, etc.: se sustituyen. */
export function txt(s: string): string {
  return s.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/±/g, '+/-').replace(/[→⟶]/g, '->').replace(/[✓✔]/g, 'Sí').replace(/[✗✘]/g, 'No').replace(/√/g, 'raíz ').replace(/₁₀/g, '10').replace(/[₀-₉]/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
}

export const BRAND: [number, number, number] = [15, 118, 110]
export const M = 12

/** Encabezado con médico/clínica y título. Devuelve la coordenada y siguiente. */
export function encabezado(doc: jsPDF, s: Settings, titulo: string, subtitulo?: string): number {
  const W = doc.internal.pageSize.getWidth()
  let y = M + 2
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...BRAND).text(titulo, M, y + 3)
  if (subtitulo) doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90).text(txt(subtitulo), M, y + 8)
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(30).text(s.clinica || '', W - M, y, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(80)
  const lineas = [s.doctor.nombre, [s.doctor.especialidad, s.doctor.cedula && `Céd. ${s.doctor.cedula}`].filter(Boolean).join(' · '), s.doctor.telefono && `Tel. ${s.doctor.telefono}`].filter(Boolean) as string[]
  lineas.forEach((l, i) => doc.text(l, W - M, y + 4 + i * 3.4, { align: 'right' }))
  y = Math.max(y + 11, y + 4 + lineas.length * 3.4) + 1
  doc.setDrawColor(...BRAND).setLineWidth(0.5).line(M, y, W - M, y)
  return y + 5
}

export function datosPaciente(doc: jsPDF, p: Patient, y: number, extra: [string, string][] = []): number {
  const W = doc.internal.pageSize.getWidth()
  const campos: [string, string][] = [['Paciente', nombreCompleto(p)], ['Edad', edad(p.fechaNac).texto], ['Fecha de nacimiento', p.fechaNac], ...(p.curp ? ([['CURP', p.curp]] as [string, string][]) : []), ...extra]
  const porFila = 4
  const w = (W - 2 * M) / porFila
  const filas = Math.ceil(campos.length / porFila)
  doc.setFillColor(241, 245, 244).roundedRect(M, y - 4, W - 2 * M, filas * 9 + 2, 1.5, 1.5, 'F')
  campos.forEach(([k, v], i) => {
    const x = M + 2 + (i % porFila) * w
    const yy = y + Math.floor(i / porFila) * 9
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(110).text(k.toUpperCase(), x, yy - 0.6)
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(25).text((doc.splitTextToSize(txt(v || '—'), w - 3) as string[])[0], x, yy + 3.4)
  })
  return y + filas * 9 + 4
}

export function seccion(doc: jsPDF, t: string, y: number): number {
  y = salto(doc, y, 12)
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...BRAND).text(txt(t), M, y)
  return y + 5
}

export function salto(doc: jsPDF, y: number, need: number): number {
  const H = doc.internal.pageSize.getHeight()
  if (y + need > H - M - 6) {
    doc.addPage()
    return M + 6
  }
  return y
}

/** Tabla simple con encabezado y anchos relativos. */
export function tabla(doc: jsPDF, y: number, cols: { t: string; w: number }[], filas: string[][], fs = 7.5): number {
  const W = doc.internal.pageSize.getWidth() - 2 * M
  const total = cols.reduce((a, c) => a + c.w, 0)
  const xs: number[] = []
  let x = M
  for (const c of cols) {
    xs.push(x)
    x += (c.w / total) * W
  }
  const head = () => {
    doc.setFillColor(...BRAND).rect(M, y - 3.6, W, 5.2, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(fs).setTextColor(255)
    cols.forEach((c, i) => doc.text(c.t, xs[i] + 1, y))
    y += 5
  }
  head()
  doc.setFont('helvetica', 'normal').setTextColor(30)
  filas.forEach((f, r) => {
    const lineas = f.map((v, i) => doc.splitTextToSize(txt(v || '—'), (cols[i].w / total) * W - 2) as string[])
    const h = Math.max(...lineas.map((l) => l.length)) * (fs * 0.42) + 1.6
    const ny = salto(doc, y, h)
    if (ny !== y) {
      y = ny
      head()
      doc.setFont('helvetica', 'normal').setTextColor(30)
    }
    if (r % 2) doc.setFillColor(246, 248, 248).rect(M, y - 3.2, W, h, 'F')
    doc.setFontSize(fs)
    lineas.forEach((l, i) => doc.text(l, xs[i] + 1, y))
    y += h
  })
  return y + 2
}

export function pie(doc: jsPDF, texto: string) {
  const n = doc.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(120)
    doc.text(doc.splitTextToSize(txt(texto), W - 2 * M - 20) as string[], M, H - M + 2)
    doc.text(`${i}/${n}`, W - M, H - M + 2, { align: 'right' })
  }
}

export function parrafo(doc: jsPDF, t: string, y: number, fs = 8, color = 50): number {
  const W = doc.internal.pageSize.getWidth()
  const l = doc.splitTextToSize(txt(t), W - 2 * M) as string[]
  y = salto(doc, y, l.length * fs * 0.42)
  doc.setFont('helvetica', 'normal').setFontSize(fs).setTextColor(color).text(l, M, y)
  return y + l.length * fs * 0.42 + 1.5
}

