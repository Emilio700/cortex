/**
 * Presets de ventana (contraste) del visor.
 *
 * En tomografía los valores están en unidades Hounsfield y los presets son
 * estándar: encéfalo 40/80, hueso 500/2000… En resonancia **no hay unidades
 * absolutas**: lo que se ve «bien» depende de la secuencia y del equipo, así que
 * no se inventan presets: sólo «Automático» (la ventana que trae el estudio) y
 * el ajuste a mano con el botón izquierdo. Ofrecer «encéfalo 40/80» sobre una RM
 * sería prometer una precisión que no existe.
 *
 * Los rangos exactos de TC se afinan con el especialista (doc. 03 de la
 * investigación, §6.2).
 */

export interface PresetVentana {
  id: string
  nombre: string
  /** Centro de la ventana (WC). */
  wc: number
  /** Ancho de la ventana (WW). */
  ww: number
}

export const PRESETS_TC: ReadonlyArray<PresetVentana> = [
  { id: 'encefalo', nombre: 'Encéfalo', wc: 40, ww: 80 },
  { id: 'subdural', nombre: 'Subdural / hematoma', wc: 75, ww: 200 },
  { id: 'hueso', nombre: 'Hueso', wc: 500, ww: 2000 },
  { id: 'angio', nombre: 'Angio-TC', wc: 300, ww: 600 },
  { id: 'partes-blandas', nombre: 'Partes blandas', wc: 40, ww: 400 },
]

/** Los presets que aplican a una modalidad DICOM («CT», «MR»…). */
export function presetsParaModalidad(modalidad: string | null | undefined): PresetVentana[] {
  return String(modalidad ?? '').toUpperCase() === 'CT' ? [...PRESETS_TC] : []
}

/** De centro y ancho al rango que usa Cornerstone. */
export function rangoDeVentana(wc: number, ww: number): { lower: number; upper: number } {
  const mitad = Math.max(1, ww) / 2
  return { lower: wc - mitad, upper: wc + mitad }
}

/** Del rango de Cornerstone a centro y ancho. */
export function ventanaDeRango(lower: number, upper: number): { wc: number; ww: number } {
  return { wc: (upper + lower) / 2, ww: Math.max(1, upper - lower) }
}

/** «WC 40 · WW 80», o «Ventana automática» si todavía no se conoce. */
export function textoDeVentana(wc: number | null, ww: number | null): string {
  if (wc === null || ww === null || !Number.isFinite(wc) || !Number.isFinite(ww)) {
    return 'Ventana automática'
  }
  return `WC ${Math.round(wc)} · WW ${Math.round(ww)}`
}
