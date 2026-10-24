import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'

export interface SystemRoleInfo {
  name: string
  label: string
  is_system: boolean
  user_count: number
}

export interface CustomRoleData {
  id: number
  tenant_id: number
  name: string
  base_role: string
  description: string | null
  is_active: boolean
  created_at: string
  user_count: number
}

export interface RoleAssignData {
  user_id: number
  role: string
}

export const useCustomRoles = () => {
  const [systemRoles, setSystemRoles] = useState<SystemRoleInfo[]>([])
  const [customRoles, setCustomRoles] = useState<CustomRoleData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const [sysRes, custRes] = await Promise.all([
        apiClient.get<SystemRoleInfo[]>('/custom-roles/system'),
        apiClient.get<CustomRoleData[]>('/custom-roles?include_inactive=true'),
      ])
      setSystemRoles(sysRes.data)
      setCustomRoles(custRes.data)
    } catch {
      setError('Error al cargar roles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  const createRole = useCallback(async (data: { name: string; base_role: string; description?: string }): Promise<boolean> => {
    setSaving(true)
    try {
      await apiClient.post('/custom-roles', data)
      await fetchRoles()
      return true
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al crear rol')
      return false
    } finally {
      setSaving(false)
    }
  }, [fetchRoles])

  const updateRole = useCallback(async (roleId: number, data: Partial<CustomRoleData>): Promise<boolean> => {
    setSaving(true)
    try {
      await apiClient.patch(`/custom-roles/${roleId}`, data)
      await fetchRoles()
      return true
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al actualizar rol')
      return false
    } finally {
      setSaving(false)
    }
  }, [fetchRoles])

  const deleteRole = useCallback(async (roleId: number): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      await apiClient.delete(`/custom-roles/${roleId}`)
      await fetchRoles()
      return true
    } catch (err: any) {
      // Un 409 trae el motivo concreto (qué rol y cuántas cuentas lo tienen);
      // «Error al eliminar rol» no decía qué hacer para lograrlo.
      setError(mensajeDeError(err, 'No se pudo eliminar el rol.'))
      return false
    } finally {
      setSaving(false)
    }
  }, [fetchRoles])

  const assignRole = useCallback(async (data: RoleAssignData): Promise<boolean> => {
    setSaving(true)
    try {
      await apiClient.put('/custom-roles/assign', data)
      return true
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al asignar rol')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  return { systemRoles, customRoles, loading, saving, error, createRole, updateRole, deleteRole, assignRole, refresh: fetchRoles }
}
