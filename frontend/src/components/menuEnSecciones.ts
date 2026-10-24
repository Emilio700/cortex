/**
 * Convierte el menú plano (encabezados `CNavTitle` seguidos de sus ítems) en
 * secciones que se pliegan.
 *
 * `_nav.tsx` sigue siendo plano a propósito: el filtrado por permisos y sus
 * pruebas trabajan sobre esa forma, y un encabezado sin ítems visibles ya se
 * quita ahí. Aquí sólo se agrupa lo que quedó, al momento de pintar.
 */
import { CNavTitle } from '@coreui/react-pro'

import type { NavItem } from '../_nav'

export interface SeccionDelMenu {
  /** Nombre del encabezado («Consultorio», «Finanzas»…), también su clave. */
  nombre: string
  items: NavItem[]
}

export interface MenuEnSecciones {
  /** Lo que va antes del primer encabezado (Inicio): siempre a la vista. */
  sueltos: NavItem[]
  secciones: SeccionDelMenu[]
}

const esEncabezado = (item: NavItem) => item.component === CNavTitle

export const agruparEnSecciones = (items: NavItem[]): MenuEnSecciones => {
  const sueltos: NavItem[] = []
  const secciones: SeccionDelMenu[] = []
  for (const item of items) {
    if (esEncabezado(item)) {
      secciones.push({ nombre: String(item.name), items: [] })
    } else if (secciones.length === 0) {
      sueltos.push(item)
    } else {
      secciones[secciones.length - 1].items.push(item)
    }
  }
  return { sueltos, secciones: secciones.filter((s) => s.items.length > 0) }
}

/** ¿Esta ruta es la de la pantalla abierta (o una de sus hijas)? */
export const rutaActiva = (destino: string | undefined, pathname: string): boolean => {
  if (!destino || destino === '/') return false
  return pathname === destino || pathname.startsWith(`${destino}/`)
}

/** La sección que contiene la pantalla abierta, para abrirla sola. */
export const seccionDeLaRuta = (secciones: SeccionDelMenu[], pathname: string): string | null => {
  // La coincidencia más larga gana: «/finanzas/pagos» es de Cobros, no de
  // «/finanzas» (Corte de caja), aunque las dos vivan en la misma sección.
  let mejor: { nombre: string; largo: number } | null = null
  for (const seccion of secciones) {
    for (const item of seccion.items) {
      if (rutaActiva(item.to, pathname) && (!mejor || item.to!.length > mejor.largo)) {
        mejor = { nombre: seccion.nombre, largo: item.to!.length }
      }
    }
  }
  return mejor?.nombre ?? null
}
