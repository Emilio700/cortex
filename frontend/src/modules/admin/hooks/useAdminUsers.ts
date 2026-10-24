/**
 * Admin users management hook - CRUD over /users (Fase 3.4)
 */
import { useState } from 'react'
import { apiClient } from '../../../shared/services/api'
import type { User } from '../../../shared/types'
import type { DoctorasQueApoya, UserCreate, UserUpdate } from '../types'

export const useAdminUsers = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async (): Promise<User[]> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<User[]>('/users')
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al cargar usuarios'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  const createUser = async (data: UserCreate): Promise<User> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.post<User>('/users', data)
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al crear usuario'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  const updateUser = async (id: number, data: UserUpdate): Promise<User> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.put<User>(`/users/${id}`, data)
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al actualizar usuario'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  // Sin `loading` compartido: el formulario de usuario lleva su propio estado y
  // no debe apagar la tabla de fondo mientras carga las asignaciones.
  const getDoctorasQueApoya = async (secretariaId: number): Promise<DoctorasQueApoya> => {
    try {
      const response = await apiClient.get<DoctorasQueApoya>(`/users/${secretariaId}/doctoras-que-apoya`)
      return response.data
    } catch (err: any) {
      throw new Error(err.response?.data?.detail || 'No se pudieron cargar los médicos que apoya.')
    }
  }

  const saveDoctorasQueApoya = async (
    secretariaId: number,
    datos: { doctor_ids: number[]; puede_ver_corte: boolean },
  ): Promise<DoctorasQueApoya> => {
    try {
      const response = await apiClient.put<DoctorasQueApoya>(`/users/${secretariaId}/doctoras-que-apoya`, datos)
      return response.data
    } catch (err: any) {
      throw new Error(err.response?.data?.detail || 'No se guardaron los médicos que apoya.')
    }
  }

  return { loading, error, fetchUsers, createUser, updateUser, getDoctorasQueApoya, saveDoctorasQueApoya }
}
