/**
 * Salir de «en consulta» sin cerrarla (plan 28, D-3).
 *
 * La cita vuelve al estado del que entró: si el médico la abrió para
 * prepararla antes de que el paciente llegara, regresa a agendada o
 * confirmada, y la llegada real sigue pidiendo triage y avisando. Solo si
 * estaba en sala el botón dice «Regresar a sala». Sin estado guardado (una
 * cita que entró antes del cambio), en sala, como hace el servidor.
 */
import type { Appointment } from '../types'

export type EstadoPrevio = 'agendada' | 'confirmada' | 'en_sala'

const ETIQUETA: Record<EstadoPrevio, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  en_sala: 'En sala',
}

export interface SalidaDeConsulta {
  destino: EstadoPrevio
  /** Texto del botón. */
  texto: string
  /** Lo que va a pasar, dicho antes de tocar. */
  explicacion: string
}

export const salidaDeConsulta = (
  cita: Pick<Appointment, 'estado_antes_de_consulta'>,
): SalidaDeConsulta => {
  const previo = cita.estado_antes_de_consulta
  const destino: EstadoPrevio =
    previo === 'agendada' || previo === 'confirmada' || previo === 'en_sala' ? previo : 'en_sala'
  if (destino === 'en_sala') {
    return {
      destino,
      texto: 'Regresar a sala',
      explicacion: 'El paciente vuelve a la sala de espera; la consulta sigue abierta para retomarla.',
    }
  }
  return {
    destino,
    texto: 'Salir sin atender',
    explicacion: `El paciente todavía no pasaba a sala: la cita vuelve a «${ETIQUETA[destino]}».`,
  }
}
