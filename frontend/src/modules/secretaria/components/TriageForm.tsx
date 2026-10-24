/**
 * Triage Form Component
 */
import React, { useState, useEffect, useRef } from 'react'
import {
    CCloseButton,
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
    CInputGroup,
    CInputGroupText,
    CBadge,
} from '@coreui/react-pro'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { useTriage } from '../hooks/useTriage'
import { useCambiosDesdeQueAbrio, useCierreSeguro } from '../../../shared/hooks/useCierreSeguro'
import type { Triage, TriageCreate } from '../types'

/**
 * Topes que ya aplica el servidor (backend/app/schemas/triage.py). Con
 * `noValidate` el navegador ya no avisa de nada: el mensaje sale junto al
 * campo antes de mandar el dato, en vez de volver como un 422 del servidor.
 */
const RANGOS = {
    weight_kg: 'El peso debe ser mayor que 0 y máximo 300 kg.',
    height_cm: 'La talla debe ser mayor que 0 y máximo 250 cm.',
    blood_pressure_systolic: 'La presión sistólica debe estar entre 50 y 300.',
    blood_pressure_diastolic: 'La presión diastólica debe estar entre 30 y 200.',
    temperature_celsius: 'La temperatura debe estar entre 30 y 45 °C.',
} as const

interface TriageFormProps {
    visible: boolean
    onClose: () => void
    onSaved: () => void
    appointmentId: number
    existingTriage?: Triage | null
}

export const TriageForm: React.FC<TriageFormProps> = ({
    visible,
    onClose,
    onSaved,
    appointmentId,
    existingTriage,
}) => {
    const { createTriage, updateTriage } = useTriage()

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [bmi, setBmi] = useState<number | null>(null)
    // Errores junto al campo (`noValidate`): sin globo del navegador.
    const [errores, setErrores] = useState<{
        weight_kg?: string
        height_cm?: string
        blood_pressure_systolic?: string
        blood_pressure_diastolic?: string
        temperature_celsius?: string
    }>({})
    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))

    // Si cambió desde que se abrió, cerrar por accidente pregunta (plan 29, lote 8).
    const errorRef = useRef<HTMLDivElement>(null)
    const [formData, setFormData] = useState<Omit<TriageCreate, 'appointment_id'>>({
        weight_kg: undefined,
        height_cm: undefined,
        blood_pressure_systolic: undefined,
        blood_pressure_diastolic: undefined,
        temperature_celsius: undefined,
        chief_complaint: '',
        observations: '',
    })

    // Load existing triage data
    useEffect(() => {
        if (existingTriage) {
            setFormData({
                weight_kg: existingTriage.weight_kg,
                height_cm: existingTriage.height_cm,
                blood_pressure_systolic: existingTriage.blood_pressure_systolic,
                blood_pressure_diastolic: existingTriage.blood_pressure_diastolic,
                temperature_celsius: existingTriage.temperature_celsius,
                chief_complaint: existingTriage.chief_complaint || '',
                observations: existingTriage.observations || '',
            })
            setBmi(existingTriage.bmi || null)
        } else {
            // Reset form
            setFormData({
                weight_kg: undefined,
                height_cm: undefined,
                blood_pressure_systolic: undefined,
                blood_pressure_diastolic: undefined,
                temperature_celsius: undefined,
                chief_complaint: '',
                observations: '',
            })
            setBmi(null)
        }
        setError(null)
        setErrores({})
    }, [existingTriage, visible])

    const sucio = useCambiosDesdeQueAbrio(visible, formData, existingTriage?.id)
    const { propsModal, pedirCierre } = useCierreSeguro({ visible, sucio, onClose })

    // En el teléfono el error quedaba debajo del formulario: se lleva a la vista.
    useEffect(() => {
        if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' })
    }, [error])

    // Calculate BMI when weight or height changes
    useEffect(() => {
        if (formData.weight_kg && formData.height_cm) {
            const heightM = formData.height_cm / 100
            const calculatedBmi = formData.weight_kg / (heightM * heightM)
            setBmi(parseFloat(calculatedBmi.toFixed(1)))
        } else {
            setBmi(null)
        }
    }, [formData.weight_kg, formData.height_cm])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Signos fuera del rango que acepta el servidor: se dicen junto al
        // campo y no viajan (el 422 de vuelta llegaba al principio del modal).
        const faltas: typeof errores = {}
        if (formData.weight_kg != null && (formData.weight_kg <= 0 || formData.weight_kg > 300))
            faltas.weight_kg = RANGOS.weight_kg
        if (formData.height_cm != null && (formData.height_cm <= 0 || formData.height_cm > 250))
            faltas.height_cm = RANGOS.height_cm
        if (
            formData.blood_pressure_systolic != null &&
            (formData.blood_pressure_systolic < 50 || formData.blood_pressure_systolic > 300)
        )
            faltas.blood_pressure_systolic = RANGOS.blood_pressure_systolic
        if (
            formData.blood_pressure_diastolic != null &&
            (formData.blood_pressure_diastolic < 30 || formData.blood_pressure_diastolic > 200)
        )
            faltas.blood_pressure_diastolic = RANGOS.blood_pressure_diastolic
        if (
            formData.temperature_celsius != null &&
            (formData.temperature_celsius < 30 || formData.temperature_celsius > 45)
        )
            faltas.temperature_celsius = RANGOS.temperature_celsius
        if (Object.keys(faltas).length > 0) {
            setErrores(faltas)
            return
        }
        setErrores({})

        setLoading(true)
        setError(null)

        try {
            const triageData: TriageCreate = {
                ...formData,
                appointment_id: appointmentId,
            }

            if (existingTriage) {
                await updateTriage(existingTriage.id, formData)
            } else {
                await createTriage(triageData)
            }
            onSaved()
            onClose()
        } catch (err: any) {
            setError(err.message || 'Error al guardar triage')
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (field: keyof Omit<TriageCreate, 'appointment_id'>, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
        // El aviso se retira en cuanto se corrige ese campo.
        limpiarError(field as keyof typeof errores)
    }

    const getBmiInterpretation = (bmiValue: number): { label: string; color: string } => {
        if (bmiValue < 18.5) return { label: 'Bajo peso', color: 'warning' }
        if (bmiValue < 25) return { label: 'Normal', color: 'success' }
        if (bmiValue < 30) return { label: 'Sobrepeso', color: 'warning' }
        return { label: 'Obesidad', color: 'danger' }
    }

    return (
        <CModal visible={visible} onClose={onClose} size="lg" {...propsModal}>
            <CModalHeader closeButton={false}>
                <CModalTitle>{existingTriage ? 'Actualizar Triage' : 'Registrar Triage'}</CModalTitle>
                <BotonAyudaContextual recorridoId="signos-formulario" />
                <CCloseButton className="ms-auto" onClick={pedirCierre} aria-label="Cerrar" />
            </CModalHeader>
            <CForm onSubmit={handleSubmit} noValidate>
                <CModalBody data-tour="signos-formulario">
                    {error && (
                        <div className="alert alert-danger" role="alert" ref={errorRef}>
                            {error}
                        </div>
                    )}
                    <CRow className="mb-3" data-tour="signos-peso-talla">
                        <CCol md={6}>
                            <CFormLabel htmlFor="weight_kg">Peso (kg)</CFormLabel>
                            <CFormInput
                                className="gems-campo"
                                type="number"
                                inputMode="decimal"
                                enterKeyHint="next"
                                step="0.1"
                                id="weight_kg"
                                value={formData.weight_kg || ''}
                                onChange={(e) => handleChange('weight_kg', e.target.value ? parseFloat(e.target.value) : undefined)}
                                disabled={loading}
                                invalid={Boolean(errores.weight_kg)}
                                aria-invalid={Boolean(errores.weight_kg) || undefined}
                                aria-describedby={errores.weight_kg ? 'error-triage-peso' : undefined}
                            />
                            <ErrorDeCampo id="error-triage-peso" mensaje={errores.weight_kg} />
                        </CCol>
                        <CCol md={6}>
                            <CFormLabel htmlFor="height_cm">Talla (cm)</CFormLabel>
                            <CFormInput
                                className="gems-campo"
                                type="number"
                                inputMode="decimal"
                                enterKeyHint="next"
                                step="0.1"
                                id="height_cm"
                                value={formData.height_cm || ''}
                                onChange={(e) => handleChange('height_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                                disabled={loading}
                                invalid={Boolean(errores.height_cm)}
                                aria-invalid={Boolean(errores.height_cm) || undefined}
                                aria-describedby={errores.height_cm ? 'error-triage-talla' : undefined}
                            />
                            <ErrorDeCampo id="error-triage-talla" mensaje={errores.height_cm} />
                        </CCol>
                    </CRow>

                    {/* BMI Display */}
                    {bmi && (
                        <CRow className="mb-3">
                            <CCol>
                                <div className="alert alert-info">
                                    <strong>IMC: {bmi}</strong>
                                    <CBadge color={getBmiInterpretation(bmi).color} className="ms-2">
                                        {getBmiInterpretation(bmi).label}
                                    </CBadge>
                                </div>
                            </CCol>
                        </CRow>
                    )}

                    <CRow className="mb-3" data-tour="signos-presion">
                        <CCol md={6}>
                            <CFormLabel>Presión Arterial (mmHg)</CFormLabel>
                            <CInputGroup>
                                <CFormInput
                                    className="gems-campo"
                                    type="number"
                                    inputMode="numeric"
                                    enterKeyHint="next"
                                    aria-label="Presión sistólica (mmHg)"
                                    placeholder="Sistólica"
                                    value={formData.blood_pressure_systolic || ''}
                                    onChange={(e) =>
                                        handleChange('blood_pressure_systolic', e.target.value ? parseInt(e.target.value) : undefined)
                                    }
                                    disabled={loading}
                                    invalid={Boolean(errores.blood_pressure_systolic)}
                                    aria-invalid={Boolean(errores.blood_pressure_systolic) || undefined}
                                    aria-describedby={errores.blood_pressure_systolic ? 'error-triage-sistolica' : undefined}
                                />
                                <CInputGroupText>/</CInputGroupText>
                                <CFormInput
                                    className="gems-campo"
                                    type="number"
                                    inputMode="numeric"
                                    enterKeyHint="next"
                                    aria-label="Presión diastólica (mmHg)"
                                    placeholder="Diastólica"
                                    value={formData.blood_pressure_diastolic || ''}
                                    onChange={(e) =>
                                        handleChange('blood_pressure_diastolic', e.target.value ? parseInt(e.target.value) : undefined)
                                    }
                                    disabled={loading}
                                    invalid={Boolean(errores.blood_pressure_diastolic)}
                                    aria-invalid={Boolean(errores.blood_pressure_diastolic) || undefined}
                                    aria-describedby={errores.blood_pressure_diastolic ? 'error-triage-diastolica' : undefined}
                                />
                            </CInputGroup>
                            <ErrorDeCampo id="error-triage-sistolica" mensaje={errores.blood_pressure_systolic} />
                            <ErrorDeCampo id="error-triage-diastolica" mensaje={errores.blood_pressure_diastolic} />
                        </CCol>
                        <CCol md={6}>
                            <CFormLabel htmlFor="temperature_celsius">Temperatura (°C)</CFormLabel>
                            <CFormInput
                                className="gems-campo"
                                type="number"
                                inputMode="decimal"
                                enterKeyHint="next"
                                step="0.1"
                                id="temperature_celsius"
                                value={formData.temperature_celsius || ''}
                                onChange={(e) =>
                                    handleChange('temperature_celsius', e.target.value ? parseFloat(e.target.value) : undefined)
                                }
                                disabled={loading}
                                invalid={Boolean(errores.temperature_celsius)}
                                aria-invalid={Boolean(errores.temperature_celsius) || undefined}
                                aria-describedby={errores.temperature_celsius ? 'error-triage-temperatura' : undefined}
                            />
                            <ErrorDeCampo id="error-triage-temperatura" mensaje={errores.temperature_celsius} />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3" data-tour="signos-motivo">
                        <CCol>
                            <CFormLabel htmlFor="chief_complaint">Motivo de Consulta</CFormLabel>
                            <CFormTextarea
                                id="chief_complaint"
                                className="gems-campo"
                                rows={3}
                                value={formData.chief_complaint}
                                onChange={enMayusculas((valor) => handleChange('chief_complaint', valor))}
                                disabled={loading}
                            />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol>
                            <CFormLabel htmlFor="observations">Observaciones</CFormLabel>
                            <CFormTextarea
                                id="observations"
                                className="gems-campo"
                                rows={3}
                                value={formData.observations}
                                onChange={enMayusculas((valor) => handleChange('observations', valor))}
                                disabled={loading}
                            />
                        </CCol>
                    </CRow>

                </CModalBody>
                <CModalFooter>
                    <CButton color="secondary" onClick={pedirCierre} disabled={loading}>
                        Cancelar
                    </CButton>
                    <CButton color="primary" type="submit" disabled={loading} data-tour="signos-guardar">
                        {loading ? (
                            <>
                                <CSpinner size="sm" className="me-2" />
                                Guardando...
                            </>
                        ) : (
                            'Guardar Triage'
                        )}
                    </CButton>
                </CModalFooter>
            </CForm>
        </CModal>
    )
}
