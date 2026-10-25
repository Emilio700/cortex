// Reúne los datos del paciente activo en una ficha estructurada (para la IA o el resumen local).
import type { DB, Patient, Observation, Encounter } from '../../lib/types'
import { edad, fmtFecha, OBS_LABELS } from '../../lib/utils'
import { ANALITOS, bandera } from '../ocr/parser'

export interface Tendencia {
  codigo: string
  label: string
  ultimo: Observation
  previo?: Observation
  n: number
  flag?: 'alto' | 'bajo' | 'normal'
}

export interface Contexto {
  p: Patient
  edad: string
  consultas: Encounter[] // más recientes primero
  vitales: Tendencia[]
  labs: Tendencia[]
  otras: Tendencia[]
  ultimaReceta?: DB['prescriptions'][number]
  proximasCitas: DB['appointments']
  sinFirmar: Encounter[]
}

const VITALES = ['pas', 'pad', 'fc', 'fr', 'temp', 'spo2', 'peso', 'talla', 'imc', 'cintura']

export function construirContexto(db: DB, patientId: string): Contexto | null {
  const p = db.patients.find((x) => x.id === patientId)
  if (!p) return null
  const obs = db.observations.filter((o) => o.patientId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const porCodigo = new Map<string, Observation[]>()
  for (const o of obs) porCodigo.set(o.codigo, [...(porCodigo.get(o.codigo) ?? []), o])
  const tend = (codigo: string, arr: Observation[]): Tendencia => {
    const a = ANALITOS.find((x) => x.codigo === codigo)
    const label = a?.label ?? OBS_LABELS[codigo]?.label ?? arr[0].etiqueta ?? codigo
    return {
      codigo,
      label,
      ultimo: arr[0],
      previo: arr[1],
      n: arr.length,
      flag: a ? bandera({ valor: arr[0].valor, refBaja: a.ref[0], refAlta: a.ref[1] }) : undefined,
    }
  }
  const vitales: Tendencia[] = [], labs: Tendencia[] = [], otras: Tendencia[] = []
  for (const [c, arr] of porCodigo) {
    const t = tend(c, arr)
    if (VITALES.includes(c)) vitales.push(t)
    else if (ANALITOS.some((a) => a.codigo === c) || c === 'tfg') labs.push(t)
    else otras.push(t)
  }
  vitales.sort((a, b) => VITALES.indexOf(a.codigo) - VITALES.indexOf(b.codigo))
  const consultas = db.encounters.filter((e) => e.patientId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const now = new Date().toISOString()
  return {
    p,
    edad: edad(p.fechaNac).texto,
    consultas,
    vitales,
    labs,
    otras,
    ultimaReceta: db.prescriptions.filter((r) => r.patientId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0],
    proximasCitas: db.appointments
      .filter((a) => a.patientId === p.id && a.inicio > now && !['cancelada', 'atendida', 'no-asistio'].includes(a.estado))
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
    sinFirmar: consultas.filter((e) => !e.firmada),
  }
}

export function flecha(t: Tendencia) {
  if (!t.previo) return ''
  const d = t.ultimo.valor - t.previo.valor
  if (Math.abs(d) < Math.abs(t.previo.valor) * 0.02) return '→'
  return d > 0 ? '↑' : '↓'
}

const linea = (t: Tendencia) =>
  `${t.label}: ${t.ultimo.valor} ${t.ultimo.unidad} (${fmtFecha(t.ultimo.fecha)})` +
  (t.previo ? ` ${flecha(t)} previo ${t.previo.valor}` : '') +
  (t.flag && t.flag !== 'normal' ? ` [${t.flag.toUpperCase()}]` : '')

/** Ficha en texto plano (se desidentifica antes de enviarse). Usa [PACIENTE] en lugar del nombre. */
export function fichaTexto(c: Contexto): string {
  const s: string[] = []
  s.push(`Paciente: [PACIENTE], ${c.edad}, sexo ${c.p.sexo === 'F' ? 'femenino' : c.p.sexo === 'M' ? 'masculino' : 'otro'}${c.p.tipoSangre ? `, grupo ${c.p.tipoSangre}` : ''}.`)
  s.push(`Alergias: ${c.p.alergias.length ? c.p.alergias.join(', ') : 'negadas / no registradas'}.`)
  if (c.p.medicamentosActuales?.length) s.push(`Medicamentos actuales: ${c.p.medicamentosActuales.join('; ')}.`)
  if (c.p.antecedentes) s.push(`Antecedentes: ${c.p.antecedentes}`)
  if (c.p.notas) s.push(`Notas: ${c.p.notas}`)
  if (c.consultas.length) {
    s.push('\nÚltimas consultas:')
    for (const e of c.consultas.slice(0, 3)) {
      s.push(`- ${fmtFecha(e.fecha)}${e.motivo ? ` · Motivo: ${e.motivo}` : ''}${e.firmada ? '' : ' (nota sin firmar)'}`)
      if (e.diagnosticos.length) s.push(`  Dx: ${e.diagnosticos.map((d) => `${d.nombre} (${d.codigo})`).join('; ')}`)
      if (e.analisis) s.push(`  A: ${e.analisis.slice(0, 300)}`)
      if (e.plan) s.push(`  P: ${e.plan.slice(0, 300)}`)
    }
  }
  if (c.vitales.length) s.push('\nSignos vitales y somatometría (último registro):\n' + c.vitales.map((t) => '- ' + linea(t)).join('\n'))
  if (c.labs.length) s.push('\nLaboratorios (último registro):\n' + c.labs.map((t) => '- ' + linea(t)).join('\n'))
  if (c.otras.length) s.push('\nOtras mediciones:\n' + c.otras.slice(0, 8).map((t) => '- ' + linea(t)).join('\n'))
  if (c.ultimaReceta) s.push(`\nÚltima receta (${fmtFecha(c.ultimaReceta.fecha)}): ${c.ultimaReceta.items.map((i) => `${i.medicamento} ${i.dosis} ${i.frecuencia}`).join('; ')}`)
  if (c.proximasCitas.length) s.push(`\nPróxima cita: ${fmtFecha(c.proximasCitas[0].inicio)} (${c.proximasCitas[0].tipo})`)
  return s.join('\n')
}
