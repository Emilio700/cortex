/**
 * Cómo se nombra a una médica en pantalla: "Dra. Cintia Castro".
 *
 * Misma regla que el backend (`app/utils/tratamiento.py`): el tratamiento es el
 * que administración capturó en la cuenta ("Dr.", "Dra." o nada), y sin él va
 * el nombre solo. Antes cada pantalla ponía "Dr." fijo, y a las doctoras les
 * salía "Dr." en la agenda; un "Dr." equivocado es peor que no poner nada
 * (plan 23, ajustes del 2026-09-28).
 */
export interface ConTratamiento {
  full_name?: string | null
  tratamiento?: string | null
}

export const nombreConTratamiento = (persona?: ConTratamiento | null): string => {
  const nombre = (persona?.full_name ?? '').trim()
  if (!nombre) return ''
  const tratamiento = (persona?.tratamiento ?? '').trim()
  return tratamiento ? `${tratamiento} ${nombre}` : nombre
}
