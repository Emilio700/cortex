/**
 * Service create/edit form (Admin module - Fase 3.4)
 */
import React, { useEffect, useState } from 'react'
import {
    CButton,
    CCol,
    CForm,
    CFormInput,
    CFormLabel,
    CFormTextarea,
    CModal,
    CModalBody,
    CModalFooter,
    CModalHeader,
    CModalTitle,
    CRow,
    CSpinner,
} from '@coreui/react-pro'
import type { Service, ServiceCreate, ServiceUpdate } from '../types'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { estaVacio } from '../../../shared/utils/validacion'

interface ServiceFormProps {
    visible: boolean
    onClose: () => void
    onSubmit: (data: ServiceCreate | ServiceUpdate) => Promise<void>
    service?: Service | null
}

export const ServiceForm: React.FC<ServiceFormProps> = ({ visible, onClose, onSubmit, service }) => {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [durationMinutes, setDurationMinutes] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): el navegador ya no enseña su globo.
    const [errores, setErrores] = useState<{ name?: string; price?: string; duration_minutes?: string }>({})

    useEffect(() => {
        if (service) {
            setName(service.name)
            setDescription(service.description || '')
            setPrice(service.price)
            setDurationMinutes(service.duration_minutes ? String(service.duration_minutes) : '')
        } else {
            setName('')
            setDescription('')
            setPrice('')
            setDurationMinutes('')
        }
        setError(null)
        setErrores({})
    }, [service, visible])

    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Se valida antes de mandar nada: el precio no puede ser negativo y la
        // duración (si se escribe) tiene que ser positiva, como pide el servidor.
        const faltas: typeof errores = {}
        if (estaVacio(name)) faltas.name = 'Escribe el nombre.'
        if (estaVacio(price)) faltas.price = 'Escribe el precio.'
        else if (Number(price) < 0) faltas.price = 'El precio no puede ser negativo.'
        if (durationMinutes) {
            const duracion = Number(durationMinutes)
            if (!Number.isInteger(duracion)) faltas.duration_minutes = 'Escribe la duración en minutos completos.'
            else if (duracion <= 0) faltas.duration_minutes = 'La duración debe ser mayor a 0.'
        }
        if (Object.keys(faltas).length > 0) {
            setErrores(faltas)
            return
        }
        setErrores({})

        setLoading(true)
        setError(null)

        try {
            await onSubmit({
                name,
                description: description || undefined,
                price,
                duration_minutes: durationMinutes ? Number(durationMinutes) : undefined,
            })
            onClose()
        } catch (err: any) {
            setError(err.message || 'Error al guardar servicio')
        } finally {
            setLoading(false)
        }
    }

    return (
        <CModal visible={visible} onClose={onClose}>
            <CModalHeader>
                <CModalTitle>{service ? 'Editar Servicio' : 'Nuevo Servicio'}</CModalTitle>
            </CModalHeader>
            <CForm onSubmit={handleSubmit} noValidate>
                <CModalBody>
                    <CRow className="mb-3">
                        <CCol>
                            <CFormLabel htmlFor="name">
                                Nombre <span className="text-danger">*</span>
                            </CFormLabel>
                            <CFormInput
                                id="name"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value)
                                    limpiarError('name')
                                }}
                                required
                                disabled={loading}
                                invalid={Boolean(errores.name)}
                                aria-invalid={Boolean(errores.name) || undefined}
                                aria-describedby={errores.name ? 'error-servicio-nombre' : undefined}
                            />
                            <ErrorDeCampo id="error-servicio-nombre" mensaje={errores.name} />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol md={6}>
                            <CFormLabel htmlFor="price">
                                Precio <span className="text-danger">*</span>
                            </CFormLabel>
                            <CFormInput
                                id="price"
                                type="number"
                                step="0.01"
                                min="0"
                                value={price}
                                onChange={(e) => {
                                    setPrice(e.target.value)
                                    limpiarError('price')
                                }}
                                required
                                disabled={loading}
                                invalid={Boolean(errores.price)}
                                aria-invalid={Boolean(errores.price) || undefined}
                                aria-describedby={errores.price ? 'error-servicio-precio' : undefined}
                            />
                            <ErrorDeCampo id="error-servicio-precio" mensaje={errores.price} />
                        </CCol>
                        <CCol md={6}>
                            <CFormLabel htmlFor="duration_minutes">Duración (minutos)</CFormLabel>
                            <CFormInput
                                id="duration_minutes"
                                type="number"
                                min="1"
                                value={durationMinutes}
                                onChange={(e) => {
                                    setDurationMinutes(e.target.value)
                                    limpiarError('duration_minutes')
                                }}
                                disabled={loading}
                                invalid={Boolean(errores.duration_minutes)}
                                aria-invalid={Boolean(errores.duration_minutes) || undefined}
                                aria-describedby={errores.duration_minutes ? 'error-servicio-duracion' : undefined}
                            />
                            <ErrorDeCampo id="error-servicio-duracion" mensaje={errores.duration_minutes} />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol>
                            <CFormLabel htmlFor="description">Descripción</CFormLabel>
                            <CFormTextarea
                                id="description"
                                rows={3}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={loading}
                            />
                        </CCol>
                    </CRow>

                    {error && <div className="alert alert-danger">{error}</div>}
                </CModalBody>
                <CModalFooter>
                    <CButton color="secondary" onClick={onClose} disabled={loading}>
                        Cancelar
                    </CButton>
                    <CButton color="primary" type="submit" disabled={loading}>
                        {loading ? (
                            <>
                                <CSpinner size="sm" className="me-2" />
                                Guardando...
                            </>
                        ) : (
                            'Guardar'
                        )}
                    </CButton>
                </CModalFooter>
            </CForm>
        </CModal>
    )
}

export default ServiceForm
