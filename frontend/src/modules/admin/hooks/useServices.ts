/**
 * Service catalog management hook - CRUD over /services (Fase 3.1/3.4)
 */
import { useState } from 'react'
import { apiClient } from '../../../shared/services/api'
import type { Service, ServiceCreate, ServiceUpdate } from '../types'

export const useServices = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchServices = async (includeInactive = false): Promise<Service[]> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<Service[]>('/services', {
        params: { include_inactive: includeInactive },
      })
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al cargar servicios'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  const createService = async (data: ServiceCreate): Promise<Service> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.post<Service>('/services', data)
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al crear servicio'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  const updateService = async (id: number, data: ServiceUpdate): Promise<Service> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.put<Service>(`/services/${id}`, data)
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al actualizar servicio'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  const deactivateService = async (id: number): Promise<Service> => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.patch<Service>(`/services/${id}/deactivate`)
      return response.data
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al desactivar servicio'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, fetchServices, createService, updateService, deactivateService }
}
