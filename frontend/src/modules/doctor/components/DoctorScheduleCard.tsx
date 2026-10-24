/**
 * Doctor working hours + schedule blocks configuration (Fase 5.1/5.2)
 */
import React, { useEffect, useState } from 'react'
import {
    CAlert,
    CButton,
    CCard,
    CCardBody,
    CCardHeader,
    CCol,
    CFormInput,
    CFormLabel,
    CFormSelect,
    CListGroup,
    CListGroupItem,
    CModal,
    CModalBody,
    CModalFooter,
    CModalHeader,
    CModalTitle,
    CRow,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCalendar, cilPlus, cilTrash } from '@coreui/icons'
import { useDoctorSchedule } from '../hooks/useDoctorSchedule'
import { useAuth } from '../../../shared/context/AuthContext'
import { formatearHoraDeCita } from '../../../shared/utils/date'

const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const formatTime = (t: string) => t.slice(0, 5)

const DoctorScheduleCard: React.FC = () => {
    const { user } = useAuth()
    const {
        workingHours,
        blocks,
        loading,
        error,
        getWorkingHours,
        createWorkingHours,
        deleteWorkingHours,
        getBlocks,
        createBlock,
        deleteBlock,
    } = useDoctorSchedule()

    const [weekday, setWeekday] = useState(0)
    const [startTime, setStartTime] = useState('09:00')
    const [endTime, setEndTime] = useState('14:00')

    const [blockStart, setBlockStart] = useState('')
    const [blockEnd, setBlockEnd] = useState('')
    const [blockReason, setBlockReason] = useState('')

    // U-05: borrar un horario o un bloqueo se confirma antes. Sin esto, un clic
    // por descuido en la papelera abría huecos en la agenda sin aviso.
    const [confirmar, setConfirmar] = useState<
        { tipo: 'horario' | 'bloqueo'; id: number; texto: string } | null
    >(null)

    const confirmarBorrado = async () => {
        if (!confirmar) return
        if (confirmar.tipo === 'horario') {
            await deleteWorkingHours(confirmar.id)
        } else {
            await deleteBlock(confirmar.id)
        }
        setConfirmar(null)
    }

    useEffect(() => {
        getWorkingHours()
        getBlocks()
    }, [getWorkingHours, getBlocks])

    const handleAddWorkingHours = async () => {
        if (!startTime || !endTime) return
        await createWorkingHours(weekday, `${startTime}:00`, `${endTime}:00`)
    }

    const handleAddBlock = async () => {
        if (!user || !blockStart || !blockEnd) return
        await createBlock(user.id, new Date(blockStart).toISOString(), new Date(blockEnd).toISOString(), blockReason)
        setBlockStart('')
        setBlockEnd('')
        setBlockReason('')
    }

    return (
        <CCard className="mb-4 glass-card">
            <CCardHeader>
                <CIcon icon={cilCalendar} className="me-2" />
                <strong>Horario Laboral y Bloqueos</strong>
                <small className="text-muted ms-2">(Define cuándo se te pueden agendar citas)</small>
            </CCardHeader>
            <CCardBody>
                {error && <CAlert color="danger">{error}</CAlert>}

                <h2 className="h6">Horario recurrente semanal</h2>
                <CRow className="g-2 align-items-end mb-3">
                    <CCol xs={12} md={4}>
                        <CFormLabel htmlFor="horario-dia" className="small mb-1">Día</CFormLabel>
                        <CFormSelect id="horario-dia" size="sm" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                            {WEEKDAY_LABELS.map((label, idx) => (
                                <option key={idx} value={idx}>
                                    {label}
                                </option>
                            ))}
                        </CFormSelect>
                    </CCol>
                    <CCol xs={6} md={3}>
                        <CFormLabel htmlFor="horario-desde" className="small mb-1">Desde</CFormLabel>
                        <CFormInput id="horario-desde" size="sm" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </CCol>
                    <CCol xs={6} md={3}>
                        <CFormLabel htmlFor="horario-hasta" className="small mb-1">Hasta</CFormLabel>
                        <CFormInput id="horario-hasta" size="sm" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </CCol>
                    <CCol xs={12} md={2}>
                        <CButton size="sm" color="primary" disabled={loading} onClick={handleAddWorkingHours}>
                            <CIcon icon={cilPlus} className="me-1" />
                            Agregar
                        </CButton>
                    </CCol>
                </CRow>

                {workingHours.length > 0 ? (
                    <CListGroup className="mb-4">
                        {workingHours.map((wh) => (
                            <CListGroupItem key={wh.id} className="d-flex justify-content-between align-items-center">
                                <span>
                                    <strong>{WEEKDAY_LABELS[wh.weekday]}</strong>: {formatTime(wh.start_time)} - {formatTime(wh.end_time)}
                                </span>
                                <CButton size="sm" color="danger" variant="ghost" title="Eliminar horario" aria-label="Eliminar horario" onClick={() => setConfirmar({ tipo: 'horario', id: wh.id, texto: `${WEEKDAY_LABELS[wh.weekday]} de ${formatTime(wh.start_time)} a ${formatTime(wh.end_time)}` })}>
                                    <CIcon icon={cilTrash} />
                                </CButton>
                            </CListGroupItem>
                        ))}
                    </CListGroup>
                ) : (
                    <div className="text-muted small mb-4 fst-italic">
                        Sin horario configurado — se te podrán agendar citas en cualquier horario.
                    </div>
                )}

                <h2 className="h6">Bloqueos puntuales (vacaciones, permisos, etc.)</h2>
                <CRow className="g-2 align-items-end mb-3">
                    <CCol xs={12} md={3}>
                        <CFormLabel htmlFor="horario-desde-2" className="small mb-1">Desde</CFormLabel>
                        <CFormInput id="horario-desde-2" size="sm" type="datetime-local" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
                    </CCol>
                    <CCol xs={12} md={3}>
                        <CFormLabel htmlFor="horario-hasta-2" className="small mb-1">Hasta</CFormLabel>
                        <CFormInput id="horario-hasta-2" size="sm" type="datetime-local" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
                    </CCol>
                    <CCol xs={12} md={4}>
                        <CFormLabel htmlFor="horario-motivo-opcional" className="small mb-1">Motivo (opcional)</CFormLabel>
                        <CFormInput id="horario-motivo-opcional" size="sm" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ej: Congreso médico" />
                    </CCol>
                    <CCol xs={12} md={2}>
                        <CButton size="sm" color="primary" disabled={loading} onClick={handleAddBlock}>
                            <CIcon icon={cilPlus} className="me-1" />
                            Bloquear
                        </CButton>
                    </CCol>
                </CRow>

                {blocks.length > 0 ? (
                    <CListGroup>
                        {blocks.map((block) => (
                            <CListGroupItem key={block.id} className="d-flex justify-content-between align-items-center">
                                <span>
                                    {formatearHoraDeCita(block.start_at, { dateStyle: 'medium', timeStyle: 'short' })} → {formatearHoraDeCita(block.end_at, { dateStyle: 'medium', timeStyle: 'short' })}
                                    {block.reason && <span className="text-muted ms-2">({block.reason})</span>}
                                </span>
                                <CButton size="sm" color="danger" variant="ghost" title="Eliminar bloqueo" aria-label="Eliminar bloqueo" onClick={() => setConfirmar({ tipo: 'bloqueo', id: block.id, texto: `${formatearHoraDeCita(block.start_at, { dateStyle: 'medium', timeStyle: 'short' })} → ${formatearHoraDeCita(block.end_at, { dateStyle: 'medium', timeStyle: 'short' })}` })}>
                                    <CIcon icon={cilTrash} />
                                </CButton>
                            </CListGroupItem>
                        ))}
                    </CListGroup>
                ) : (
                    <div className="text-muted small fst-italic">Sin bloqueos registrados.</div>
                )}
            </CCardBody>

            <CModal visible={confirmar !== null} onClose={() => setConfirmar(null)}>
                <CModalHeader>
                    <CModalTitle>
                        {confirmar?.tipo === 'horario' ? 'Eliminar horario' : 'Eliminar bloqueo'}
                    </CModalTitle>
                </CModalHeader>
                <CModalBody>
                    {confirmar?.tipo === 'horario' ? (
                        <>
                            ¿Eliminar el horario <strong>{confirmar?.texto}</strong>? Dejarás de
                            recibir citas en ese horario recurrente.
                        </>
                    ) : (
                        <>
                            ¿Eliminar el bloqueo <strong>{confirmar?.texto}</strong>? Volverás a
                            estar disponible para citas en ese periodo.
                        </>
                    )}
                </CModalBody>
                <CModalFooter>
                    <CButton color="secondary" onClick={() => setConfirmar(null)} disabled={loading}>
                        Cancelar
                    </CButton>
                    <CButton color="danger" onClick={() => void confirmarBorrado()} disabled={loading}>
                        Eliminar
                    </CButton>
                </CModalFooter>
            </CModal>
        </CCard>
    )
}

export default DoctorScheduleCard
