/**
 * Etiquetas en español de los estados de vacunas, medicamentos en seguimiento
 * e hitos prenatales.
 *
 * El API guarda los valores en inglés y la consulta los enseñaba crudos
 * («applied», «pending», «suggested»). Cada lista es también la fuente de su
 * `<select>`, para que la opción elegida y lo que se muestra después digan lo
 * mismo. Un valor desconocido se muestra tal cual, sin romper la pantalla.
 */
export interface Opcion {
  valor: string
  etiqueta: string
}

export const ESTADOS_DE_VACUNA: ReadonlyArray<Opcion> = [
  { valor: 'applied', etiqueta: 'Aplicada' },
  { valor: 'offered', etiqueta: 'Ofrecida' },
  { valor: 'deferred', etiqueta: 'Diferida' },
  { valor: 'rejected', etiqueta: 'Rechazada' },
  { valor: 'not_evaluated', etiqueta: 'No evaluada' },
]

export const REVISIONES_DE_MEDICAMENTO: ReadonlyArray<Opcion> = [
  { valor: 'pending', etiqueta: 'Pendiente' },
  { valor: 'documented_continue', etiqueta: 'Continuar documentado' },
  { valor: 'adjust_with_prescriber', etiqueta: 'Revisar con prescriptor' },
  { valor: 'refer', etiqueta: 'Referir' },
  { valor: 'insufficient_data', etiqueta: 'Datos insuficientes' },
]

export const ESTADOS_DE_HITO: ReadonlyArray<Opcion> = [
  { valor: 'suggested', etiqueta: 'Sugerido' },
  { valor: 'indicated', etiqueta: 'Indicado' },
  { valor: 'completed', etiqueta: 'Realizado' },
  { valor: 'deferred', etiqueta: 'Diferido' },
]

export const METODOS_DE_DATACION: ReadonlyArray<Opcion> = [
  { valor: 'last_menstrual_period', etiqueta: 'FUM' },
  { valor: 'ultrasound', etiqueta: 'Ultrasonido' },
  { valor: 'assisted_reproduction', etiqueta: 'Reproducción asistida' },
  { valor: 'known_conception', etiqueta: 'Concepción conocida' },
  { valor: 'other', etiqueta: 'Otro' },
]

const buscar = (lista: ReadonlyArray<Opcion>, valor: string): string =>
  lista.find((o) => o.valor === valor)?.etiqueta ?? valor

export const etiquetaEstadoVacuna = (status: string) => buscar(ESTADOS_DE_VACUNA, status)
export const etiquetaRevisionMedicamento = (status: string) =>
  buscar(REVISIONES_DE_MEDICAMENTO, status)
export const etiquetaEstadoHito = (status: string) => buscar(ESTADOS_DE_HITO, status)
export const etiquetaMetodoDatacion = (method: string) => buscar(METODOS_DE_DATACION, method)
