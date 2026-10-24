/**
 * Los datos del inicio del médico, cada sección por su lado (plan 28, Fase 2).
 *
 * Una sección que falla no tapa a las demás: el error de las cirugías no esconde
 * la agenda. Todo se refresca junto con `useCicloDeRefresco` (60 s con la pestaña
 * visible, y al volver a ella), y «hoy» se calcula en cada carga: si la
 * pantalla queda abierta pasada la medianoche, el siguiente refresco ya trae el
 * día nuevo.
 */
import { useCallback, useEffect } from 'react'

import { apiClient } from '../../../shared/services/api'
import { hoyLocalISO } from '../../../shared/utils/date'
import { useAuth } from '../../../shared/context/AuthContext'
import type { Appointment } from '../../secretaria/types'
import type { IncidenciaCritica } from '../components/IncidenciasCriticas'
import { EVENTO_RESULTADOS_ACTUALIZADOS, ESTADO_SIN_REVISAR } from './useResultadosSinRevisar'
import { useCicloDeRefresco } from './useCicloDeRefresco'
import { useDatoVivo } from './useDatoVivo'

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

/** Días hacia adelante que cubre «Cirugías programadas». */
export const DIAS_DE_CIRUGIAS = 14

/** El día local dentro de `dias` días, como AAAA-MM-DD (lo que espera la API). */
const diaLocalEn = (dias: number) => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Las cirugías del médico de hoy a dos semanas. En neurocirugía es el
 * seguimiento que más pesa (valoración preoperatoria, estudios, quirófano); en
 * GEMS este lugar lo ocupaban los controles del embarazo.
 */
const pedirCirugias = async (): Promise<Appointment[]> => {
  const { data } = await apiClient.get<Appointment[]>('/appointments/my-appointments', {
    params: {
      appointment_type: 'cirugia',
      fecha_desde: hoyLocalISO(),
      fecha_hasta: diaLocalEn(DIAS_DE_CIRUGIAS),
      orden: 'asc',
      limit: 100,
    },
  })
  if (!Array.isArray(data)) throw new Error('La lista de cirugías no llegó completa.')
  return data.filter((cita) => cita.status !== 'cancelada')
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
  const cirugias = useDatoVivo(pedirCirugias, {
    habilitado: veCitas,
    mensaje: 'No se pudieron consultar las cirugías programadas.',
  })

  const recargarCitas = citasHoy.recargar
  const recargarRecientes = recientes.recargar
  const recargarResultados = resultados.recargar
  const recargarCriticos = criticos.recargar
  const recargarCirugias = cirugias.recargar

  const refrescarTodo = useCallback(() => {
    void recargarCitas()
    void recargarRecientes()
    void recargarResultados()
    void recargarCriticos()
    void recargarCirugias()
  }, [recargarCitas, recargarRecientes, recargarResultados, recargarCriticos, recargarCirugias])

  // Con el latido de avisos solo se recarga lo que un aviso mueve: la agenda
  // (llegó a sala, entró a consulta), los resultados y los críticos.
  const alCambiarAvisos = useCallback(() => {
    void recargarCitas()
    void recargarResultados()
    void recargarCriticos()
  }, [recargarCitas, recargarResultados, recargarCriticos])

  useCicloDeRefresco(refrescarTodo, { alCambiarAvisos })

  // Revisar un resultado en la bandeja (en otra pestaña de Cortex) baja el número
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
    cirugias,
    refrescarTodo,
  }
}
