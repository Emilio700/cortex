/** Los números de la franja de la bandeja (plan 32, punto 3). */
import { apiClient } from '../../../shared/services/api'
import type { ResumenBandeja } from '../types/clinicalTracking'

export const obtenerResumenBandeja = async (): Promise<ResumenBandeja> =>
  (await apiClient.get<ResumenBandeja>('/clinical-tracking/orders/inbox-summary')).data
