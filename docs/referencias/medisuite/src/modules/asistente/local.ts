// Generación local sin LLM: plantillas deterministas a partir de los datos (siempre disponible, sin red).
import { fmtFecha, nombreCompleto } from '../../lib/utils'
import type { Settings } from '../../lib/types'
import { flecha, type Contexto, type Tendencia } from './contexto'

const lin = (t: Tendencia) =>
  `- **${t.label}:** ${t.ultimo.valor} ${t.ultimo.unidad} (${fmtFecha(t.ultimo.fecha)})${t.previo ? ` ${flecha(t)} previo ${t.previo.valor}` : ''}${t.flag && t.flag !== 'normal' ? ` — **${t.flag === 'alto' ? 'ALTO' : 'BAJO'}**` : ''}`

export function resumenLocal(c: Contexto): string {
  const s: string[] = []
  s.push(`## Resumen pre-consulta`)
  s.push(`**${nombreCompleto(c.p)}**, ${c.edad}, ${c.p.sexo === 'F' ? 'femenino' : c.p.sexo === 'M' ? 'masculino' : 'otro'}${c.p.tipoSangre ? `, ${c.p.tipoSangre}` : ''}.`)
  s.push(`\n### Alergias\n${c.p.alergias.length ? c.p.alergias.map((a) => `- **${a}**`).join('\n') : '- Sin alergias registradas'}`)
  s.push(`\n### Medicamentos actuales\n${c.p.medicamentosActuales?.length ? c.p.medicamentosActuales.map((m) => `- ${m}`).join('\n') : '- No registrados'}`)
  if (c.p.antecedentes) s.push(`\n### Antecedentes\n${c.p.antecedentes}`)
  s.push(`\n### Últimas consultas`)
  if (!c.consultas.length) s.push('- Sin consultas previas')
  for (const e of c.consultas.slice(0, 3)) {
    s.push(`- **${fmtFecha(e.fecha)}**${e.motivo ? ` — ${e.motivo}` : ''}${e.diagnosticos.length ? ` · Dx: ${e.diagnosticos.map((d) => d.nombre).join(', ')}` : ''}${e.plan ? ` · Plan: ${e.plan.split('\n')[0].slice(0, 140)}` : ''}`)
  }
  if (c.vitales.length) s.push(`\n### Signos vitales recientes\n${c.vitales.map(lin).join('\n')}`)
  if (c.labs.length) s.push(`\n### Laboratorios\n${c.labs.map(lin).join('\n')}`)
  const pend: string[] = []
  const fuera = c.labs.filter((t) => t.flag && t.flag !== 'normal')
  if (fuera.length) pend.push(`Revisar valores fuera de rango: ${fuera.map((t) => t.label).join(', ')}`)
  const viejos = c.labs.filter((t) => Date.now() - new Date(t.ultimo.fecha).getTime() > 180 * 864e5)
  if (viejos.length) pend.push(`Laboratorios con más de 6 meses: ${viejos.map((t) => t.label).join(', ')}`)
  if (c.sinFirmar.length) pend.push(`${c.sinFirmar.length} nota(s) sin firmar`)
  if (c.proximasCitas.length) pend.push(`Próxima cita: ${fmtFecha(c.proximasCitas[0].inicio)}`)
  s.push(`\n### Pendientes\n${pend.length ? pend.map((p) => `- ${p}`).join('\n') : '- Ninguno detectado'}`)
  return s.join('\n')
}

const REGLAS: [keyof Soap, RegExp][] = [
  ['P', /\b(indic|recet|tomar|toma |tome|cada \d|mg\b|tabletas?|c[aá]psulas?|control|cita|regres|solicit|laboratorio|estudios?|referir|referencia|dieta|ejercicio|reposo|se le da|iniciar|suspender|continuar)/i],
  ['A', /\b(diagn[oó]stic|impresi[oó]n|probable|compatible|descart|sugestiv|se trata de|cuadro de|considero)/i],
  ['O', /\b(t\/?a\b|tensi[oó]n|presi[oó]n arterial|fc\b|frecuencia|temperatura|sat|spo2|peso|talla|imc|exploraci[oó]n|a la exploraci[oó]n|se observa|se palpa|ausculta|abdomen|faringe|ruidos|campos pulmonares|consciente|orientad|\d+\s?(mmhg|lpm|°c|kg|cm))/i],
]

export type Soap = { S: string[]; O: string[]; A: string[]; P: string[] }

export function soapLocal(trans: string, c: Contexto | null): string {
  const soap: Soap = { S: [], O: [], A: [], P: [] }
  const frases = trans.replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+/).map((f) => f.trim()).filter(Boolean)
  for (const f of frases) soap[(REGLAS.find(([, re]) => re.test(f))?.[0] ?? 'S') as keyof Soap].push(f)
  if (c?.vitales.length && !soap.O.length) soap.O.push(`Últimos signos registrados: ${c.vitales.slice(0, 5).map((t) => `${t.label} ${t.ultimo.valor} ${t.ultimo.unidad}`).join(', ')}.`)
  const sec = (t: string, a: string[]) => `## ${t}\n${a.length ? a.join(' ') : '_Sin información en la transcripción._'}`
  return [
    sec('Subjetivo', soap.S),
    sec('Objetivo', soap.O),
    sec('Análisis', soap.A),
    sec('Plan', soap.P),
    '\n_Clasificación automática por palabras clave (sin IA). Revisa y reubica las frases._',
  ].join('\n\n')
}

export function referenciaLocal(c: Contexto, destino: string, motivo: string, s: Settings): string {
  const ult = c.consultas[0]
  return `## Carta de referencia

**Fecha:** ${fmtFecha(new Date().toISOString())}
**A:** ${destino || 'Servicio / especialista'}
**Paciente:** ${nombreCompleto(c.p)}, ${c.edad}

Por medio de la presente refiero a mi paciente para su valoración y manejo por ${motivo || 'el motivo que se describe'}.

### Antecedentes relevantes
${c.p.antecedentes || 'Sin antecedentes registrados.'}
- **Alergias:** ${c.p.alergias.join(', ') || 'negadas'}
- **Medicamentos:** ${c.p.medicamentosActuales?.join('; ') || 'ninguno registrado'}

### Cuadro actual
${ult ? `${ult.subjetivo || ''} ${ult.analisis ? `\n\n**Impresión diagnóstica:** ${ult.analisis}` : ''}`.trim() : 'Ver motivo de referencia.'}
${ult?.diagnosticos.length ? `\n**Diagnósticos:** ${ult.diagnosticos.map((d) => `${d.nombre} (${d.codigo})`).join('; ')}` : ''}

### Estudios recientes
${[...c.vitales.slice(0, 4), ...c.labs].map(lin).join('\n') || '- Sin estudios registrados'}

Agradezco de antemano la atención brindada y quedo a sus órdenes.

**${s.doctor.nombre}**
${s.doctor.especialidad} · Céd. Prof. ${s.doctor.cedula}
${s.doctor.telefono} · ${s.doctor.email}`
}

export function instruccionesLocal(c: Contexto, indic: string): string {
  return `## Indicaciones para ${c.p.nombre}

### Sus medicamentos
${c.p.medicamentosActuales?.length ? c.p.medicamentosActuales.map((m) => `- ${m}`).join('\n') : '- Siga la receta que le entregamos.'}

### Qué hacer en casa
${indic.trim() ? indic.split(/\n|(?<=\.)\s+/).filter(Boolean).map((l) => `- ${l.trim()}`).join('\n') : '- Siga las indicaciones de su médico.'}

### Acuda a urgencias si presenta
- Dificultad para respirar o dolor de pecho
- Fiebre que no baja o confusión
- Cualquier síntoma que empeore rápidamente

${c.p.alergias.length ? `**Recuerde:** usted es alérgico(a) a ${c.p.alergias.join(', ')}. Dígalo siempre antes de recibir un medicamento.` : ''}

${c.proximasCitas.length ? `**Su próxima cita:** ${fmtFecha(c.proximasCitas[0].inicio)}` : '**Agende su cita de control** según le indicó su médico.'}`
}
