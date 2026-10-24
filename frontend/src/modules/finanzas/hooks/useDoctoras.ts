/**
 * Médicos de la sucursal para los selectores de finanzas.
 *
 * Mismo endpoint que usa la agenda (`/users/directory?role=doctor`): una sola
 * lista de doctoras en todo el sistema, y no otra que pida permisos de
 * administración de usuarios que la secretaria no tiene.
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../../../shared/services/api'
import { Role, type User } from '../../../shared/types'

export const useDoctoras = (habilitado: boolean) => {
  const [doctoras, setDoctoras] = useState<User[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!habilitado) return
    let vigente = true
    apiClient
      .get<User[]>('/users/directory', { params: { role: Role.DOCTOR } })
      .then((res) => {
        if (vigente) setDoctoras(Array.isArray(res?.data) ? res.data : [])
      })
      .catch(() => {
        if (vigente) setError('No se pudo cargar la lista de doctoras.')
      })
    return () => {
      vigente = false
    }
  }, [habilitado])

  return { doctoras, error }
}
