/**
 * Piezas del visor que no dependen de Cornerstone.
 *
 * Están aparte para poder probarlas sin GPU ni navegador: el orden de las
 * series, la serie que se abre primero y el texto de estado son las decisiones
 * que, si se equivocan, hacen que el médico mire la secuencia equivocada.
 */

export interface SerieDicom {
  id: number
  series_instance_uid: string
  series_number: number
  modality: string
  series_description: string | null
  sequence_label: string | null
  sequence_detected_by: string | null
  instance_count: number
  rows: number | null
  columns: number | null
  pixel_spacing_x: number | null
  pixel_spacing_y: number | null
  slice_thickness: number | null
  has_geometry: boolean
  is_derived: boolean
  total_bytes: number
}

export interface AnotacionDicom {
  id: number
  kind: string
  series_id: number | null
  value: number | null
  unit: string | null
  label: string | null
  notes: string | null
  is_confirmed: boolean
  created_at: string
  created_by: string | null
}

export interface EstudioDicom {
  id: number
  patient_id: number
  study_instance_uid: string
  modality: string
  study_date: string
  study_description: string | null
  body_part: string | null
  institution_name: string | null
  status: string
  status_detail: string | null
  series_count: number
  instance_count: number
  total_bytes: number
  has_contrast: boolean | null
  created_at: string
  series?: SerieDicom[]
  annotations?: AnotacionDicom[]
  warnings?: string[]
}

export interface CandidatoComparacion {
  study: EstudioDicom
  avisos: string[]
}

export interface CorteManifiesto {
  sop_instance_uid: string
  instance_number: number
  position: number[]
  orientation: number[]
  rows: number | null
  columns: number | null
  path: string
  bytes: number
  url: string
}

export interface ManifiestoSerie {
  series_instance_uid: string
  series_number: number
  modality: string
  series_description: string | null
  sequence_label: string | null
  sequence_detected_by: string | null
  ordered_by: string
  instances: CorteManifiesto[]
}

/** Orden en que se muestran las series: primero lo que se lee siempre. */
const ORDEN_SECUENCIAS = [
  'T1',
  'T1+C',
  'T2',
  'FLAIR',
  'DWI',
  'ADC',
  'TOF',
  'SWI',
  'T2*',
  'PERFUSION',
  'DIFUSION',
  'ANGIO',
  'HUESO',
]

export function nombreDeSerie(serie: SerieDicom): string {
  // La etiqueta la deduce el sistema; la descripción la escribió el equipo. Se
  // muestran las dos cuando no coinciden, para que nadie confunda una deducción
  // con un dato del estudio.
  const etiqueta = serie.sequence_label?.trim()
  const descripcion = serie.series_description?.trim()
  if (etiqueta && descripcion && etiqueta.toLowerCase() !== descripcion.toLowerCase()) {
    return `${etiqueta} · ${descripcion}`
  }
  if (etiqueta) return etiqueta
  if (descripcion) return descripcion
  return `Serie ${serie.series_number}`
}

export function ordenarSeries(series: SerieDicom[]): SerieDicom[] {
  return [...series].sort((a, b) => {
    const posicionA = a.sequence_label ? ORDEN_SECUENCIAS.indexOf(a.sequence_label) : -1
    const posicionB = b.sequence_label ? ORDEN_SECUENCIAS.indexOf(b.sequence_label) : -1
    const pesoA = posicionA === -1 ? ORDEN_SECUENCIAS.length : posicionA
    const pesoB = posicionB === -1 ? ORDEN_SECUENCIAS.length : posicionB
    if (pesoA !== pesoB) return pesoA - pesoB
    return a.series_number - b.series_number
  })
}

export function serieInicial(series: SerieDicom[]): SerieDicom | null {
  return ordenarSeries(series).find((serie) => serie.instance_count > 0) ?? null
}

/** Busca, en el estudio previo, la serie que corresponde a la que se está viendo. */
export function emparejarSerie(
  seriesPrevias: SerieDicom[],
  actual: SerieDicom | null
): SerieDicom | null {
  if (!actual) return null
  if (actual.sequence_label) {
    const porEtiqueta = seriesPrevias.find(
      (serie) => serie.sequence_label === actual.sequence_label
    )
    if (porEtiqueta) return porEtiqueta
  }
  return (
    seriesPrevias.find(
      (serie) =>
        !!serie.series_description &&
        serie.series_description.toLowerCase() === (actual.series_description ?? '').toLowerCase()
    ) ?? null
  )
}

export function formatearBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mega = bytes / (1024 * 1024)
  if (mega < 1) return `${Math.round(bytes / 1024)} KB`
  if (mega < 1024) return `${mega.toFixed(1)} MB`
  return `${(mega / 1024).toFixed(2)} GB`
}

export function resumenDeEstudio(estudio: EstudioDicom): string {
  const fecha = new Date(estudio.study_date)
  const legible = Number.isNaN(fecha.getTime())
    ? estudio.study_date
    : fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  const partes = [
    estudio.modality,
    legible,
    `${estudio.series_count} ${estudio.series_count === 1 ? 'serie' : 'series'}`,
    formatearBytes(estudio.total_bytes),
  ]
  if (estudio.institution_name) partes.push(estudio.institution_name)
  return partes.join(' · ')
}

export interface EstadoVisible {
  tono: 'ok' | 'aviso' | 'error'
  texto: string
}

export function estadoDeEstudio(estudio: EstudioDicom): EstadoVisible {
  if (estudio.status === 'ready') {
    return { tono: 'ok', texto: 'Estudio completo' }
  }
  if (estudio.status === 'partial') {
    return { tono: 'aviso', texto: estudio.status_detail ?? 'El estudio llegó incompleto' }
  }
  if (estudio.status === 'failed') {
    return { tono: 'error', texto: estudio.status_detail ?? 'No se pudo leer el estudio' }
  }
  return { tono: 'aviso', texto: 'El estudio se está preparando' }
}

/** Índice equivalente entre dos pilas de distinto número de cortes. */
export function corteEquivalente(indice: number, totalOrigen: number, totalDestino: number): number {
  if (totalOrigen <= 0 || totalDestino <= 0) return 0
  if (totalOrigen === totalDestino) return indice
  const fraccion = indice / (totalOrigen - 1 || 1)
  return Math.min(totalDestino - 1, Math.max(0, Math.round(fraccion * (totalDestino - 1))))
}
