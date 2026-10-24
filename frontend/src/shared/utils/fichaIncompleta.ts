/**
 * Qué le falta a la ficha de una paciente (plan 32, punto 5).
 *
 * El alta exprés crea pacientes con nombre, apellidos y celular, a propósito.
 * Lo que falta se señala con suavidad —un punto, una línea gris— y nunca
 * bloquea agendar ni atender. Hoy cuenta solo la fecha de nacimiento: de ella
 * dependen la edad, las semanas de embarazo y los PDF. Si mañana importa otro
 * dato, se agrega aquí y lo toman la lista, el expediente y la consulta.
 */
export interface DatosDeFicha {
  date_of_birth?: string | null
}

export function faltantesDeFicha(paciente: DatosDeFicha | null | undefined): string[] {
  if (!paciente) return []
  const faltan: string[] = []
  if (!paciente.date_of_birth) faltan.push('fecha de nacimiento')
  return faltan
}

/** «Ficha incompleta: falta fecha de nacimiento», o `null` si no le falta nada. */
export function avisoDeFicha(paciente: DatosDeFicha | null | undefined): string | null {
  const faltan = faltantesDeFicha(paciente)
  if (faltan.length === 0) return null
  return `Ficha incompleta: falta ${faltan.join(' y ')}`
}
