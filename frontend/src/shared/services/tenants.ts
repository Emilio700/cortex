/**
 * Sucursales (tenants) — único punto de acceso HTTP al recurso.
 *
 * Todas las llamadas al backend relacionadas con sucursales viven aquí, de
 * modo que ajustar el contrato sea tocar un solo archivo.
 *
 * CONTRATO (prefijo real `/api/v1`, añadido por `apiClient`):
 *
 *   GET  /tenants?include_inactive=false  -> Tenant[]
 *        Cualquier rol. MASTER ve todas (con `include_inactive=true` también
 *        las desactivadas); el resto sólo la suya y sólo si está activa.
 *   POST /tenants                         -> Tenant (201). Sólo MASTER.
 *        Body: TenantPayload. 400 al superar el máximo de sucursales activas
 *        o si el nombre está repetido; el mensaje viene en español y se
 *        muestra tal cual (el tope vive sólo en el backend).
 *   PUT  /tenants/{id}                    -> Tenant. Sólo MASTER.
 *        Actualización parcial: se envía únicamente lo que cambia.
 *   PUT  /tenants/{id}/status             -> Tenant. Sólo MASTER.
 *        Body: `{ "is_active": boolean }`. Desactivación lógica: nunca se
 *        borra una sucursal porque de ella cuelgan pacientes e historial
 *        clínico. No existe DELETE (el backend responde 405).
 *   PUT  /tenants/{id}/switch             -> TenantSwitchResponse
 *        Sin body. Devuelve access_token Y refresh_token: hay que guardar los
 *        dos o la sesión muere en el primer refresh.
 *
 *   GET  /doctor-clinics                  -> DoctorClinic[]
 *        Consultorios asignados al doctor autenticado; determina a qué
 *        sucursales puede cambiar un doctor.
 */
import { apiClient } from './api'

export interface Tenant {
  id: number
  name: string
  address?: string | null
  phone?: string | null
  email?: string | null
  /** Código corto para los folios (GYG-REC-2026-0042); plan 32. */
  codigo_folio?: string | null
  is_active: boolean
  created_at: string
}

/** Campos editables de una sucursal. En edición el backend acepta parciales. */
export interface TenantPayload {
  name?: string
  address?: string | null
  phone?: string | null
  email?: string | null
  codigo_folio?: string | null
}

export interface TenantSwitchResponse {
  access_token: string
  refresh_token: string
  token_type: string
  tenant_id: number
  tenant_name: string
}

export interface DoctorClinic {
  id: number
  tenant_id: number
  tenant_name: string
  created_at: string | null
}

/**
 * Extrae el mensaje del backend. FastAPI devuelve `detail` como string en los
 * errores de negocio (p. ej. el máximo de sucursales) y como lista en los de
 * validación; conservamos el texto en español en ambos casos.
 */
const extractMessage = (error: unknown, fallback: string): string => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const msg = (detail[0] as { msg?: unknown })?.msg
    if (typeof msg === 'string') return msg
  }
  return fallback
}

const request = async <T>(fallback: string, call: () => Promise<{ data: T }>): Promise<T> => {
  try {
    const { data } = await call()
    return data
  } catch (error) {
    throw new Error(extractMessage(error, fallback))
  }
}

export const listTenants = (includeInactive = false): Promise<Tenant[]> =>
  request('No se pudieron cargar las sucursales.', () =>
    apiClient.get<Tenant[]>('/tenants', { params: { include_inactive: includeInactive } }),
  )

export const createTenant = (payload: TenantPayload): Promise<Tenant> =>
  request('No se pudo crear la sucursal.', () => apiClient.post<Tenant>('/tenants', payload))

export const updateTenant = (id: number, payload: TenantPayload): Promise<Tenant> =>
  request('No se pudo actualizar la sucursal.', () =>
    apiClient.put<Tenant>(`/tenants/${id}`, payload),
  )

export const setTenantStatus = (id: number, isActive: boolean): Promise<Tenant> =>
  request(isActive ? 'No se pudo activar la sucursal.' : 'No se pudo desactivar la sucursal.', () =>
    apiClient.put<Tenant>(`/tenants/${id}/status`, { is_active: isActive }),
  )

export const switchTenant = (id: number): Promise<TenantSwitchResponse> =>
  request('No se pudo cambiar de sucursal.', () =>
    apiClient.put<TenantSwitchResponse>(`/tenants/${id}/switch`),
  )

export const listMyClinics = (): Promise<DoctorClinic[]> =>
  request('No se pudieron cargar tus consultorios.', () =>
    apiClient.get<DoctorClinic[]>('/doctor-clinics'),
  )
