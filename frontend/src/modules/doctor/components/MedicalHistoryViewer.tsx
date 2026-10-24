import React, { useEffect, useState } from 'react'
import {
    CCard,
    CCardBody,
    CSpinner,
    CAlert,
    CAccordion,
    CAccordionItem,
    CAccordionHeader,
    CAccordionBody,
    CBadge,
    CButton,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilNotes, cilMedicalCross, cilFile, cilCloudDownload, cilPrint, cilEnvelopeClosed } from '@coreui/icons'
import { useSOAPNotes } from '../hooks/useSOAPNotes'
import { usePrescriptions } from '../hooks/usePrescriptions'
import { useCertificates } from '../hooks/useCertificates'
import type { SOAPNote, Prescription, MedicalCertificate } from '../types'
import { diaDelConsultorio, formatDate } from '../../../shared/utils/date'
import { apiClient } from '../../../shared/services/api'
import { Role, type User } from '../../../shared/types'
import { useToast } from '../../../shared/components/ToastProvider'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'

interface MedicalHistoryViewerProps {
    patientId: number
}

const MedicalHistoryViewer: React.FC<MedicalHistoryViewerProps> = ({ patientId }) => {
    const { getPatientSOAPNotes, loading: loadingNotes } = useSOAPNotes()
    const { getPatientPrescriptions, downloadPrescriptionPDF, printPrescription, sendPrescriptionEmail, loading: loadingRx } = usePrescriptions()
    const { getPatientCertificates, downloadCertificatePDF, sendCertificateEmail, loading: loadingCerts } = useCertificates()
    const { showSuccess, showError } = useToast()

    const [notes, setNotes] = useState<SOAPNote[]>([])
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
    const [certificates, setCertificates] = useState<MedicalCertificate[]>([])
    const [hasMorePrescriptions, setHasMorePrescriptions] = useState(false)
    const [hasMoreCertificates, setHasMoreCertificates] = useState(false)
    const [doctorNamesById, setDoctorNamesById] = useState<Record<number, string>>({})
    // Qué partes del historial no se pudieron leer. Antes cada fallo volvía
    // una lista vacía y la pantalla decía «No hay registros médicos previos»
    // de un paciente que sí los tiene (plan 29, T-1).
    const [fallos, setFallos] = useState<string[]>([])
    const [errorNombres, setErrorNombres] = useState(false)
    const [errorMas, setErrorMas] = useState<string | null>(null)
    const activeKey = 1

    useEffect(() => {
        if (patientId) {
            loadHistory()
            loadDoctorNames()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patientId])

    const loadHistory = async () => {
        const [notas, recetas, certificados] = await Promise.allSettled([
            getPatientSOAPNotes(patientId),
            getPatientPrescriptions(patientId),
            getPatientCertificates(patientId),
        ])
        const nuevosFallos: string[] = []
        if (notas.status === 'fulfilled') setNotes(notas.value)
        else nuevosFallos.push('las notas')
        if (recetas.status === 'fulfilled') {
            setPrescriptions(recetas.value)
            setHasMorePrescriptions(recetas.value.length === 20)
        } else nuevosFallos.push('las recetas')
        if (certificados.status === 'fulfilled') {
            setCertificates(certificados.value)
            setHasMoreCertificates(certificados.value.length === 20)
        } else nuevosFallos.push('los certificados')
        setFallos(nuevosFallos)
    }

    const loadDoctorNames = async () => {
        try {
            const response = await apiClient.get<User[]>('/users/directory', { params: { role: Role.DOCTOR } })
            const map: Record<number, string> = {}
            response.data.forEach((doctor) => {
                map[doctor.id] = nombreConTratamiento(doctor)
            })
            setDoctorNamesById(map)
            setErrorNombres(false)
        } catch (err) {
            console.error('Error loading doctor names:', err)
            setErrorNombres(true)
        }
    }

    const doctorLabel = (doctorId: number) =>
        doctorNamesById[doctorId] ?? (errorNombres ? `Médico n.º ${doctorId} (no se pudo leer su nombre)` : `#${doctorId}`)

    const handleDownloadPrescription = async (id: number, createdAt: string) => {
        // El día del consultorio, no el de UTC: una receta de las 18:00 se
        // nombraba con la fecha de mañana (D-12).
        const date = diaDelConsultorio(createdAt)
        await downloadPrescriptionPDF(id, `Receta_${id}_${date}.pdf`)
    }

    const handlePrintPrescription = async (id: number) => {
        await printPrescription(id)
    }

    const handleSendPrescriptionEmail = async (id: number) => {
        const result = await sendPrescriptionEmail(id)
        if (result) {
            showSuccess(`Receta enviada a ${result.to_email}`)
        } else {
            showError('No se pudo enviar la receta. Verifica que el paciente tenga correo registrado.')
        }
    }

    const handleDownloadCertificate = async (id: number, createdAt: string) => {
        // El día del consultorio, no el de UTC: una receta de las 18:00 se
        // nombraba con la fecha de mañana (D-12).
        const date = diaDelConsultorio(createdAt)
        await downloadCertificatePDF(id, `Certificado_${id}_${date}.pdf`)
    }

    const handleSendCertificateEmail = async (id: number) => {
        const result = await sendCertificateEmail(id)
        if (result) {
            showSuccess(`Certificado enviado a ${result.to_email}`)
        } else {
            showError('No se pudo enviar el certificado. Verifica que el paciente tenga correo registrado.')
        }
    }

    const isLoading = loadingNotes || loadingRx || loadingCerts

    if (isLoading) {
        return (
            <div className="text-center p-5">
                <CSpinner color="primary" />
                <div className="mt-2 text-secondary">Cargando historial médico...</div>
            </div>
        )
    }

    return (
        <div className="medical-history">
            {/* Encabezado de lo que este panel lista. Antes decía «Historial
                del Paciente», el mismo nombre que la cronología de citas de
                arriba, y parecían dos historiales que se contradecían
                (plan 29). */}
            <h5 className="mb-3">Notas, recetas y certificados</h5>

            {fallos.length > 0 && (
                <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2" role="alert">
                    <span className="flex-grow-1">
                        No se pudieron cargar {fallos.join(', ').replace(/, ([^,]*)$/, ' ni $1')} del paciente. Lo que no
                        aparece abajo puede existir.
                    </span>
                    <CButton color="danger" variant="outline" size="sm" onClick={() => void loadHistory()}>
                        Reintentar
                    </CButton>
                </CAlert>
            )}
            {errorMas && (
                <CAlert color="warning" className="py-2">
                    {errorMas}
                </CAlert>
            )}

            {/* El vacío se dice únicamente de las tres fuentes que este panel
                leyó. Antes decía «No hay registros médicos previos» y
                contradecía la cronología de citas que se ve arriba, en la
                misma pestaña Historial: un paciente con citas aparecía como
                sin registros (plan 29). */}
            {fallos.length === 0 && notes.length === 0 && prescriptions.length === 0 && certificates.length === 0 && (
                <CAlert color="info">Este paciente no tiene notas, recetas ni certificados registrados.</CAlert>
            )}

            <CAccordion activeItemKey={activeKey}>
                <CAccordionItem itemKey={1}>
                    <CAccordionHeader>
                        <CIcon icon={cilNotes} className="me-2 text-primary" />
                        Notas de Evolución (SOAP)
                        <CBadge color="primary" shape="rounded-pill" className="ms-auto">{notes.length}</CBadge>
                    </CAccordionHeader>
                    <CAccordionBody>
                        {notes.length > 0 ? (
                            <div className="d-flex flex-column gap-3">
                                {notes.map((note) => (
                                    <CCard key={note.id} className="border-start-primary border-start-4">
                                        <CCardBody className="p-3">
                                            <div className="d-flex justify-content-between mb-2">
                                                <small className="text-secondary">{formatDate(note.created_at)}</small>
                                                <div className="fw-bold text-primary small">{doctorLabel(note.doctor_id)}</div>
                                            </div>
                                            {/* El diagnóstico se documenta en la
                                                sección de valoración desde que se
                                                quitó CIE-10; la insignia "Dx"
                                                colgaba de un campo que el backend
                                                ya no devuelve. */}
                                            {note.assessment?.trim() && (
                                                <div className="mb-2">
                                                    <span className="badge bg-info bg-opacity-10 text-info border border-info">
                                                        Dx: {note.assessment.substring(0, 60)}
                                                    </span>
                                                </div>
                                            )}
                                            <p className="mb-0 text-truncate" style={{ maxWidth: '100%' }}>
                                                <span className="fw-bold">S:</span> {note.subjective.substring(0, 50)}...
                                            </p>
                                        </CCardBody>
                                    </CCard>
                                ))}
                            </div>
                        ) : (
                            <div className="text-secondary text-center fst-italic py-2">{fallos.includes('las notas') ? 'No se pudieron cargar.' : 'Sin notas previas'}</div>
                        )}
                    </CAccordionBody>
                </CAccordionItem>

                <CAccordionItem itemKey={2}>
                    <CAccordionHeader>
                        <CIcon icon={cilMedicalCross} className="me-2 text-success" />
                        Prescripciones
                        <CBadge color="success" shape="rounded-pill" className="ms-auto">{prescriptions.length}</CBadge>
                    </CAccordionHeader>
                    <CAccordionBody>
                        {prescriptions.length > 0 ? (
                            <div className="d-flex flex-column gap-3">
                                {prescriptions.map((rx) => (
                                    <CCard key={rx.id} className="border-start-success border-start-4">
                                        <CCardBody className="p-3">
                                            <div className="d-flex justify-content-between align-items-start mb-2">
                                                <div>
                                                    <small className="text-secondary">{formatDate(rx.created_at)}</small>
                                                    {/* El folio es lo que el médico reconoce; el id
                                                        viene de la migración legacy y no le dice nada. */}
                                                    <CBadge color="light" className="ms-2 text-dark">
                                                        {rx.folio_number
                                                            ? `Folio ${rx.folio_number}`
                                                            : `Receta #${rx.id}`}
                                                    </CBadge>
                                                </div>
                                                <div className="btn-group btn-group-sm">
                                                    <button
                                                        className="btn btn-outline-success btn-sm"
                                                        onClick={() => handleDownloadPrescription(rx.id, rx.created_at)}
                                                        title="Descargar PDF"
                                                    >
                                                        <CIcon icon={cilCloudDownload} />
                                                    </button>
                                                    <button
                                                        className="btn btn-outline-primary btn-sm"
                                                        onClick={() => handlePrintPrescription(rx.id)}
                                                        title="Imprimir"
                                                    >
                                                        <CIcon icon={cilPrint} />
                                                    </button>
                                                    <button
                                                        className="btn btn-outline-secondary btn-sm"
                                                        onClick={() => handleSendPrescriptionEmail(rx.id)}
                                                        title="Enviar por correo"
                                                    >
                                                        <CIcon icon={cilEnvelopeClosed} />
                                                    </button>
                                                </div>
                                            </div>
                                            <ul className="mb-0 ps-3 small">
                                                {rx.medications.map((med: any, idx: number) => (
                                                    <li key={idx}>
                                                        <strong>{med.name}</strong> {med.dosage}
                                                        <span className="text-muted ms-1">
                                                            - {med.frequency} por {med.duration}
                                                        </span>
                                                        {med.intake_time && (
                                                            <span className="text-primary ms-1">({med.intake_time})</span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                            {rx.instructions && (
                                                <div className="mt-2 small text-muted border-top pt-2">
                                                    <em>Instrucciones: {rx.instructions}</em>
                                                </div>
                                            )}
                                        </CCardBody>
                                    </CCard>
                                ))}
                            </div>
                        ) : (
                            <div className="text-secondary text-center fst-italic py-2">{fallos.includes('las recetas') ? 'No se pudieron cargar.' : 'Sin prescripciones previas'}</div>
                        )}
                        {hasMorePrescriptions && <CButton className="mt-3" color="success" variant="outline" onClick={async () => {
                            const next = await getPatientPrescriptions(patientId, prescriptions.length, 20).catch(() => {
                                setErrorMas('No se pudieron cargar más recetas. Inténtalo de nuevo.')
                                return null
                            })
                            if (!next) return
                            setErrorMas(null)
                            setPrescriptions((current) => [...current, ...next])
                            setHasMorePrescriptions(next.length === 20)
                        }}>Cargar recetas anteriores</CButton>}
                    </CAccordionBody>
                </CAccordionItem>

                <CAccordionItem itemKey={3}>
                    <CAccordionHeader>
                        <CIcon icon={cilFile} className="me-2 text-warning" />
                        Certificados Médicos
                        <CBadge color="warning" shape="rounded-pill" className="ms-auto">{certificates.length}</CBadge>
                    </CAccordionHeader>
                    <CAccordionBody>
                        {certificates.length > 0 ? (
                            <div className="d-flex flex-column gap-3">
                                {certificates.map((cert) => (
                                    <CCard key={cert.id} className="border-start-warning border-start-4">
                                        <CCardBody className="p-3">
                                            <div className="d-flex justify-content-between align-items-start mb-2">
                                                <div>
                                                    <small className="text-secondary">{formatDate(cert.created_at)}</small>
                                                    <CBadge color="secondary" className="ms-2">{cert.certificate_type}</CBadge>
                                                </div>
                                                <div className="btn-group btn-group-sm">
                                                    <button
                                                        className="btn btn-outline-warning btn-sm"
                                                        onClick={() => handleDownloadCertificate(cert.id, cert.created_at)}
                                                        title="Descargar PDF"
                                                    >
                                                        <CIcon icon={cilCloudDownload} />
                                                    </button>
                                                    <button
                                                        className="btn btn-outline-secondary btn-sm"
                                                        onClick={() => handleSendCertificateEmail(cert.id)}
                                                        title="Enviar por correo"
                                                    >
                                                        <CIcon icon={cilEnvelopeClosed} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="small">
                                                <strong>Dx:</strong> {cert.diagnosis || 'N/A'}
                                            </div>
                                        </CCardBody>
                                    </CCard>
                                ))}
                            </div>
                        ) : (
                            <div className="text-secondary text-center fst-italic py-2">{fallos.includes('los certificados') ? 'No se pudieron cargar.' : 'Sin certificados previos'}</div>
                        )}
                        {hasMoreCertificates && <CButton className="mt-3" color="warning" variant="outline" onClick={async () => {
                            const next = await getPatientCertificates(patientId, certificates.length, 20).catch(() => {
                                setErrorMas('No se pudieron cargar más certificados. Inténtalo de nuevo.')
                                return null
                            })
                            if (!next) return
                            setErrorMas(null)
                            setCertificates((current) => [...current, ...next])
                            setHasMoreCertificates(next.length === 20)
                        }}>Cargar certificados anteriores</CButton>}
                    </CAccordionBody>
                </CAccordionItem>
            </CAccordion>
        </div>
    )
}

export default MedicalHistoryViewer
