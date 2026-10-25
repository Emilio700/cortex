// "Carnet perinatal" en PDF (jsPDF).
import { jsPDF } from 'jspdf'
import type { Patient, Registro, Settings } from '../../lib/types'
import { alertasConsulta, categoriaIMC, imc, IOM, sdgTexto } from './calc'
import { datacionDe, datosCons, datosEmb, type DatosEmbarazo } from './modelo'
import { encabezado, datosPaciente, seccion, tabla, parrafo, pie } from './pdfbase'

const f = (iso?: string | null) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export function carnetPDF(p: Patient, emb: Registro, consultas: Registro[], s: Settings, hoy: string): Blob {
  const e: DatosEmbarazo = datosEmb(emb)
  const d = datacionDe(e)
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  doc.setProperties({ title: `Carnet perinatal — ${p.nombre} ${p.apellidos}`, creator: 'MediSuite' })
  let y = encabezado(doc, s, 'Carnet perinatal', 'Control prenatal conforme a la NOM-007-SSA2-2016')
  const sdgHoy = d.fumEfectiva ? Math.round((Date.parse((e.resolucion?.fecha ?? hoy) + 'T12:00:00Z') - Date.parse(d.fumEfectiva + 'T12:00:00Z')) / 864e5) : null
  y = datosPaciente(doc, p, y, [
    ['Grupo y Rh', e.grupoRh || p.tipoSangre || '—'],
    ['G / P / C / A', `${e.gesta} / ${e.para} / ${e.cesareas} / ${e.abortos}`],
    ['Alergias', p.alergias.join(', ') || 'Negadas'],
    ['Estado', emb.estado === 'terminado' ? 'Terminado' : 'En curso'],
  ])

  y = seccion(doc, 'Datación', y)
  const imcPre = e.pesoPre && e.talla ? imc(e.pesoPre, e.talla) : null
  y = tabla(doc, y, [{ t: 'FUM', w: 1 }, { t: 'USG de datación', w: 1.4 }, { t: 'Método', w: 0.7 }, { t: 'FPP', w: 1 }, { t: e.resolucion ? 'SDG a la resolución' : 'SDG hoy', w: 1 }, { t: 'IMC pregestacional', w: 1.4 }], [[
    f(e.fum),
    e.usg ? `${f(e.usg.fecha)} · ${sdgTexto(e.usg.sdgDias)}${e.usg.lcc ? ` (LCC ${e.usg.lcc} mm)` : ''}` : '—',
    d.metodo,
    f(d.fpp),
    sdgHoy !== null ? sdgTexto(sdgHoy) : '—',
    imcPre ? `${imcPre.toFixed(1)} kg/m² · ${IOM[categoriaIMC(imcPre)].label} (ganancia IOM ${IOM[categoriaIMC(imcPre)].total.join('–')} kg)` : '—',
  ]])
  y = parrafo(doc, d.explicacion + ' (ACOG CO 700)', y, 7, 90)
  if (e.riesgos.length || e.riesgoNotas) y = parrafo(doc, `Factores de riesgo: ${[...e.riesgos, e.riesgoNotas].filter(Boolean).join('; ')}`, y + 1, 8, 30)

  y = seccion(doc, 'Consultas prenatales', y + 2)
  const cs = [...consultas].sort((a, b) => a.fecha.localeCompare(b.fecha))
  y = tabla(
    doc,
    y,
    [{ t: 'Fecha', w: 1 }, { t: 'SDG', w: 0.8 }, { t: 'Peso', w: 0.6 }, { t: 'TA', w: 0.8 }, { t: 'AU', w: 0.5 }, { t: 'FCF', w: 0.5 }, { t: 'Mov.', w: 0.8 }, { t: 'Edema', w: 0.7 }, { t: 'Prot.', w: 0.6 }, { t: 'Present.', w: 0.8 }, { t: 'Notas / alertas', w: 2.6 }],
    cs.map((r) => {
      const c = datosCons(r)
      const al = alertasConsulta(c, c.sdgDias ?? null).map((a) => '! ' + a.texto)
      return [f(c.fecha), c.sdgDias !== undefined ? sdgTexto(c.sdgDias) : '—', c.peso ? `${c.peso}` : '', c.pas ? `${c.pas}/${c.pad ?? '—'}` : '', c.au ? `${c.au}` : '', c.fcf ? `${c.fcf}` : '', c.movimientos || '', c.edema || '', c.proteinuria || '', c.presentacion || '', [c.notas, ...al].filter(Boolean).join(' ')]
    }),
    7,
  )
  if (!cs.length) y = parrafo(doc, 'Sin consultas registradas.', y)

  if (e.biometrias?.length) {
    y = seccion(doc, 'Ultrasonidos / biometría fetal', y + 2)
    y = tabla(doc, y, [{ t: 'Fecha', w: 1 }, { t: 'EG', w: 0.8 }, { t: 'LCC mm', w: 0.7 }, { t: 'CC cm', w: 0.7 }, { t: 'CA cm', w: 0.7 }, { t: 'LF cm', w: 0.7 }, { t: 'PFE*', w: 1 }, { t: 'Percentil**', w: 0.9 }, { t: 'Notas', w: 2 }],
      e.biometrias.map((b) => [f(b.fecha), b.sdgDias !== undefined ? sdgTexto(b.sdgDias) : '—', b.lcc ? `${b.lcc}` : '', b.cc ? `${b.cc}` : '', b.ca ? `${b.ca}` : '', b.lf ? `${b.lf}` : '', b.pfe ? `${Math.round(b.pfe)} g` : '', b.percentil !== undefined ? `p${b.percentil.toFixed(0)}` : '', b.notas ?? '']), 7)
    y = parrafo(doc, '* Peso fetal estimado, Hadlock 1985 (CC, CA, LF). ** Percentil con la ecuación de Hadlock 1991 (DE 12.7 %).', y, 6.8, 100)
  }

  if (e.resolucion) {
    const r = e.resolucion
    y = seccion(doc, 'Resolución del embarazo', y + 2)
    y = tabla(doc, y, [{ t: 'Fecha', w: 1 }, { t: 'Tipo', w: 1 }, { t: 'SDG', w: 0.8 }, { t: 'RN sexo', w: 0.7 }, { t: 'RN peso', w: 0.8 }, { t: 'Apgar', w: 0.7 }, { t: 'Notas', w: 3 }],
      [[f(r.fecha), r.tipo, r.sdgDias !== undefined ? sdgTexto(r.sdgDias) : '—', r.rnSexo || '—', r.rnPeso ? `${r.rnPeso} g` : '—', r.apgar || '—', r.notas || '']])
  }

  y = seccion(doc, 'Signos de alarma — acuda de inmediato a urgencias si presenta:', y + 2)
  y = parrafo(doc, 'Dolor de cabeza intenso, visión borrosa o lucecitas, zumbido de oídos, dolor en la boca del estómago, hinchazón de cara o manos, sangrado o salida de líquido por la vagina, fiebre, convulsiones, contracciones antes de las 37 semanas, o si el bebé se mueve menos o deja de moverse (NOM-007-SSA2-2016).', y, 8, 30)
  pie(doc, `Generado con MediSuite el ${f(hoy)}. Datación: ACOG CO 700. Ganancia de peso: IOM 2009. Peso fetal: Hadlock 1985; percentil: ecuación de Hadlock 1991. Documento de apoyo; no sustituye el expediente clínico.`)
  return doc.output('blob')
}
