/**
 * Services catalog management page (Admin module - Fase 3.1/3.4)
 */
import React, { useEffect, useState } from 'react'
import {
    CBadge,
    CButton,
    CCard,
    CCardBody,
    CCol,
    CRow,
    CTableBody,
    CTableDataCell,
    CTableHead,
    CTableHeaderCell,
    CTableRow,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBan, cilPencil, cilPlus, cilMedicalCross } from '@coreui/icons'
import { useServices } from '../hooks/useServices'
import { ServiceForm } from '../components/ServiceForm'
import { useToast } from '../../../shared/components/ToastProvider'
import { TableSkeleton } from '../../../shared/components/TableSkeleton'
import type { Service, ServiceCreate, ServiceUpdate } from '../types'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { TablaResponsiva } from '../../../shared/components/TablaResponsiva'

const formatCurrency = (value: string) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value))

const ServicesPage: React.FC = () => {
    const { fetchServices, createService, updateService, deactivateService } = useServices()
    const { showSuccess, showError } = useToast()

    const [services, setServices] = useState<Service[]>([])
    const [loading, setLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [selectedService, setSelectedService] = useState<Service | null>(null)

    const [errorCarga, setErrorCarga] = useState<string | null>(null)

    const loadServices = async () => {
        try {
            setLoading(true)
            setErrorCarga(null)
            const data = await fetchServices(true)
            setServices(data)
        } catch (err) {
            console.error('Error loading services:', err)
            setServices([])
            setErrorCarga(err instanceof Error && err.message ? err.message : 'No se pudieron cargar los servicios.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadServices()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleCreate = () => {
        setSelectedService(null)
        setShowForm(true)
    }

    const handleEdit = (service: Service) => {
        setSelectedService(service)
        setShowForm(true)
    }

    const handleSubmit = async (data: ServiceCreate | ServiceUpdate) => {
        if (selectedService) {
            await updateService(selectedService.id, data as ServiceUpdate)
            showSuccess('Servicio actualizado correctamente.')
        } else {
            await createService(data as ServiceCreate)
            showSuccess('Servicio creado correctamente.')
        }
        await loadServices()
    }

    const handleDeactivate = async (service: Service) => {
        // Un servicio desactivado deja de ofrecerse al cobrar: no se hace de un toque.
        if (!window.confirm(`¿Desactivar «${service.name}»? Dejará de ofrecerse al cobrar.`)) return
        try {
            await deactivateService(service.id)
            showSuccess('Servicio desactivado.')
            await loadServices()
        } catch (err: any) {
            showError(err.message || 'No se pudo desactivar el servicio.')
        }
    }

    return (
        <>
            <EncabezadoPantalla
                titulo="Servicios"
                descripcion="Catálogo de servicios y precios de la clínica"
                icono={cilMedicalCross}
                acciones={
                    <>
                        <CButton color="light" onClick={handleCreate} data-tour="servicios-nuevo">
                            <CIcon icon={cilPlus} className="me-2" />
                            Nuevo Servicio
                        </CButton>
                    </>
                }
            />
            <CRow>
                <CCol xs={12}>
                    <CCard className="mb-4 glass-card">
                        <CCardBody>
                            {loading ? (
                                <TableSkeleton rows={5} columns={5} />
                            ) : (
                                <TablaResponsiva striped hover responsive data-tour="servicios-tabla">
                                    <CTableHead>
                                        <CTableRow>
                                            <CTableHeaderCell>Nombre</CTableHeaderCell>
                                            <CTableHeaderCell>Precio</CTableHeaderCell>
                                            <CTableHeaderCell>Duración</CTableHeaderCell>
                                            <CTableHeaderCell>Estado</CTableHeaderCell>
                                            <CTableHeaderCell>Acciones</CTableHeaderCell>
                                        </CTableRow>
                                    </CTableHead>
                                    <CTableBody>
                                        {errorCarga ? (
                                            // Un fallo no se ve como «no hay» (plan 29, T-1).
                                            <CTableRow>
                                                <CTableDataCell colSpan={5} className="text-center text-danger py-3" role="alert">
                                                    {errorCarga}{' '}
                                                    <CButton color="danger" variant="outline" size="sm" className="ms-2" onClick={() => void loadServices()}>
                                                        Reintentar
                                                    </CButton>
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : services.length === 0 ? (
                                            <CTableRow>
                                                <CTableDataCell colSpan={5} className="text-center text-muted">
                                                    No hay servicios registrados
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : (
                                            services.map((service) => (
                                                <CTableRow key={service.id}>
                                                    <CTableDataCell>{service.name}</CTableDataCell>
                                                    <CTableDataCell>{formatCurrency(service.price)}</CTableDataCell>
                                                    <CTableDataCell>
                                                        {service.duration_minutes ? `${service.duration_minutes} min` : '-'}
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        <CBadge color={service.is_active ? 'success' : 'secondary'}>
                                                            {service.is_active ? 'Activo' : 'Inactivo'}
                                                        </CBadge>
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        <CButton
                                                            color="info"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEdit(service)}
                                                            data-tour="servicios-editar"
                                                            title="Editar"
                                                        >
                                                            <CIcon icon={cilPencil} />
                                                        </CButton>
                                                        {service.is_active && (
                                                            <CButton
                                                                color="danger"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="ms-2"
                                                                onClick={() => handleDeactivate(service)}
                                                                data-tour="servicios-desactivar"
                                                                title="Desactivar"
                                                            >
                                                                <CIcon icon={cilBan} />
                                                            </CButton>
                                                        )}
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

            <ServiceForm
                visible={showForm}
                onClose={() => setShowForm(false)}
                onSubmit={handleSubmit}
                service={selectedService}
            />
        </>
    )
}

export default ServicesPage
