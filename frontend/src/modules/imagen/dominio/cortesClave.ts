/**
 * Cortes clave: los cortes que el médico marca para volver a verlos o enseñarlos.
 *
 * Lo que sale de aquí es lo que decide qué se pinta en el deslizador y en el
 * panel: cuáles cortes de la serie abierta están marcados, y si el que se ve
 * ahora lo está. Se prueba sin navegador.
 */
import type { EstadoDeVista } from '../servicios/controlesDeVista'

export interface CorteClave {
  id: number
  study_id: number
  series_id: number
  series_description: string | null
  /** Posición (desde 0) en el orden que muestra el visor. */
  instance_index: number
  sop_instance_uid: string | null
  label: string | null
  notes: string | null
  view_state: Partial<VistaGuardada>
  has_image: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Cómo se veía el corte al marcarlo; es lo que viaja al servidor. */
export interface VistaGuardada {
  wc: number | null
  ww: number | null
  zoom: number | null
  rotation: number | null
  flip_h: boolean
  flip_v: boolean
  invert: boolean
}

/** El estado del visor, en la forma que guarda el servidor. */
export function vistaParaGuardar(estado: EstadoDeVista): VistaGuardada {
  return {
    wc: estado.wc,
    ww: estado.ww,
    zoom: estado.zoom > 0 ? estado.zoom : null,
    rotation: estado.rotacion,
    flip_h: estado.volteoH,
    flip_v: estado.volteoV,
    invert: estado.invertido,
  }
}

/** Del servidor al estado que sabe aplicar el visor (sólo lo que vino). */
export function estadoDeVistaGuardada(vista: Partial<VistaGuardada>): Partial<EstadoDeVista> {
  const estado: Partial<EstadoDeVista> = {}
  if (typeof vista.wc === 'number') estado.wc = vista.wc
  if (typeof vista.ww === 'number') estado.ww = vista.ww
  if (typeof vista.zoom === 'number') estado.zoom = vista.zoom
  if (typeof vista.rotation === 'number') estado.rotacion = vista.rotation
  if (typeof vista.flip_h === 'boolean') estado.volteoH = vista.flip_h
  if (typeof vista.flip_v === 'boolean') estado.volteoV = vista.flip_v
  if (typeof vista.invert === 'boolean') estado.invertido = vista.invert
  return estado
}

/** Los cortes clave de una serie, por posición. */
export function cortesDeSerie(marcas: CorteClave[], serieId: number | null | undefined): CorteClave[] {
  if (serieId == null) return []
  return marcas
    .filter((marca) => marca.series_id === serieId)
    .sort((a, b) => a.instance_index - b.instance_index)
}

/** La marca de este corte, si la hay. */
export function marcaDelCorte(
  marcas: CorteClave[],
  serieId: number | null | undefined,
  indice: number
): CorteClave | null {
  return cortesDeSerie(marcas, serieId).find((marca) => marca.instance_index === indice) ?? null
}

/** Siguiente (o anterior) corte clave a partir de una posición; `null` si no hay. */
export function cortesClaveVecino(
  marcas: CorteClave[],
  serieId: number | null | undefined,
  indice: number,
  direccion: 1 | -1
): CorteClave | null {
  const delaSerie = cortesDeSerie(marcas, serieId)
  const candidatos =
    direccion === 1
      ? delaSerie.filter((marca) => marca.instance_index > indice)
      : delaSerie.filter((marca) => marca.instance_index < indice).reverse()
  return candidatos[0] ?? null
}

/**
 * Posición (0 a 100 %) de cada marca sobre el deslizador, para pintar sus
 * muescas. Con un solo corte no hay recorrido que marcar.
 */
export function posicionesEnDeslizador(marcas: CorteClave[], total: number): number[] {
  if (total <= 1) return []
  return marcas.map((marca) => (marca.instance_index / (total - 1)) * 100)
}

/** Lo que se muestra en la lista: su nombre o, si no tiene, dónde está. */
export function tituloDeCorteClave(marca: CorteClave): string {
  return marca.label?.trim() || `Corte ${marca.instance_index + 1}`
}
