// Datos demo de tamizajes: María (p1) mastografía hace 3 años (vencida) y citología vigente; José (p2) sangre oculta en heces.
import type { Registro } from '../../lib/types'

const DAY = 86_400_000

function reg(id: string, patientId: string, now: number, dias: number, regla: string, titulo: string, datos: Record<string, unknown>): Registro {
  const fecha = new Date(now - dias * DAY)
  fecha.setHours(12, 0, 0, 0)
  return { id, patientId, fecha: fecha.toISOString(), tipo: 'tamizaje', estado: 'realizado', titulo, datos: { regla, realizado: fecha.toISOString().slice(0, 10), ...datos } }
}

export function demoTamizajes(now: number): Registro[] {
  return [
    reg('reg-tam-p1-mx', 'p1', now, 3 * 365 + 20, 'mama-mastografia', 'Cáncer de mama: mastografía — normal / negativo', { resultado: 'normal', notas: 'BI-RADS 1. Hospital General.' }),
    reg('reg-tam-p1-cacu', 'p1', now, 300, 'cacu', 'Cáncer cervicouterino: Citología cervical — normal / negativo', { prueba: 'citologia', resultado: 'normal', notas: 'Negativo a lesión intraepitelial.' }),
    reg('reg-tam-p2-crc', 'p2', now, 240, 'colorrectal', 'Cáncer colorrectal: Sangre oculta en heces — normal / negativo', { prueba: 'soh', resultado: 'normal', notas: 'Prueba inmunoquímica negativa.' }),
  ]
}
