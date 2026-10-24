/**
 * Etiquetas en español del estado y la prioridad de una orden de estudio.
 *
 * El API guarda y devuelve los valores en inglés (`ordered`, `routine`…), que
 * es lo que la doctora y recepción veían crudo en pantalla. Aquí se traducen en
 * un solo lugar para que la bandeja, la lista de recepción y el expediente
 * digan lo mismo. Un valor que no se conozca se muestra tal cual, sin romper la
 * pantalla.
 */
import type { DiagnosticOrderStatus, EstadoVisible, OrderPriority } from '../types/clinicalTracking'

/**
 * Decisión de Emilio (plan 26, D-1): la interfaz solo dice Pendiente de
 * resultado, Resultado recibido y Revisada (más Cancelada o Rechazada). GEMS no
 * tiene laboratorio propio, así que aceptada, programada, muestra tomada y en
 * proceso no se pueden medir; las órdenes viejas que quedaron en esos estados
 * se ven como pendientes, que es lo que de verdad son.
 */
const ESTADOS: Record<DiagnosticOrderStatus, EstadoVisible> = {
  draft: 'borrador',
  ordered: 'pendiente',
  accepted: 'pendiente',
  scheduled: 'pendiente',
  collected: 'pendiente',
  in_process: 'pendiente',
  result_received: 'resultado_recibido',
  reviewed: 'revisada',
  cancelled: 'cancelada',
  rejected: 'rechazada',
}

const ETIQUETAS_VISIBLES: Record<EstadoVisible, string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente de resultado',
  resultado_recibido: 'Resultado recibido',
  revisada: 'Revisada',
  cancelada: 'Cancelada',
  rechazada: 'Rechazada',
}

const COLORES_VISIBLES: Record<EstadoVisible, string> = {
  borrador: 'secondary',
  pendiente: 'warning',
  resultado_recibido: 'info',
  revisada: 'success',
  cancelada: 'secondary',
  rechazada: 'secondary',
}

/** El estado visible de una orden: el que manda el servidor o, si no viene, el que corresponde. */
export const estadoVisibleDe = (orden: { status: string; estado_visible?: string | null }): string =>
  orden.estado_visible || ESTADOS[orden.status as DiagnosticOrderStatus] || orden.status

export const etiquetaEstadoVisible = (estado: string): string =>
  ETIQUETAS_VISIBLES[estado as EstadoVisible] ?? estado

export const colorEstadoVisible = (estado: string): string =>
  COLORES_VISIBLES[estado as EstadoVisible] ?? 'secondary'

const PRIORIDADES: Record<OrderPriority, string> = {
  routine: 'Rutinaria',
  preferential: 'Preferente',
  urgent: 'Urgente',
}

/**
 * Urgencia de mayor a menor, para ordenar la bandeja: antes se ordenaba por el
 * texto en inglés y «Preferente» (preferential) caía después de «Rutinaria»
 * (routine) por el alfabeto, cuando debe ir antes.
 */
export const ORDEN_PRIORIDAD: Record<OrderPriority, number> = {
  urgent: 0,
  preferential: 1,
  routine: 2,
}

/** Etiqueta de un estado guardado, ya traducida a lo que ve la interfaz (D-1). */
export const etiquetaEstadoOrden = (status: string): string => {
  const visible = ESTADOS[status as DiagnosticOrderStatus]
  return visible ? ETIQUETAS_VISIBLES[visible] : status
}

export const etiquetaPrioridad = (priority: string): string =>
  PRIORIDADES[priority as OrderPriority] ?? priority

/** Peso de urgencia; lo desconocido va al final. */
export const pesoPrioridad = (priority: string): number =>
  ORDEN_PRIORIDAD[priority as OrderPriority] ?? 99

/**
 * Tipos de estudio, en el orden en que salen en el formulario.
 *
 * Antes el tipo solo existía como `<option>` del formulario, y en la consulta y
 * la bandeja se leía crudo («laboratory», «obstetric»). Esta lista es la única
 * fuente: el selector del formulario se arma con ella y las pantallas la usan
 * para mostrar el tipo, así no pueden decir cosas distintas.
 */
export const TIPOS_DE_ESTUDIO: ReadonlyArray<{ valor: string; etiqueta: string }> = [
  { valor: 'laboratory', etiqueta: 'Laboratorio' },
  { valor: 'gynecology', etiqueta: 'Ginecología / Pap / VPH' },
  { valor: 'breast', etiqueta: 'Imagen de mama' },
  { valor: 'obstetric', etiqueta: 'Obstetricia' },
  { valor: 'procedure', etiqueta: 'Procedimiento' },
  { valor: 'referral', etiqueta: 'Interconsulta' },
  { valor: 'other', etiqueta: 'Otro' },
]

const TIPOS: Record<string, string> = Object.fromEntries(
  TIPOS_DE_ESTUDIO.map(({ valor, etiqueta }) => [valor, etiqueta]),
)

export const etiquetaTipoEstudio = (category: string): string => TIPOS[category] ?? category

/**
 * Destino físico de un estudio: a dónde lleva la paciente esa hoja (plan 26,
 * §3.2). Es la misma agrupación que usa el papel «Separado por destino», para
 * que la pantalla y el papel junten igual los estudios.
 */
export type DestinoFisico = 'laboratorio' | 'imagen' | 'otros'

const DESTINOS: Record<string, DestinoFisico> = {
  laboratory: 'laboratorio',
  gynecology: 'laboratorio',
  breast: 'imagen',
  obstetric: 'imagen',
}

export const DESTINOS_FISICOS: ReadonlyArray<{ valor: DestinoFisico; etiqueta: string }> = [
  { valor: 'laboratorio', etiqueta: 'Laboratorio' },
  { valor: 'imagen', etiqueta: 'Imagen y gabinete' },
  { valor: 'otros', etiqueta: 'Otros' },
]

export const destinoFisico = (category: string): DestinoFisico => DESTINOS[category] ?? 'otros'
