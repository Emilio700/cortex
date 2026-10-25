/**
 * Costura del origen «radiografia» del selector (tramo RX).
 *
 * TC la deja como *stub*: la opción aparece deshabilitada con su motivo. RX
 * reemplaza el cuerpo de este archivo (puede devolver más campos, como el
 * ajuste de la columna) y conecta su ajuste a la escena en `AtlasNeuroPage`.
 * Ver COORDINACION.md.
 */
import type { OpcionDeOrigen } from '../componentes/SelectorOrigen'

export function useOrigenRadiografia(patientId: number | null): { opcion: OpcionDeOrigen } {
  void patientId
  return { opcion: { disponible: false, motivo: 'Aún no hay medidas de radiografía de este paciente.' } }
}
