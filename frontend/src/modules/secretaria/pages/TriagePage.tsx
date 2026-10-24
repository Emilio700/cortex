
import React, { useState, useEffect, useCallback } from 'react'
import {
    CCard,
    CCardBody,
    CCol,
    CContainer,
    CRow,
    CTableBody,
    CTableHead,
    CTableHeaderCell,
    CTableRow,
    CTableDataCell,
    CButton,
    CBadge,
    CAlert,
} from '@coreui/react-pro'
import { cilMedicalCross, cilClipboard } from '@coreui/icons'
import CIcon from '@coreui/icons-react'
import { useAppointments } from '../hooks/useAppointments'
import { useTriage } from '../hooks/useTriage'
import { TriageForm } from '../components/TriageForm'
import { TableSkeleton } from '../../../shared/components/TableSkeleton'
import { formatDateCita } from '../../../shared/utils/date'
import type { Appointment } from '../types'
import TablaResponsiva from '../../../shared/components/TablaResponsiva'
import { ESTADO_LABELS } from '../utils/tablero'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

/**
 * Inicio y fin del día local en ISO. Sin este rango el API devolvía las citas
 * más recientes de cualquier fecha y la paciente de hoy podía quedar fuera.
 */
const rangoDeHoy = () => {
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    const fin = new Date(inicio)
    fin.setHours(23, 59, 59, 999)
    return { inicio: inicio.toISOString(), fin: fin.toISOString() }
}

const TriagePage: React.FC = () => {
    const { loading, error, fetchAppointments } = useAppointments()
    const { getTriageByAppointment } = useTriage()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [triageModalVisible, setTriageModalVisible] = useState(false)
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [existingTriage, setExistingTriage] = useState<any>(null)
    const [leyendoId, setLeyendoId] = useState<number | null>(null)
    const [falloLectura, setFalloLectura] = useState<{
        cita: Appointment
        sinAcceso: boolean
        mensaje: string
    } | null>(null)

    // El rango se calcula en cada carga, no al montar: si la pantalla queda
    // abierta después de medianoche, el siguiente refresco ya trae el día nuevo.
    const loadAppointments = useCallback(async () => {
        try {
            const { inicio, fin } = rangoDeHoy()
            const data = await fetchAppointments({
                start_date: inicio,
                end_date: fin,
                limit: 500,
            })
            setAppointments(data)
        } catch (err) {
            console.error(err)
        }
    }, [fetchAppointments])

    useEffect(() => {
        loadAppointments()
    }, [loadAppointments])

    // Recepción deja esta pantalla abierta toda la mañana mientras agenda en
    // otra pestaña; sin esto, la paciente que se confirmó allá no aparece
    // aquí hasta recargar a mano.
    useEffect(() => {
        const alVolver = () => {
            loadAppointments()
        }
        window.addEventListener('focus', alVolver)
        return () => window.removeEventListener('focus', alVolver)
    }, [loadAppointments])

    // El API sólo filtra por un estado a la vez; confirmada y en_sala se
    // separan aquí. La que ya está en consulta no: está con la doctora, que
    // toma los signos ahí mismo si faltan (plan 28, D-3). El orden por hora se asegura aquí también para no depender
    // de que el servidor lo mantenga.
    const triageAppointments = appointments
        .filter((app) => app.status === 'confirmada' || app.status === 'en_sala')
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

    // El formulario se abre sólo cuando la lectura contestó: con 204 (sin signos)
    // vacío, con 200 lleno. Antes cualquier error lo abría vacío y con un 403 o un
    // 500 recepción capturaba signos encima de unos que quizá ya existían.
    const handleTriageClick = async (appointment: Appointment) => {
        setFalloLectura(null)
        setLeyendoId(appointment.id)
        try {
            const triage = await getTriageByAppointment(appointment.id)
            setExistingTriage(triage)
            setSelectedAppointment(appointment)
            setTriageModalVisible(true)
        } catch (err) {
            const sinAcceso = (err as { status?: number })?.status === 403
            setFalloLectura({
                cita: appointment,
                sinAcceso,
                mensaje: sinAcceso
                    ? 'No tienes acceso a los signos vitales de esta paciente.'
                    : 'No se pudieron cargar los signos vitales. No sabemos si ya se registraron, así que no se abrió la captura.',
            })
        } finally {
            setLeyendoId(null)
        }
    }

    const handleTriageSaved = () => {
        loadAppointments()
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'agendada': return 'info'
            case 'confirmada': return 'primary'
            case 'en_sala': return 'warning'
            case 'en_consulta': return 'dark'
            case 'atendida': return 'success'
            case 'cancelada': return 'danger'
            default: return 'secondary'
        }
    }

    return (
        <CContainer fluid>
            <EncabezadoPantalla
                titulo="Triage"
                descripcion="Citas pendientes de signos vitales"
                icono={cilClipboard}
            />
            <CRow>
                <CCol xs={12}>
                    <CCard className="mb-4 glass-card">
                        <CCardBody>
                            {falloLectura && (
                                <CAlert
                                    color={falloLectura.sinAcceso ? 'warning' : 'danger'}
                                    className="d-flex justify-content-between align-items-center"
                                    dismissible
                                    onClose={() => setFalloLectura(null)}
                                >
                                    <span>
                                        {falloLectura.cita.patient?.first_name} {falloLectura.cita.patient?.last_name}:{' '}
                                        {falloLectura.mensaje}
                                    </span>
                                    {!falloLectura.sinAcceso && (
                                        <CButton
                                            color="danger"
                                            variant="outline"
                                            size="sm"
                                            className="ms-3"
                                            onClick={() => handleTriageClick(falloLectura.cita)}
                                        >
                                            Reintentar
                                        </CButton>
                                    )}
                                </CAlert>
                            )}
                            {/* Con datos ya en pantalla, el refresco al volver a la ventana
                                no la cambia por el esqueleto: sería un parpadeo cada vez. */}
                            {loading && appointments.length === 0 ? (
                                <TableSkeleton rows={4} columns={5} />
                            ) : error ? (
                                <CAlert color="danger">{error}</CAlert>
                            ) : (
                                <TablaResponsiva hover responsive data-tour="triage-lista">
                                    <CTableHead>
                                        <CTableRow>
                                            {/* En el teléfono la paciente va de título y la hora como dato. */}
                                            <CTableHeaderCell data-tarjeta="dato">Hora</CTableHeaderCell>
                                            <CTableHeaderCell data-tarjeta="titulo">Paciente</CTableHeaderCell>
                                            <CTableHeaderCell>Doctora</CTableHeaderCell>
                                            <CTableHeaderCell>Estado</CTableHeaderCell>
                                            <CTableHeaderCell>Acciones</CTableHeaderCell>
                                        </CTableRow>
                                    </CTableHead>
                                    <CTableBody>
                                        {triageAppointments.length === 0 ? (
                                            <CTableRow>
                                                <CTableDataCell colSpan={5} className="text-center">
                                                    No hay citas pendientes de triage para hoy.
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : (
                                            triageAppointments.map((app) => (
                                                <CTableRow key={app.id}>
                                                    <CTableDataCell>{formatDateCita(app.scheduled_at, 'HH:mm')}</CTableDataCell>
                                                    <CTableDataCell>
                                                        {app.patient?.first_name} {app.patient?.last_name}
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        {app.doctor?.full_name}
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        {/* El estado en palabras, no el valor interno («en_sala»). */}
                                                        <CBadge color={getStatusBadge(app.status)}>
                                                            {ESTADO_LABELS[app.status] ?? app.status}
                                                        </CBadge>
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        <CButton
                                                            color="success"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleTriageClick(app)}
                                                            disabled={leyendoId === app.id}
                                                            data-tour="triage-signos"
                                                            title="Realizar Triage"
                                                        >
                                                            <CIcon icon={cilMedicalCross} className="me-2" />
                                                            Signos Vitales
                                                        </CButton>
                                                    </CTableDataCell>
                                                </CTableRow>
                                            ))
                                        )}
                                    </CTableBody>
                                </TablaResponsiva>
                            )}
                        </CCardBody>
                    </CCard>
                </CCol>
            </CRow>

            {selectedAppointment && (
                <TriageForm
                    visible={triageModalVisible}
                    onClose={() => {
                        setTriageModalVisible(false)
                        setSelectedAppointment(null)
                    }}
                    onSaved={handleTriageSaved}
                    appointmentId={selectedAppointment.id}
                    existingTriage={existingTriage}
                />
            )}
        </CContainer>
    )
}

export default TriagePage
