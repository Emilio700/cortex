import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import type { AvailablePermission, PermissionUpdateResult, UserPermissionsResponse } from '../../../shared/types'

interface UsePermissionsReturn {
  availablePermissions: AvailablePermission[]
  loadingAvailable: boolean
  /** Lanza un error con el mensaje en español si no se pudieron leer. */
  getUserPermissions: (userId: number) => Promise<UserPermissionsResponse>
  /** El catálogo de permisos no se pudo leer; la lista vacía no es «no hay permisos». */
  errorDisponibles: string | null
  /** Devuelve lo que quedo guardado, o null si no se guardo nada. */
  updateUserPermissions: (userId: number, overrides: { user_id: number; action: string; is_granted: boolean }[]) => Promise<PermissionUpdateResult | null>
  saving: boolean
}

export const usePermissions = (): UsePermissionsReturn => {
  const [availablePermissions, setAvailablePermissions] = useState<AvailablePermission[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorDisponibles, setErrorDisponibles] = useState<string | null>(null)

  useEffect(() => {
    const fetchAvailable = async () => {
      try {
        const res = await apiClient.get('/permissions/available')
        setAvailablePermissions(res.data)
      } catch (err) {
        setErrorDisponibles(mensajeDeError(err, 'No se pudo leer el catálogo de permisos.'))
      } finally {
        setLoadingAvailable(false)
      }
    }
    fetchAvailable()
  }, [])

  // Antes un fallo devolvía null y la pantalla seguía mostrando los permisos
  // de la persona elegida antes, como si fueran de ésta, y guardar los
  // escribía encima (plan 29, T-1). Ahora el fallo se lanza y se dice.
  const getUserPermissions = useCallback(async (userId: number): Promise<UserPermissionsResponse> => {
    try {
      const res = await apiClient.get<UserPermissionsResponse>(`/permissions/user/${userId}`)
      return res.data
    } catch (err) {
      throw new Error(mensajeDeError(err, 'No se pudieron leer los permisos de esta persona.'))
    }
  }, [])

  // Devuelve los permisos efectivos que reporto el servidor, no un booleano:
  // la pantalla no debe anunciar un resultado que ella misma supuso. Si el
  // guardado falla, no hay nada que anunciar.
  const updateUserPermissions = useCallback(async (
    userId: number,
    overrides: { user_id: number; action: string; is_granted: boolean }[],
  ): Promise<PermissionUpdateResult | null> => {
    setSaving(true)
    try {
      const res = await apiClient.put<PermissionUpdateResult>(`/permissions/user/${userId}`, overrides)
      return res.data
    } catch {
      return null
    } finally {
      setSaving(false)
    }
  }, [])

  return { availablePermissions, loadingAvailable, errorDisponibles, getUserPermissions, updateUserPermissions, saving }
}
