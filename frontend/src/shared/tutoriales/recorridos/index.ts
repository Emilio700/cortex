/**
 * Catálogo de todos los recorridos. El orden importa: dentro de una misma
 * pantalla, el primero es el que el centro de ayuda pone arriba en
 * «Esta pantalla». Los recorridos completos por rol viven en `completos.ts`.
 */
import type { Recorrido } from '../tipos'
import { RECORRIDOS_GENERALES } from './general'
import { RECORRIDOS_AVISOS } from './avisos'
import { RECORRIDOS_DOCTORA } from './doctora'
import { RECORRIDOS_RECEPCION } from './recepcion'
import { RECORRIDOS_COBROS } from './cobros'
import { RECORRIDOS_ADMINISTRACION } from './administracion'
// base-modulos-extra (tramo A)
import { RECORRIDOS_SISTEMA } from './sistema'

export const CATALOGO: Recorrido[] = [
  ...RECORRIDOS_GENERALES,
  ...RECORRIDOS_AVISOS,
  ...RECORRIDOS_DOCTORA,
  ...RECORRIDOS_RECEPCION,
  ...RECORRIDOS_COBROS,
  ...RECORRIDOS_ADMINISTRACION,
  // base-modulos-extra (tramo A)
  ...RECORRIDOS_SISTEMA,
]
