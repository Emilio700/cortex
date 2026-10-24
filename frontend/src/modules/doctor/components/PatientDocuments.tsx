/**
 * PatientDocuments Component
 * Replaces "Resumen Rápido" - Shows uploaded lab results and medical files
 */
import React, { useEffect, useState } from 'react'
import {
    CDropdown,
    CDropdownItem,
    CDropdownMenu,
    CDropdownToggle,
    CFormSwitch,
    CCard,
    CCardBody,
    CCardHeader,
    CSpinner,
    CAlert,
    CButton,
    CBadge,
    CListGroup,
    CListGroupItem,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
    cilCloudUpload,
    cilFile,
    cilCloudDownload,
    cilDescription,
    cilMedicalCross,
    cilOptions,
} from '@coreui/icons'
import {
    usePatientDocuments,
    PatientDocument,
    VENTANA_DE_CORRECCION_MS,
} from 'src/shared/hooks/usePatientDocuments'
import { useAuth } from '../../../shared/context/AuthContext'
import { instanteDelServidor } from '../../../shared/utils/date'
import CorregirDocumentoModal, { type Correccion } from './CorregirDocumentoModal'
import { formatDate } from 'src/shared/utils/date'
import VisorDocumentos, { archivoDeDocumento } from '../../../shared/components/VisorDocumentos'
import { NOMBRE_DE_TIPO } from '../../expediente/SubirArchivoModal'

interface PatientDocumentsProps {
    patientId: number
    /** En el expediente: lleva a la pestaña Estudios, donde viven los resultados. */
    onVerEstudios?: () => void
}

const PatientDocuments: React.FC<PatientDocumentsProps> = ({ patientId, onVerEstudios }) => {
    const {
        loading,
        error,
        documents,
        hasMore,
        fetchPatientDocuments,
        downloadDocument,
        anularDocumento,
        moverDocumento,
        revertirAnulacion,
        enEstudios,
    } = usePatientDocuments()
    const [selectedDoc, setSelectedDoc] = useState<PatientDocument | null>(null)
    const { user, can } = useAuth()
    // Corrección (plan 29, lote 7): qué documento y qué acción, y lo que el
    // servidor confirmó para anunciarlo.
    const [corrigiendo, setCorrigiendo] = useState<{ doc: PatientDocument; accion: Correccion } | null>(null)
    const [hecho, setHecho] = useState<string | null>(null)
    // Solo administración ve los anulados (y los revierte).
    const esAdministracion = user?.role === 'admin' || user?.role === 'master'
    const [verAnulados, setVerAnulados] = useState(false)

    useEffect(() => {
        if (patientId) {
            void fetchPatientDocuments(patientId, 0, 50, false, verAnulados)
        }
    }, [patientId, verAnulados])

    /** Lo mismo que decide el servidor; si se equivoca, el servidor lo dice. */
    const puedeCorregir = (doc: PatientDocument) => {
        if (can('documents.correct')) return true
        const subido = instanteDelServidor(doc.created_at).getTime()
        return doc.uploaded_by_user_id === user?.id && Date.now() - subido <= VENTANA_DE_CORRECCION_MS
    }

    const alCorregir = (
        resultado: PatientDocument,
        accion: Correccion,
        destino?: { first_name: string; last_name: string },
    ) => {
        setCorrigiendo(null)
        setHecho(
            accion === 'anular'
                ? `Se anuló «${resultado.title}». Ya no aparece en el expediente; el archivo se conserva.`
                : accion === 'mover'
                  ? `Se movió «${resultado.title}» al expediente de ${destino?.first_name ?? ''} ${destino?.last_name ?? ''}.`.replace(/\s+\./, '.')
                  : `Se revirtió la anulación de «${resultado.title}».`,
        )
        void fetchPatientDocuments(patientId, 0, 50, false, verAnulados)
    }

    const getDocumentIcon = (type: string) => {
        switch (type) {
            case 'lab_result':
                return cilMedicalCross
            case 'imaging_study':
                return cilDescription
            default:
                return cilFile
        }
    }

    // Los mismos nombres que en el modal de subir (C9).
    const getDocumentTypeLabel = (type: string) => NOMBRE_DE_TIPO[type] || type

    const groupedDocs = documents.reduce((acc, doc) => {
        const type = doc.document_type
        if (!acc[type]) acc[type] = []
        acc[type].push(doc)
        return acc
    }, {} as Record<string, PatientDocument[]>)

    if (loading) {
        return (
            <CCard className="h-100">
                <CCardBody className="d-flex justify-content-center align-items-center">
                    <CSpinner color="primary" />
                </CCardBody>
            </CCard>
        )
    }

    return (
        <CCard className="h-100 shadow-sm">
            <CCardHeader className="bg-white border-bottom">
                <div className="d-flex justify-content-between align-items-center">
                    <h3 className="h6 mb-0">
                        <CIcon icon={cilCloudUpload} className="me-2" aria-hidden="true" />
                        Documentos de la paciente
                    </h3>
                    {/* Sin lista no hay número: un «0» diría que no tiene documentos.
                        Con más páginas, el número es de los ya cargados. */}
                    {esAdministracion && (
                        <CFormSwitch
                            id={`ver-anulados-${patientId}`}
                            className="ms-auto me-2 mb-0 small"
                            label="Anulados"
                            checked={verAnulados}
                            onChange={() => setVerAnulados((v) => !v)}
                        />
                    )}
                    <CBadge color="primary" shape="rounded-pill">
                        {error && documents.length === 0 ? '—' : `${documents.length}${hasMore ? '+' : ''}`}
                    </CBadge>
                </div>
            </CCardHeader>
            <CCardBody className="overflow-auto" style={{ maxHeight: '600px' }}>
                {hecho && (
                    <CAlert color="success" dismissible onClose={() => setHecho(null)} className="mb-3">
                        {hecho}
                    </CAlert>
                )}
                {!verAnulados && enEstudios > 0 && (
                    <div className="small text-body-secondary mb-3" role="status">
                        {enEstudios === 1
                            ? '1 archivo es el resultado de un estudio y está en Estudios.'
                            : `${enEstudios} archivos son resultados de estudios y están en Estudios.`}{' '}
                        {onVerEstudios && (
                            <CButton color="link" size="sm" className="p-0 align-baseline" onClick={onVerEstudios}>
                                Ver en Estudios
                            </CButton>
                        )}
                    </div>
                )}
                {verAnulados && (
                    <CAlert color="warning" className="py-2 small mb-3">
                        Estás viendo los documentos anulados de esta paciente. No aparecen en el expediente.
                    </CAlert>
                )}
                {error && (
                    <CAlert color="danger" className="mb-3 d-flex flex-wrap align-items-center gap-2">
                        <span className="flex-grow-1">{error}</span>
                        <CButton color="danger" variant="outline" size="sm" onClick={() => void fetchPatientDocuments(patientId, 0, 50, false, verAnulados)}>
                            Reintentar
                        </CButton>
                    </CAlert>
                )}

                {/* «No hay documentos» solo si la lista se pudo leer (plan 29, T-1). */}
                {documents.length === 0 && !loading && !error && (
                    <div className="text-center text-muted py-5">
                        <CIcon icon={cilFile} size="3xl" className="mb-3 opacity-25" />
                        <p>{verAnulados ? 'No hay documentos anulados' : 'No hay documentos subidos'}</p>
                        <small>Aquí van las referencias de otro médico y otros archivos. Los resultados de estudios están en Estudios.</small>
                    </div>
                )}

                {Object.entries(groupedDocs).map(([type, docs]) => (
                    <div key={type} className="mb-4">
                        <div className="text-uppercase text-secondary fw-bold small mb-2 d-flex align-items-center">
                            <CIcon icon={getDocumentIcon(type)} className="me-2" />
                            {getDocumentTypeLabel(type)} ({docs.length})
                        </div>
                        <CListGroup flush>
                            {docs.map((doc) => (
                                <CListGroupItem
                                    key={doc.id}
                                    className="px-3 py-2 border-start border-start-3 border-start-primary tarjeta-clicable"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setSelectedDoc(doc)}
                                >
                                    <div className="d-flex justify-content-between align-items-start">
                                        <div className="flex-grow-1">
                                            <div className="fw-semibold text-dark">{doc.title}</div>
                                            {doc.lab_name && (
                                                <small className="text-muted d-block">
                                                    📍 {doc.lab_name}
                                                </small>
                                            )}
                                            <small className="text-muted">
                                                📅 {doc.study_date || formatDate(doc.created_at, 'dd/MM/yyyy')}
                                            </small>
                                            {doc.description && (
                                                <p className="mb-0 mt-1 small text-secondary">{doc.description}</p>
                                            )}
                                            {doc.movido_desde_patient_id && (
                                                <small className="d-block text-info" title={doc.movido_motivo ?? undefined}>
                                                    Movido desde otro expediente
                                                </small>
                                            )}
                                            {doc.anulado_at && (
                                                <small className="d-block text-danger">
                                                    Anulado: {doc.anulado_motivo}
                                                </small>
                                            )}
                                        </div>
                                        <div className="d-flex gap-1 ms-2">
                                            <CButton
                                                color="primary"
                                                variant="ghost"
                                                size="sm"
                                                title="Descargar documento"
                                                aria-label={`Descargar ${doc.file_name}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    downloadDocument(doc.id, doc.file_name)
                                                }}
                                            >
                                                <CIcon icon={cilCloudDownload} />
                                            </CButton>
                                            {(doc.anulado_at ? esAdministracion : puedeCorregir(doc)) && (
                                                // El renglón abre el visor: tocar el menú no debe abrirlo.
                                                <span onClick={(e) => e.stopPropagation()} data-tour="documentos-corregir">
                                                <CDropdown alignment="end">
                                                    <CDropdownToggle
                                                        color="secondary"
                                                        variant="ghost"
                                                        size="sm"
                                                        caret={false}
                                                        className="documentos-corregir-boton"
                                                        aria-label={`Corregir ${doc.title}`}
                                                        title="Corregir"
                                                    >
                                                        <CIcon icon={cilOptions} />
                                                    </CDropdownToggle>
                                                    <CDropdownMenu>
                                                        {doc.anulado_at ? (
                                                            <CDropdownItem
                                                                as="button"
                                                                onClick={() => setCorrigiendo({ doc, accion: 'revertir' })}
                                                            >
                                                                Revertir la anulación
                                                            </CDropdownItem>
                                                        ) : (
                                                            <>
                                                                <CDropdownItem
                                                                    as="button"
                                                                    onClick={() => setCorrigiendo({ doc, accion: 'mover' })}
                                                                >
                                                                    Mover a otra paciente
                                                                </CDropdownItem>
                                                                <CDropdownItem
                                                                    as="button"
                                                                    className="text-danger"
                                                                    onClick={() => setCorrigiendo({ doc, accion: 'anular' })}
                                                                >
                                                                    Anular
                                                                </CDropdownItem>
                                                            </>
                                                        )}
                                                    </CDropdownMenu>
                                                </CDropdown>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </CListGroupItem>
                            ))}
                        </CListGroup>
                    </div>
                ))}

                {hasMore && (
                    <CButton
                        color="secondary"
                        variant="outline"
                        className="w-100"
                        disabled={loading}
                        onClick={() => void fetchPatientDocuments(patientId, documents.length, 50, true, verAnulados)}
                    >
                        Cargar más documentos
                    </CButton>
                )}

            </CCardBody>

            <CorregirDocumentoModal
                documento={corrigiendo?.doc ?? null}
                accion={corrigiendo?.accion ?? null}
                onClose={() => setCorrigiendo(null)}
                onCorregido={alCorregir}
                ejecutar={{ anular: anularDocumento, mover: moverDocumento, revertir: revertirAnulacion }}
            />

            {selectedDoc && (
                <VisorDocumentos
                    visible={!!selectedDoc}
                    onClose={() => setSelectedDoc(null)}
                    titulo={selectedDoc.title}
                    archivos={[archivoDeDocumento(selectedDoc.id, selectedDoc.file_name, selectedDoc.mime_type)]}
                />
            )}
        </CCard >
    )
}

export default PatientDocuments
