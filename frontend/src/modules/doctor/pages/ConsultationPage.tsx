import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CContainer,
  CRow,
  CCol,
  CCard,
  CCardBody,
  CNav,
  CNavLink,
  CSpinner,
  CAlert,
  CButton,
  CBadge,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CFormLabel,
  CFormTextarea,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
  cilNotes,
  cilMedicalCross,
  cilDescription as cilDescriptionIcon,
  cilArrowLeft,
  cilUser,
  cilCalendar,
  cilPhone,
} from '@coreui/icons'

import { useCargaDeConsulta, type ResultadoCobro } from '../hooks/useCargaDeConsulta'
import AppointmentStatusBadge from '../../../shared/components/AppointmentStatusBadge'
import { salidaDeConsulta } from '../../secretaria/utils/salidaDeConsulta'
import { useAuth } from '../../../shared/context/AuthContext'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'

import { SOAPNoteForm } from '../components/SOAPNoteForm'
import PrescriptionForm from '../components/PrescriptionForm'
import AvisoAlergias from '../components/AvisoAlergias'
import CertificateForm from '../components/CertificateForm'
import { TriageForm } from '../../secretaria/components/TriageForm'
import ExpedienteDePaciente, { pedirPestanaDelExpediente } from '../../expediente/ExpedienteDePaciente'
import ClinicalConsentCard from '../components/ClinicalConsentCard'
import ClinicalPlanPanel from '../components/ClinicalPlanPanel'
import ConsultationSection from '../components/ConsultationSection'
import './consultaPestanas.css'
import DatosPacienteEditables from '../components/DatosPacienteEditables'
import { AvisoCompletarFicha } from '../../../shared/components/AvisoCompletarFicha'
import { InsigniaEmbarazo, SugerenciaProximaRevision } from '../components/EmbarazoResumen'

import type { ClinicalPlanSummary } from '../components/ClinicalPlanPanel'
import type { ClinicalConsentSummary } from '../components/ClinicalConsentCard'
import { formatEdad } from '../../../shared/utils/date'
import {
  CobroAlFinalizarSeccion,
  bloqueDeCobro,
  borradorInicial,
  type BorradorCobro,
  type ErrorDeCobroDeCampo,
} from '../../finanzas/components/CobroAlFinalizar'
import { describirCobro, etiquetaMetodo, formatoMoneda } from '../../finanzas/utils/cobro'

/**
 * Aviso de una sección que no se pudo leer.
 *
 * Va pegado al formulario afectado y no en un banner único arriba porque el
 * riesgo es local: lo que hay que impedir es que se escriba encima de un dato
 * que sí existe pero que esta vez no llegó. Las demás secciones siguen siendo
 * utilizables.
 */
const AvisoDeLectura = ({ mensaje }: { mensaje: string }) => (
  <CAlert color="danger" className="py-2 mb-3">
    <strong>No se pudo cargar esta sección.</strong> {mensaje}{' '}
    Se deshabilitó la captura para no escribir encima de información que quizá ya exista.
    Recarga la página para volver a intentarlo.
  </CAlert>
)

/** Lo que quedó del cobro al cerrar, dicho con el estado que confirmó el servidor. */
const FraseDelCobro = ({ resultado }: { resultado: ResultadoCobro }) => {
  const primero = resultado.cobros[0]
  if (!resultado.confirmado) {
    // Cerró, pero el servidor no dijo que el cobro quedara como se pidió.
    // Callarlo haría que recepción cobre otra vez... o que nadie cobre.
    return (
      <strong className="text-danger">
        El sistema no confirmó el cobro: avisa a recepción antes de que el paciente se vaya.
      </strong>
    )
  }
  if (resultado.estado === 'cobrada') {
    if (resultado.modo === 'cobrado') {
      return (
        <>
          Cobro registrado
          {primero &&
            `: ${formatoMoneda(primero.amount)} con ${etiquetaMetodo(String(primero.method)).toLowerCase()}`}
          .
        </>
      )
    }
    return <>{primero ? describirCobro(primero) : 'Ya estaba cobrada.'} No hay que cobrarla otra vez.</>
  }
  if (resultado.estado === 'sin_cargo') return <>Quedó sin cargo.</>
  if (resultado.estado === 'pendiente') return <>Queda pendiente de cobro en recepción.</>
  return null
}

type PestanaConsulta = 'consulta' | 'expediente'

const PESTANAS: { id: PestanaConsulta; nombre: string; descripcion: string; icono: typeof cilNotes }[] = [
  { id: 'consulta', nombre: 'Consulta', descripcion: 'Consulta actual', icono: cilMedicalCross },
  {
    id: 'expediente',
    nombre: 'Expediente',
    descripcion: 'Todo lo del paciente: resumen, consultas, estudios, documentos, imágenes, embarazo y consentimientos',
    icono: cilNotes,
  },
]

const ConsultationPage = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>()
  const navigate = useNavigate()

  // Todo lo que viene del servidor —las cinco lecturas, sus errores y el cierre
  // de la consulta— vive en el hook. Aquí sólo queda lo que depende de dónde
  // hizo clic el médico.
  const {
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
  } = useCargaDeConsulta(appointmentId)

  const [activeTab, setActiveTab] = useState<PestanaConsulta>('consulta')
  // Las pestañas ya abiertas se quedan montadas (sólo se ocultan). Antes,
  // cambiar de pestaña desmontaba la consulta y se perdía lo escrito en la
  // nota y en la receta sin guardar, aunque el recorrido prometía lo
  // contrario (plan 29, lote 6). Las demás se montan hasta la primera visita
  // para no pedir de entrada datos que quizá nadie mire.
  const [visitadas, setVisitadas] = useState<Set<PestanaConsulta>>(() => new Set(['consulta']))
  const cambiarPestana = (pestana: PestanaConsulta) => {
    setActiveTab(pestana)
    setVisitadas((actuales) => (actuales.has(pestana) ? actuales : new Set(actuales).add(pestana)))
  }
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [showTriageModal, setShowTriageModal] = useState(false)
  const { can } = useAuth()
  // Si la asistente no alcanzó a pasarla por triage, el médico toma los signos
  // aquí mismo. Con la lectura fallida no se ofrece: no sabemos si ya existen.
  const puedeCapturarSignos = can('triage.create') && !isReadOnly && !errorTriage
  const [discountNote, setDiscountNote] = useState('')
  const [planSummary, setPlanSummary] = useState<ClinicalPlanSummary | null>(null)
  const [consentSummary, setConsentSummary] = useState<ClinicalConsentSummary | null>(null)

  // El borrador de cobro sobrevive a cerrar el modal: si el cierre falló, el
  // reintento no obliga al médico a capturar otra vez monto y referencia.
  const [borradorCobro, setBorradorCobro] = useState<BorradorCobro | null>(null)
  // El error de cobro conserva su campo: la sección lo pinta junto a él.
  const [errorCobro, setErrorCobro] = useState<ErrorDeCobroDeCampo | null>(null)
  const puedeCobrar = can('payments.create')

  const abrirFinalizar = () => {
    if (!borradorCobro) setBorradorCobro(borradorInicial(appointment?.cobro_sin_cargo_motivo ?? ''))
    setErrorCobro(null)
    setShowFinalizeModal(true)
  }

  // El modal sólo se cierra si la consulta de verdad quedó cerrada: mientras el
  // cierre falle, el error tiene que quedar a la vista donde se pulsó el botón.
  const confirmarFinalizar = async () => {
    setErrorCobro(null)
    // Ya cobrada (reapertura, o un 409 que acaba de avisar): no se manda
    // ningún cobro, sólo se cierra.
    let cobro
    if (appointment?.estado_cobro !== 'cobrada') {
      const traducido = bloqueDeCobro(borradorCobro ?? borradorInicial())
      if ('error' in traducido) {
        // El aviso se pinta junto al campo que lo causó (CobroAlFinalizarSeccion).
        setErrorCobro(traducido)
        return
      }
      cobro = traducido.bloque
    }
    // La nota es para que recepción sepa cuánto cobrar: si ya cobró el médico,
    // no hay nada que cobrar y una nota vieja ("cobrar sólo $500") confundiría.
    const nota = cobro?.modo === 'cobrado' ? undefined : discountNote
    if (await handleFinalize(nota, cobro)) {
      setShowFinalizeModal(false)
      setBorradorCobro(null)
    }
  }

  // Igual que al finalizar: el modal se queda abierto con el error si la
  // reapertura no ocurrió. Cerrarlo daría a entender que la consulta ya está
  // editable cuando en la base sigue cerrada.
  const confirmarReabrir = async () => {
    if (await reabrirConsulta()) setShowReopenModal(false)
  }

  if (loading) {
    return (
      <CContainer className="py-4 text-center">
        <CSpinner color="primary" />
        <div className="mt-3">Cargando consulta...</div>
      </CContainer>
    )
  }

  if (!appointment) {
    // Tres causas distintas que antes se anunciaban con la misma frase. Un 500
    // decía "no se encontró la cita", así que el médico se iba a buscar en la
    // agenda una cita que sí existe en vez de volver a intentar.
    const motivo =
      citaCargada?.estado === 'sin-permiso'
        ? `Esta cita no es tuya. ${citaCargada.mensaje}`
        : citaCargada?.estado === 'error'
          ? `No se pudo cargar la cita. ${citaCargada.mensaje} ` +
            'La cita sigue en la agenda: vuelve a intentarlo en un momento.'
          : 'No se encontró la cita solicitada. Puede que la hayan eliminado o que ' +
            'esté asignada a otro médico.'

    return (
      <CContainer className="py-4">
        <CAlert color="danger">
          {motivo}
          <div className="mt-3">
            {/* Es la única salida de esta pantalla: en gris pálido sobre fondo
                claro apenas se distinguía del texto del error. */}
            <CButton color="danger" className="text-white fw-semibold" onClick={() => navigate('/doctor/dashboard')}>
              Volver al Dashboard
            </CButton>
          </div>
        </CAlert>
      </CContainer>
    )
  }

  const planSummaryBadge =
    // Cuenta estudios, lo mismo que enseña la tarjeta de adentro (plan 26, C-1).
    planSummary && planSummary.currentAppointment > 0 ? (
      <CBadge color="info" shape="rounded-pill">
        {planSummary.currentAppointment}{' '}
        {planSummary.currentAppointment === 1 ? 'estudio' : 'estudios'} en esta consulta
      </CBadge>
    ) : planSummary && (planSummary.total ?? 0) > 0 ? (
      <CBadge color="light" textColor="dark" shape="rounded-pill">
        {planSummary.total} {planSummary.total === 1 ? 'estudio' : 'estudios'} en el expediente
      </CBadge>
    ) : null

  const consentSummaryBadge =
    consentSummary && consentSummary.signed > 0 ? (
      <CBadge color="success" shape="rounded-pill">
        {consentSummary.signed} firmado(s)
      </CBadge>
    ) : consentSummary && consentSummary.total > 0 ? (
      <CBadge color="warning" textColor="dark" shape="rounded-pill">
        {consentSummary.total} pendiente(s) de firma
      </CBadge>
    ) : null

  const certificateSummaryBadge = errorCertificados ? (
    // La sección de certificados arranca plegada: si el aviso viviera sólo
    // adentro, el fallo quedaría escondido justo cuando hace falta verlo.
    <CBadge color="danger" shape="rounded-pill">
      No se pudo cargar
    </CBadge>
  ) : certificates.length > 0 ? (
    <CBadge color="info" shape="rounded-pill">
      {certificates.length} emitido(s)
    </CBadge>
  ) : null

  return (
    <CContainer fluid className="consulta-pagina px-2 px-md-4 py-3">
      {/* ── Encabezado ────────────────────────────────── */}
      {/* En el teléfono se compacta (plan 29, C-5): `_movil.scss`. */}
      <CCard className="consulta-encabezado mb-3 border-0 shadow-sm overflow-hidden">
        <CCardBody className="p-3 p-md-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div>
              <CButton
                color="link"
                className="p-0 text-decoration-none small"
                onClick={() => navigate('/doctor/appointments')}
              >
                <CIcon icon={cilArrowLeft} className="me-1" />
                Volver a consultas
              </CButton>
              <div className="d-flex align-items-center flex-wrap gap-2 mt-2">
                <CIcon icon={cilMedicalCross} className="text-primary" size="lg" />
                <h1 className="h4 mb-0">Consulta médica</h1>
                <CBadge color="light" textColor="dark" shape="rounded-pill">
                  Folio #{appointment.id}
                </CBadge>
              </div>
              <small className="consulta-encabezado-descripcion text-body-secondary d-block mt-1">
                Consulta, expediente y estudios del paciente en un solo flujo.
              </small>
            </div>
            {isReadOnly ? (
              <CBadge color="secondary">Consulta cerrada</CBadge>
            ) : (
              // El estado real de la cita, el que ven recepción y la agenda
              // (plan 28, D-3): «En consulta» lo pone abrir esta pantalla.
              <div className="d-flex flex-column align-items-end gap-2" data-tour="consulta-estado">
                <AppointmentStatusBadge status={appointment.status} />
                {appointment.status === 'en_consulta' && (
                  <>
                    <CButton
                      color="warning"
                      variant="outline"
                      size="sm"
                      onClick={() => void regresarASala()}
                      disabled={regresandoASala}
                      title={salidaDeConsulta(appointment).explicacion}
                    >
                      {regresandoASala ? 'Saliendo…' : salidaDeConsulta(appointment).texto}
                    </CButton>
                    <small className="consulta-encabezado-descripcion text-body-secondary text-end" style={{ maxWidth: 260 }}>
                      {salidaDeConsulta(appointment).explicacion}
                    </small>
                  </>
                )}
              </div>
            )}
          </div>
          {errorRegresarASala && (
            <CAlert color="danger" className="mt-3 mb-0" role="alert">
              {errorRegresarASala}
            </CAlert>
          )}

          <div className="border-top mt-3 pt-3">
            <CNav
              data-tour="consulta-pestanas"
              variant="pills"
              role="tablist"
              aria-label="Secciones de la consulta"
              className="consulta-pestanas flex-nowrap overflow-auto gap-1 p-1 rounded-3 bg-body-tertiary"
              style={{ maxWidth: '100%' }}
            >
              {PESTANAS.map((pestana) => (
                // <li> a mano: CNavItem no pasa `role` y axe marca un tablist
                // con <li> sin role=presentation.
                <li key={pestana.id} className="nav-item" role="presentation">
                  <CNavLink
                    as="button"
                    type="button"
                    role="tab"
                    id={`consulta-tab-${pestana.id}`}
                    aria-selected={activeTab === pestana.id}
                    aria-controls={`consulta-panel-${pestana.id}`}
                    title={pestana.descripcion}
                    active={activeTab === pestana.id}
                    onClick={() => cambiarPestana(pestana.id)}
                    className="consulta-pestana d-flex align-items-center flex-shrink-0 px-3 py-2 fw-medium"
                  >
                    <CIcon icon={pestana.icono} className="consulta-pestana__icono" aria-hidden="true" />
                    {/* En el teléfono el nombre va debajo del icono, en letra
                        chica: cinco iconos sueltos no decían qué era cada uno. */}
                    <span className="consulta-pestana__texto">{pestana.nombre}</span>
                  </CNavLink>
                </li>
              ))}
            </CNav>
          </div>
        </CCardBody>
      </CCard>

      {/* ── Paciente Card ── */}
      {appointment.patient && (
        <CCard className="mb-3 border-0 shadow-sm" data-tour="consulta-paciente">
          <CCardBody className="p-3">
            <CRow className="align-items-center g-3">
              {/* Avatar + Nombre + Datos */}
              <CCol xs={12} sm>
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 52, height: 52 }}
                  >
                    <CIcon icon={cilUser} size="lg" className="text-primary" />
                  </div>
                  <div className="min-width-0" style={{ flex: 1, overflow: 'hidden' }}>
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <h2 className="h4 mb-1 text-truncate fw-bold" style={{ maxWidth: '100%' }}>
                        {appointment.patient.first_name} {appointment.patient.last_name}
                      </h2>
                      <InsigniaEmbarazo resumen={resumenEmbarazo} />
                      {/* Sin esto, un fallo se veía igual que un paciente sin
                          embarazo: sin semanas ni próxima revisión (plan 29, C-2). */}
                      {errorEmbarazo && (
                        <CButton
                          color="danger"
                          variant="outline"
                          size="sm"
                          className="py-0"
                          title={errorEmbarazo}
                          onClick={() => void recargarEmbarazo()}
                        >
                          No se pudo consultar el embarazo · Reintentar
                        </CButton>
                      )}
                    </div>
                    <div className="d-flex flex-wrap align-items-center gap-2 small text-secondary">
                      {/* El guion se pinta a propósito cuando no se sabe la edad,
                          en vez de omitir el dato: así el hueco se ve, y junto a
                          él está el lápiz para llenarlo sin salir de la consulta.
                          Sólo se muestra si el expediente sí se pudo leer; si la
                          lectura falló no sabemos si hay fecha o no. */}
                      {fullPatient && (
                        <span className="d-flex align-items-center gap-1">
                          <CIcon icon={cilCalendar} size="sm" />
                          {formatEdad(fullPatient.date_of_birth)}
                        </span>
                      )}
                      {fullPatient?.gender && <span>· {fullPatient.gender}</span>}
                      {(appointment.patient.phone || fullPatient?.cell_phone) && (
                        <span className="d-flex align-items-center gap-1">
                          <CIcon icon={cilPhone} size="sm" />
                          {appointment.patient.phone || fullPatient?.cell_phone}
                        </span>
                      )}
                      {/* Completar el expediente aquí mismo: salir al perfil de la
                          paciente para capturar un teléfono costaba la nota que se
                          llevaba escrita en esta pestaña. */}
                      <DatosPacienteEditables
                        paciente={fullPatient}
                        onGuardado={recargarPaciente}
                        readOnly={isReadOnly}
                      />
                    </div>
                  </div>
                </div>
              </CCol>

              {/* No pintar nada cuando la lectura falla se ve igual que una cita
                  sin signos vitales, y eso lleva a pensar que al paciente no
                  la pasaron por triage. Se dice en el mismo lugar donde irían
                  los números, y sin ofrecer capturarlos: podrían ya existir. */}
              {errorTriage && (
                <CCol xs="auto" className="ms-auto">
                  <div className="text-end">
                    <CBadge color="danger" shape="rounded-pill">
                      No se pudieron cargar los signos vitales
                    </CBadge>
                    <div className="small text-secondary mt-1">{errorTriage}</div>
                  </div>
                </CCol>
              )}

              {/* Signos vitales (compactos a la derecha) */}
              {!errorTriage && triage && (
                <CCol xs="auto" className="ms-auto" data-tour="consulta-signos">
                  <div className="d-flex flex-wrap gap-1 justify-content-end">
                    <span className="badge bg-light text-dark border small py-1 px-2">
                      ❤ {triage.blood_pressure_systolic}/{triage.blood_pressure_diastolic}
                    </span>
                    <span className="badge bg-light text-dark border small py-1 px-2">
                      🌡 {triage.temperature_celsius}°C
                    </span>
                    <span className="badge bg-light text-dark border small py-1 px-2">
                      ⚖ {triage.weight_kg} kg
                    </span>
                    {triage.bmi && (
                      <span className="badge bg-light text-dark border small py-1 px-2">
                        IMC {triage.bmi}
                      </span>
                    )}
                  </div>
                  {triage.chief_complaint && (
                    <div className="text-end mt-1 small text-secondary fst-italic">
                      "{triage.chief_complaint}"
                    </div>
                  )}
                  {puedeCapturarSignos && (
                    <div className="text-end mt-1">
                      <CButton
                        data-tour="consulta-signos-boton"
                        color="link"
                        size="sm"
                        className="p-0"
                        onClick={() => setShowTriageModal(true)}
                      >
                        Corregir signos vitales
                      </CButton>
                    </div>
                  )}
                </CCol>
              )}

              {/* Sin triage: el hueco se nombra y junto a él está cómo llenarlo,
                  para que la consulta no se cierre sin presión ni peso. */}
              {!errorTriage && !triage && puedeCapturarSignos && (
                <CCol xs="auto" className="ms-auto" data-tour="consulta-signos">
                  <div className="text-end">
                    <div className="small text-secondary mb-1">Sin signos vitales</div>
                    <CButton
                      data-tour="consulta-signos-boton"
                      color="primary"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTriageModal(true)}
                    >
                      Registrar signos vitales
                    </CButton>
                  </div>
                </CCol>
              )}
            </CRow>

            {/* Alergias: si existen, o el aviso de que no se pudieron leer. */}
            {(fullPatient?.allergies || errorPaciente) && (
              <div className="mt-2 pt-2 border-top">
                <AvisoAlergias paciente={fullPatient} error={errorPaciente} onReintentar={() => recargarPaciente()} />
              </div>
            )}
          </CCardBody>
        </CCard>
      )}

      {/* Fichas incompletas, sutil (plan 32, punto 5): una línea gris que se
          descarta, nunca un modal. Sólo con el expediente leído: si la lectura
          falló no sabemos si falta algo. */}
      {fullPatient && !isReadOnly && (
        <AvisoCompletarFicha
          paciente={fullPatient}
          pista="se llena con el lápiz junto a su edad"
          className="mb-3"
        />
      )}

      {/* ── VISTA CONSULTA: flujo vertical paso a paso ── */}
      {visitadas.has('consulta') && (
        <div
          role="tabpanel"
          id="consulta-panel-consulta"
          aria-labelledby="consulta-tab-consulta"
          hidden={activeTab !== 'consulta'}
        >
          <div className="d-flex flex-column gap-3">
            {isReadOnly && (
              <CAlert
                color="info"
                className="d-flex align-items-center flex-wrap gap-2 mb-0"
                data-tour="consulta-reabrir"
              >
                <span>📋 Esta consulta ya fue finalizada — vista de solo lectura</span>
                {/* Antes de esto, un clic de más en Finalizar dejaba el
                    expediente congelado: la salida era pedirle a soporte que
                    moviera el estado en la base. */}
                {puedeReabrirse && (
                  <CButton
                    color="info"
                    variant="outline"
                    size="sm"
                    className="ms-auto"
                    onClick={() => setShowReopenModal(true)}
                  >
                    Reabrir consulta
                  </CButton>
                )}
              </CAlert>
            )}

            {/* El error de reabrir se ve aquí cuando el modal ya se cerró — y
                junto al aviso de sólo lectura, que es lo que sigue siendo cierto. */}
            {errorReabrir && !showReopenModal && (
              <CAlert color="danger" className="mb-0">
                {errorReabrir}
              </CAlert>
            )}
            <CCard className="shadow-sm" data-tour="consulta-nota">
              <CCardBody className="p-3">
                <div className="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                  <span className="badge bg-primary rounded-pill me-1">1</span>
                  <CIcon icon={cilNotes} className="text-primary" width={20} />
                  <h5 className="mb-0 fw-bold">Notas de Consulta</h5>
                  {existingSoapNote && (
                    <CBadge color="success" shape="rounded-pill" className="ms-auto">
                      ✓ Guardada
                    </CBadge>
                  )}
                </div>
                {errorNota && <AvisoDeLectura mensaje={errorNota} />}
                <SOAPNoteForm
                  ref={notaRef}
                  appointmentId={appointment.id}
                  existingNote={existingSoapNote}
                  onSaved={handleSOAPNoteSaved}
                  compact
                  readOnly={isReadOnly || errorNota !== null}
                />
              </CCardBody>
            </CCard>

            <CCard className="shadow-sm" data-tour="consulta-receta">
              <CCardBody className="p-3">
                <div className="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                  <span className="badge bg-success rounded-pill me-1">2</span>
                  <span className="fs-5">💊</span>
                  <h5 className="mb-0 fw-bold">Receta Médica</h5>
                </div>
                {/* Las alergias se repiten aquí: en el teléfono el aviso del
                    encabezado quedaba ~1 500 px más arriba, justo cuando se
                    elige el medicamento (plan 29, C-3). */}
                {!isReadOnly && (
                  <div data-tour="receta-alergias">
                    <AvisoAlergias
                      paciente={fullPatient}
                      error={errorPaciente}
                      onReintentar={() => recargarPaciente()}
                      decirSiNoHayRegistro
                      className="mb-3"
                    />
                  </div>
                )}
                {/* Aquí el formulario se retira en vez de sólo bloquearse: en modo
                    lectura y sin recetas afirma "no se emitió receta en esta
                    consulta", y eso es justo lo que no sabemos. */}
                {errorRecetas ? (
                  <AvisoDeLectura mensaje={errorRecetas} />
                ) : (
                  <PrescriptionForm
                    appointmentId={appointment.id}
                    patientId={appointment.patient_id}
                    triage={triage}
                    prescriptions={prescriptions}
                    onSaved={handlePrescriptionSaved}
                    readOnly={isReadOnly}
                  />
                )}
              </CCardBody>
            </CCard>

            <ConsultationSection
              step={3}
              stepColor="info"
              icon={<CIcon icon={cilMedicalCross} className="text-info" width={20} />}
              title="Plan clínico"
              subtitle="Órdenes de estudios, vacunas y seguimiento de medicamentos."
              summary={planSummaryBadge}
            >
              <ClinicalPlanPanel
                patientId={appointment.patient_id}
                appointmentId={appointment.id}
                patientName={
                  appointment.patient
                    ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                    : undefined
                }
                readOnly={isReadOnly}
                onSummaryChange={setPlanSummary}
                onVerHistorial={() => {
                  pedirPestanaDelExpediente(appointment.patient_id, 'estudios')
                  cambiarPestana('expediente')
                }}
              />
            </ConsultationSection>

            <ConsultationSection
              step={4}
              stepColor="primary"
              icon={<CIcon icon={cilDescriptionIcon} className="text-primary" width={20} />}
              title="Consentimiento informado"
              subtitle="Se prepara en consulta, el paciente revisa y firma aquí."
              summary={consentSummaryBadge}
            >
              <ClinicalConsentCard
                patientId={appointment.patient_id}
                appointmentId={appointment.id}
                patientName={fullPatient ? `${fullPatient.first_name} ${fullPatient.last_name}` : ''}
                defaultProcedure={appointment.cirugia_type}
                readOnly={isReadOnly}
                onSummaryChange={setConsentSummary}
              />
            </ConsultationSection>

            <ConsultationSection
              step={5}
              stepColor="secondary"
              icon={<span className="fs-5">📋</span>}
              title="Certificado médico"
              subtitle="Incapacidad, aptitud u otros certificados de esta consulta."
              summary={certificateSummaryBadge}
            >
              {errorCertificados && <AvisoDeLectura mensaje={errorCertificados} />}
              <CertificateForm
                appointmentId={appointment.id}
                patientId={appointment.patient_id}
                existingCertificate={certificates[0] ?? null}
                readOnly={isReadOnly || errorCertificados !== null}
                onSaved={handleCertificateSaved}
              />
            </ConsultationSection>

            {/* El error de finalizar se ve aquí cuando el modal ya se cerró. */}
            {finalizeError && !showFinalizeModal && (
              <CAlert color="danger" className="mb-0">
                {finalizeError}
              </CAlert>
            )}

            {/* La sugerencia de próxima revisión va fuera de la barra de finalizar
                para que ésta quede compacta y pueda fijarse abajo sin tapar nada. */}
            {!isReadOnly && resumenEmbarazo && (
              <div className="mb-3">
                <SugerenciaProximaRevision resumen={resumenEmbarazo} />
              </div>
            )}

            {/* ── Finalizar Consulta ──
                U-07: se fija al pie de la pestaña Consulta para que el botón esté
                siempre a la vista, sin tener que bajar hasta el final. */}
            {!isReadOnly && (
              // En el teléfono es solo el botón, y se esconde mientras se escribe:
              // con el teclado abierto tapaba casi todo el campo (plan 29, C-4).
              <CCard
                className="consulta-barra-finalizar shadow border-start border-4 border-success position-sticky"
                style={{ bottom: '1rem', zIndex: 1020 }}
                data-tour="consulta-finalizar"
              >
                <CCardBody className="p-3">
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div className="consulta-barra-finalizar-texto">
                      <h5 className="mb-1">¿Finalizar consulta?</h5>
                      <p className="text-muted small mb-0">
                        La cita se marcará como atendida y dirás quién cobra la consulta.
                      </p>
                    </div>
                    <CButton color="success" size="lg" onClick={abrirFinalizar}>
                      ✓ Finalizar Consulta
                    </CButton>
                  </div>
                </CCardBody>
              </CCard>
            )}

            {finalized && (
              <CAlert color="success" className="d-flex align-items-center flex-wrap gap-2">
                <span>
                  ✅ Consulta finalizada.{' '}
                  {/* Cada frase de cobro sale del estado que contestó el servidor,
                      no de lo que se eligió: si recepción cobró mientras tanto,
                      "pendiente de cobro" haría que se cobrara otra vez. */}
                  {resultadoCobro && <FraseDelCobro resultado={resultadoCobro} />}
                </span>
                <CButton
                  color="success"
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  onClick={() => navigate('/doctor/appointments')}
                >
                  Volver a Consultas
                </CButton>
              </CAlert>
            )}
          </div>
        </div>
      )}

      {/* ── EXPEDIENTE ──────────────────────────────── */}
      {/* La consulta reutiliza el expediente único (plan 32, punto 6) en vez de
          repetir sus propias pestañas «Expediente», «Estudios», «Imágenes» e
          «Historial»: lo que el médico ve aquí es lo mismo que en la página
          del expediente, con sus mismas pestañas y permisos. */}
      {visitadas.has('expediente') && (
        <div
          role="tabpanel"
          id="consulta-panel-expediente"
          aria-labelledby="consulta-tab-expediente"
          hidden={activeTab !== 'expediente'}
        >
          <div className="mt-3">
            <ExpedienteDePaciente patientId={appointment.patient_id} appointmentId={appointment.id} enConsulta />
          </div>
        </div>
      )}

      {/* ── Modal Finalizar Consulta ── */}
      <CModal visible={showFinalizeModal} onClose={() => setShowFinalizeModal(false)}>
        <CModalHeader>
          <CModalTitle>Finalizar Consulta</CModalTitle>
          {/* Con el modal abierto el "?" del encabezado queda tapado. */}
          <BotonAyudaContextual recorridoId="consulta-cobro" />
        </CModalHeader>
        <CModalBody>
          {finalizeError && (
            <CAlert color="danger" className="py-2">
              {finalizeError}
            </CAlert>
          )}
          <p>
            Estás por finalizar la consulta de{' '}
            <strong>
              {appointment.patient?.first_name} {appointment.patient?.last_name}
            </strong>
            .
          </p>
          <p className="text-muted small">
            La cita se marcará como <CBadge color="secondary">atendida</CBadge>.
          </p>
          {(errorNota || errorRecetas || errorCertificados) && (
            // No se bloquea el cierre —dejarla abierta a la fuerza tampoco
            // ayuda—, pero sí se dice que se va a cerrar sin haber podido leer
            // parte del expediente.
            <CAlert color="warning" className="py-2 small">
              Parte de esta consulta no se pudo cargar, así que no se sabe qué quedó registrado.
              Conviene recargar la página antes de finalizar.
            </CAlert>
          )}
          {resumenEmbarazo && (
            <div className="mb-3">
              <CAlert color="info" className="small mb-2">
                <strong>Paciente embarazada.</strong> Edad gestacional hoy:{' '}
                {resumenEmbarazo.edad.etiqueta} ({resumenEmbarazo.edad.etiquetaCorta}).
              </CAlert>
              <SugerenciaProximaRevision resumen={resumenEmbarazo} compacta />
            </div>
          )}
          <CobroAlFinalizarSeccion
            cita={appointment}
            borrador={borradorCobro ?? borradorInicial()}
            onChange={(b) => {
              setBorradorCobro(b)
              setErrorCobro(null)
            }}
            errorEnvio={errorCobro}
            puedeCobrar={puedeCobrar}
            disabled={finalizing}
          />
          {(borradorCobro?.modo ?? 'recepcion') !== 'cobrado' || appointment.estado_cobro === 'cobrada' ? (
            <>
              <CFormLabel className="mt-3" htmlFor="nota-secretaria">
                💬 Nota para secretaría (descuento, precio especial)
              </CFormLabel>
              <CFormTextarea
                id="nota-secretaria"
                rows={3}
                value={discountNote}
                onChange={(e: any) => setDiscountNote(e.target.value)}
                placeholder="Ej. Aplicar 20% descuento, cobrar solo $500..."
                disabled={finalizing}
              />
            </>
          ) : null}
        </CModalBody>
        <CModalFooter>
          <CButton
            color="secondary"
            onClick={() => setShowFinalizeModal(false)}
            disabled={finalizing}
          >
            Cancelar
          </CButton>
          <CButton color="success" onClick={confirmarFinalizar} disabled={finalizing}>
            {finalizing ? 'Finalizando...' : 'Confirmar y Finalizar'}
          </CButton>
        </CModalFooter>
      </CModal>

      {/* ── Modal Reabrir Consulta ──
          Reabrir no es un clic más: devuelve la cita al flujo de atención y
          queda registrado. Por eso se confirma explicando qué implica, en vez
          de hacerlo de golpe desde el aviso de sólo lectura. */}
      <CModal visible={showReopenModal} onClose={() => setShowReopenModal(false)}>
        <CModalHeader>
          <CModalTitle>Reabrir consulta</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {errorReabrir && (
            <CAlert color="danger" className="py-2">
              {errorReabrir}
            </CAlert>
          )}
          <p>
            Vas a reabrir la consulta de{' '}
            <strong>
              {appointment.patient?.first_name} {appointment.patient?.last_name}
            </strong>
            .
          </p>
          <ul className="text-muted small mb-3">
            <li>
              La cita vuelve a quedar abierta (<CBadge color="dark">en consulta</CBadge> si es de hoy;
              si no, <CBadge color="warning">en sala</CBadge>) y podrás corregir la nota o emitir la
              receta que faltó.
            </li>
            <li>
              Secretaría verá la consulta otra vez abierta, y volverá a recibir el aviso de cobro
              cuando la finalices de nuevo.
            </li>
            <li>Queda registrado quién la reabrió y cuándo.</li>
          </ul>
        </CModalBody>
        <CModalFooter>
          <CButton
            color="secondary"
            onClick={() => setShowReopenModal(false)}
            disabled={reabriendo}
          >
            Cancelar
          </CButton>
          <CButton color="warning" onClick={confirmarReabrir} disabled={reabriendo}>
            {reabriendo ? 'Reabriendo...' : 'Confirmar y Reabrir'}
          </CButton>
        </CModalFooter>
      </CModal>

      {/* El mismo formulario que usa recepción desde la agenda: una sola forma
          de capturar signos, sin importar quién los tome. */}
      {appointment && (
        <TriageForm
          visible={showTriageModal}
          onClose={() => setShowTriageModal(false)}
          onSaved={() => void recargarTriage()}
          appointmentId={appointment.id}
          existingTriage={triage}
        />
      )}
    </CContainer>
  )
}

export default ConsultationPage
