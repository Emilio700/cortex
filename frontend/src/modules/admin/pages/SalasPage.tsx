/**
 * Gestión de salas (módulo Administración)
 *
 * Alta, edición y activación/desactivación de las salas físicas de la
 * sucursal activa. No se ofrece borrado: de una sala cuelgan citas, así que
 * el backend implementa desactivación lógica, igual que con las sucursales.
 *
 * Una sala desactivada deja de ofrecerse al agendar y deja de tener columna
 * en la agenda por salas, pero las citas viejas conservan su sala.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
    CAlert,
    CBadge,
    CButton,
    CCard,
    CCardBody,
    CCol,
    CRow,
    CTable,
    CTableBody,
    CTableDataCell,
    CTableHead,
    CTableHeaderCell,
    CTableRow,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBan, cilCheckCircle, cilPencil, cilPlus, cilRoom } from '@coreui/icons'
import { SalaForm } from '../components/SalaForm'
import { useToast } from '../../../shared/components/ToastProvider'
import { TableSkeleton } from '../../../shared/components/TableSkeleton'
import { createSala, listSalas, setSalaStatus, updateSala } from '../../../shared/services/salas'
import type { Sala, SalaPayload } from '../../../shared/services/salas'
import { colorDeSala } from '../../secretaria/utils/salas'
import { useAlReactivarPestana } from '../../../shared/tabs/useAlReactivarPestana'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const SalasPage: React.FC = () => {
    const { showSuccess, showError } = useToast()

    const [salas, setSalas] = useState<Sala[]>([])
    const [loading, setLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [selectedSala, setSelectedSala] = useState<Sala | null>(null)

    const [errorCarga, setErrorCarga] = useState<string | null>(null)

    const loadSalas = useCallback(async (silencioso = false) => {
        try {
            // En un regreso la tabla ya está a la vista: sin skeleton que la
            // borre; las salas se reemplazan al llegar la respuesta.
            if (!silencioso) setLoading(true)
            setErrorCarga(null)
            const data = await listSalas({ includeInactive: true })
            // El backend ya entrega display_order asc y luego name; se
            // conserva ese orden tal cual para no discrepar con la agenda.
            setSalas(data)
        } catch (err) {
            setSalas([])
            setErrorCarga(err instanceof Error ? err.message : 'No se pudieron cargar las salas.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadSalas()
    }, [loadSalas])

    // Al volver a la pestaña se recarga en silencio: las salas y su orden
    // pudieron cambiar desde otra sesión mientras ésta estaba en el fondo.
    useAlReactivarPestana(() => { void loadSalas(true) })

    const handleCreate = () => {
        setSelectedSala(null)
        setShowForm(true)
    }

    const handleEdit = (sala: Sala) => {
        setSelectedSala(sala)
        setShowForm(true)
    }

    const handleSubmit = async (data: SalaPayload) => {
        if (selectedSala) {
            await updateSala(selectedSala.id, data)
            showSuccess('Sala actualizada correctamente.')
        } else {
            await createSala(data)
            showSuccess('Sala creada correctamente.')
        }
        await loadSalas()
    }

    const handleToggleActive = async (sala: Sala) => {
        try {
            await setSalaStatus(sala.id, !sala.is_active)
            showSuccess(sala.is_active ? 'Sala desactivada.' : 'Sala activada.')
            await loadSalas()
        } catch (err) {
            showError(err instanceof Error ? err.message : 'No se pudo cambiar el estado de la sala.')
        }
    }

    const activas = salas.filter((sala) => sala.is_active)
    const ordenSugerido = salas.reduce((max, sala) => Math.max(max, sala.display_order ?? 0), 0) + 1

    return (
        <>
            <EncabezadoPantalla
                titulo="Salas"
                descripcion="Salas físicas de la sucursal: alta, edición y estado"
                icono={cilRoom}
                acciones={
                    <>
                        <CBadge color="light" className="text-dark px-3 py-2">
                            {activas.length} {activas.length === 1 ? 'sala activa' : 'salas activas'}
                        </CBadge>
                        <CButton color="light" onClick={handleCreate}>
                            <CIcon icon={cilPlus} className="me-2" />
                            Nueva Sala
                        </CButton>
                    </>
                }
            />

            {!loading && activas.length === 1 && (
                <CAlert color="info">
                    Esta sucursal tiene una sola sala: al agendar se asigna sola y no se pide
                    elegirla. En cuanto haya dos o más, la sala pasa a ser obligatoria.
                </CAlert>
            )}

            <CRow>
                <CCol xs={12}>
                    <CCard className="mb-4 glass-card">
                        <CCardBody>
                            {loading ? (
                                <TableSkeleton rows={4} columns={4} />
                            ) : (
                                <CTable striped hover responsive>
                                    <CTableHead>
                                        <CTableRow>
                                            <CTableHeaderCell>Orden</CTableHeaderCell>
                                            <CTableHeaderCell>Nombre</CTableHeaderCell>
                                            <CTableHeaderCell>Estado</CTableHeaderCell>
                                            <CTableHeaderCell>Acciones</CTableHeaderCell>
                                        </CTableRow>
                                    </CTableHead>
                                    <CTableBody>
                                        {errorCarga ? (
                                            // Un fallo no se ve como «no hay» (plan 29, T-1).
                                            <CTableRow>
                                                <CTableDataCell colSpan={4} className="text-center text-danger py-3" role="alert">
                                                    {errorCarga}{' '}
                                                    <CButton color="danger" variant="outline" size="sm" className="ms-2" onClick={() => void loadSalas()}>
                                                        Reintentar
                                                    </CButton>
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : salas.length === 0 ? (
                                            <CTableRow>
                                                <CTableDataCell colSpan={4} className="text-center text-muted">
                                                    Todavía no hay salas registradas en esta sucursal
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : (
                                            salas.map((sala) => (
                                                <CTableRow key={sala.id}>
                                                    <CTableDataCell>{sala.display_order}</CTableDataCell>
                                                    <CTableDataCell>
                                                        <span
                                                            className="d-inline-block rounded-circle me-2 align-middle"
                                                            style={{
                                                                width: 12,
                                                                height: 12,
                                                                backgroundColor: colorDeSala(sala.id, salas),
                                                            }}
                                                            aria-hidden="true"
                                                        />
                                                        {sala.name}
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        <CBadge color={sala.is_active ? 'success' : 'secondary'}>
                                                            {sala.is_active ? 'Activa' : 'Inactiva'}
                                                        </CBadge>
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        <CButton
                                                            color="info"
                                                            size="sm"
                                                            onClick={() => handleEdit(sala)}
                                                            title="Editar"
                                                        >
                                                            <CIcon icon={cilPencil} className="me-1" />
                                                            Editar
                                                        </CButton>
                                                        <CButton
                                                            color={sala.is_active ? 'danger' : 'success'}
                                                            size="sm"
                                                            className="ms-2"
                                                            onClick={() => handleToggleActive(sala)}
                                                            title={sala.is_active ? 'Desactivar' : 'Activar'}
                                                        >
                                                            <CIcon
                                                                icon={sala.is_active ? cilBan : cilCheckCircle}
                                                                className="me-1"
                                                            />
                                                            {sala.is_active ? 'Desactivar' : 'Activar'}
                                                        </CButton>
                                                    </CTableDataCell>
                                                </CTableRow>
                                            ))
                                        )}
                                    </CTableBody>
                                </CTable>
                            )}
                            <div className="small text-body-secondary mt-2">
                                Las salas no se borran: se desactivan, para no perder la sala de las
                                citas ya atendidas.
                            </div>
                        </CCardBody>
                    </CCard>
                </CCol>
            </CRow>

            <SalaForm
                visible={showForm}
                onClose={() => setShowForm(false)}
                onSubmit={handleSubmit}
                sala={selectedSala}
                ordenSugerido={ordenSugerido}
            />
        </>
    )
}

export default SalasPage
