/**
 * Patient History — summary cards + chronological timeline
 */
import React, { useState, useEffect, useMemo } from 'react'
import {
    CSpinner, CAccordion, CAccordionItem, CAccordionHeader, CAccordionBody, CTable, CTableBody, CTableDataCell, CTableRow,
    CRow, CCol, CAlert, CButton,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilMedicalCross, cilHistory, cilUserFemale, cilPhone, cilCalendar, cilBaby } from '@coreui/icons'
import { useParams } from 'react-router-dom'
import { apiClient } from '../../../shared/services/api'
import AppointmentStatusBadge from '../../../shared/components/AppointmentStatusBadge'
import { InsigniaExpress } from '../../finanzas/components/InsigniaExpress'
import { formatEdad, formatearFechaISOCon, formatearHoraDeCita } from '../../../shared/utils/date'
import { mensajeDeError } from '../../../shared/utils/errors'

interface TriageInfo {
    weight_kg?: number | null
    blood_pressure_systolic?: number | null
    blood_pressure_diastolic?: number | null
    temperature_celsius?: number | null
    chief_complaint?: string | null
    observations?: string | null
}

interface SOAPInfo {
    subjective?: string
    objective?: string
    assessment?: string
    plan?: string
}

interface PrescriptionInfo {
    id: number
    folio?: string
    medications: any
    instructions?: string
    created_at?: string
}

interface HistoryEntry {
    appointment_id: number
    scheduled_at?: string
    status: string
    /** `express`: consulta que no se agendó y se registró al cobrarla. */
    origen?: string
    notes?: string
    triage?: TriageInfo | null
    soap_note?: SOAPInfo | null
    prescriptions: PrescriptionInfo[]
}

interface PatientHistoryData {
    patient_id: number
    patient_name: string
    /**
     * `false` cuando el servidor no mandó nota, signos ni recetas porque quien
     * mira no tiene permiso para leerlos (plan 32, C1). Sin esto la pantalla
     * diría «sin datos clínicos» de una cita que sí los tiene.
     */
    contenido_clinico?: boolean
    history: HistoryEntry[]
}

interface PatientDetail {
    id: number
    date_of_birth?: string
    phone?: string
    cell_phone?: string
    address?: string
    blood_type?: string | null
    patient_type?: string | null
    religion?: string | null
    menarca_age?: number | null
    menstrual_rhythm?: string | null
    ivsa_age?: number | null
    birth_control?: string | null
    last_menstrual_period?: string | null
    expected_delivery_date?: string | null
    gestas?: number | null; paras?: number | null; cesareas?: number | null; abortos?: number | null
}

interface PatientHistoryProps {
    /**
     * Paciente a mostrar. Sin esto el componente solo servia en su propia ruta
     * de secretaria, y el doctor tenia que salirse de la consulta para ver el
     * seguimiento. Cuando no se pasa, se toma de la URL como siempre.
     */
    patientId?: number
}

export const PatientHistory: React.FC<PatientHistoryProps> = ({ patientId: idPorProp }) => {
    const params = useParams()
    const patientId = idPorProp !== undefined ? String(idPorProp) : params.patientId
    const [data, setData] = useState<PatientHistoryData | null>(null)
    const [patient, setPatient] = useState<PatientDetail | null>(null)
    const [loading, setLoading] = useState(true)
    // Un fallo al leer no es «sin historial» (plan 29, T-1): se dice, con
    // «Reintentar», en vez de afirmar que el paciente no tiene citas.
    const [error, setError] = useState<string | null>(null)
    const [intento, setIntento] = useState(0)
    const [activeItem, setActiveItem] = useState<number | undefined>(undefined)

    useEffect(() => {
        if (!patientId) return
        setLoading(true)
        setError(null)
        Promise.all([
            apiClient.get(`/patients/${patientId}/history`),
            apiClient.get(`/patients/${patientId}`),
        ])
            .then(([histRes, patRes]) => {
                setData(histRes.data)
                setPatient(patRes.data)
            })
            .catch((err) => {
                setData(null)
                setError(mensajeDeError(err, 'No se pudo cargar el historial del paciente.'))
            })
            .finally(() => setLoading(false))
    }, [patientId, intento])

    const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({})

    const toggleFlip = (cardId: string) => {
        setFlippedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }))
    }

    // ── ALL hooks BEFORE any conditional return ──────────────────
    // Citas en el reloj del consultorio; fechas sin hora (FUR, FPP) sin correrse (D-12).
    const formatDate = (isoStr?: string) =>
        formatearHoraDeCita(isoStr, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }, '—')

    const formatShortDate = (isoStr?: string) => {
        if (!isoStr) return '—'
        const opciones: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
        return isoStr.length <= 10
            ? formatearFechaISOCon(isoStr, opciones, '—')
            : formatearHoraDeCita(isoStr, opciones, '—')
    }

    const stats = useMemo(() => {
        const history = data?.history || []
        const total = history.length
        const attended = history.filter(e => e.status === 'atendida').length
        // La última consulta es la última ATENDIDA. Antes era la primera de la
        // lista, que puede ser una cita agendada para la semana que entra o
        // una cancelada: «Última consulta: 9 oct» de una cita que no ha
        // pasado (plan 29, lote 6). El peso es el de esa misma consulta.
        const last = history.find(e => e.status === 'atendida')
        const lastWeight = last?.triage?.weight_kg ?? null
        const totalRx = history.reduce((sum, e) => sum + e.prescriptions.length, 0)
        const hours = history.map(e => e.scheduled_at ? new Date(e.scheduled_at).getHours() : null).filter(h => h !== null) as number[]
        const hourCounts: Record<number, number> = {}
        hours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1 })
        let prefHour = 0; let maxCount = 0
        Object.entries(hourCounts).forEach(([h, c]) => { if (c > maxCount) { maxCount = c; prefHour = parseInt(h) } })
        const prefTimeStr = maxCount > 0 ? `${prefHour}:00` : '—'
        return { total, attended, last, lastWeight, totalRx, prefTimeStr }
    }, [data])

    const ginecoLabel = useMemo(() => {
        if (!patient) return null
        const parts = []
        if (patient.gestas != null) parts.push(`G${patient.gestas}`)
        if (patient.paras != null) parts.push(`P${patient.paras}`)
        if (patient.cesareas != null) parts.push(`C${patient.cesareas}`)
        if (patient.abortos != null) parts.push(`A${patient.abortos}`)
        return parts.length > 0 ? parts.join(' ') : null
    }, [patient])

    if (loading) {
        return (<div className="text-center py-5"><CSpinner /><p className="mt-3 text-muted">Cargando historial clínico...</p></div>)
    }

    if (error) {
        return (
            <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2" role="alert">
                <span className="flex-grow-1">{error} Esto no quiere decir que no tenga citas.</span>
                <CButton color="danger" variant="outline" size="sm" onClick={() => setIntento((n) => n + 1)}>
                    Reintentar
                </CButton>
            </CAlert>
        )
    }

    if (!data || data.history.length === 0) {
        return (
            <div className="text-center py-5">
                <CIcon icon={cilHistory} size="xxl" className="text-muted mb-3" />
                <h6>Sin historial clínico</h6>
                <p className="text-muted small">Este paciente aún no tiene citas previas. Puedes agendar su primera cita desde la <a href="/#/secretaria/agenda">Agenda</a>.</p>
            </div>
        )
    }

    const veClinico = data.contenido_clinico !== false

    return (
        <div>
            {/* ── Professional stat cards ── */}
            {patient && (
                <CRow className="mb-3 g-2" data-tour="historial-resumen">
                    {/* Card 1: Paciente */}
                    <CCol xs={6} lg={2}>
                        <div className={`flip-card ${flippedCards['general'] ? 'flipped' : ''}`} onClick={() => toggleFlip('general')}>
                            <div className="flip-card-inner">
                                <div className="flip-card-front stat-card border-top-primary p-3">
                                    <div className="d-flex align-items-center gap-2 mb-2">
                                        <div className="stat-icon bg-primary bg-opacity-10 text-primary">
                                            <CIcon icon={cilUserFemale} size="sm" />
                                        </div>
                                        <div className="stat-label">PACIENTE</div>
                                    </div>
                                    {/* Aquí decía el tipo de paciente. Se quitó: esa
                                        bandera lleva años sin apagarse y el 97% de las
                                        marcadas como obstétricas no tiene ningún
                                        embarazo activo, así que la tarjeta afirmaba algo
                                        falso casi siempre. La edad sí se sostiene. */}
                                    <div className="stat-value">{formatEdad(patient.date_of_birth)}</div>
                                    {patient.blood_type && <span className="badge bg-danger bg-opacity-15 text-danger mt-1">{patient.blood_type}</span>}
                                </div>
                                <div className="flip-card-back stat-card border-top-primary p-3">
                                    <div className="stat-label mb-2">DATOS GENERALES</div>
                                    {/* "— años" no dice nada; el guion solo sí dice "no se sabe". */}
                                    <div className="small">Edad: <strong>{formatEdad(patient.date_of_birth)}</strong></div>
                                    <div className="small">Sangre: <strong>{patient.blood_type || '—'}</strong></div>
                                    <div className="small">Religión: <strong>{patient.religion || '—'}</strong></div>
                                    {patient.address && <div className="small text-muted mt-1 text-truncate">{patient.address}</div>}
                                </div>
                            </div>
                        </div>
                    </CCol>

                    {/* Card 2: Contacto */}
                    <CCol xs={6} lg={2}>
                        <div className={`flip-card ${flippedCards['contacto'] ? 'flipped' : ''}`} onClick={() => toggleFlip('contacto')}>
                            <div className="flip-card-inner">
                                <div className="flip-card-front stat-card border-top-info p-3">
                                    <div className="d-flex align-items-center gap-2 mb-2">
                                        <div className="stat-icon bg-info bg-opacity-10 text-info">
                                            <CIcon icon={cilPhone} size="sm" />
                                        </div>
                                        <div className="stat-label">CONTACTO</div>
                                    </div>
                                    <div className="stat-value">{patient.cell_phone || patient.phone || '—'}</div>
                                </div>
                                <div className="flip-card-back stat-card border-top-info p-3">
                                    <div className="stat-label mb-2">CONTACTO</div>
                                    {patient.phone && <div className="small">📞 Casa: <strong>{patient.phone}</strong></div>}
                                    {patient.cell_phone && <div className="small">📱 Cel: <strong>{patient.cell_phone}</strong></div>}
                                    {!patient.phone && !patient.cell_phone && <div className="small text-muted">Sin teléfono</div>}
                                    {patient.address && <div className="small text-muted mt-1">{patient.address}</div>}
                                </div>
                            </div>
                        </div>
                    </CCol>

                    {/* Card 3: Citas */}
                    <CCol xs={6} lg={2}>
                        <div className={`flip-card ${flippedCards['citas'] ? 'flipped' : ''}`} onClick={() => toggleFlip('citas')}>
                            <div className="flip-card-inner">
                                <div className="flip-card-front stat-card border-top-success p-3">
                                    <div className="d-flex align-items-center gap-2 mb-2">
                                        <div className="stat-icon bg-success bg-opacity-10 text-success">
                                            <CIcon icon={cilCalendar} size="sm" />
                                        </div>
                                        <div className="stat-label">CITAS</div>
                                    </div>
                                    <div className="stat-value-large">{stats.total}</div>
                                    <div className="stat-detail">{stats.attended} atendidas</div>
                                </div>
                                <div className="flip-card-back stat-card border-top-success p-3">
                                    <div className="stat-label mb-2">HISTORIAL DE CITAS</div>
                                    <div className="small">Total: <strong>{stats.total}</strong></div>
                                    <div className="small">Atendidas: <strong>{stats.attended}</strong></div>
                                    <div className="small">Horario preferido: <strong>{stats.prefTimeStr}</strong></div>
                                    {stats.last && <div className="small mt-1">Última: {formatShortDate(stats.last.scheduled_at)}</div>}
                                </div>
                            </div>
                        </div>
                    </CCol>

                    {/* Card 4: Última cita. Peso y recetas son de la consulta:
                        solo para quien puede leerlos. */}
                    {veClinico && <CCol xs={6} lg={3}>
                        <div className={`flip-card ${flippedCards['ultima'] ? 'flipped' : ''}`} onClick={() => toggleFlip('ultima')}>
                            <div className="flip-card-inner">
                                <div className="flip-card-front stat-card border-top-warning p-3">
                                    <div className="d-flex align-items-center gap-2 mb-2">
                                        <div className="stat-icon bg-warning bg-opacity-10 text-warning">
                                            <CIcon icon={cilMedicalCross} size="sm" />
                                        </div>
                                        <div className="stat-label">ÚLTIMA CONSULTA</div>
                                    </div>
                                    <div className="stat-value">{stats.last ? formatShortDate(stats.last.scheduled_at) : '—'}</div>
                                    <div className="d-flex gap-3 mt-1">
                                        {stats.lastWeight && <div className="stat-detail">⚖️ {stats.lastWeight} kg</div>}
                                        {stats.totalRx > 0 && <div className="stat-detail text-success">💊 {stats.totalRx}</div>}
                                    </div>
                                </div>
                                <div className="flip-card-back stat-card border-top-warning p-3">
                                    <div className="stat-label mb-2">ÚLTIMA CONSULTA</div>
                                    <div className="small">Fecha: <strong>{stats.last ? formatShortDate(stats.last.scheduled_at) : '—'}</strong></div>
                                    {stats.lastWeight && <div className="small">Peso: <strong>{stats.lastWeight} kg</strong></div>}
                                    <div className="small">Recetas totales: <strong className="text-success">{stats.totalRx}</strong></div>
                                    {stats.last?.triage?.observations && (
                                        <div className="small text-muted mt-1" style={{ maxHeight: '50px', overflow: 'hidden' }}>
                                            {stats.last.triage.observations.substring(0, 80)}...
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CCol>}

                    {/* Card 5: Historia G-O */}
                    <CCol xs={12} lg={3}>
                        <div className={`flip-card ${flippedCards['gineco'] ? 'flipped' : ''}`} onClick={() => toggleFlip('gineco')}>
                            <div className="flip-card-inner">
                                <div className="flip-card-front stat-card border-top-danger p-3">
                                    <div className="d-flex align-items-center gap-2 mb-2">
                                        <div className="stat-icon bg-danger bg-opacity-10 text-danger">
                                            <CIcon icon={cilBaby} size="sm" />
                                        </div>
                                        <div className="stat-label">HISTORIA G-O</div>
                                    </div>
                                    <div className="stat-value">{ginecoLabel || 'Sin registro'}</div>
                                    {patient.menarca_age && <div className="stat-detail">Menarca: {patient.menarca_age}a</div>}
                                </div>
                                <div className="flip-card-back stat-card border-top-danger p-3">
                                    <div className="stat-label mb-2">HISTORIA GINECO-OBSTÉTRICA</div>
                                    {ginecoLabel && <div className="small mb-1"><strong>{ginecoLabel}</strong></div>}
                                    {patient.menarca_age && <div className="small">Menarca: <strong>{patient.menarca_age}a</strong></div>}
                                    {patient.menstrual_rhythm && <div className="small">Ritmo: <strong>{patient.menstrual_rhythm}</strong></div>}
                                    {patient.ivsa_age && <div className="small">IVSA: <strong>{patient.ivsa_age}a</strong></div>}
                                    {patient.birth_control && <div className="small">Ctrl Fert: <strong>{patient.birth_control}</strong></div>}
                                    {patient.last_menstrual_period && <div className="small">FUR: <strong>{formatShortDate(patient.last_menstrual_period)}</strong></div>}
                                    {patient.expected_delivery_date && <div className="small">FPP: <strong>{formatShortDate(patient.expected_delivery_date)}</strong></div>}
                                    {!ginecoLabel && !patient.menarca_age && <div className="small text-muted">Sin datos G-O</div>}
                                </div>
                            </div>
                        </div>
                    </CCol>
                </CRow>
            )}

            <div className="d-flex align-items-center gap-3 mb-3">
                <h2 className="h4 mb-0"><CIcon icon={cilHistory} className="me-2" />Historial de {data.patient_name}</h2>
                <small className="text-muted">{data.history.length} cita(s)</small>
            </div>

            <CAccordion flush activeItemKey={activeItem} data-tour="historial-citas">
                {data.history.map((entry) => (
                    <CAccordionItem itemKey={entry.appointment_id} key={entry.appointment_id}>
                        <CAccordionHeader className="py-2 small" onClick={() => setActiveItem(activeItem === entry.appointment_id ? undefined : entry.appointment_id)}>
                            <div className="d-flex flex-wrap align-items-center gap-2 w-100">
                                <strong className="me-2">{formatDate(entry.scheduled_at)}</strong>
                                <AppointmentStatusBadge status={entry.status as any} />
                                <InsigniaExpress cita={entry} />
                                {entry.triage && (
                                    <span className="text-muted ms-auto d-flex align-items-center gap-3">
                                        {entry.triage.weight_kg && <span>⚖️ {entry.triage.weight_kg} kg</span>}
                                        {(entry.triage.blood_pressure_systolic || entry.triage.blood_pressure_diastolic) && <span>♥ {entry.triage.blood_pressure_systolic}/{entry.triage.blood_pressure_diastolic}</span>}
                                        {entry.prescriptions.length > 0 && <span className="text-success">💊 {entry.prescriptions.length}</span>}
                                        {entry.soap_note && <span className="text-primary">📋</span>}
                                    </span>
                                )}
                            </div>
                        </CAccordionHeader>
                        <CAccordionBody className="small py-2">
                            {entry.triage?.chief_complaint && <div className="mb-2 text-muted"><strong>Motivo:</strong> {entry.triage.chief_complaint}</div>}
                            {entry.triage?.observations && (
                                <div className="mb-2 p-2 bg-light rounded">
                                    <strong>Hallazgos:</strong>
                                    <pre className="mb-0 mt-1" style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{entry.triage.observations}</pre>
                                </div>
                            )}
                            {entry.soap_note && (
                                <div className="mb-2">
                                    <strong className="text-primary">📋 Nota SOAP</strong>
                                    <CTable small bordered className="mt-1">
                                        <CTableBody>
                                            {entry.soap_note.subjective && <CTableRow><CTableDataCell width="100" className="fw-bold">Subjetivo</CTableDataCell><CTableDataCell>{entry.soap_note.subjective}</CTableDataCell></CTableRow>}
                                            {entry.soap_note.objective && <CTableRow><CTableDataCell className="fw-bold">Objetivo</CTableDataCell><CTableDataCell style={{ whiteSpace: 'pre-wrap' }}>{entry.soap_note.objective}</CTableDataCell></CTableRow>}
                                            {entry.soap_note.assessment && <CTableRow><CTableDataCell className="fw-bold">Diagnóstico</CTableDataCell><CTableDataCell>{entry.soap_note.assessment}</CTableDataCell></CTableRow>}
                                        </CTableBody>
                                    </CTable>
                                </div>
                            )}
                            {entry.prescriptions.length > 0 && (
                                <div>
                                    <strong className="text-success">💊 {entry.prescriptions.length} receta(s)</strong>
                                    {entry.prescriptions.map((p) => (
                                        <div key={p.id} className="ms-3 mt-1 p-2 bg-light rounded">
                                            {Array.isArray(p.medications) ? p.medications.map((m: any, i: number) => <div key={i} className="mb-1"><strong>{m.name}</strong></div>) : <div>{p.instructions || 'Sin detalles'}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {veClinico && !entry.triage?.observations && !entry.soap_note && entry.prescriptions.length === 0 && <p className="text-muted mb-0">Sin datos clínicos registrados en esta cita.</p>}
                            {!veClinico && <p className="text-muted mb-0">La nota, los signos y las recetas de la consulta solo los ve el personal médico.</p>}
                        </CAccordionBody>
                    </CAccordionItem>
                ))}
            </CAccordion>
        </div>
    )
}
