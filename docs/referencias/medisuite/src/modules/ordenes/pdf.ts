// PDF "Solicitud de estudios" (carta) con encabezado del médico, datos del paciente, estudios, preparación y QR con folio.
import type { Patient, Registro, Settings } from '../../lib/types'
import { bloquePaciente, espacio, M, marcaAgua, nuevoPDF, numerar, parrafo, pdfTexto, pieFirma, seccion, BRAND } from './pdfComun'
import { datosOrden, estadoOrden, preparacionCombinada, textoQR } from './ordenes'

export async function ordenPDF(r: Registro, p: Patient, s: Settings): Promise<Blob> {
  const d = datosOrden(r)
  const c = nuevoPDF(s, 'Solicitud de estudios', { folio: d.folio, asunto: 'Solicitud de estudios de laboratorio y gabinete' })
  const { doc, W } = c
  bloquePaciente(c, p, r.fecha, d.folio, [
    ['Laboratorio / gabinete destino', d.laboratorio || 'A elección del paciente'],
    ['Urgencia', d.urgencia === 'urgente' ? 'URGENTE' : 'Ordinaria'],
  ])
  if (p.alergias.length) parrafo(c, `Alergias: ${p.alergias.join(', ')}`, { bold: true, size: 8.5, color: [200, 30, 30] })

  const dx = [...d.diagnosticos.map((x) => `${x.codigo} ${x.nombre}`), d.diagnosticoTexto].filter(Boolean).join('; ')
  seccion(c, 'Diagnóstico presuntivo')
  parrafo(c, dx || 'No especificado', { size: 9.5 })

  const grupos: [string, typeof d.items][] = [
    ['Laboratorio clínico', d.items.filter((i) => i.tipo === 'laboratorio')],
    ['Gabinete / imagen', d.items.filter((i) => i.tipo === 'gabinete')],
  ]
  for (const [titulo, items] of grupos) {
    if (!items.length) continue
    seccion(c, titulo)
    items.forEach((it, i) => {
      espacio(c, 6)
      const extra = [it.muestra, it.loinc && `LOINC ${it.loinc}`].filter(Boolean).join(' · ')
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(25)
      doc.setDrawColor(90).setLineWidth(0.25).rect(M + 1, c.y - 2.8, 3, 3)
      const lineas = doc.splitTextToSize(pdfTexto(`${i + 1}. ${it.nombre}`), W - 2 * M - 60) as string[]
      doc.text(lineas, M + 6, c.y)
      if (extra) doc.setFontSize(7.5).setTextColor(110).text(pdfTexto(extra), W - M, c.y, { align: 'right' })
      c.y += lineas.length * 4.3 + 0.8
    })
    c.y += 2
  }

  if (d.indicaciones) {
    seccion(c, 'Indicaciones / datos clínicos para el laboratorio')
    parrafo(c, d.indicaciones, { size: 9.5 })
  }

  const prep = preparacionCombinada(d.items)
  if (prep.length) {
    seccion(c, 'Preparación del paciente')
    for (const x of prep) {
      parrafo(c, `• ${x.texto}`, { size: 9, gap: 0.5 })
      parrafo(c, `Aplica a: ${x.estudios.join(', ')}`, { size: 7.5, italic: true, color: 100, indent: 3, gap: 1.5 })
    }
    parrafo(c, 'Confirme la preparación y horario con el laboratorio o gabinete; cada uno puede tener indicaciones propias.', { size: 7.5, italic: true, color: 110 })
  }
  doc.setTextColor(...BRAND)

  await pieFirma(
    c,
    textoQR(d.folio, r.fecha, s.doctor.cedula, d.items.length),
    `Solicitud ${d.folio}. Presente este documento en el laboratorio o gabinete. El QR contiene el folio para identificar la orden; no incluye datos del paciente.`,
    `Folio ${d.folio}`,
  )
  if (estadoOrden(r) === 'cancelada') marcaAgua(c, 'CANCELADA')
  numerar(c)
  return doc.output('blob')
}
