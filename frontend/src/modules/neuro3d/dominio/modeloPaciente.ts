/**
 * El modelo 3D del paciente, en palabras (feat/modelo-3d-desde-tc).
 *
 * Puro: decide si la opción «Tomografía del paciente» del selector se puede
 * elegir, por qué no, y cómo se describe el modelo que se muestra. La regla es
 * la de siempre: sólo un modelo que el servidor dio por **listo** se ofrece; lo
 * que está en curso o falló se dice, no se muestra.
 */
import type { OpcionDeOrigen } from '../componentes/SelectorOrigen'

export interface Modelo3D {
  id: number
  patient_id: number
  study_id: number
  series_id: number
  region: string
  estado: 'pendiente' | 'procesando' | 'listo' | 'fallo'
  motivo_fallo?: string | null
  estructuras?: number | null
  motor?: string | null
  motor_version?: string | null
  sintetico: boolean
  solicitado_por?: string | null
  solicitado_en: string
  terminado_en?: string | null
  confirmado_por?: string | null
  confirmado_en?: string | null
  estudio_fecha?: string | null
  estudio_descripcion?: string | null
  serie_descripcion?: string | null
  modalidad?: string | null
}

export const SIN_MODELO =
  'Aún no hay un modelo de tomografía de este paciente. Genéralo desde el visor de su estudio («Generar modelo 3D»).'
export const NO_SE_CONSULTO = 'No se pudo consultar los modelos del paciente. Recarga la pantalla.'
export const EN_CURSO = 'El modelo se está armando; puede tardar unos minutos. Vuelve a abrir Neuro 3D cuando esté listo.'

const fecha = (valor?: string | null): string => {
  if (!valor) return 'sin fecha'
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return String(valor).slice(0, 10)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * La opción del selector y el modelo que se cargaría al elegirla. Con
 * `preferido` (llega del visor por `?modelo=`) se usa ése si está listo.
 */
export function opcionDeTc(
  modelos: Modelo3D[] | null,
  preferido?: number | null,
): { opcion: OpcionDeOrigen; modelo: Modelo3D | null } {
  if (modelos === null) return { opcion: { disponible: false, motivo: NO_SE_CONSULTO }, modelo: null }
  const deColumna = modelos.filter((m) => m.region === 'columna')
  const listos = deColumna.filter((m) => m.estado === 'listo')
  const modelo = listos.find((m) => m.id === preferido) ?? listos[0] ?? null
  if (modelo) return { opcion: { disponible: true }, modelo }
  const reciente = deColumna[0]
  if (!reciente) return { opcion: { disponible: false, motivo: SIN_MODELO }, modelo: null }
  if (reciente.estado === 'fallo') {
    return {
      opcion: { disponible: false, motivo: `El último intento no se pudo: ${reciente.motivo_fallo ?? 'sin motivo registrado'}` },
      modelo: null,
    }
  }
  return { opcion: { disponible: false, motivo: EN_CURSO }, modelo: null }
}

/** «TC del 12 sep 2026 · columna axial · TotalSegmentator 2.18.0» */
export function describirModelo(m: Modelo3D): string {
  const partes = [`${m.modalidad === 'MR' ? 'RM' : 'TC'} del ${fecha(m.estudio_fecha)}`]
  if (m.serie_descripcion) partes.push(m.serie_descripcion)
  if (m.motor) partes.push([m.motor, m.motor_version].filter(Boolean).join(' '))
  return partes.join(' · ')
}

/** Si alguien ya la revisó contra las imágenes, quién y cuándo; si no, que falta. */
export function textoDeRevision(m: Modelo3D): string {
  if (m.confirmado_en) return `Revisada por ${m.confirmado_por ?? 'el médico'} el ${fecha(m.confirmado_en)}.`
  return 'Sin revisar: compárala con las imágenes originales antes de usarla.'
}

export const AVISO_SINTETICO =
  'Modelo SINTÉTICO de prueba: el segmentador corre en modo falso. No es la anatomía de este paciente.'
