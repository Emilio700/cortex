/**
 * Salas de consulta — único punto de acceso HTTP al recurso.
 *
 * Igual que `tenants.ts`, TODAS las llamadas al backend sobre salas viven
 * aquí. Se usan los nombres de campo del backend (`name`, `display_order`)
 * sin traducirlos: este archivo ES la frontera, y una capa de renombrado
 * sólo añadiría un sitio más donde equivocarse.
 *
 * CONTRATO (prefijo real `/api/v1`, lo añade `apiClient`):
 *
 *   GET  /consultation-rooms                       -> Sala[]
 *        Cualquier rol autenticado. Ya viene ordenado por `display_order` y
 *        luego por `name`.
 *        Query: `include_inactive` (bool, def. false) — lo pide la pantalla
 *        de gestión; la agenda trabaja sólo con las activas.
 *                `tenant_id` (sólo MASTER) — lo necesita el filtro de la
 *        agenda cuando se mira una sucursal distinta de la activa.
 *   POST /consultation-rooms                       -> Sala (201). MASTER/ADMIN.
 *        Body: `{ name, display_order }`. `name` de 1 a 100 caracteres.
 *   PUT  /consultation-rooms/{id}                  -> Sala. MASTER/ADMIN. Parcial.
 *   PUT  /consultation-rooms/{id}/status           -> Sala. MASTER/ADMIN.
 *        Body: `{ is_active: boolean }`. Desactivación lógica: NO hay DELETE
 *        (el backend responde 405), porque de una sala cuelgan citas.
 *
 * Errores del backend, ya redactados en español y que se muestran tal cual:
 *   400 "Ya existe una sala con ese nombre en esta sucursal."
 *   400 "El nombre de la sala es obligatorio."
 *   403 "No tienes permiso para realizar esta acción."
 *   404 "No se encontró la sala."
 *
 * La validación de agenda (sala obligatoria, sala ocupada, sala inválida) NO
 * vive aquí: la aplica el backend al crear o actualizar la cita y devuelve
 * 400 con un `detail` en español escrito para el usuario.
 */
import { apiClient } from './api'

/** Ruta del recurso. Un solo sitio donde cambiarla si el backend se mueve. */
const BASE = '/consultation-rooms'

export interface Sala {
  id: number
  tenant_id: number
  name: string
  is_active: boolean
  display_order: number
  created_at?: string
}

/** Campos editables de una sala. En edición el backend acepta parciales. */
export interface SalaPayload {
  name?: string
  display_order?: number
}

/**
 * Extrae el mensaje del backend conservando el texto en español, tanto en los
 * errores de negocio (`detail` string, p. ej. "Sala 1 ya está ocupada…") como
 * en los de validación (`detail` lista).
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

export interface ListSalasOptions {
  /** Incluye las salas desactivadas. Sólo lo usa la pantalla de gestión. */
  includeInactive?: boolean
  /** Sucursal concreta (sólo MASTER). Sin valor, la sucursal activa. */
  tenantId?: number
}

export const listSalas = ({ includeInactive, tenantId }: ListSalasOptions = {}): Promise<Sala[]> => {
  const params: Record<string, unknown> = {}
  if (includeInactive) params.include_inactive = true
  if (tenantId) params.tenant_id = tenantId
  return request('No se pudieron cargar las salas.', () => apiClient.get<Sala[]>(BASE, { params }))
}

export const createSala = (payload: SalaPayload): Promise<Sala> =>
  request('No se pudo crear la sala.', () => apiClient.post<Sala>(BASE, payload))

export const updateSala = (id: number, payload: SalaPayload): Promise<Sala> =>
  request('No se pudo actualizar la sala.', () => apiClient.put<Sala>(`${BASE}/${id}`, payload))

export const setSalaStatus = (id: number, isActive: boolean): Promise<Sala> =>
  request(isActive ? 'No se pudo activar la sala.' : 'No se pudo desactivar la sala.', () =>
    apiClient.put<Sala>(`${BASE}/${id}/status`, { is_active: isActive }),
  )
