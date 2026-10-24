/**
 * Patients page with table, search, and CRUD operations
 */
import React, { useState, useEffect } from 'react'
import {
    CDropdown,
    CDropdownItem,
    CDropdownMenu,
    CDropdownToggle,
    CButton,
    CCard,
    CCardBody,
    CCol,
    CFormInput,
    CFormSwitch,
    CInputGroup,
    CInputGroupText,
    CRow,
    CTableBody,
    CTableDataCell,
    CTableHead,
    CTableHeaderCell,
    CTableRow,
    CBadge,
    CPagination,
    CPaginationItem,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilSearch, cilNotes, cilOptions, cilPeople } from '@coreui/icons'
import { useNavigate } from 'react-router-dom'
import { usePatients } from '../hooks/usePatients'
import { PacienteForm } from '../components/PacienteForm'
import { useToast } from '../../../shared/components/ToastProvider'
import { TableSkeleton } from '../../../shared/components/TableSkeleton'
import { apiClient } from '../../../shared/services/api'
import { formatEdad, hoyLocalISO } from '../../../shared/utils/date'
import { useAuth } from '../../../shared/context/AuthContext'
import type { Patient, PatientCreate } from '../types'
import { pedir, useAtenderPedido } from '../../../shared/utils/pedidos'
import TablaResponsiva from '../../../shared/components/TablaResponsiva'
import { useAlReactivarPestana } from '../../../shared/tabs/useAlReactivarPestana'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { PuntoFichaIncompleta } from '../../../shared/components/PuntoFichaIncompleta'
import { rutaDelExpediente } from '../../expediente/rutas'

const PacientesPage: React.FC = () => {
    const { fetchPatients, createPatient, updatePatient, getPatient } = usePatients()
    const navigate = useNavigate()
    const { showSuccess, showError } = useToast()
    const { can } = useAuth()

    const [patients, setPatients] = useState<Patient[]>([])
    const [loading, setLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [soloIncompletas, setSoloIncompletas] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [tenantNames, setTenantNames] = useState<Record<number, string>>({})
    const pageSize = 50

    // Load patients function with pagination
    // Un fallo al leer no es «aún no hay pacientes» (plan 29, T-1): recepción
    // la registraría otra vez.
    const [errorCarga, setErrorCarga] = useState(false)

    const loadPatients = async (search?: string, page = 1, silencioso = false) => {
        try {
            // En un regreso la tabla ya tiene pacientes: sin skeleton, los
            // datos actuales se reemplazan al llegar la respuesta.
            if (!silencioso) setLoading(true)
            const skip = (page - 1) * pageSize
            // Fetch one extra to detect if there are more pages
            const data = await fetchPatients(search, skip, pageSize + 1, soloIncompletas)
            setHasMore(data.length > pageSize)
            setPatients(data.slice(0, pageSize))
            setCurrentPage(page)
            setErrorCarga(false)
        } catch (error) {
            setPatients([])
            setErrorCarga(true)
            console.error('Error loading patients:', error)
            showError('No se pudieron cargar los pacientes. Intenta de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    // Al abrir sólo se piden las sucursales: la lista la pide el efecto de la
    // búsqueda, que también corre al montarse. Antes los dos la pedían y cada
    // visita a Pacientes hacía dos veces la misma consulta (plan 29, lote 6).
    useEffect(() => {
        loadTenantNames()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Only run once on mount

    const loadTenantNames = async () => {
        try {
            const { data } = await apiClient.get<any[]>('/tenants')
            const map: Record<number, string> = {}
            data.forEach((t: any) => { map[t.id] = t.name })
            setTenantNames(map)
        } catch { /* non-critical */ }
    }

    // Search with debounce - resets to page 1. La primera vez, sin esperar.
    const primeraCarga = React.useRef(true)
    useEffect(() => {
        const espera = primeraCarga.current ? 0 : 300
        primeraCarga.current = false
        const timer = setTimeout(() => {
            loadPatients(searchTerm || undefined, 1)
        }, espera)

        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, soloIncompletas])

    // Al volver a la pestaña se recarga en silencio con la misma búsqueda y
    // página: un paciente registrado en otra sesión debe aparecer sin cerrar
    // la pestaña. El formulario abierto no se toca (su estado vive aparte).
    useAlReactivarPestana(() => { void loadPatients(searchTerm || undefined, currentPage, true) })

    const handleCreate = () => {
        setSelectedPatient(null)
        setShowForm(true)
    }

    // «Nuevo paciente» desde el inicio abre el alta (plan 28). Solo llega aquí
    // si la sesión tiene `patients.create`: el inicio no ofrece el botón sin él.
    useAtenderPedido('pacientes:nuevo', handleCreate)

    const handleEdit = (patient: Patient) => {
        setSelectedPatient(patient)
        setShowForm(true)
    }

    // «Agendar» abre la Agenda con «Nueva cita» y el paciente ya elegido.
    const handleAgendar = (patient: Patient) => {
        pedir('agenda:dia', {
            fecha: hoyLocalISO(),
            nueva: true,
            paciente: { id: patient.id, first_name: patient.first_name, last_name: patient.last_name, phone: patient.phone ?? undefined },
        })
        navigate('/secretaria/agenda')
    }

    const handleViewAppointments = (patient: Patient) => {
        const fullName = `${patient.first_name} ${patient.last_name}`
        // El pedido llega aunque la Agenda ya esté abierta en otra pestaña; la
        // URL queda para quien la copie (plan 28).
        pedir('agenda:paciente', { id: patient.id, nombre: fullName })
        navigate(`/secretaria/agenda?patient_id=${patient.id}&patient_name=${encodeURIComponent(fullName)}`)
    }

    // Un solo destino para todos los roles: el expediente, que ya enseña a
    // cada quien lo que le toca (plan 32, punto 6).
    const handleViewHistory = (patient: Patient) => navigate(rutaDelExpediente(patient.id))

    const handleSubmit = async (data: PatientCreate) => {
        // Note: errors propagate so PacienteForm can keep the modal open and show
        // the validation message. We only reach the success path when the save works.
        if (selectedPatient) {
            await updatePatient(selectedPatient.id, data)
            showSuccess('Paciente actualizado correctamente.')
        } else {
            await createPatient(data)
            showSuccess('Paciente registrado correctamente.')
        }
        await loadPatients(searchTerm, currentPage)
    }

    /**
     * S-06: si la persona resulta ser un paciente ya registrado, se abre su
     * expediente en el mismo formulario (pasa a modo edición) en vez de
     * duplicarla. Sólo se cambia si el servidor devolvió al paciente.
     */
    const elegirPacienteExistente = async (candidato: { patient_id: number; full_name: string }) => {
        try {
            const existente = await getPatient(candidato.patient_id)
            setSelectedPatient(existente)
        } catch (err: any) {
            showError(err?.message || 'No se pudo abrir el paciente seleccionado.')
        }
    }

    return (
        <>
            <EncabezadoPantalla
                titulo="Pacientes"
                descripcion="Busca, registra y consulta el expediente de tus pacientes"
                icono={cilPeople}
                acciones={
                    <>
                        <CButton color="light" onClick={handleCreate} data-tour="pacientes-nuevo">
                            <CIcon icon={cilPlus} className="me-2" />
                            Nuevo Paciente
                        </CButton>
                    </>
                }
            />
            <CRow>
                <CCol xs={12}>
                    <CCard className="mb-4 glass-card">
                        <CCardBody>
                            {/* Search bar */}
                            <CRow className="mb-3">
                                <CCol md={6} data-tour="pacientes-buscar">
                                    <CInputGroup>
                                        <CInputGroupText>
                                            <CIcon icon={cilSearch} />
                                        </CInputGroupText>
                                        <CFormInput
                                            placeholder="Buscar por nombre, teléfono o email..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </CInputGroup>
                                </CCol>
                                <CCol md={6} className="d-flex align-items-center mt-2 mt-md-0" data-tour="pacientes-incompletas">
                                    <CFormSwitch
                                        id="solo-fichas-incompletas"
                                        label="Fichas incompletas"
                                        title="Sólo los pacientes a las que les falta la fecha de nacimiento"
                                        checked={soloIncompletas}
                                        onChange={(e) => setSoloIncompletas(e.target.checked)}
                                    />
                                </CCol>
                            </CRow>

                            {/* Table */}
                            {loading ? (
                                <TableSkeleton rows={6} columns={6} />
                            ) : (
                                <TablaResponsiva striped hover responsive data-tour="pacientes-tabla">
                                    <CTableHead>
                                        <CTableRow>
                                            <CTableHeaderCell>Nombre</CTableHeaderCell>
                                            <CTableHeaderCell>Expediente</CTableHeaderCell>
                                            <CTableHeaderCell>Teléfono</CTableHeaderCell>
                                            <CTableHeaderCell>Edad</CTableHeaderCell>
                                            <CTableHeaderCell data-tarjeta="ocultar">Sucursal</CTableHeaderCell>
                                            <CTableHeaderCell><span className="visually-hidden">Acciones</span></CTableHeaderCell>
                                        </CTableRow>
                                    </CTableHead>
                                    <CTableBody>
                                        {patients.length === 0 ? (
                                            <CTableRow>
                                                <CTableDataCell colSpan={6} className="text-center text-muted py-4">
                                                    {errorCarga ? (
                                                        <span className="text-danger" role="alert">
                                                            No se pudo cargar la lista de pacientes. Esto no quiere
                                                            decir que no existan: no las registres de nuevo.{' '}
                                                            <CButton
                                                                color="link"
                                                                size="sm"
                                                                className="p-0 align-baseline"
                                                                onClick={() => void loadPatients(searchTerm || undefined, currentPage)}
                                                            >
                                                                Reintentar
                                                            </CButton>
                                                        </span>
                                                    ) : soloIncompletas && !searchTerm ? (
                                                        'Ningún paciente tiene la ficha incompleta.'
                                                    ) : searchTerm ? (
                                                        'No se encontraron pacientes'
                                                    ) : (
                                                        <>
                                                            <div className="mb-3">
                                                                Aún no hay pacientes registrados.
                                                            </div>
                                                            {/* U-03: un estado vacío con acción, no una calle sin salida. */}
                                                            <CButton color="primary" onClick={handleCreate}>
                                                                <CIcon icon={cilPlus} className="me-2" />
                                                                Nuevo Paciente
                                                            </CButton>
                                                        </>
                                                    )}
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : (
                                            patients.map((patient) => (
                                                <CTableRow key={patient.id}>
                                                    <CTableDataCell>
                                                        {patient.first_name} {patient.last_name}
                                                        <PuntoFichaIncompleta paciente={patient} />
                                                    </CTableDataCell>
                                                    <CTableDataCell>{patient.id}</CTableDataCell>
                                                    <CTableDataCell>{patient.cell_phone || patient.phone || '-'}</CTableDataCell>
                                                    {/* La edad se pinta desde el ayudante compartido: aquí vivía una
                                                        copia del cálculo que convertía la fecha faltante en "56 años". */}
                                                    <CTableDataCell>{formatEdad(patient.date_of_birth)}</CTableDataCell>
                                                    <CTableDataCell>
                                                        <CBadge color="light" className="text-dark fw-normal">
                                                            {tenantNames[patient.tenant_id] || `Suc ${patient.tenant_id}`}
                                                        </CBadge>
                                                    </CTableDataCell>
                                                    {/* Pacientes es el directorio (plan 32, punto 6): una sola
                                                        acción principal, el expediente, igual para todos los
                                                        roles; lo demás va en «⋯». */}
                                                    <CTableDataCell className="text-nowrap text-end">
                                                        <CButton
                                                            color="primary"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleViewHistory(patient)}
                                                            data-tour="pacientes-historial"
                                                            aria-label={`Abrir expediente de ${patient.first_name} ${patient.last_name}`}
                                                        >
                                                            <CIcon icon={cilNotes} className="me-1" aria-hidden="true" />
                                                            Abrir expediente
                                                        </CButton>
                                                        <CDropdown alignment="end" variant="btn-group" className="ms-1">
                                                            <CDropdownToggle
                                                                color="secondary"
                                                                variant="ghost"
                                                                size="sm"
                                                                caret={false}
                                                                data-tour="pacientes-mas"
                                                                aria-label={`Más acciones de ${patient.first_name} ${patient.last_name}`}
                                                            >
                                                                <CIcon icon={cilOptions} />
                                                            </CDropdownToggle>
                                                            <CDropdownMenu>
                                                                {can('patients.update') && (
                                                                    <CDropdownItem as="button" type="button" onClick={() => handleEdit(patient)}>
                                                                        Editar ficha
                                                                    </CDropdownItem>
                                                                )}
                                                                {can('appointments.create') && (
                                                                    <CDropdownItem as="button" type="button" onClick={() => handleAgendar(patient)}>
                                                                        Agendar
                                                                    </CDropdownItem>
                                                                )}
                                                                <CDropdownItem as="button" type="button" onClick={() => handleViewAppointments(patient)}>
                                                                    Ver sus citas
                                                                </CDropdownItem>
                                                            </CDropdownMenu>
                                                        </CDropdown>
                                                    </CTableDataCell>
                                                </CTableRow>
                                            ))
                                        )}
                                    </CTableBody>
                                </TablaResponsiva>
                            )}

                            {/* Pagination */}
                            {!loading && patients.length > 0 && (
                                <div className="d-flex justify-content-between align-items-center mt-3">
                                    <small className="text-muted">
                                        Página {currentPage} — {patients.length} pacientes
                                    </small>
                                    <CPagination size="sm" aria-label="Paginación de pacientes">
                                        <CPaginationItem
                                            disabled={currentPage <= 1}
                                            onClick={() => loadPatients(searchTerm || undefined, currentPage - 1)}
                                        >
                                            Anterior
                                        </CPaginationItem>
                                        <CPaginationItem active>{currentPage}</CPaginationItem>
                                        <CPaginationItem
                                            disabled={!hasMore}
                                            onClick={() => loadPatients(searchTerm || undefined, currentPage + 1)}
                                        >
                                            Siguiente
                                        </CPaginationItem>
                                    </CPagination>
                                </div>
                            )}

                        </CCardBody>
                    </CCard>
                </CCol>
            </CRow>

            {/* Patient Form Modal */}
            <PacienteForm
                visible={showForm}
                onClose={() => setShowForm(false)}
                onSubmit={handleSubmit}
                patient={selectedPatient}
                onElegirExistente={elegirPacienteExistente}
                title={selectedPatient ? 'Editar Paciente' : 'Nuevo Paciente'}
            />

        </>
    )
}

export default PacientesPage
