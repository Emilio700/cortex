/**
 * De una anotación de Cornerstone a una medición que el sistema sabe guardar.
 *
 * Cornerstone entrega, al terminar un trazo, la anotación con sus estadísticas
 * (`cachedStats`, una por imagen). Aquí se lee lo que importa según la
 * herramienta: distancia en mm, ángulo en grados, área en mm² (con la media y la
 * desviación de la región cuando las calcula). Se prueba sin navegador.
 *
 * Si no se conoce el espaciado del píxel, la distancia viene en píxeles y se
 * dice «px»: nunca se presenta como milímetros (doc. 03, §10, regla 4).
 */

export type TipoDeMedicion = 'length' | 'angle' | 'roi'

export interface MedicionTrazada {
  kind: TipoDeMedicion
  value: number
  unit: string
  annotationUID: string
  /** Extras del trazo que viajan en la geometría (media de la región, etc.). */
  detalle: Record<string, number | string>
}

type Estadisticas = Record<string, unknown>

interface AnotacionLike {
  annotationUID?: string
  metadata?: { toolName?: string }
  data?: { cachedStats?: Record<string, Estadisticas> }
}

const numero = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

/** `mm2` → `mm²`; lo demás pasa igual. */
export function unidadLegible(unidad: string | null | undefined): string {
  const texto = String(unidad ?? '').trim()
  if (texto === 'mm2') return 'mm²'
  if (texto === 'px2') return 'px²'
  return texto
}

/** Las estadísticas del primer corte donde se trazó (casi siempre hay una sola). */
function primerasEstadisticas(anotacion: AnotacionLike): Estadisticas | null {
  const todas = anotacion.data?.cachedStats
  if (!todas) return null
  const primera = Object.values(todas)[0]
  return primera && typeof primera === 'object' ? primera : null
}

export function medicionDeAnotacion(entrada: unknown): MedicionTrazada | null {
  const anotacion = entrada as AnotacionLike | null | undefined
  const uid = anotacion?.annotationUID
  if (!anotacion || !uid) return null
  const estadisticas = primerasEstadisticas(anotacion)
  if (!estadisticas) return null

  const herramienta = anotacion.metadata?.toolName
  if (herramienta === 'Length') {
    const largo = numero(estadisticas.length)
    if (largo === null) return null
    return {
      kind: 'length',
      value: largo,
      unit: unidadLegible(String(estadisticas.unit ?? 'mm')),
      annotationUID: uid,
      detalle: {},
    }
  }
  if (herramienta === 'Angle') {
    const angulo = numero(estadisticas.angle)
    if (angulo === null) return null
    return { kind: 'angle', value: angulo, unit: '°', annotationUID: uid, detalle: {} }
  }
  if (herramienta === 'EllipticalROI') {
    const area = numero(estadisticas.area)
    if (area === null) return null
    const detalle: Record<string, number | string> = {}
    const media = numero(estadisticas.mean)
    const desviacion = numero(estadisticas.stdDev)
    if (media !== null) detalle.mean = media
    if (desviacion !== null) detalle.std_dev = desviacion
    if (typeof estadisticas.modalityUnit === 'string') detalle.modality_unit = estadisticas.modalityUnit
    return {
      kind: 'roi',
      value: area,
      unit: unidadLegible(String(estadisticas.areaUnit ?? 'mm2')),
      annotationUID: uid,
      detalle,
    }
  }
  return null
}

/** Cómo se llama cada tipo de medición en pantalla. */
export function nombreDeMedicion(kind: string): string {
  if (kind === 'length') return 'Distancia'
  if (kind === 'angle') return 'Ángulo'
  if (kind === 'roi') return 'Área (elipse)'
  if (kind === 'lesion') return 'Lesión'
  return 'Medición'
}
