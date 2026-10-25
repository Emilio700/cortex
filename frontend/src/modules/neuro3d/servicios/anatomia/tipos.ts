/**
 * Lo que una capa anatómica le entrega a la escena: piezas con su geometría,
 * su estructura del catálogo y cómo deben pintarse.
 *
 * Es la costura para el «modelo del paciente» (fase futura): una capa que lea
 * las mallas glTF que genere el segmentador entregará estas mismas piezas, y la
 * escena las pinta, las resalta, las corta y las captura igual que las del
 * atlas. Nada de la escena sabe si una pieza es procedural o del paciente.
 */
import type * as THREE from 'three'
import type { CapaId } from '../../dominio/capas'
import type { Tejido } from '../materiales/tejidos'

/** Cómo se ve una pieza: decide el material (brillo, translucidez, emisión). */
export type Acabado = 'organo' | 'hueso' | 'disco' | 'nervio' | 'vaso' | 'liquido' | 'envoltura' | 'via' | 'lesion'

export interface PiezaAnatomica {
  /** Id del catálogo; sin él la pieza es decorativa y no se puede tocar. */
  estructura?: string
  /** Atlas detallado: la estructura que la contiene (giro → lóbulo, hueso → cráneo). */
  parteDe?: string
  capa: CapaId
  geometria: THREE.BufferGeometry
  /** Token de color (`--cx-anat-*`). */
  color: string
  acabado: Acabado
  /**
   * Tejido del modo Realista. Opcional: si falta, la escena lo deduce del
   * acabado y la capa (`tejidoDePieza`). Una capa con mallas detalladas puede
   * precisarlo (p. ej. «sustancia-blanca» en un corte del encéfalo).
   */
  tejido?: Tejido
  /** Dónde se cuelga su rótulo. */
  ancla?: THREE.Vector3
  /** Columna despiezada: cuánto se desplaza la pieza entera (rígida). */
  desplazamientoDespiece?: THREE.Vector3
  /** Columna despiezada: la geometría trae su forma separada como morph target. */
  despiezaPorForma?: boolean
  /** Dónde queda el rótulo con la columna separada. */
  anclaDespiece?: THREE.Vector3
}

export interface ContextoDeCapa {
  /** Para capas que necesitan la columna (médula, raíces, vías). */
  columna?: import('./columna3d').ModeloColumna
  /**
   * Las piezas del modelo simplificado, por estructura: el atlas detallado se
   * alinea con ellas (centros, rótulos y despiece de cada vértebra).
   */
  procedurales?: ReadonlyMap<string, readonly PiezaAnatomica[]>
}

export interface CapaAnatomica {
  id: string
  nombre: string
  /**
   * «procedural» es el modelo simplificado; «paciente», las mallas de sus
   * estudios; «referencia», el atlas detallado (una persona de referencia).
   */
  origen: 'procedural' | 'paciente' | 'referencia'
  construir(contexto: ContextoDeCapa): PiezaAnatomica[] | Promise<PiezaAnatomica[]>
}
