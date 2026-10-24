/**
 * Utilidades puras del catalogo de estudios de imagen.
 *
 * El catalogo sale del formato de solicitud en papel del laboratorio
 * (Imagenes Diagnosticas de Mazatlan) y lo sirve GET /catalogo-estudios.
 * Aqui solo se ordena, se filtra y se arma el texto que se guarda en
 * `study_name` de la orden diagnostica. No se inventan campos: el contrato
 * del backend (category, study_name, catalog_code, specimen_or_body_site...)
 * queda igual.
 */
import { normalizarTexto } from './receta'

export interface GrupoEstudios {
  clave: string
  nombre: string
  modalidad: string
  estudios: string[]
  modificadores?: string[]
  requiere_region?: boolean
  requiere_lateralidad?: boolean
  destacado?: boolean
}

export interface CatalogoEstudios {
  fuente: string
  grupos: GrupoEstudios[]
}

/** Lateralidad tal como viene en el formato de papel. */
export const LATERALIDADES = ['Derecha', 'Izquierda'] as const
export type Lateralidad = (typeof LATERALIDADES)[number]

/** Lo que el doctor lleva elegido en el selector de estudio. */
export interface SeleccionEstudio {
  /** `null` cuando escribe el estudio a mano. */
  grupo: GrupoEstudios | null
  estudio: string
  modificador?: string
  region?: string
  lateralidad?: string
  /** Texto libre, para el estudio que no esta en el catalogo. */
  manual?: string
}

/** Limite de `study_name` en el modelo DiagnosticOrder. */
export const LIMITE_NOMBRE_ESTUDIO = 255

const limpiar = (texto?: string | null) => (texto || '').replace(/\s+/g, ' ').trim()

/**
 * Prefijo con el que arranca el texto de la orden.
 * Los grupos de rayos X se abrevian "RX ..." (asi los nombra el laboratorio);
 * el resto usa el nombre del grupo en mayusculas.
 * Ej: "RESONANCIA MAGNETICA", "RX EXTREMIDADES", "US ESPECIALIZADO EMBARAZO".
 */
export function prefijoGrupo(grupo: GrupoEstudios): string {
  const nombre = limpiar(grupo.nombre).replace(/^Rayos X\s*-\s*/i, '')
  const base = grupo.modalidad === 'RX' && !/^RX\b/i.test(nombre) ? `RX ${nombre}` : nombre
  return base.toUpperCase()
}

/** Destacados primero (Imagen de la mujer y US de embarazo) conservando el orden del formato. */
export function ordenarGrupos(grupos: GrupoEstudios[]): GrupoEstudios[] {
  const lista = grupos || []
  return [...lista.filter((g) => g.destacado), ...lista.filter((g) => !g.destacado)]
}

export interface EstudioEncontrado {
  grupo: GrupoEstudios
  estudio: string
}

/**
 * Busca un estudio en todos los grupos, sin distinguir mayusculas ni acentos.
 * Los grupos destacados salen primero porque son el dia a dia de la clinica.
 */
export function buscarEstudios(
  grupos: GrupoEstudios[],
  texto: string,
  limite = 8,
): EstudioEncontrado[] {
  const busqueda = normalizarTexto(texto)
  if (!busqueda) return []
  const encontrados: EstudioEncontrado[] = []
  for (const grupo of ordenarGrupos(grupos || [])) {
    for (const estudio of grupo.estudios || []) {
      const candidato = normalizarTexto(`${grupo.nombre} ${estudio}`)
      if (candidato.includes(busqueda)) encontrados.push({ grupo, estudio })
      if (encontrados.length >= limite) return encontrados
    }
  }
  return encontrados
}

/** Que le falta a la seleccion para poder guardarse; `null` si ya esta completa. */
export function faltaEnSeleccion(seleccion: SeleccionEstudio): string | null {
  if (!seleccion.grupo) {
    return limpiar(seleccion.manual) ? null : 'Escribe el estudio que necesitas.'
  }
  if (!limpiar(seleccion.estudio)) return 'Elige el estudio del grupo.'
  if (seleccion.grupo.requiere_region && !limpiar(seleccion.region)) {
    return 'Indica la región a estudiar.'
  }
  if (seleccion.grupo.requiere_lateralidad && !limpiar(seleccion.lateralidad)) {
    return 'Indica si es derecha o izquierda.'
  }
  return null
}

export function seleccionCompleta(seleccion: SeleccionEstudio): boolean {
  return faltaEnSeleccion(seleccion) === null
}

/**
 * Texto que se guarda en `study_name`.
 * Del catalogo: "PREFIJO — Estudio (detalles)", con region, lateralidad y
 * modificador entre parentesis en ese orden.
 *   "RESONANCIA MAGNETICA — Mamas (Contrastada)"
 *   "RX EXTREMIDADES — Rodilla (Derecha)"
 *   "ULTRASONIDOS — Ultrasonido Doppler venoso (Miembro inferior)"
 * Escrito a mano: exactamente lo que tecleo el doctor, sin prefijo.
 */
export function textoEstudio(seleccion: SeleccionEstudio): string {
  if (!seleccion.grupo) return limpiar(seleccion.manual).slice(0, LIMITE_NOMBRE_ESTUDIO)
  const estudio = limpiar(seleccion.estudio)
  if (!estudio) return ''
  const detalles = [
    seleccion.grupo.requiere_region ? limpiar(seleccion.region) : '',
    seleccion.grupo.requiere_lateralidad ? limpiar(seleccion.lateralidad) : '',
    (seleccion.grupo.modificadores || []).length ? limpiar(seleccion.modificador) : '',
  ].filter(Boolean)
  const sufijo = detalles.length ? ` (${detalles.join(', ')})` : ''
  return `${prefijoGrupo(seleccion.grupo)} — ${estudio}${sufijo}`.slice(0, LIMITE_NOMBRE_ESTUDIO)
}

/**
 * Sitio anatomico para `specimen_or_body_site` (campo que ya existe en la orden).
 * Solo se llena cuando el formato de papel lo pide: region o lateralidad.
 */
export function sitioAnatomico(seleccion: SeleccionEstudio): string {
  if (!seleccion.grupo) return ''
  const partes = [
    seleccion.grupo.requiere_region ? limpiar(seleccion.region) : '',
    seleccion.grupo.requiere_lateralidad ? limpiar(seleccion.lateralidad) : '',
  ].filter(Boolean)
  return partes.join(' ').slice(0, 180)
}
