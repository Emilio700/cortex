// Plantillas de certificados, constancias, justificantes y cartas de referencia (lógica pura, sin React).
//
// Fundamento:
// - Ley General de Salud, art. 83: los documentos que expide el profesional deben consignar la institución que
//   expidió el título y el número de cédula profesional (el PDF lo pone en el encabezado).
// - NOM-004-SSA3-2012, Del expediente clínico, numeral 6.4 «Nota de referencia/traslado»: establecimiento que envía,
//   establecimiento receptor y resumen clínico con motivo de envío, impresión diagnóstica y terapéutica empleada.
// - Incapacidades IMSS: los certificados de incapacidad temporal para el trabajo con validez ante el IMSS solo los
//   expiden médicos del propio Instituto (Ley del Seguro Social y Reglamento de Prestaciones Médicas del IMSS). Un justificante privado no da derecho a subsidio.
// - Certificado de defunción: formato oficial foliado de la Secretaría de Salud (DGIS/SINBA); no se genera aquí.
import type { Diagnostico } from '../../lib/types'
import { canonico, sha256Hex } from '../ordenes/comun'

export type Plantilla = 'salud' | 'asistencia' | 'incapacidad' | 'prenupcial' | 'referencia'
export type EstadoCert = 'borrador' | 'emitido' | 'cancelado'

export interface InfoPlantilla {
  id: Plantilla
  nombre: string
  tipoRegistro: 'certificado' | 'referencia'
  prefijo: string
  descripcion: string
  aviso?: string
}

export const PLANTILLAS: InfoPlantilla[] = [
  { id: 'salud', nombre: 'Certificado médico de salud', tipoRegistro: 'certificado', prefijo: 'CM', descripcion: 'Buena salud, para trabajo, escolar o deportivo.' },
  { id: 'asistencia', nombre: 'Constancia de asistencia a consulta', tipoRegistro: 'certificado', prefijo: 'CM', descripcion: 'Hace constar que el paciente acudió a consulta en fecha y horario.' },
  {
    id: 'incapacidad',
    nombre: 'Justificante médico / reposo',
    tipoRegistro: 'certificado',
    prefijo: 'CM',
    descripcion: 'Días de reposo con fechas; el diagnóstico es opcional por privacidad.',
    aviso:
      'Las incapacidades temporales para el trabajo con validez oficial ante el IMSS solo las expide un médico del IMSS (Ley del Seguro Social y Reglamento de Prestaciones Médicas del IMSS). Este justificante es un documento médico privado: no genera subsidio ni sustituye la incapacidad del IMSS o ISSSTE.',
  },
  {
    id: 'prenupcial',
    nombre: 'Certificado médico prenupcial',
    tipoRegistro: 'certificado',
    prefijo: 'CM',
    descripcion: 'Para trámite de matrimonio civil.',
    aviso:
      'Los requisitos del certificado prenupcial (estudios como VDRL, VIH, grupo y Rh, vigencia y formato) los fija el Código Civil y el Registro Civil de cada entidad federativa, y algunas ya no lo exigen. Verifique los requisitos locales vigentes antes de emitirlo (verificar).',
  },
  { id: 'referencia', nombre: 'Carta de referencia / contrarreferencia', tipoRegistro: 'referencia', prefijo: 'RF', descripcion: 'Envío a especialidad u hospital con resumen clínico (NOM-004-SSA3-2012, 6.4).' },
]

export const infoPlantilla = (id: string): InfoPlantilla => PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[0]

export const FINALIDAD: Record<string, string> = {
  'buena-salud': 'Buena salud (general)',
  trabajo: 'Para trabajo / ingreso laboral',
  escolar: 'Escolar',
  deportivo: 'Deportivo',
}

export type Campos = Record<string, string | boolean | string[] | undefined>

export interface PacienteSnap {
  nombre: string
  edad: string
  sexo: 'F' | 'M' | 'O'
  curp?: string
}

export interface Seccion {
  titulo?: string
  texto: string
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const art = (sexo: PacienteSnap['sexo'], f: string, m: string, o = `${m}(a)`) => (sexo === 'F' ? f : sexo === 'M' ? m : o)

export function fechaLarga(isoDia: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDia) ? new Date(isoDia + 'T12:00:00') : new Date(isoDia)
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Días naturales de reposo entre dos fechas YYYY-MM-DD, inclusive (0 si son inválidas o invertidas). */
export function diasIncapacidad(desde: string, hasta: string): number {
  const a = Date.parse(desde + 'T12:00:00Z')
  const b = Date.parse(hasta + 'T12:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

/** Fecha final (inclusive) a partir de la inicial y el número de días. */
export function hastaPorDias(desde: string, dias: number): string {
  const a = Date.parse(desde + 'T12:00:00Z')
  if (!Number.isFinite(a) || dias < 1) return desde
  return new Date(a + (Math.round(dias) - 1) * 86_400_000).toISOString().slice(0, 10)
}

const NUM = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince']
/** "3 (tres) días" — los documentos médico-legales suelen escribir la cantidad también con letra. */
export function diasConLetra(n: number): string {
  const l = NUM[n]
  return `${n}${l ? ` (${l === 'un' ? 'un' : l})` : ''} día${n === 1 ? '' : 's'}`
}

export interface CtxResumen {
  alergias: string[]
  medicamentos: string[]
  antecedentes?: string
  ultimaNota?: { fecha: string; motivo?: string; subjetivo?: string; objetivo?: string; analisis?: string; plan?: string; diagnosticos: Diagnostico[] }
  signos: { etiqueta: string; valor: string; fecha: string }[]
}

const corto = (t: string | undefined, max: number) => {
  const x = (t ?? '').replace(/\s+/g, ' ').trim()
  return x.length > max ? x.slice(0, max - 1).trimEnd() + '…' : x
}

/** Resumen clínico auto-armado para la carta de referencia (el médico lo revisa y edita). */
export function resumenClinico(c: CtxResumen): string {
  const l: string[] = []
  if (c.antecedentes) l.push(`Antecedentes: ${corto(c.antecedentes, 400)}`)
  l.push(`Alergias: ${c.alergias.length ? c.alergias.join(', ') : 'negadas'}.`)
  l.push(`Medicamentos actuales: ${c.medicamentos.length ? c.medicamentos.join('; ') : 'ninguno referido'}.`)
  const n = c.ultimaNota
  if (n) {
    const partes = [n.motivo && `motivo: ${corto(n.motivo, 200)}`, n.subjetivo && `S: ${corto(n.subjetivo, 500)}`, n.objetivo && `O: ${corto(n.objetivo, 500)}`, n.analisis && `A: ${corto(n.analisis, 400)}`, n.plan && `P: ${corto(n.plan, 300)}`].filter(Boolean)
    if (partes.length) l.push(`Última consulta (${fechaLarga(n.fecha)}): ${partes.join('. ')}.`.replace(/\.\./g, '.'))
  }
  if (c.signos.length) l.push(`Signos vitales recientes: ${c.signos.map((x) => `${x.etiqueta} ${x.valor}`).join(', ')}.`)
  return l.join('\n')
}

/** Texto del documento por plantilla. Se congela al emitir. */
export function generarCuerpo(plantilla: Plantilla, c: Campos, p: PacienteSnap, fechaISO: string, medico: { nombre: string; cedula: string }): Seccion[] {
  const fecha = fechaLarga(fechaISO.slice(0, 10))
  const el = art(p.sexo, 'la', 'el', 'el(la)')
  const pac = `${p.nombre}${p.curp ? `, con CURP ${p.curp},` : ','} de ${p.edad} de edad`
  const suscribe = `Quien suscribe, ${medico.nombre || 'médico tratante'}, con cédula profesional ${medico.cedula || '—'}`
  const destinatario = s(c.destinatario) || 'A quien corresponda'
  const out: Seccion[] = [{ texto: destinatario + ':' }]
  const somato = () =>
    [
      s(c.peso) && `peso ${s(c.peso)} kg`,
      s(c.talla) && `talla ${s(c.talla)} cm`,
      s(c.ta) && `TA ${s(c.ta)} mmHg`,
      s(c.fc) && `FC ${s(c.fc)} lpm`,
      s(c.fr) && `FR ${s(c.fr)} rpm`,
      s(c.temp) && `temperatura ${s(c.temp)} °C`,
      s(c.agudeza) && `agudeza visual ${s(c.agudeza)}`,
    ]
      .filter(Boolean)
      .join(', ')

  switch (plantilla) {
    case 'salud': {
      const fin = s(c.finalidad) || 'buena-salud'
      out.push({ texto: `${suscribe}, CERTIFICA que el día ${fecha} practicó examen médico a ${pac}, encontrando lo siguiente:` })
      const sv = somato()
      if (sv) out.push({ titulo: 'Signos vitales y somatometría', texto: sv + '.' })
      if (s(c.tipoSangre)) out.push({ titulo: 'Grupo sanguíneo y Rh', texto: s(c.tipoSangre) + (c.tipoSangreReferido ? ' (referido por el paciente).' : '.') })
      out.push({ titulo: 'Exploración física', texto: s(c.hallazgos) || 'Sin alteraciones clínicas aparentes al momento de la exploración.' })
      const concl = s(c.conclusion) || 'apto'
      const para =
        fin === 'trabajo'
          ? 'para desempeñar actividades laborales'
          : fin === 'escolar'
            ? 'para realizar actividades escolares, incluidas las de educación física'
            : fin === 'deportivo'
              ? `para realizar actividad física y deportiva${s(c.deporte) ? ` (${s(c.deporte)})` : ''}`
              : ''
      const sano = art(p.sexo, 'clínicamente sana', 'clínicamente sano', 'clínicamente sano(a)')
      const apto = art(p.sexo, 'apta', 'apto', 'apto(a)')
      let conclusion: string
      if (concl === 'no-apto') conclusion = `Con base en la valoración, por el momento se considera ${art(p.sexo, 'NO apta', 'NO apto', 'NO apto(a)')} ${para || 'para la actividad solicitada'}${s(c.restricciones) ? `: ${s(c.restricciones)}` : ''}.`
      else if (concl === 'apto-restricciones') conclusion = `Se considera ${apto} ${para || 'para sus actividades habituales'}, con las siguientes restricciones o recomendaciones: ${s(c.restricciones) || '—'}.`
      else conclusion = fin === 'buena-salud' ? `Por lo anterior, a la exploración se encuentra ${sano}.` : `Por lo anterior, a la exploración se encuentra ${sano} y ${apto} ${para}.`
      out.push({ titulo: 'Conclusión', texto: conclusion })
      if (fin === 'deportivo') out.push({ texto: 'La valoración clínica preparticipativa no descarta por completo enfermedad cardiovascular; ante síntomas durante el esfuerzo (dolor torácico, desmayo, palpitaciones o falta de aire desproporcionada) debe suspender la actividad y acudir a valoración.' })
      if (s(c.vigencia)) out.push({ texto: `Vigencia sugerida: ${s(c.vigencia)}.` })
      out.push({ texto: `Se extiende el presente a solicitud de ${el} interesad${art(p.sexo, 'a', 'o', 'o(a)')} para los fines que ${art(p.sexo, 'a ella', 'a él', 'a él/ella')} convengan, en la fecha arriba indicada.` })
      break
    }
    case 'asistencia': {
      const horario = s(c.horaLlegada) && s(c.horaSalida) ? ` en un horario de ${s(c.horaLlegada)} a ${s(c.horaSalida)} horas` : s(c.horaLlegada) ? ` a las ${s(c.horaLlegada)} horas` : ''
      out.push({ texto: `${suscribe}, HACE CONSTAR que ${pac}, acudió a ${s(c.motivo) || 'consulta médica'} en este consultorio el día ${fechaLarga(s(c.fechaAtencion) || fechaISO.slice(0, 10))}${horario}.` })
      if (s(c.acompanante)) out.push({ texto: `Acudió en compañía de ${s(c.acompanante)}${s(c.parentesco) ? ` (${s(c.parentesco)})` : ''}, quien permaneció durante la atención.` })
      out.push({ texto: 'Se extiende la presente constancia a solicitud del interesado para los fines que le convengan.' })
      break
    }
    case 'incapacidad': {
      const desde = s(c.desde) || fechaISO.slice(0, 10)
      const hasta = s(c.hasta) || desde
      const dias = diasIncapacidad(desde, hasta)
      const act = s(c.actividad) === 'escolares' ? 'escolares' : s(c.actividad) === 'habituales' ? 'habituales' : 'laborales'
      const reposo = s(c.reposo) === 'absoluto' ? 'reposo absoluto' : 'reposo relativo en domicilio'
      out.push({ texto: `${suscribe}, HACE CONSTAR que en esta fecha valoró a ${pac}, quien presenta un padecimiento que le impide realizar temporalmente sus actividades ${act}.` })
      if (c.incluirDx && s(c.diagnostico)) out.push({ titulo: 'Diagnóstico', texto: s(c.diagnostico) })
      out.push({ texto: `Por ello se indica ${reposo} por ${diasConLetra(dias)}, del ${fechaLarga(desde)} al ${fechaLarga(hasta)}, ambos inclusive, salvo nueva valoración médica.` })
      if (s(c.recomendaciones)) out.push({ titulo: 'Recomendaciones', texto: s(c.recomendaciones) })
      out.push({ texto: 'Este documento es un justificante médico privado; no constituye certificado de incapacidad del IMSS ni del ISSSTE.' })
      break
    }
    case 'prenupcial': {
      out.push({ texto: `${suscribe}, CERTIFICA que el día ${fecha} practicó examen médico prenupcial a ${pac}, con los siguientes resultados:` })
      const sv = somato()
      if (sv) out.push({ titulo: 'Signos vitales y somatometría', texto: sv + '.' })
      const est = [
        s(c.tipoSangre) && `Grupo sanguíneo y Rh: ${s(c.tipoSangre)}`,
        s(c.vdrl) && `VDRL: ${s(c.vdrl)}`,
        s(c.vih) && `Prueba de VIH: ${s(c.vih)}`,
        s(c.otrosEstudios),
      ].filter(Boolean)
      if (est.length) out.push({ titulo: 'Estudios de laboratorio', texto: est.join('\n') + (s(c.fechaEstudios) ? `\nFecha de los estudios: ${fechaLarga(s(c.fechaEstudios))}.` : '') })
      out.push({ titulo: 'Exploración física', texto: s(c.hallazgos) || 'Sin alteraciones clínicas aparentes al momento de la exploración.' })
      out.push({
        titulo: 'Conclusión',
        texto:
          s(c.conclusion) ||
          `Con base en la exploración clínica y los estudios referidos, no se encontraron datos de enfermedad infectocontagiosa activa al momento de la valoración.`,
      })
      out.push({ texto: 'Se extiende el presente para el trámite de matrimonio civil ante el Registro Civil.' })
      break
    }
    case 'referencia': {
      const contra = s(c.modalidad) === 'contrarreferencia'
      out.push({ titulo: 'Establecimiento que envía', texto: s(c.origen) || '—' })
      out.push({ titulo: 'Establecimiento / servicio receptor', texto: [s(c.destino), s(c.especialidad) && `Especialidad: ${s(c.especialidad)}`].filter(Boolean).join('\n') || '—' })
      const urg = s(c.urgencia) === 'urgente' ? 'URGENTE' : s(c.urgencia) === 'preferente' ? 'Preferente' : 'Ordinaria'
      out.push({ titulo: 'Prioridad', texto: urg })
      out.push({ titulo: contra ? 'Motivo de la contrarreferencia' : 'Motivo de envío', texto: s(c.motivo) || '—' })
      out.push({ titulo: 'Resumen clínico', texto: s(c.resumen) || '—' })
      out.push({ titulo: 'Impresión diagnóstica', texto: s(c.impresionDx) || '—' })
      out.push({ titulo: 'Terapéutica empleada', texto: s(c.tratamiento) || 'Ninguna' })
      const adj = Array.isArray(c.estudiosAdjuntos) ? c.estudiosAdjuntos : []
      const est = [...adj, s(c.estudiosTexto)].filter(Boolean)
      if (est.length) out.push({ titulo: 'Estudios que se anexan', texto: est.map((x) => `• ${x}`).join('\n') })
      if (s(c.recomendaciones)) out.push({ titulo: contra ? 'Indicaciones y seguimiento sugerido' : 'Solicitud al servicio receptor', texto: s(c.recomendaciones) })
      out.push({ texto: contra ? 'Agradezco la atención brindada y quedo a sus órdenes para el seguimiento del paciente.' : 'Agradeceré su valoración y la contrarreferencia correspondiente con sus hallazgos e indicaciones.' })
      break
    }
  }
  return out
}

/** Contenido que firma la huella: lo emitido no puede cambiar sin que la verificación falle. */
export function contenidoHuella(x: { folio: string; tipo: string; plantilla: string; patientId?: string; paciente: PacienteSnap; cuerpo: Seccion[]; emitidoEn: string; cedula: string }) {
  return canonico({ v: 1, ...x })
}

/** Huella SHA-256 (hex) del documento emitido. En el QR va abreviada a 16 caracteres. */
export function huella(x: Parameters<typeof contenidoHuella>[0]): string {
  return sha256Hex(contenidoHuella(x))
}

export function urlVerificacion(base: string, folio: string, hash: string): string {
  return `${base}#/certificados?v=${encodeURIComponent(folio)}&h=${hash.slice(0, 16)}`
}

export type ResultadoVerificacion = 'valido' | 'cancelado' | 'alterado' | 'no-encontrado' | 'borrador'
/** Compara el hash del QR con el recalculado del registro guardado. */
export function verificar(reg: { estado?: string; datos: Record<string, unknown> } | undefined, hashQR: string, recalcular: () => string): ResultadoVerificacion {
  if (!reg) return 'no-encontrado'
  if (reg.estado === 'borrador') return 'borrador'
  const guardado = String(reg.datos.hash ?? '')
  const actual = recalcular()
  if (!guardado || actual !== guardado || !guardado.startsWith(hashQR.toLowerCase())) return 'alterado'
  return reg.estado === 'cancelado' ? 'cancelado' : 'valido'
}
