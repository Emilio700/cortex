/**
 * Única fuente de órdenes de la paciente dentro de una consulta.
 *
 * Tres paneles pedían los mismos datos por separado (y uno pedía el historial
 * entero con `limit: 1` sólo para leer el total): la lista de «Estudios de
 * esta consulta» hacía dos llamadas, «Resultados pendientes» una tercera con
 * `por_atender`, y la pestaña Estudios una cuarta con su propia paginación.
 * En producción eso son peticiones repetidas que devuelven lo mismo.
 *
 * Aquí una entrada por paciente guarda lo que piden las tres vistas, cargado
 * con DOS peticiones:
 *
 * - El historial (página 0, sin filtros, `limit: 100`): de ahí salen la lista
 *   de la consulta (filtrada por cita en el cliente cuando el expediente cabe
 *   en la página), el total del expediente para el enlace «Ver historial (N)»
 *   (del `X-Total-Count`, sin la llamada extra de antes) y la primera página
 *   de la pestaña Estudios.
 * - «Por atender» (`por_atender: true`): es un filtro del servidor con su
 *   propia semántica —autoría clínica, incidencias críticas abiertas, estados
 *   no imprimibles y un orden de atención que pone las incidencias primero—
 *   que no se puede derivar del listado general sin cambiar lo que se ve.
 *
 * Exactitud: si el expediente tiene más órdenes de las que caben en una página
 * (el servidor topa en 100), la lista de la consulta se pide con su filtro
 * `appointment_id` en vez de derivarse: una cita reabierta con más de 100
 * órdenes posteriores no puede quedarse sin sus estudios.
 *
 * Errores: cada vista anuncia el suyo y ofrece reintentar; mientras no se sepa,
 * ninguna dice «no hay». La entrada se olvida cuando se desmonta el último
 * consumidor, así cada consulta vuelve a preguntar fresca.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import type { OrdenConResultados, OrdenEnBandeja } from '../types/clinicalTracking'

/** El servidor no entrega más de 100 órdenes por página. */
export const LIMITE_DE_CONSULTA = 100
/** Tope de «Resultados pendientes», igual que antes. */
export const LIMITE_POR_ATENDER = 50

const rutaDeOrdenes = (patientId: number) => `/clinical-tracking/patient/${patientId}/orders`

/** Lo que los componentes leen: una foto inmutable por cada cambio. */
interface VistaDeOrdenes {
  historial: OrdenConResultados[] | null
  totalExpediente: number | null
  cargandoHistorial: boolean
  errorHistorial: string | null
  deConsulta: OrdenConResultados[] | null
  totalConsulta: number | null
  cargandoConsulta: boolean
  errorConsulta: string | null
  porAtender: OrdenEnBandeja[] | null
  totalPorAtender: number | null
  cargandoPorAtender: boolean
  errorPorAtender: string | null
}

interface Entrada extends VistaDeOrdenes {
  patientId: number
  /** Cita para la que se cargó cada rebanada: distingue una consulta nueva. */
  citaHistorial: number | null
  citaPorAtender: number | null
  version: number
  vista: VistaDeOrdenes
  oyentes: Set<() => void>
}

const VISTA_INICIAL: VistaDeOrdenes = {
  historial: null,
  totalExpediente: null,
  cargandoHistorial: false,
  errorHistorial: null,
  deConsulta: null,
  totalConsulta: null,
  cargandoConsulta: false,
  errorConsulta: null,
  porAtender: null,
  totalPorAtender: null,
  cargandoPorAtender: false,
  errorPorAtender: null,
}

const entradas = new Map<number, Entrada>()

const construirVista = (e: Entrada): VistaDeOrdenes => ({
  historial: e.historial,
  totalExpediente: e.totalExpediente,
  cargandoHistorial: e.cargandoHistorial,
  errorHistorial: e.errorHistorial,
  deConsulta: e.deConsulta,
  totalConsulta: e.totalConsulta,
  cargandoConsulta: e.cargandoConsulta,
  errorConsulta: e.errorConsulta,
  porAtender: e.porAtender,
  totalPorAtender: e.totalPorAtender,
  cargandoPorAtender: e.cargandoPorAtender,
  errorPorAtender: e.errorPorAtender,
})

const notificar = (e: Entrada) => {
  e.version += 1
  e.vista = construirVista(e)
  for (const oyente of [...e.oyentes]) oyente()
}

const obtener = (patientId: number): Entrada => {
  let e = entradas.get(patientId)
  if (!e) {
    e = {
      patientId,
      ...VISTA_INICIAL,
      citaHistorial: null,
      citaPorAtender: null,
      version: 0,
      vista: { ...VISTA_INICIAL },
      oyentes: new Set(),
    }
    entradas.set(patientId, e)
  }
  return e
}

/** Una respuesta tardía no puede escribir sobre una entrada ya olvidada. */
const vigente = (e: Entrada) => entradas.get(e.patientId) === e

/** El expediente completo cabe en la página ya pedida: derivar es exacto. */
const cabeElExpediente = (e: Entrada) =>
  e.totalExpediente !== null
    ? e.totalExpediente <= LIMITE_DE_CONSULTA
    : (e.historial?.length ?? 0) < LIMITE_DE_CONSULTA

const cargarConsultaExacta = async (e: Entrada, cita: number) => {
  e.cargandoConsulta = true
  notificar(e)
  try {
    const respuesta = await apiClient.get<OrdenConResultados[]>(rutaDeOrdenes(e.patientId), {
      params: { appointment_id: cita, skip: 0, limit: LIMITE_DE_CONSULTA },
    })
    if (!vigente(e)) return
    e.deConsulta = respuesta.data
    const encabezado = respuesta.headers?.['x-total-count']
    e.totalConsulta = encabezado !== undefined ? Number(encabezado) : respuesta.data.length
    e.errorConsulta = null
  } catch (err) {
    if (!vigente(e)) return
    e.deConsulta = null
    e.totalConsulta = null
    e.errorConsulta = mensajeDeError(err, 'No se pudieron cargar los estudios de esta consulta.')
  } finally {
    if (!vigente(e)) return
    e.cargandoConsulta = false
    notificar(e)
  }
}

const cargarHistorial = async (e: Entrada, cita: number | null) => {
  e.citaHistorial = cita
  e.cargandoHistorial = true
  e.errorHistorial = null
  e.errorConsulta = null
  e.deConsulta = null
  e.totalConsulta = null
  e.cargandoConsulta = true
  notificar(e)
  try {
    const respuesta = await apiClient.get<OrdenConResultados[]>(rutaDeOrdenes(e.patientId), {
      params: { skip: 0, limit: LIMITE_DE_CONSULTA },
    })
    if (!vigente(e)) return
    e.historial = respuesta.data
    const encabezado = respuesta.headers?.['x-total-count']
    e.totalExpediente = encabezado !== undefined ? Number(encabezado) : respuesta.data.length
    e.cargandoHistorial = false
    if (cabeElExpediente(e)) {
      // Todo el expediente está en memoria: la lista de la consulta se deriva
      // sin otra petición, y el total es el de las filas filtradas.
      e.deConsulta = (e.historial ?? []).filter((o) => o.appointment_id === cita)
      e.totalConsulta = e.deConsulta.length
      e.cargandoConsulta = false
      notificar(e)
    } else if (cita !== null) {
      // Expediente grande: la derivación podría perder órdenes de una cita
      // antigua (una consulta reabierta). El servidor filtra exacto.
      notificar(e)
      await cargarConsultaExacta(e, cita)
    } else {
      // Sin cita (sólo la pestaña Estudios) no hay lista que derivar.
      e.cargandoConsulta = false
      notificar(e)
    }
  } catch (err) {
    if (!vigente(e)) return
    e.historial = null
    e.totalExpediente = null
    e.cargandoHistorial = false
    e.cargandoConsulta = false
    e.errorHistorial = mensajeDeError(err, 'No se pudo cargar el historial de estudios.')
    e.errorConsulta = mensajeDeError(err, 'No se pudieron cargar los estudios de esta consulta.')
    notificar(e)
  }
}

const cargarPorAtender = async (e: Entrada, cita: number | null) => {
  e.citaPorAtender = cita
  e.cargandoPorAtender = true
  e.errorPorAtender = null
  notificar(e)
  try {
    const respuesta = await apiClient.get<OrdenEnBandeja[]>(rutaDeOrdenes(e.patientId), {
      params: { por_atender: true, skip: 0, limit: LIMITE_POR_ATENDER },
    })
    if (!vigente(e)) return
    e.porAtender = respuesta.data
    const encabezado = respuesta.headers?.['x-total-count']
    e.totalPorAtender = encabezado !== undefined ? Number(encabezado) : respuesta.data.length
  } catch (err) {
    if (!vigente(e)) return
    e.porAtender = null
    e.totalPorAtender = null
    e.errorPorAtender = mensajeDeError(
      err,
      'No se pudieron cargar los resultados pendientes de la paciente.',
    )
  } finally {
    if (!vigente(e)) return
    e.cargandoPorAtender = false
    notificar(e)
  }
}

/** Refresco forzado tras una mutación (crear, anexar, revisar, anular…). */
const recargarHistorial = (patientId: number, cita: number | null) => {
  void cargarHistorial(obtener(patientId), cita)
}

const recargarPorAtender = (patientId: number, cita: number | null) => {
  void cargarPorAtender(obtener(patientId), cita)
}

const suscribir = (patientId: number) => (oyente: () => void) => {
  const e = obtener(patientId)
  e.oyentes.add(oyente)
  return () => {
    e.oyentes.delete(oyente)
    // Sin consumidores no hay consulta abierta: se olvida todo para que la
    // próxima vuelva a preguntar fresca (otra cita, otro día).
    if (e.oyentes.size === 0) entradas.delete(e.patientId)
  }
}

const usarVista = (patientId: number) =>
  useSyncExternalStore(
    useCallback(suscribir(patientId), [patientId]),
    useCallback(() => obtener(patientId).vista, [patientId]),
  )

/** Para las pruebas: olvida lo cargado entre un caso y el siguiente. */
export const olvidarOrdenesDePaciente = (patientId?: number) => {
  if (patientId === undefined) entradas.clear()
  else entradas.delete(patientId)
}

/**
 * Lista de «Estudios de esta consulta» y total del expediente, de la fuente
 * compartida. Al montarse (o al cambiar de cita) recarga si hace falta.
 */
export const useOrdenesDeLaConsulta = (patientId: number, appointmentId: number) => {
  const vista = usarVista(patientId)

  useEffect(() => {
    const e = obtener(patientId)
    if (e.cargandoHistorial) return
    if (e.historial !== null && e.citaHistorial === appointmentId) return
    void cargarHistorial(e, appointmentId)
  }, [patientId, appointmentId])

  return {
    ordenes: vista.deConsulta ?? [],
    totalConsulta: vista.totalConsulta ?? 0,
    totalExpediente: vista.totalExpediente,
    cargando: vista.cargandoConsulta || (vista.deConsulta === null && vista.errorConsulta === null),
    error: vista.errorConsulta,
    recargar: () => recargarHistorial(patientId, appointmentId),
  }
}

/**
 * Página 0 del historial de la pestaña Estudios, de la fuente compartida:
 * si la consulta ya la cargó, montar la pestaña no pide nada.
 */
export const useHistorialDeOrdenes = (patientId: number) => {
  const vista = usarVista(patientId)

  useEffect(() => {
    const e = obtener(patientId)
    if (e.historial === null && !e.cargandoHistorial) void cargarHistorial(e, null)
  }, [patientId])

  return {
    historial: vista.historial ?? [],
    totalExpediente: vista.totalExpediente,
    cargando:
      vista.cargandoHistorial || (vista.historial === null && vista.errorHistorial === null),
    error: vista.errorHistorial,
    // Al reintentar no se pierde la cita que ya tenía la entrada.
    recargar: () => recargarHistorial(patientId, obtener(patientId).citaHistorial),
  }
}

/** «Resultados pendientes de la paciente», de la fuente compartida. */
export const useResultadosPorAtender = (patientId: number, appointmentId: number) => {
  const vista = usarVista(patientId)

  useEffect(() => {
    const e = obtener(patientId)
    if (e.cargandoPorAtender) return
    if (e.porAtender !== null && e.citaPorAtender === appointmentId) return
    void cargarPorAtender(e, appointmentId)
  }, [patientId, appointmentId])

  return {
    porAtender: vista.porAtender,
    totalPorAtender: vista.totalPorAtender,
    cargando:
      vista.cargandoPorAtender || (vista.porAtender === null && vista.errorPorAtender === null),
    error: vista.errorPorAtender,
    recargar: () => recargarPorAtender(patientId, appointmentId),
  }
}
