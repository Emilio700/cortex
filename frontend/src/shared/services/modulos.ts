/**
 * Módulos opcionales del consultorio (base-modulos-extra).
 *
 * Vive en `shared/` porque lo leen la sesión (`AuthContext`, para el menú y las
 * rutas) y la pantalla de Configuración → Módulos. El backend solo lista los
 * módulos ya construidos; uno que no esté aquí no existe para la interfaz.
 */
import { apiClient } from './api'

export interface ModuloDelConsultorio {
  id: string
  nombre: string
  descripcion: string
  /** Servicio que necesita para encenderse (`orthanc`, `whisper`, `ia`…), o null. */
  servicio_requerido: string | null
  servicio_configurado: boolean
  activo: boolean
}

export interface ModulosDelConsultorio {
  /** Ids encendidos: lo que leen el menú y las rutas. */
  activos: string[]
  modulos: ModuloDelConsultorio[]
}

export async function obtenerModulos(): Promise<ModulosDelConsultorio> {
  const { data } = await apiClient.get<ModulosDelConsultorio>('/modulos')
  return { activos: data?.activos ?? [], modulos: data?.modulos ?? [] }
}

export async function cambiarModulo(id: string, activo: boolean): Promise<ModuloDelConsultorio> {
  const { data } = await apiClient.put<ModuloDelConsultorio>(
    `/modulos/${encodeURIComponent(id)}`,
    { activo },
  )
  return data
}
