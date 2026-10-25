// Registros genéricos (colección `registros`, docs/api.md v1.2): permisos por tipo, rutas y hooks.
//
// La matriz es espejo de api/src/permissions.ts (REGISTROS_PERMISOS); el servidor es quien decide.
// En modo demo no hay roles: todo se permite.
//
// Uso en módulos:
//   const vacunas = useRegistros('vacuna', patientId)          // ordenados por fecha desc
//   const puede = useCanRegistro('vacuna', 'write')            // oculta botones si el rol no puede
//   add('registros', { patientId, tipo: 'vacuna', titulo: 'BCG dosis única', estado: 'aplicada', datos: {...} })
import { useMemo } from 'react'
import { getMode } from './api'
import { useSession } from './session'
import { useCollection } from './store'
import type { ID, Registro, Rol, TipoRegistro } from './types'
import { permisoRegistro } from './registros-permisos'

export { REGISTROS_PERMISOS, permisoRegistro, REGISTRO_INFO, registroLabel } from './registros-permisos'

/** ¿El rol puede leer este tipo? En modo demo siempre. Sin usuario en modo servidor, no. */
export function canReadRegistro(rol: Rol | null | undefined, tipo: TipoRegistro): boolean {
  if (getMode() !== 'server') return true
  return !!rol && permisoRegistro(rol, tipo, 'read')
}
/** ¿El rol puede crear/modificar/borrar este tipo? En modo demo siempre. */
export function canWriteRegistro(rol: Rol | null | undefined, tipo: TipoRegistro): boolean {
  if (getMode() !== 'server') return true
  return !!rol && permisoRegistro(rol, tipo, 'write')
}
/** Hook reactivo con el usuario de la sesión. */
export function useCanRegistro(tipo: TipoRegistro, op: 'read' | 'write' = 'write'): boolean {
  const ses = useSession()
  return op === 'read' ? canReadRegistro(ses.user?.rol, tipo) : canWriteRegistro(ses.user?.rol, tipo)
}

export const ordenarRegistros = (a: Registro, b: Registro) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)

/**
 * Registros de uno o varios tipos (opcionalmente de un paciente), ordenados por fecha descendente.
 * `patientId` undefined = todos (con y sin paciente); `null` = solo los que no tienen paciente.
 */
export function useRegistros(tipo: TipoRegistro | TipoRegistro[], patientId?: ID | null): Registro[] {
  const tipos = Array.isArray(tipo) ? tipo : [tipo]
  const key = tipos.join('|')
  const all = useCollection('registros')
  return useMemo(
    () =>
      all
        .filter((r) => tipos.includes(r.tipo) && (patientId === undefined || (patientId === null ? !r.patientId : r.patientId === patientId)))
        .sort(ordenarRegistros),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, key, patientId],
  )
}

