/**
 * Gestión de sucursales (módulo Master)
 *
 * Alta, edición y activación/desactivación de sucursales. No se ofrece
 * borrado: de una sucursal cuelgan pacientes e historial clínico, por lo que
 * el backend implementa desactivación lógica.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
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
import { cilBan, cilCheckCircle, cilPencil, cilPlus, cilBuilding } from '@coreui/icons'
import { TenantForm } from '../components/TenantForm'
import { useToast } from '../../../shared/components/ToastProvider'
import { TableSkeleton } from '../../../shared/components/TableSkeleton'
import { createTenant, listTenants, setTenantStatus, updateTenant } from '../../../shared/services/tenants'
import type { Tenant, TenantPayload } from '../../../shared/services/tenants'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const TenantsPage: React.FC = () => {
    const { showSuccess, showError } = useToast()

    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loading, setLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)

    // Un fallo no se ve como «No hay sucursales» (plan 29, T-1).
    const [errorCarga, setErrorCarga] = useState<string | null>(null)

    const loadTenants = useCallback(async () => {
        try {
            setLoading(true)
            setErrorCarga(null)
            setTenants(await listTenants(true))
        } catch (err) {
            setTenants([])
            setErrorCarga(err instanceof Error ? err.message : 'No se pudieron cargar las sucursales.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadTenants()
    }, [loadTenants])

    const handleCreate = () => {
        setSelectedTenant(null)
        setShowForm(true)
    }

    const handleEdit = (tenant: Tenant) => {
        setSelectedTenant(tenant)
        setShowForm(true)
    }

    const handleSubmit = async (data: TenantPayload) => {
        if (selectedTenant) {
            await updateTenant(selectedTenant.id, data)
            showSuccess('Sucursal actualizada correctamente.')
        } else {
            await createTenant(data)
            showSuccess('Sucursal creada correctamente.')
        }
        await loadTenants()
    }

    const handleToggleActive = async (tenant: Tenant) => {
        try {
            await setTenantStatus(tenant.id, !tenant.is_active)
            showSuccess(tenant.is_active ? 'Sucursal desactivada.' : 'Sucursal activada.')
            await loadTenants()
        } catch (err) {
            showError(
                err instanceof Error ? err.message : 'No se pudo cambiar el estado de la sucursal.',
            )
        }
    }

    // El máximo de sucursales activas lo define y lo aplica el backend
    // (MAX_TENANTS): aquí sólo se cuenta lo que hay, nunca el tope. Si se
    // excede, el backend responde 400 y ese mensaje se muestra en el formulario.
    const activeCount = tenants.filter((tenant) => tenant.is_active).length

    return (
        <>
            <EncabezadoPantalla
                titulo="Gestión de Sucursales"
                descripcion="Alta, edición y estado de las sucursales de la clínica"
                icono={cilBuilding}
                padre={{ nombre: 'Panel de Desarrollador', ruta: '/master' }}
                acciones={
                    <>
                        <CBadge color="light" className="text-dark px-3 py-2">
                            {activeCount} {activeCount === 1 ? 'sucursal activa' : 'sucursales activas'}
                        </CBadge>
                        <CButton color="light" onClick={handleCreate} data-tour="sucursales-nueva">
                            <CIcon icon={cilPlus} className="me-2" />
                            Nueva Sucursal
                        </CButton>
                    </>
                }
            />
            <CRow>
                <CCol xs={12}>
                    <CCard className="mb-4 glass-card">
                        <CCardBody>
                            {loading ? (
                                <TableSkeleton rows={5} columns={6} />
                            ) : (
                                <CTable striped hover responsive data-tour="sucursales-tabla">
                                    <CTableHead>
                                        <CTableRow>
                                            <CTableHeaderCell>Nombre</CTableHeaderCell>
                                            <CTableHeaderCell>Dirección</CTableHeaderCell>
                                            <CTableHeaderCell>Teléfono</CTableHeaderCell>
                                            <CTableHeaderCell>Correo</CTableHeaderCell>
                                            <CTableHeaderCell>Estado</CTableHeaderCell>
                                            <CTableHeaderCell>Acciones</CTableHeaderCell>
                                        </CTableRow>
                                    </CTableHead>
                                    <CTableBody>
                                        {errorCarga ? (
                                            <CTableRow>
                                                <CTableDataCell colSpan={6} className="text-center text-danger py-3" role="alert">
                                                    {errorCarga}{' '}
                                                    <CButton color="danger" variant="outline" size="sm" className="ms-2" onClick={() => void loadTenants()}>
                                                        Reintentar
                                                    </CButton>
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : tenants.length === 0 ? (
                                            <CTableRow>
                                                <CTableDataCell colSpan={6} className="text-center text-muted">
                                                    No hay sucursales registradas
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : (
                                            tenants.map((tenant) => (
                                                <CTableRow key={tenant.id}>
                                                    <CTableDataCell>
                                                        {tenant.name}
                                                        {tenant.codigo_folio && (
                                                            <CBadge color="light" textColor="dark" className="ms-2" title="Código para folios">
                                                                {tenant.codigo_folio}
                                                            </CBadge>
                                                        )}
                                                    </CTableDataCell>
                                                    <CTableDataCell>{tenant.address || '-'}</CTableDataCell>
                                                    <CTableDataCell>{tenant.phone || '-'}</CTableDataCell>
                                                    <CTableDataCell>{tenant.email || '-'}</CTableDataCell>
                                                    <CTableDataCell>
                                                        <CBadge color={tenant.is_active ? 'success' : 'secondary'}>
                                                            {tenant.is_active ? 'Activa' : 'Inactiva'}
                                                        </CBadge>
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        <CButton
                                                            color="info"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEdit(tenant)}
                                                            title="Editar"
                                                        >
                                                            <CIcon icon={cilPencil} />
                                                        </CButton>
                                                        <CButton
                                                            color={tenant.is_active ? 'danger' : 'success'}
                                                            variant="ghost"
                                                            size="sm"
                                                            className="ms-2"
                                                            onClick={() => handleToggleActive(tenant)}
                                                            data-tour="sucursales-activar"
                                                            title={tenant.is_active ? 'Desactivar' : 'Activar'}
                                                        >
                                                            <CIcon icon={tenant.is_active ? cilBan : cilCheckCircle} />
                                                        </CButton>
                                                    </CTableDataCell>
                                                </CTableRow>
                                            ))
                                        )}
                                    </CTableBody>
                                </CTable>
                            )}
                        </CCardBody>
                    </CCard>
                </CCol>
            </CRow>

            <TenantForm
                visible={showForm}
                onClose={() => setShowForm(false)}
                onSubmit={handleSubmit}
                tenant={selectedTenant}
            />
        </>
    )
}

export default TenantsPage
