/**
 * Alta y edición de sucursales (módulo Master)
 */
import React, { useEffect, useState } from 'react'
import {
    CButton,
    CCol,
    CForm,
    CFormInput,
    CFormLabel,
    CModal,
    CModalBody,
    CModalFooter,
    CModalHeader,
    CModalTitle,
    CRow,
    CSpinner,
} from '@coreui/react-pro'
import type { Tenant, TenantPayload } from '../../../shared/services/tenants'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { CORREO, esCorreo, estaVacio } from '../../../shared/utils/validacion'

interface TenantFormProps {
    visible: boolean
    onClose: () => void
    onSubmit: (data: TenantPayload) => Promise<void>
    tenant?: Tenant | null
}

export const TenantForm: React.FC<TenantFormProps> = ({ visible, onClose, onSubmit, tenant }) => {
    const [name, setName] = useState('')
    const [address, setAddress] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [codigo, setCodigo] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): el navegador ya no enseña su globo.
    const [errores, setErrores] = useState<{ name?: string; email?: string; codigo?: string }>({})

    useEffect(() => {
        setName(tenant?.name || '')
        setAddress(tenant?.address || '')
        setPhone(tenant?.phone || '')
        setEmail(tenant?.email || '')
        setCodigo(tenant?.codigo_folio || '')
        setError(null)
        setErrores({})
    }, [tenant, visible])

    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Se valida antes de mandar nada: el servidor exige el nombre de al
        // menos 3 caracteres y un correo con forma válida si se escribe.
        const faltas: typeof errores = {}
        const nombre = name.trim()
        if (estaVacio(nombre)) faltas.name = 'Escribe el nombre.'
        else if (nombre.length < 3) faltas.name = 'El nombre debe tener al menos 3 caracteres.'
        const correo = email.trim()
        if (!estaVacio(correo) && !esCorreo(correo)) faltas.email = CORREO.invalido
        const codigoFolio = codigo.trim().toUpperCase()
        if (!estaVacio(codigoFolio) && !/^[A-Z]{2,5}$/.test(codigoFolio)) {
            faltas.codigo = 'De 2 a 5 letras, sin acentos ni números (p. ej. GYG).'
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
                name: name.trim(),
                address: address.trim() || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                codigo_folio: codigoFolio || null,
            })
            onClose()
        } catch (err) {
            // El backend devuelve el motivo en español (por ejemplo al superar
            // el máximo de sucursales activas o si el nombre ya existe); se
            // muestra tal cual, sin duplicar la regla en el frontend.
            setError(err instanceof Error ? err.message : 'No se pudo guardar la sucursal.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <CModal visible={visible} onClose={onClose}>
            <CModalHeader>
                <CModalTitle>{tenant ? 'Editar Sucursal' : 'Nueva Sucursal'}</CModalTitle>
            </CModalHeader>
            <CForm onSubmit={handleSubmit} noValidate>
                <CModalBody>
                    <CRow className="mb-3">
                        <CCol>
                            <CFormLabel htmlFor="tenant-name">
                                Nombre <span className="text-danger">*</span>
                            </CFormLabel>
                            <CFormInput
                                id="tenant-name"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value)
                                    limpiarError('name')
                                }}
                                minLength={3}
                                maxLength={200}
                                required
                                disabled={loading}
                                invalid={Boolean(errores.name)}
                                aria-invalid={Boolean(errores.name) || undefined}
                                aria-describedby={errores.name ? 'error-tenant-nombre' : undefined}
                            />
                            <ErrorDeCampo id="error-tenant-nombre" mensaje={errores.name} />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol>
                            <CFormLabel htmlFor="tenant-address">Dirección</CFormLabel>
                            <CFormInput
                                id="tenant-address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                maxLength={500}
                                disabled={loading}
                            />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol md={6}>
                            <CFormLabel htmlFor="tenant-phone">Teléfono</CFormLabel>
                            <CFormInput
                                id="tenant-phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                maxLength={20}
                                disabled={loading}
                            />
                        </CCol>
                        <CCol md={6}>
                            <CFormLabel htmlFor="tenant-email">Correo</CFormLabel>
                            <CFormInput
                                id="tenant-email"
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value)
                                    limpiarError('email')
                                }}
                                maxLength={100}
                                disabled={loading}
                                invalid={Boolean(errores.email)}
                                aria-invalid={Boolean(errores.email) || undefined}
                                aria-describedby={errores.email ? 'error-tenant-correo' : undefined}
                            />
                            <ErrorDeCampo id="error-tenant-correo" mensaje={errores.email} />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol md={6}>
                            <CFormLabel htmlFor="tenant-codigo">Código para folios</CFormLabel>
                            <CFormInput
                                id="tenant-codigo"
                                value={codigo}
                                onChange={(e) => {
                                    setCodigo(e.target.value.toUpperCase())
                                    limpiarError('codigo')
                                }}
                                maxLength={5}
                                placeholder="GYG"
                                disabled={loading}
                                invalid={Boolean(errores.codigo)}
                                aria-invalid={Boolean(errores.codigo) || undefined}
                                aria-describedby={errores.codigo ? 'error-tenant-codigo' : 'ayuda-tenant-codigo'}
                            />
                            <ErrorDeCampo id="error-tenant-codigo" mensaje={errores.codigo} />
                            {!errores.codigo && (
                                <div id="ayuda-tenant-codigo" className="form-text">
                                    Va al inicio de cada folio: GYG-REC-2026-0042. Cambiarlo no renumera lo ya emitido.
                                </div>
                            )}
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

export default TenantForm
