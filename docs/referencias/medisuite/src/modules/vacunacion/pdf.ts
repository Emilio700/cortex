// Cartilla de vacunación y lista de recordatorios en PDF (jsPDF).
import { jsPDF } from 'jspdf'
import type { Patient, Settings } from '../../lib/types'
import { nombreCompleto } from '../../lib/utils'
import { encabezado, datosPaciente, seccion, tabla, parrafo, pie } from '../prenatal/pdfbase'
import { ESQUEMA_VERSION, ESTADO_LABEL, GRUPO_LABEL, NOTAS_ESQUEMA, NOTA_RESCATE, vacunaPorId, type Aplicacion, type EstadoDosis, type Grupo } from './esquema'

const f = (d?: string) => (d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

export function cartillaPDF(p: Patient, estados: EstadoDosis[], grupos: Grupo[], aplicaciones: Aplicacion[], s: Settings, hoy: string): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  doc.setProperties({ title: `Cartilla de vacunación — ${nombreCompleto(p)}`, creator: 'MediSuite' })
  let y = encabezado(doc, s, 'Cartilla de vacunación', ESQUEMA_VERSION)
  y = datosPaciente(doc, p, y, [['Fecha de impresión', f(hoy)]])
  for (const g of grupos) {
    const filas = estados.filter((e) => e.dosis.grupo === g && e.estado !== 'no-aplica')
    if (!filas.length) continue
    y = seccion(doc, GRUPO_LABEL[g], y + 1)
    y = tabla(doc, y, [{ t: 'Vacuna', w: 1.6 }, { t: 'Dosis', w: 0.9 }, { t: 'Edad', w: 1.2 }, { t: 'Estado', w: 0.8 }, { t: 'Fecha', w: 0.9 }, { t: 'Lote / laboratorio', w: 1.3 }, { t: 'Aplicó', w: 1 }],
      filas.map((e) => [
        (vacunaPorId(e.dosis.vacunaId)?.nombre ?? e.dosis.vacunaId) + (e.dosis.verificar ? ' *' : ''),
        e.dosis.dosis,
        e.dosis.edadTexto,
        ESTADO_LABEL[e.estado],
        e.aplicacion ? f(e.aplicacion.fecha) : e.fechaObjetivo ? `(${f(e.fechaObjetivo)})` : '',
        [e.aplicacion?.lote, e.aplicacion?.laboratorio].filter(Boolean).join(' · '),
        e.aplicacion?.aplicador ?? '',
      ]), 7.5)
  }
  const otras = aplicaciones.filter((a) => a.dosisId === 'otra')
  if (otras.length) {
    y = seccion(doc, 'Otras vacunas y campañas', y + 1)
    y = tabla(doc, y, [{ t: 'Vacuna', w: 2 }, { t: 'Fecha', w: 1 }, { t: 'Lote / laboratorio', w: 1.5 }, { t: 'Aplicó', w: 1 }],
      otras.map((a) => [a.nombre || vacunaPorId(a.vacunaId)?.nombre || a.vacunaId, f(a.fecha), [a.lote, a.laboratorio].filter(Boolean).join(' · '), a.aplicador ?? '']))
  }
  if (estados.some((e) => e.estado === 'atrasada')) y = parrafo(doc, NOTA_RESCATE, y + 2, 7.5, 40)
  y = parrafo(doc, '* Dato por verificar con el lineamiento vigente del CeNSIA. ' + NOTAS_ESQUEMA.join(' '), y + 1, 6.8, 100)
  pie(doc, `Generado con MediSuite. ${ESQUEMA_VERSION}. Fechas entre paréntesis = fecha programada. No sustituye la Cartilla Nacional de Salud oficial.`)
  return doc.output('blob')
}

export interface FilaRecordatorio {
  paciente: Patient
  pendientes: EstadoDosis[]
}
export function recordatoriosPDF(filas: FilaRecordatorio[], s: Settings, hoy: string): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  let y = encabezado(doc, s, 'Recordatorios de vacunación', `Pacientes con dosis atrasadas o por aplicar · ${f(hoy)}`)
  y = tabla(doc, y, [{ t: 'Paciente', w: 1.6 }, { t: 'Teléfono', w: 0.9 }, { t: 'Vacunas pendientes', w: 4 }],
    filas.map((r) => [nombreCompleto(r.paciente), r.paciente.telefono ?? '', r.pendientes.map((e) => `${vacunaPorId(e.dosis.vacunaId)?.nombre} ${e.dosis.dosis} (${e.estado === 'atrasada' ? 'atrasada' : 'toca'})`).join('; ')]), 7.5)
  if (!filas.length) parrafo(doc, 'Sin pacientes con dosis pendientes.', y)
  pie(doc, `MediSuite · ${ESQUEMA_VERSION}`)
  return doc.output('blob')
}
