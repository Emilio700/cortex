import { useCollection } from '../../lib/store'
import type { Patient } from '../../lib/types'
import type { ConfigTurnos, Turno } from './calc'
import type { DatosHoja } from './hoja'

export interface Ctx {
  pid: string | null
  patient: Patient | null
  dia0: number
  turno: Turno
  cfg: ConfigTurnos
  rango: [number, number]
  datos: DatosHoja
  guardar: (fn: (d: DatosHoja) => DatosHoja) => void
  puede: boolean // escribir la hoja (registro)
  puedeObs: boolean // guardar signos como observaciones
  enfermera: string
}

/** Peso para cálculos: el de la hoja, si no la última observación de peso del paciente. */
export function usePeso(ctx: Ctx): number | undefined {
  const pesos = useCollection('observations', (o) => o.patientId === ctx.pid && o.codigo === 'peso', [ctx.pid])
  const ultimo = [...pesos].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.valor
  return ctx.datos.peso ?? ultimo
}

export const nuevoId = () => Math.random().toString(36).slice(2, 10)

/** "HH:MM" local de un timestamp. */
export const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5)

/** Convierte "HH:MM" a timestamp dentro del día de enfermería (las horas antes del inicio del día caen al día siguiente). */
export function horaEnDia(hm: string, dia0: number): number {
  const [h, m] = hm.split(':').map(Number)
  const d = new Date(dia0)
  d.setHours(h || 0, m || 0, 0, 0)
  if (d.getTime() < dia0) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** Hora por omisión para un registro nuevo: ahora si cae en el turno, si no el inicio del turno. */
export function horaPorOmision(rango: [number, number]): string {
  const ahora = Date.now()
  return hhmm(ahora >= rango[0] && ahora < rango[1] ? ahora : rango[0])
}
