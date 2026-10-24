/**
 * Toda la conversación de la consulta con el servidor, en un solo lugar.
 *
 * La página tenía las cinco lecturas, la clasificación de sus errores y el
 * cierre de la consulta mezclados con 400 líneas de JSX. Cada rama nueva
 * (embarazo, plan clínico, la próxima revisión prenatal que viene) engordaba
 * el mismo componente y volvía imposible leer de un vistazo qué pasa cuando
 * una lectura falla — que es justamente lo que se nos escapó en producción.
 *
 * Aquí vive el estado que depende del servidor; en la página queda lo que sólo
 * depende de dónde hizo clic el médico (pestaña activa, modal, borrador de la
 * nota para secretaría).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { useDoctorAppointments, type CitaCargada } from './useDoctorAppointments'
import { useTriage } from './useTriage'
import { useSOAPNotes } from './useSOAPNotes'
import { useCertificates } from './useCertificates'
import { usePrescriptions } from './usePrescriptions'
import { useEmbarazoActivo } from './useEmbarazoActivo'
import { usePatients } from '../../secretaria/hooks/usePatients'
import { apiClient } from '../../../shared/services/api'

import type { Patient, Triage } from '../../secretaria/types'
import type { MedicalCertificate, Prescription, SOAPNote } from '../types'
import type { SOAPNoteFormHandle } from '../components/SOAPNoteForm'
import { mensajeDeError, type Cargado } from '../../../shared/utils/errors'
import type { CamposCobroDeCita, CobroResumen, EstadoCobro } from '../../finanzas/types'
import type { CobroCapturado } from '../../finanzas/components/CobroAlFinalizar'
import { aErrorDeCobro, nuevoIdDeIntento } from '../../finanzas/utils/cobro'
import { salidaDeConsulta } from '../../secretaria/utils/salidaDeConsulta'

/**
 * Lo que el servidor confirmó del cobro al cerrar.
 *
 * `modo` es lo que eligió el médico (null si no se mandó cobro: la cita ya
 * estaba cobrada). `estado` es lo que dijo el servidor, y es lo único que la
 * pantalla anuncia: si el médico eligió "Lo cobra recepción" pero recepción
 * ya había cobrado mientras tanto, decir "pendiente de cobro" hacía que se
 * cobrara otra vez. `confirmado` es falso si el estado no corresponde a lo
 * elegido o si el servidor no lo dijo (un backend viejo que ignora el bloque).
 */
export interface ResultadoCobro {
  modo: CobroCapturado['modo'] | null
  confirmado: boolean
  estado: EstadoCobro | null
  cobros: CobroResumen[]
}

/** Qué estados de cobro corresponden a cada decisión del médico. */
const ESTADOS_ESPERADOS: Record<CobroCapturado['modo'], EstadoCobro[]> = {
  cobrado: ['cobrada'],
  sin_cargo: ['sin_cargo'],
  // Recepción pudo haberla cobrado antes (cobro anticipado): también vale.
  recepcion: ['pendiente', 'cobrada'],
}

/** Los campos de cobro que mandó el servidor, sin inventar los que no mandó. */
const camposDeCobro = (datos: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries({
      status: datos.status,
      estado_cobro: datos.estado_cobro,
      total_cobrado: datos.total_cobrado,
      cobro_resumen: datos.cobro_resumen,
      cobro_sin_cargo_motivo: datos.cobro_sin_cargo_motivo,
      attended_by_user_id: datos.attended_by_user_id,
    }).filter(([, v]) => v !== undefined),
  )

/**
 * Red de seguridad del `.catch()` de cada lectura. `cargar()` ya clasifica lo
 * que devuelve la petición; esto cubre el caso en que el hook falle antes de
 * llegar ahí. Lo que no se puede permitir es que un fallo se convierta en un
 * dato vacío, así que se traduce a error explícito.
 */
const falloDeLectura = <T,>(err: any): Cargado<T> => ({
  estado: 'error',
  mensaje: mensajeDeError(err),
})

export const useCargaDeConsulta = (appointmentId: string | undefined) => {
  const { getAppointment } = useDoctorAppointments()
  const { getTriageByAppointment } = useTriage()
  const { getSOAPNoteByAppointment } = useSOAPNotes()
  const { getPatient } = usePatients()
  const { getAppointmentCertificates } = useCertificates()
  const { getAppointmentPrescriptions } = usePrescriptions()

  // La cita se guarda clasificada y no como `Appointment | null`: la página
  // tiene que poder decir cuál de los tres motivos la dejó sin cita.
  const [citaCargada, setCitaCargada] = useState<CitaCargada | null>(null)
  const [triage, setTriage] = useState<Triage | null>(null)
  const [fullPatient, setFullPatient] = useState<Patient | null>(null)
  // Si la ficha no se pudo leer, no se sabe si el paciente tiene alergias: la
  // pantalla lo dice en vez de callar (plan 29, C-1). Callar se veía igual que
  // «sin alergias registradas», y el médico recetaba creyéndolo.
  const [errorPaciente, setErrorPaciente] = useState<string | null>(null)
  const fullPatientRef = useRef<Patient | null>(null)
  fullPatientRef.current = fullPatient
  const [existingSoapNote, setExistingSoapNote] = useState<SOAPNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [finalizing, setFinalizing] = useState(false)
  const [finalized, setFinalized] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [reabriendo, setReabriendo] = useState(false)
  const [errorReabrir, setErrorReabrir] = useState<string | null>(null)
  const [regresandoASala, setRegresandoASala] = useState(false)
  const [errorRegresarASala, setErrorRegresarASala] = useState<string | null>(null)
  const [resultadoCobro, setResultadoCobro] = useState<ResultadoCobro | null>(null)
  // Un `client_request_id` por intento de cobro, que sobrevive al reintento:
  // si la primera petición sí llegó pero la respuesta se perdió en la red,
  // repetirla con el mismo id devuelve el mismo pago en vez de cobrar dos veces.
  // Se descarta sólo cuando el servidor confirmó el cierre o se reabre.
  const idIntentoCobro = useRef<string | null>(null)
  // Ambos endpoints ordenan created_at DESC: el más reciente es el [0].
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  // Un error de lectura por sección: mientras no sepamos qué hay guardado, esa
  // sección se muestra pero no se deja capturar.
  const [errorNota, setErrorNota] = useState<string | null>(null)
  const [errorRecetas, setErrorRecetas] = useState<string | null>(null)
  const [errorCertificados, setErrorCertificados] = useState<string | null>(null)
  const [errorTriage, setErrorTriage] = useState<string | null>(null)
  // La nota vive en el estado del formulario; finalizar tiene que poder guardarla.
  const notaRef = useRef<SOAPNoteFormHandle | null>(null)

  const appointment =
    citaCargada?.estado === 'ok' ? (citaCargada.dato as typeof citaCargada.dato & CamposCobroDeCita) : null
  // Embarazo activo: se muestra sin buscarlo y recuerda el control al cerrar.
  const {
    resumen: resumenEmbarazo,
    error: errorEmbarazo,
    recargar: recargarEmbarazo,
  } = useEmbarazoActivo(appointment?.patient_id)

  const isReadOnly =
    appointment?.status === 'atendida' || appointment?.status === 'cancelada' || finalized

  // Una cita cancelada no se retoma desde aquí: se reagenda. Reabrir sólo tiene
  // sentido sobre la consulta que se cerró por error.
  const puedeReabrirse = isReadOnly && appointment?.status !== 'cancelada'

  /**
   * Avisa al servidor que la consulta se abrió (plan 28, D-3).
   *
   * Es el servidor el que decide si la cita pasa a «en consulta» (solo la
   * doctora de la cita, solo hoy, solo si no estaba cerrada) y la pantalla
   * pinta el estado que él contesta, no el que esperaba. Si la llamada falla,
   * la cita se queda con el estado que tenía: no se anuncia nada que no pasó,
   * y no se interrumpe la consulta por un dato de la agenda.
   */
  const marcarEnConsulta = async (estadoActual: string | undefined) => {
    if (!appointmentId) return
    if (estadoActual !== 'agendada' && estadoActual !== 'confirmada' && estadoActual !== 'en_sala') return
    try {
      const respuesta = await apiClient.post(`/appointments/${appointmentId}/iniciar-consulta`)
      const datos = respuesta?.data as
        | { status?: string; estado_antes_de_consulta?: string | null }
        | undefined
      // El estado previo lo guarda el servidor: con él, el botón de salir dice
      // a dónde vuelve la cita en vez de suponerlo aquí.
      if (datos?.status) {
        aplicarALaCita({ status: datos.status, estado_antes_de_consulta: datos.estado_antes_de_consulta ?? null })
      }
    } catch (err) {
      console.warn('No se pudo marcar la cita en consulta:', err)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      if (!appointmentId) return
      setLoading(true)
      try {
        const cita = await getAppointment(Number(appointmentId)).catch(
          (err: any): CitaCargada => ({ estado: 'error', mensaje: mensajeDeError(err) }),
        )
        setCitaCargada(cita)
        if (cita.estado === 'ok') {
          const found = cita.dato
          void marcarEnConsulta(found.status)
          // Un `.catch()` por promesa: antes, la primera lectura que fallara
          // tumbaba el `Promise.all` entero y la consulta se dibujaba vacía
          // aunque en base estuviera completa.
          const [triageCargado, notaCargada, patientData, certificadosCargados, recetasCargadas] =
            await Promise.all([
              getTriageByAppointment(Number(appointmentId)).catch(falloDeLectura<Triage>),
              getSOAPNoteByAppointment(Number(appointmentId)).catch(falloDeLectura<SOAPNote>),
              found.patient_id
                ? getPatient(found.patient_id).then(
                    (dato): Cargado<Patient> => ({ estado: 'ok', dato }),
                    falloDeLectura<Patient>,
                  )
                : Promise.resolve<Cargado<Patient> | null>(null),
              getAppointmentCertificates(Number(appointmentId)).catch(
                falloDeLectura<MedicalCertificate[]>,
              ),
              getAppointmentPrescriptions(Number(appointmentId)).catch(
                falloDeLectura<Prescription[]>,
              ),
            ])
          setFullPatient(patientData?.estado === 'ok' ? patientData.dato : null)
          setErrorPaciente(patientData?.estado === 'error' ? patientData.mensaje : null)

          // No pintarlos cuando la lectura falló se ve idéntico a una cita sin
          // triage: el médico concluiría que no le tomaron la presión, y ahora
          // además le ofreceríamos capturar encima de unos que sí existen.
          setErrorTriage(triageCargado.estado === 'error' ? triageCargado.mensaje : null)
          setTriage(triageCargado.estado === 'ok' ? triageCargado.dato : null)

          // Sólo `sin-registro` autoriza un formulario en blanco y editable:
          // ése es el caso legítimo de una consulta nueva. Ante un error se
          // deja vacío pero bloqueado, con el motivo a la vista.
          setErrorNota(notaCargada.estado === 'error' ? notaCargada.mensaje : null)
          setExistingSoapNote(notaCargada.estado === 'ok' ? notaCargada.dato : null)

          setErrorCertificados(
            certificadosCargados.estado === 'error' ? certificadosCargados.mensaje : null,
          )
          setCertificates(certificadosCargados.estado === 'ok' ? certificadosCargados.dato : [])

          setErrorRecetas(recetasCargadas.estado === 'error' ? recetasCargadas.mensaje : null)
          setPrescriptions(recetasCargadas.estado === 'ok' ? recetasCargadas.dato : [])
        }
      } catch (err) {
        console.error('Error cargando consulta:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [appointmentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCertificateSaved = useCallback(() => {
    if (!appointmentId) return
    void getAppointmentCertificates(Number(appointmentId))
      .then((resultado) => {
        // Si la relectura falla se conserva la lista que ya estaba y no se
        // bloquea nada: el certificado se acaba de guardar, aquí no hay riesgo
        // de escribir encima de algo desconocido.
        if (resultado.estado === 'ok') setCertificates(resultado.dato)
      })
      .catch(() => undefined)
  }, [appointmentId]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Refresca al paciente que se está mostrando en el encabezado.
   *
   * Existe porque ahora el expediente se puede completar desde la consulta: sin
   * esto, la edad seguiría saliendo en guion y la insignia de alergias seguiría
   * ausente después de haberlas capturado — la pantalla afirmando un estado que
   * ya no es el de la base.
   *
   * Lo normal es pasarle el registro que devolvió el guardado: el PUT contesta
   * con el paciente tal como quedó, así que es el dato más fresco que existe y
   * evita un viaje extra que, si fallara, dejaría datos viejos en pantalla
   * justo después de un guardado exitoso. Sin argumento vuelve a leerla.
   */
  const recargarPaciente = useCallback(
    async (yaGuardada?: Patient) => {
      if (yaGuardada) {
        setFullPatient(yaGuardada)
        setErrorPaciente(null)
        return
      }
      const idPaciente = citaCargada?.estado === 'ok' ? citaCargada.dato.patient_id : null
      if (!idPaciente) return
      try {
        setFullPatient(await getPatient(idPaciente))
        setErrorPaciente(null)
      } catch (err) {
        // Si la relectura falla se conserva lo que ya estaba: no sabemos más que
        // antes, y borrar al paciente del encabezado sería perder información.
        // Si nunca se había podido leer, el aviso de que no se sabe sigue en pie.
        if (!fullPatientRef.current) setErrorPaciente(mensajeDeError(err))
      }
    },
    [citaCargada], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /**
   * Vuelve a leer los signos vitales después de que el médico los capturó.
   *
   * Se relee en lugar de pintar lo que se mandó: lo que se muestra es lo que
   * quedó en la base, con el IMC que calcula el servidor. Si la relectura falla
   * se dice así, no se deja la cita como si siguiera sin triage — eso invitaría
   * a capturarlos otra vez.
   */
  const recargarTriage = useCallback(async () => {
    if (!appointmentId) return
    const resultado = await getTriageByAppointment(Number(appointmentId)).catch(
      falloDeLectura<Triage>,
    )
    setErrorTriage(resultado.estado === 'error' ? resultado.mensaje : null)
    setTriage(resultado.estado === 'ok' ? resultado.dato : null)
  }, [appointmentId]) // eslint-disable-line react-hooks/exhaustive-deps

  /** La receta guardada se incorpora sin volver a pedir la lista completa. */
  const handlePrescriptionSaved = useCallback((prescription: Prescription) => {
    setPrescriptions((actuales) => [
      prescription,
      ...actuales.filter((receta) => receta.id !== prescription.id),
    ])
  }, [])

  const handleSOAPNoteSaved = useCallback((note: SOAPNote) => {
    setExistingSoapNote(note)
  }, [])

  /** Mezcla en la cita lo que devolvió el servidor, sin pisar lo que no mandó. */
  const aplicarALaCita = (cambios: Record<string, unknown>) => {
    setCitaCargada((actual) =>
      actual?.estado === 'ok' ? { ...actual, dato: { ...actual.dato, ...cambios } } : actual,
    )
  }

  /**
   * Cierra la consulta y, en la misma petición, dice quién cobra.
   *
   * Devuelve `true` sólo si de verdad quedó cerrada, para que la página no
   * pueda anunciar un cierre —ni un cobro— que no ocurrió. El bloque `cobro`
   * viaja en el mismo PATCH porque el servidor lo aplica todo o nada: con dos
   * llamadas, una falla a la mitad dejaría una cita cobrada y abierta.
   */
  const handleFinalize = async (
    notaParaSecretaria?: string,
    cobro?: CobroCapturado,
  ): Promise<boolean> => {
    if (!appointmentId) return false
    setFinalizing(true)
    setFinalizeError(null)
    setResultadoCobro(null)
    try {
      // Primero la nota: cerrar una consulta cuya nota no se pudo guardar es
      // perder la nota. Si el guardado falla, no se toca el estado de la cita.
      if (notaRef.current?.tieneCambios()) {
        const nota = await notaRef.current.guardar()
        if (!nota) {
          setFinalizeError(
            'No se pudo guardar la nota de consulta. La consulta NO se finalizó: ' +
              'revisa la nota e inténtalo de nuevo.',
          )
          return false
        }
      }
      let bloque: Record<string, unknown> | undefined
      if (cobro?.modo === 'cobrado') {
        if (!idIntentoCobro.current) idIntentoCobro.current = nuevoIdDeIntento()
        bloque = { ...cobro, client_request_id: idIntentoCobro.current }
      } else if (cobro) {
        bloque = { ...cobro }
      }
      const respuesta = await apiClient.patch(`/appointments/${appointmentId}/status`, {
        status: 'atendida',
        notes: notaParaSecretaria || undefined,
        ...(bloque ? { cobro: bloque } : {}),
      })
      const datos = (respuesta?.data ?? {}) as Partial<CamposCobroDeCita> & { status?: string }
      // Sólo lo que el servidor mandó: si no dijo el estado de cobro, no se inventa.
      aplicarALaCita(camposDeCobro(datos as Record<string, unknown>))
      const estado = datos.estado_cobro ?? null
      setResultadoCobro({
        modo: cobro?.modo ?? null,
        confirmado: cobro ? estado !== null && ESTADOS_ESPERADOS[cobro.modo].includes(estado) : true,
        estado,
        cobros: datos.cobro_resumen ?? [],
      })
      idIntentoCobro.current = null
      setFinalized(true)
      return true
    } catch (err: any) {
      // Fallar en silencio le hacía creer al médico que ya había cerrado.
      console.error('Error al finalizar:', err)
      const error = aErrorDeCobro(
        err,
        'No se pudo finalizar la consulta. La cita sigue abierta y no se registró ningún cobro; ' +
          'inténtalo de nuevo.',
      )
      // 409: alguien más ya la cobró. Lo que dice el servidor pasa a ser la
      // verdad de la pantalla, para que el médico vea quién y cuánto y pueda
      // cerrar sin volver a cobrar.
      if (error.status === 409 && error.cobroExistente) {
        const existente = error.cobroExistente
        aplicarALaCita({
          estado_cobro: 'cobrada',
          total_cobrado: existente.amount,
          cobro_resumen: [
            {
              id: existente.id,
              amount: existente.amount,
              method: existente.method,
              received_by_name: existente.received_by_name,
              doctor_name: existente.doctor_name,
              referencia: existente.referencia,
              paid_at: existente.paid_at,
            },
          ],
        })
        idIntentoCobro.current = null
      }
      setFinalizeError(error.message)
      return false
    } finally {
      setFinalizing(false)
    }
  }

  /**
   * Reabre una consulta que se cerró por error.
   *
   * La cita vuelve a `en_sala`, que es el estado del que se sale finalizando:
   * así la consulta se retoma donde estaba en vez de inventar un camino nuevo.
   *
   * Devuelve `true` sólo si el servidor confirmó la reapertura. Mientras no lo
   * haga, la pantalla tiene que seguir en sólo lectura: decir "ya puedes
   * escribir" sobre una consulta que sigue cerrada haría perder la nota otra
   * vez, ahora al guardarla.
   */
  const reabrirConsulta = async (): Promise<boolean> => {
    if (!appointmentId) return false
    setReabriendo(true)
    setErrorReabrir(null)
    try {
      const respuesta = await apiClient.patch(`/appointments/${appointmentId}/status`, {
        status: 'en_sala',
      })
      // El estado se toma de la respuesta del servidor, no del que pedimos: lo
      // que la pantalla muestre tiene que ser lo que quedó en la base.
      // El estado de cobro también se relee: entre el primer cierre y ahora
      // recepción pudo haber cobrado, y el modal de volver a cerrar tiene que
      // saberlo para no ofrecer "Lo cobré yo" ni decir "pendiente".
      aplicarALaCita({
        status: 'en_sala',
        ...camposDeCobro((respuesta?.data ?? {}) as Record<string, unknown>),
      })
      // `finalized` es lo que deja la pantalla en sólo lectura después de
      // cerrar sin recargar; sin bajarlo, reabrir no se notaría hasta un F5.
      setFinalized(false)
      setFinalizeError(null)
      setResultadoCobro(null)
      // Un cierre nuevo es un intento de cobro nuevo.
      idIntentoCobro.current = null
      // El médico reabre desde dentro de la consulta: sigue atendiendo. El
      // servidor reabre a «en sala» (su regla de siempre, que también usa
      // recepción) y aquí se pide «en consulta» con las mismas reglas que al
      // abrir: si la cita no es de hoy o no es suya, se queda en sala.
      void marcarEnConsulta('en_sala')
      return true
    } catch (err: any) {
      setErrorReabrir(
        err?.response?.data?.detail ||
          'No se pudo reabrir la consulta. Sigue cerrada; inténtalo de nuevo.',
      )
      return false
    } finally {
      setReabriendo(false)
    }
  }

  /**
   * Salir de la consulta sin cerrarla: la cita vuelve al estado del que entró
   * («Regresar a sala» si estaba en sala; si el médico la abrió antes de que
   * el paciente llegara, vuelve a agendada o confirmada). Devuelve `true` solo
   * si el servidor lo confirmó; el estado que se pinta es el que contestó.
   */
  const regresarASala = async (): Promise<boolean> => {
    if (!appointmentId || !appointment) return false
    const { destino } = salidaDeConsulta(appointment)
    setRegresandoASala(true)
    setErrorRegresarASala(null)
    try {
      const respuesta = await apiClient.patch(`/appointments/${appointmentId}/status`, {
        status: destino,
      })
      const datos = (respuesta?.data ?? {}) as { status?: string; estado_antes_de_consulta?: string | null }
      if (datos.status) {
        aplicarALaCita({ status: datos.status, estado_antes_de_consulta: datos.estado_antes_de_consulta ?? null })
      }
      return datos.status === destino
    } catch (err: any) {
      setErrorRegresarASala(
        mensajeDeError(err, 'No se pudo salir de la consulta. La cita sigue en consulta.'),
      )
      return false
    } finally {
      setRegresandoASala(false)
    }
  }

  return {
    citaCargada,
    appointment,
    triage,
    fullPatient,
    errorPaciente,
    existingSoapNote,
    certificates,
    prescriptions,
    resumenEmbarazo,
    errorEmbarazo,
    recargarEmbarazo,
    loading,
    isReadOnly,
    puedeReabrirse,
    errorTriage,
    errorNota,
    errorRecetas,
    errorCertificados,
    notaRef,
    finalizing,
    finalized,
    finalizeError,
    reabriendo,
    errorReabrir,
    regresandoASala,
    errorRegresarASala,
    regresarASala,
    resultadoCobro,
    handleFinalize,
    reabrirConsulta,
    recargarPaciente,
    recargarTriage,
    handleCertificateSaved,
    handlePrescriptionSaved,
    handleSOAPNoteSaved,
  }
}
