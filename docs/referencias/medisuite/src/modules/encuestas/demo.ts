// ~40 respuestas sintéticas de satisfacción en los últimos 3 meses (con ligera mejora en el tiempo).
import type { Registro } from '../../lib/types'
import { PLANTILLA_BASE, tituloEncuesta } from './nps'

const BUENOS = [
  'La doctora explicó todo con mucha paciencia.',
  'Muy amables en recepción, gracias.',
  'Excelente atención, me sentí escuchada.',
  'Todo muy limpio y ordenado.',
  'Me atendieron puntual, muy bien.',
  'El recordatorio por WhatsApp me ayudó mucho.',
]
const REGULARES = [
  'Buena consulta pero esperé casi 40 minutos.',
  'El estacionamiento es complicado.',
  'La sala de espera estaba muy calurosa, falta aire acondicionado.',
  'Bien en general, aunque el precio subió.',
]
const MALOS = [
  'Esperé más de una hora y nadie me avisó del retraso.',
  'No contestan el teléfono para agendar cita.',
  'El baño no estaba limpio.',
  'Me pareció caro para lo rápido de la consulta.',
]

export function demoEncuestas(now: number): Registro[] {
  let seed = 20261024
  const r = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const DIA = 864e5
  const medicos = ['Dra. Andrea Morales Peña', 'Dr. Emilio Navarro Ríos']
  const pacientes = ['p1', 'p2', 'p4', 'p6', 'p7']
  const out: Registro[] = []
  const N = 40
  for (let i = 0; i < N; i++) {
    const hace = Math.round(88 - (i * 86) / (N - 1)) // de hace 88 días a hace 2
    const t = now - hace * DIA + Math.floor(r() * 8 + 9) * 3600e3
    const progreso = i / N // las más recientes tienden a ser mejores
    const u = r() + progreso * 0.25
    const nps = u > 0.55 ? (r() < 0.6 ? 10 : 9) : u > 0.3 ? (r() < 0.5 ? 8 : 7) : Math.floor(r() * 5) + 2
    const base = nps >= 9 ? 5 : nps >= 7 ? 4 : 3
    const esc = (sesgo = 0) => Math.max(1, Math.min(5, base + sesgo + (r() < 0.25 ? -1 : 0)))
    const respuestas: Record<string, number | string> = {
      nps,
      atencion: esc(0),
      espera: esc(nps < 7 ? -1 : r() < 0.4 ? -1 : 0),
      trato: esc(0),
      limpieza: esc(0),
    }
    if (r() < 0.55) respuestas.comentarios = nps >= 9 ? pick(BUENOS) : nps >= 7 ? pick(REGULARES) : pick(MALOS)
    const patientId = i % 8 === 3 ? pacientes[Math.floor(i / 8) % pacientes.length] : undefined
    out.push({
      id: `demo-encuesta-${i + 1}`,
      tipo: 'encuesta',
      fecha: new Date(t).toISOString(),
      patientId,
      estado: 'respondida',
      titulo: tituloEncuesta(respuestas),
      datos: {
        respuestas,
        preguntas: PLANTILLA_BASE.preguntas.map(({ id, tipo, texto }) => ({
          id,
          tipo,
          texto,
        })),
        medico: r() < 0.65 ? medicos[0] : medicos[1],
        canal: r() < 0.8 ? 'kiosco' : 'qr',
      },
    })
  }
  return out
}
