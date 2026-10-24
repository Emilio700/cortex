/**
 * Los datos del inicio de la doctora, cada sección por su lado (plan 28, Fase 2).
 *
 * Una sección que falla no tapa a las demás: el error de las FPP no esconde la
 * agenda. Todo se refresca junto con `useCicloDeRefresco` (60 s con la pestaña
 * visible, y al volver a ella), y «hoy» se calcula en cada carga: si la
 * pantalla queda abierta pasada la medianoche, el siguiente refresco ya trae el
 * día nuevo.
 */
import { useCallback, useEffect } from 'react'

import { apiClient } from '../../../shared/services/api'
import { hoyLocalISO } from '../../../shared/utils/date'
import { useAuth } from '../../../shared/context/AuthContext'
import type { Appointment } from '../../secretaria/types'
import type { RevisionPendiente } from '../components/TableroRevisionPrenatal'
import type { IncidenciaCritica } from '../components/IncidenciasCriticas'
import { EVENTO_RESULTADOS_ACTUALIZADOS, ESTADO_SIN_REVISAR } from './useResultadosSinRevisar'
import { useCicloDeRefresco } from './useCicloDeRefresco'
import { useDatoVivo } from './useDatoVivo'

export interface PartoProximo {
  pregnancy_id: number
  patient_id: number
  patient_full_name?: string | null
  estimated_delivery_date: string
  vencida?: boolean
  dating_status: string
  next_visit_on?: string | null
}

export interface Criticos {
  items: IncidenciaCritica[]
  total: number
}

/** Citas de hoy en el consultorio: el día va como fecha, no como instante UTC. */
export const pedirCitasDeHoy = async (): Promise<Appointment[]> => {
  const hoy = hoyLocalISO()
  const { data } = await apiClient.get<Appointment[]>('/appointments/my-appointments', {
    params: { fecha_desde: hoy, fecha_hasta: hoy, limit: 200 },
  })
  if (!Array.isArray(data)) throw new Error('La agenda no devolvió una lista de citas.')
  return data
}

const pedirRecientes = async (): Promise<Appointment[]> => {
  // Sin fechas el servidor ordena de la más reciente a la más antigua.
  const { data } = await apiClient.get<Appointment[]>('/appointments/my-appointments', {
    params: { status: 'atendida', limit: 30 },
  })
  if (!Array.isArray(data)) throw new Error('La lista de consultas no llegó completa.')
  return data
}

const pedirResultadosSinRevisar = async (): Promise<number> => {
  const { data } = await apiClient.get('/clinical-tracking/orders/inbox', {
    params: { status: ESTADO_SIN_REVISAR, skip: 0, limit: 1 },
  })
  // Una respuesta sin total no se lee como «0».
  if (typeof data?.total !== 'number') throw new Error('La bandeja no devolvió el total.')
  return data.total
}

const pedirCriticos = async (): Promise<Criticos> => {
  const { data } = await apiClient.get<Criticos>('/clinical-tracking/critical-results')
  if (!Array.isArray(data?.items) || typeof data?.total !== 'number') {
    throw new Error('La respuesta de resultados críticos no trae el total.')
  }
  return data
}

const pedirPrenatales = async (): Promise<RevisionPendiente[]> => {
  const { data } = await apiClient.get<RevisionPendiente[]>('/clinical-tracking/prenatal-review-board')
  if (!Array.isArray(data)) throw new Error('El tablero prenatal no devolvió una lista.')
  return data
}

const pedirPartos = async (): Promise<PartoProximo[]> => {
  const { data } = await apiClient.get<PartoProximo[]>('/clinical-tracking/obstetric-dashboard', {
    params: { days: 30 },
  })
  if (!Array.isArray(data)) throw new Error('La lista de partos no llegó completa.')
  return data
}

export const useInicioDoctora = () => {
  const { can } = useAuth()
  const veCitas = can('doctor.appointments.read')
  // El seguimiento clínico (bandeja, críticos, embarazos) pide su permiso: sin
  // él, el servidor contestaría 403 y la sección diría «no se pudo» siempre.
  const veSeguimiento = can('clinical_tracking.read')

  const citasHoy = useDatoVivo(pedirCitasDeHoy, {
    habilitado: veCitas,
    mensaje: 'No se pudieron cargar tus citas de hoy.',
  })
  const recientes = useDatoVivo(pedirRecientes, {
    habilitado: veCitas,
    mensaje: 'No se pudieron cargar tus pacientes recientes.',
  })
  const resultados = useDatoVivo(pedirResultadosSinRevisar, {
    habilitado: veSeguimiento,
    mensaje: 'No se pudieron contar los resultados sin revisar.',
  })
  const criticos = useDatoVivo(pedirCriticos, {
    habilitado: veSeguimiento,
    mensaje: 'No se pudo consultar si hay resultados críticos.',
  })
  const prenatales = useDatoVivo(pedirPrenatales, {
    habilitado: veSeguimiento,
    mensaje: 'No se pudieron consultar los controles prenatales.',
  })
  const partos = useDatoVivo(pedirPartos, {
    habilitado: veSeguimiento,
    mensaje: 'No se pudieron consultar los partos próximos.',
  })

  const recargarCitas = citasHoy.recargar
  const recargarRecientes = recientes.recargar
  const recargarResultados = resultados.recargar
  const recargarCriticos = criticos.recargar
  const recargarPrenatales = prenatales.recargar
  const recargarPartos = partos.recargar

  const refrescarTodo = useCallback(() => {
    void recargarCitas()
    void recargarRecientes()
    void recargarResultados()
    void recargarCriticos()
    void recargarPrenatales()
    void recargarPartos()
  }, [recargarCitas, recargarRecientes, recargarResultados, recargarCriticos, recargarPrenatales, recargarPartos])

  // Con el latido de avisos solo se recarga lo que un aviso mueve: la agenda
  // (llegó a sala, entró a consulta), los resultados y los críticos.
  const alCambiarAvisos = useCallback(() => {
    void recargarCitas()
    void recargarResultados()
    void recargarCriticos()
  }, [recargarCitas, recargarResultados, recargarCriticos])

  useCicloDeRefresco(refrescarTodo, { alCambiarAvisos })

  // Revisar un resultado en la bandeja (en otra pestaña de GEMS) baja el número
  // y puede cerrar un crítico: se vuelve a preguntar sin esperar al minuto.
  useEffect(() => {
    const alCambiar = () => {
      void recargarResultados()
      void recargarCriticos()
    }
    window.addEventListener(EVENTO_RESULTADOS_ACTUALIZADOS, alCambiar)
    return () => window.removeEventListener(EVENTO_RESULTADOS_ACTUALIZADOS, alCambiar)
  }, [recargarResultados, recargarCriticos])

  return {
    veCitas,
    veSeguimiento,
    citasHoy,
    recientes,
    resultados,
    criticos,
    prenatales,
    partos,
    refrescarTodo,
  }
}
