/**
 * Llamadas de las pantallas de Sistema. Los módulos viven en
 * `shared/services/modulos.ts` porque también los lee la sesión.
 */
import { apiClient } from '../../../shared/services/api'
import { cambiarModulo, obtenerModulos } from '../../../shared/services/modulos'
import type { ServicioAuxiliar } from '../dominio/sistema'

export const sistemaApi = {
  obtenerModulos,
  cambiarModulo,
  async estadoDeServicios(): Promise<ServicioAuxiliar[]> {
    const { data } = await apiClient.get<ServicioAuxiliar[]>('/servicios/estado')
    return data ?? []
  },
}
