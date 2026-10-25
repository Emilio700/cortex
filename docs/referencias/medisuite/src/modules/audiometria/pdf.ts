// Reporte de audiometría en PDF (jsPDF, carta vertical).
import { jsPDF } from 'jspdf'
import type { Patient, Settings } from '../../lib/types'
import { edad, nombreCompleto } from '../../lib/utils'
import { FRECUENCIAS, etiquetaFrec, type Interpretacion, type Umbrales } from './audiograma'

export function audiometriaPDF(o: { u: Umbrales; png: string; p: Patient; s: Settings; it: Interpretacion; equipo?: string; notas?: string; fecha: string }): Blob {
  const { u, png, p, s, it } = o
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  const brand: [number, number, number] = [15, 118, 110]
  // Helvetica (WinAnsi) no tiene ≥ ≤ −: se sustituyen antes de escribir
  const texto = doc.text.bind(doc)
  const limpio = (v: string) => v.replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/−/g, '-')
  doc.text = ((t: string | string[], ...rest: unknown[]) => (texto as (...a: unknown[]) => jsPDF)(Array.isArray(t) ? t.map(limpio) : limpio(t), ...rest)) as typeof doc.text
  doc.setProperties({ title: `Audiometría ${nombreCompleto(p)}`, author: s.doctor.nombre, subject: 'Audiometría tonal', creator: 'MediSuite' })

  let y = M + 4
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20).text(s.doctor.nombre || 'Médico', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(80)
  if (s.doctor.especialidad) doc.text(s.doctor.especialidad, M, (y += 4.5))
  if (s.doctor.cedula) doc.text(`Cédula profesional: ${s.doctor.cedula}`, M, (y += 4))
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...brand).text(s.clinica || '', W - M, M + 4, { align: 'right' })
  y += 3
  doc.setDrawColor(...brand).setLineWidth(0.6).line(M, y, W - M, y)
  y += 7
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(20).text('Reporte de audiometría tonal', M, y)
  y += 6
  const f = new Date(o.fecha)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(40)
  doc.text(`Paciente: ${nombreCompleto(p)}   ·   Edad: ${edad(p.fechaNac, f).texto}   ·   Fecha: ${f.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`, M, y)
  if (o.equipo) doc.text(`Equipo: ${o.equipo}`, M, (y += 4.5))
  y += 4

  // Audiograma
  const iw = 120
  const ih = (iw * 860) / 900
  doc.addImage(png, 'PNG', M, y, iw, ih)

  // Resumen a la derecha
  const xr = M + iw + 6
  let yr = y + 4
  const wr = W - M - xr
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20).text('Resultados', xr, yr)
  yr += 5
  doc.setFont('helvetica', 'normal').setFontSize(8.6).setTextColor(40)
  const lineas: string[] = [
    `PTA derecho (0.5-1-2-4 kHz): ${it.ptaDer ?? '—'} dB HL`,
    it.gradoDer ? `  ${it.gradoDer.nombre} (${it.gradoDer.rango})` : '',
    `PTA izquierdo: ${it.ptaIzq ?? '—'} dB HL`,
    it.gradoIzq ? `  ${it.gradoIzq.nombre} (${it.gradoIzq.rango})` : '',
    it.global.grado ? `Grado OMS (mejor oído): ${it.global.grado.nombre}${it.global.unilateral ? ' · pérdida unilateral' : ''}` : '',
  ].filter(Boolean)
  for (const l of lineas) {
    const t = doc.splitTextToSize(l, wr) as string[]
    doc.text(t, xr, yr)
    yr += t.length * 3.8
  }
  yr += 2
  doc.setFont('helvetica', 'bold').text('Hallazgos', xr, yr)
  yr += 4.5
  doc.setFont('helvetica', 'normal')
  for (const l of it.referir.length ? it.referir : ['Sin criterios de referencia por asimetría ni brecha aéreo-ósea.']) {
    const t = doc.splitTextToSize('• ' + l, wr) as string[]
    doc.text(t, xr, yr)
    yr += t.length * 3.8 + 1
  }

  // Tabla de umbrales
  y += ih + 6
  const cols = ['Hz', ...FRECUENCIAS.map(etiquetaFrec)]
  const cw = (W - 2 * M) / cols.length
  const filas: [string, (f: (typeof FRECUENCIAS)[number]) => string][] = [
    ['Aérea der.', (fr) => cel(u.der.aerea[fr])],
    ['Ósea der.', (fr) => cel(u.der.osea[fr])],
    ['Aérea izq.', (fr) => cel(u.izq.aerea[fr])],
    ['Ósea izq.', (fr) => cel(u.izq.osea[fr])],
  ]
  doc.setFillColor(241, 245, 244).rect(M, y - 4, W - 2 * M, 6, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.5)
  cols.forEach((c, i) => doc.text(c, M + i * cw + 2, y))
  doc.setFont('helvetica', 'normal')
  for (const [nom, fn] of filas) {
    y += 5.5
    doc.text(nom, M + 2, y)
    FRECUENCIAS.forEach((fr, i) => doc.text(fn(fr), M + (i + 1) * cw + 2, y))
  }
  y += 4
  doc.setFontSize(7.5).setTextColor(90).text('Valores en dB HL. M = enmascarado; NR = sin respuesta al nivel indicado.', M, (y += 3))

  if (o.notas) {
    y += 7
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(20).text('Notas', M, y)
    doc.setFont('helvetica', 'normal').setFontSize(8.6).setTextColor(40)
    const t = doc.splitTextToSize(o.notas, W - 2 * M) as string[]
    doc.text(t, M, (y += 4.5))
    y += t.length * 3.8
  }

  const H = doc.internal.pageSize.getHeight()
  doc.setFontSize(7.2).setTextColor(100)
  const pie = doc.splitTextToSize(
    'Clasificación: OMS, World Report on Hearing (2021), grado por PTA de 0.5, 1, 2 y 4 kHz en el mejor oído. Símbolos: ASHA, Guidelines for Audiometric Symbols (1990). Asimetría: NICE NG98 (2018), ≥15 dB en 2 frecuencias adyacentes. Umbrales capturados de un audiómetro calibrado; la interpretación final corresponde al médico.',
    W - 2 * M,
  ) as string[]
  doc.text(pie, M, H - 12)
  return doc.output('blob')
}

function cel(t?: { db: number | null; enmascarado?: boolean; sinRespuesta?: boolean }) {
  if (!t || t.db == null) return '—'
  return `${t.db}${t.enmascarado ? ' M' : ''}${t.sinRespuesta ? ' NR' : ''}`
}
