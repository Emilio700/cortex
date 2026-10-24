/**
 * Alta y edición de salas (módulo Administración)
 *
 * Mismo patrón que `TenantForm`: un modal corto, el error del backend tal
 * como viene (ya está redactado en español) y nada de reglas duplicadas.
 */
import React, { useEffect, useState } from 'react'
import {
    CButton,
    CCol,
    CForm,
    CFormInput,
    CFormLabel,
    CFormText,
    CModal,
    CModalBody,
    CModalFooter,
    CModalHeader,
    CModalTitle,
    CRow,
    CSpinner,
} from '@coreui/react-pro'
import type { Sala, SalaPayload } from '../../../shared/services/salas'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { estaVacio } from '../../../shared/utils/validacion'

interface SalaFormProps {
    visible: boolean
    onClose: () => void
    onSubmit: (data: SalaPayload) => Promise<void>
    sala?: Sala | null
    /** Orden sugerido para una sala nueva: la última de la lista más uno. */
    ordenSugerido?: number
}

export const SalaForm: React.FC<SalaFormProps> = ({
    visible,
    onClose,
    onSubmit,
    sala,
    ordenSugerido = 1,
}) => {
    const [nombre, setNombre] = useState('')
    const [orden, setOrden] = useState('1')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): el navegador ya no enseña su globo.
    const [errores, setErrores] = useState<{ nombre?: string; orden?: string }>({})

    useEffect(() => {
        setNombre(sala?.name || '')
        setOrden(String(sala?.display_order ?? ordenSugerido))
        setError(null)
        setErrores({})
    }, [sala, visible, ordenSugerido])

    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Se valida antes de mandar nada: el globo del navegador ya no lo hace
        // (`noValidate`) y estos topes son los mismos que tenía el campo.
        const faltas: typeof errores = {}
        if (estaVacio(nombre)) faltas.nombre = 'Escribe el nombre.'
        if (orden.trim() !== '') {
            const posicion = Number(orden)
            if (!Number.isInteger(posicion) || posicion < 1 || posicion > 99) {
                faltas.orden = 'Escribe un número entre 1 y 99.'
            }
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
                name: nombre.trim(),
                display_order: Number(orden) || 1,
            })
            onClose()
        } catch (err) {
            // El backend explica el motivo en español (nombre repetido dentro
            // de la sucursal, permisos, etc.); se muestra tal cual.
            setError(err instanceof Error ? err.message : 'No se pudo guardar la sala.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <CModal visible={visible} onClose={onClose}>
            <CModalHeader>
                <CModalTitle>{sala ? 'Editar Sala' : 'Nueva Sala'}</CModalTitle>
            </CModalHeader>
            <CForm onSubmit={handleSubmit} noValidate>
                <CModalBody>
                    <CRow className="mb-3">
                        <CCol>
                            <CFormLabel htmlFor="sala-nombre">
                                Nombre <span className="text-danger">*</span>
                            </CFormLabel>
                            <CFormInput
                                id="sala-nombre"
                                className="gems-campo"
                                value={nombre}
                                onChange={(e) => {
                                    setNombre(e.target.value)
                                    limpiarError('nombre')
                                }}
                                minLength={1}
                                maxLength={100}
                                required
                                disabled={loading}
                                invalid={Boolean(errores.nombre)}
                                aria-invalid={Boolean(errores.nombre) || undefined}
                                aria-describedby={errores.nombre ? 'error-sala-nombre' : undefined}
                            />
                            <ErrorDeCampo id="error-sala-nombre" mensaje={errores.nombre} />
                            <CFormText>Como se llama la sala dentro del consultorio.</CFormText>
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol md={6}>
                            <CFormLabel htmlFor="sala-orden">Orden</CFormLabel>
                            <CFormInput
                                id="sala-orden"
                                className="gems-campo"
                                type="number"
                                min={1}
                                max={99}
                                value={orden}
                                onChange={(e) => {
                                    setOrden(e.target.value)
                                    limpiarError('orden')
                                }}
                                disabled={loading}
                                invalid={Boolean(errores.orden)}
                                aria-invalid={Boolean(errores.orden) || undefined}
                                aria-describedby={errores.orden ? 'error-sala-orden' : undefined}
                            />
                            <ErrorDeCampo id="error-sala-orden" mensaje={errores.orden} />
                            <CFormText>Posición de la columna en la agenda por salas.</CFormText>
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

export default SalaForm
