/**
 * El texto del aviso resumen al entrar: «Tienes 2 pacientes en sala y 1
 * consulta finalizada».
 *
 * Lo que llegó mientras la usuaria no tenía GEMS abierto antes sólo sumaba al
 * contador (plan 27, F-4): el médico entraba con el paciente ya en sala y
 * nada se lo decía. Un emergente por aviso, en cambio, inundaría la pantalla
 * al entrar; por eso es uno solo, que cuenta por tipo.
 */
import type { Notification } from '../types/notification'

const FRASES: Record<string, [singular: string, plural: string]> = {
  patient_arrived: ['paciente en sala', 'pacientes en sala'],
  consultation_completed: ['consulta finalizada', 'consultas finalizadas'],
  prenatal_review_due: ['control prenatal por agendar', 'controles prenatales por agendar'],
  diagnostic_result_received: ['resultado por revisar', 'resultados por revisar'],
  appointment_cancelled: ['cita cancelada', 'citas canceladas'],
  appointment_rescheduled: ['cita reprogramada', 'citas reprogramadas'],
  system_alert: ['aviso del sistema', 'avisos del sistema'],
}

const OTRO: [string, string] = ['aviso por atender', 'avisos por atender']

const enumerar = (partes: string[]): string =>
  partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`

export function resumenDeAvisos(avisos: Pick<Notification, 'type'>[]): string {
  const cuenta = new Map<string, number>()
  for (const aviso of avisos) {
    const tipo = aviso.type in FRASES ? aviso.type : 'otro'
    cuenta.set(tipo, (cuenta.get(tipo) ?? 0) + 1)
  }
  const partes = Array.from(cuenta, ([tipo, n]) => {
    const [singular, plural] = FRASES[tipo] ?? OTRO
    return `${n} ${n === 1 ? singular : plural}`
  })
  return `Tienes ${enumerar(partes)}.`
}
