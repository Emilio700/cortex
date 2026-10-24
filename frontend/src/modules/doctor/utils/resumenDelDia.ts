/** Los números del encabezado de Mis Consultas, contados en el servidor (plan 32, punto 4). */
import { apiClient } from '../../../shared/services/api'

export interface ResumenDelDia {
  fecha: string
  total: number
  pendientes: number
  atendidas: number
}

export const obtenerResumenDelDia = async (): Promise<ResumenDelDia> =>
  (await apiClient.get<ResumenDelDia>('/appointments/my-appointments/resumen-del-dia')).data
