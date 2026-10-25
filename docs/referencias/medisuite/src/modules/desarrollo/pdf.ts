// Resumen de la evaluación de hitos para la familia (jsPDF).
import { jsPDF } from 'jspdf'
import type { Patient, Settings } from '../../lib/types'
import { encabezado, datosPaciente, seccion, parrafo, pie } from '../prenatal/pdfbase'
import { DOMINIOS, DOMINIO_LABEL, GUIA_PADRES, checkpointLabel, evaluar, hitosDe, type DatosDesarrollo } from './hitos'

export function evaluacionPDF(p: Patient, d: DatosDesarrollo, s: Settings): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const res = evaluar(d.checkpoint, d.respuestas, d.perdidaHabilidades)
  let y = encabezado(doc, s, 'Hitos del desarrollo', `Lista de ${checkpointLabel(d.checkpoint)} · CDC "Learn the Signs. Act Early." 2022`)
  const em = (m: number) => (m < 24 ? `${m.toFixed(1)} meses` : `${Math.floor(m / 12)} a ${Math.floor(m % 12)} m`)
  y = datosPaciente(doc, p, y, [['Fecha de evaluación', d.fechaEval], ['Edad', em(d.edadCronologicaMeses)], ...(d.usaCorregida ? ([['Edad corregida', em(d.edadCorregidaMeses)]] as [string, string][]) : [])])
  y = seccion(doc, 'Resultado', y)
  y = parrafo(doc, res.mensaje, y, 9, 30)
  for (const dom of DOMINIOS) {
    y = seccion(doc, DOMINIO_LABEL[dom], y + 1)
    for (const h of hitosDe(d.checkpoint).filter((x) => x.dominio === dom)) {
      const v = d.respuestas[h.id]
      y = parrafo(doc, `[${v === 'si' ? 'Sí' : v === 'no' ? 'Todavía no' : v === 'nose' ? 'No sé' : ' — '}]  ${h.texto}`, y, 8, v === 'no' ? 20 : 60)
    }
  }
  if (d.notas) y = parrafo(doc, `Indicaciones: ${d.notas}`, y + 2, 9, 30)
  y = seccion(doc, 'Para la familia', y + 2)
  parrafo(doc, GUIA_PADRES, y, 8.5, 40)
  pie(doc, 'Fuente: CDC "Learn the Signs. Act Early." (dominio público); Zubler JM et al. Pediatrics 2022;149(3):e2021052138. Traducción de MediSuite. Lista de vigilancia; no es una prueba de tamizaje.')
  return doc.output('blob')
}
