/**
 * Certificate Form Component — Professional medical certificate form.
 *
 * Features:
 * - Visual card selector for certificate type (sick leave / fitness / other)
 * - CIE-10 autocomplete removed — diagnosis is free text
 * - Incapacity days with large numeric input
 * - Observations field
 * - Preview + download PDF actions
 *
 * Tenía el bug gemelo del de la receta: leía el registro existente sólo en el
 * `useState` inicial —así que un certificado que llegaba asíncrono nunca se
 * pintaba— y decidía crear-vs-actualizar contra ese prop, de modo que dos
 * guardados en la misma sesión emitían dos certificados.
 */
import React, { useEffect, useState } from 'react'
import {
    CButton,
    CCard,
    CCardBody,
    CCardHeader,
    CCol,
    CForm,
    CFormInput,
    CFormTextarea,
    CRow,
    CSpinner,
    CBadge,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCloudDownload, cilMedicalCross, cilUser, cilDescription } from '@coreui/icons'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { useCambiosSinGuardar } from '../../../shared/tabs/cambiosSinGuardar'
import { useCertificates } from '../hooks/useCertificates'
import { CertificateType, type MedicalCertificate } from '../types'

interface CertificateFormProps {
    appointmentId: number
    patientId: number
    existingCertificate?: MedicalCertificate | null
    onSaved?: (certificate: MedicalCertificate) => void
    readOnly?: boolean
}

// Type config for visual cards
interface CertTypeConfig {
    value: CertificateType
    label: string
    icon: React.ReactNode
    description: string
    color: 'primary' | 'warning' | 'info'
}

const CERT_TYPES: CertTypeConfig[] = [
    {
        value: CertificateType.SICK_LEAVE,
        label: 'Incapacidad Laboral',
        icon: <CIcon icon={cilMedicalCross} size="xl" />,
        description: 'Justifica ausencia laboral por razones médicas',
        color: 'warning',
    },
    {
        value: CertificateType.FITNESS,
        label: 'Certificado de Aptitud',
        icon: <CIcon icon={cilUser} size="xl" />,
        description: 'Confirma que el paciente está apto para actividades',
        color: 'primary',
    },
    {
        value: CertificateType.OTHER,
        label: 'Otro Propósito',
        icon: <CIcon icon={cilDescription} size="xl" />,
        description: 'Certificado para otros fines médicos',
        color: 'info',
    },
]

export const CertificateForm: React.FC<CertificateFormProps> = ({
    appointmentId,
    patientId,
    existingCertificate,
    onSaved,
    readOnly = false,
}) => {
    const { loading, error, createCertificate, updateCertificate, downloadCertificatePDF } = useCertificates()
    const [saved, setSaved] = useState(false)
    // Errores junto al campo (`noValidate`): sin globo del navegador.
    const [errores, setErrores] = useState<{ diagnosis?: string; daysOff?: string }>({})
    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
    /**
     * Identidad interna del certificado emitido. Decidir crear-vs-actualizar
     * contra el prop no alcanza: el padre puede no haberse enterado todavía del
     * create y el segundo guardado emitiría un certificado duplicado.
     */
    const [certificadoId, setCertificadoId] = useState<number | null>(
        existingCertificate?.id ?? null,
    )
    const [formData, setFormData] = useState({
        certificate_type: existingCertificate?.certificate_type || CertificateType.SICK_LEAVE,
        diagnosis: existingCertificate?.diagnosis || '',
        diagnosis_code: '',
        days_off: existingCertificate?.days_off || 1,
        notes: existingCertificate?.notes || '',
    })

    /** Hay texto capturado que todavía no está en ningún certificado guardado. */
    const hayCambiosSinGuardar =
        !readOnly &&
        (existingCertificate && existingCertificate.id === certificadoId
            ? formData.certificate_type !== existingCertificate.certificate_type ||
              formData.diagnosis !== (existingCertificate.diagnosis || '') ||
              formData.notes !== (existingCertificate.notes || '')
            : formData.diagnosis.trim() !== '' || formData.notes.trim() !== '')

    useCambiosSinGuardar(hayCambiosSinGuardar, 'Certificado médico')

    /**
     * El certificado llega después del primer render, así que sin esto no se
     * pintaba nunca. Se dispara por el id del registro y no por la identidad del
     * objeto —en cada render le borraría a la doctora lo que está escribiendo— y
     * por lo mismo respeta una captura ya empezada.
     */
    useEffect(() => {
        if (!existingCertificate) return
        if (existingCertificate.id === certificadoId) return
        if (formData.diagnosis.trim() !== '' || formData.notes.trim() !== '') return
        setCertificadoId(existingCertificate.id)
        setFormData({
            certificate_type: existingCertificate.certificate_type,
            diagnosis: existingCertificate.diagnosis || '',
            diagnosis_code: '',
            days_off: existingCertificate.days_off || 1,
            notes: existingCertificate.notes || '',
        })
        setErrores({})
    }, [existingCertificate?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    /** Lo ya emitido se reconoce por el folio, no por el id crudo de base. */
    const certificadoEmitido =
        certificadoId !== null && existingCertificate?.id === certificadoId
            ? existingCertificate
            : null

    const handleChange = (field: string, value: string | number) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
        // El aviso se retira en cuanto se corrige ese campo.
        if (field === 'diagnosis') limpiarError('diagnosis')
        if (field === 'days_off') limpiarError('daysOff')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaved(false)

        // Se valida antes de llamar al servidor: con `noValidate` el navegador
        // ya no avisa y el 422 de vuelta caería lejos del campo. El diagnóstico
        // lo exige el servidor siempre; los días, sólo en incapacidad (allá
        // mayor que 0; aquí además el tope del campo: 365).
        const faltas: typeof errores = {}
        if (!formData.diagnosis.trim()) faltas.diagnosis = 'Escribe el diagnóstico.'
        if (
            formData.certificate_type === CertificateType.SICK_LEAVE &&
            (!Number.isInteger(formData.days_off) || formData.days_off < 1 || formData.days_off > 365)
        ) {
            faltas.daysOff = 'Indica entre 1 y 365 días de incapacidad.'
        }
        if (Object.keys(faltas).length > 0) {
            setErrores(faltas)
            return
        }
        setErrores({})

        let savedCertificate: MedicalCertificate | null = null

        const payload = {
            certificate_type: formData.certificate_type,
            diagnosis: formData.diagnosis,
            days_off:
                formData.certificate_type === CertificateType.SICK_LEAVE ? formData.days_off : undefined,
            notes: formData.notes || undefined,
        }

        if (certificadoId !== null) {
            savedCertificate = await updateCertificate(certificadoId, payload)
        } else {
            savedCertificate = await createCertificate({
                appointment_id: appointmentId,
                patient_id: patientId,
                ...payload,
            })
        }

        if (savedCertificate) {
            setCertificadoId(savedCertificate.id)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
            if (onSaved) onSaved(savedCertificate)
        }
    }

    return (
        <CCard data-tour="certificado-formulario">
            <CCardHeader className="d-flex justify-content-between align-items-center">
                <div className="d-flex flex-wrap align-items-center gap-2">
                    <strong>
                        {certificadoId !== null ? 'Editar' : 'Nuevo'} Certificado Médico
                    </strong>
                    {certificadoEmitido?.folio_number && (
                        <span className="small text-muted">
                            Folio {certificadoEmitido.folio_number}
                        </span>
                    )}
                </div>
                {saved && (
                    <CBadge color="success">✓ Guardado</CBadge>
                )}
            </CCardHeader>
            <CCardBody>
                {error && (
                    <div className="alert alert-danger mb-3" role="alert">
                        {error}
                    </div>
                )}

                <CForm onSubmit={handleSubmit} noValidate>
                    {/* ── Certificate Type — Visual Cards ────────────── */}
                    {/* En el teléfono las tres opciones van una debajo de otra: en
                        tres columnas de 85 px las palabras se partían a la mitad
                        («Incapaci-dad»). Son un grupo de opciones, no botones
                        sueltos: el lector de pantalla dice cuál está elegida. */}
                    <CRow
                        className="mb-4 g-2"
                        data-tour="certificado-tipo"
                        role="radiogroup"
                        aria-labelledby="certificado-tipo-titulo"
                    >
                        <CCol xs={12}>
                            <span className="form-label d-block" id="certificado-tipo-titulo">
                                <strong>Tipo de Certificado</strong>
                            </span>
                        </CCol>
                        {CERT_TYPES.map((type) => {
                            const isActive = formData.certificate_type === type.value
                            return (
                                <CCol xs={12} sm={4} key={type.value}>
                                    <div
                                        className={`d-flex d-sm-block align-items-center gap-2 text-sm-center p-2 p-sm-3 border rounded-3 ${
                                            isActive
                                                ? `border-${type.color} bg-${type.color} bg-opacity-10`
                                                : 'border-secondary-subtle'
                                        }`}
                                        style={{
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            transform: isActive ? 'scale(1.02)' : 'scale(1)',
                                        }}
                                        onClick={() => handleChange('certificate_type', type.value)}
                                        role="radio"
                                        aria-checked={isActive}
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                handleChange('certificate_type', type.value)
                                            }
                                        }}
                                    >
                                        <div className={`mb-sm-1 ${isActive ? `text-${type.color}` : 'text-muted'}`} aria-hidden="true">
                                            {type.icon}
                                        </div>
                                        <div className={`fw-semibold small ${isActive ? '' : 'text-muted'}`}>
                                            {type.label}
                                        </div>
                                    </div>
                                </CCol>
                            )
                        })}
                    </CRow>

                    {/* ── Diagnosis ──────────────────────────────────── */}
                    <CRow className="mb-3">
                        <CCol xs={12}>
                            <label htmlFor="diagnosis_cert" className="form-label">
                                <strong>Diagnóstico Completo</strong>
                            </label>
                            <CFormTextarea
                                id="diagnosis_cert"
                                className="gems-campo"
                                rows={3}
                                placeholder="Describe el diagnóstico que justifica el certificado..."
                                value={formData.diagnosis}
                                onChange={enMayusculas((valor) => handleChange('diagnosis', valor))}
                                disabled={readOnly}
                                invalid={Boolean(errores.diagnosis)}
                                aria-invalid={Boolean(errores.diagnosis) || undefined}
                                aria-describedby={errores.diagnosis ? 'error-certificado-diagnostico' : undefined}
                            />
                            <ErrorDeCampo id="error-certificado-diagnostico" mensaje={errores.diagnosis} />
                        </CCol>
                    </CRow>

                    {/* ── Days Off (only for sick leave) ─────────────── */}
                    {formData.certificate_type === CertificateType.SICK_LEAVE && (
                        <CRow className="mb-3">
                            <CCol xs={12} md={4}>
                                <label htmlFor="days_off" className="form-label">
                                    <strong>Días de Incapacidad</strong>
                                </label>
                                <CFormInput
                                    id="days_off"
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={formData.days_off}
                                    onChange={(e) => handleChange('days_off', parseInt(e.target.value) || 1)}
                                    disabled={readOnly}
                                    size="lg"
                                    className="gems-campo text-center fw-bold"
                                    style={{ fontSize: '1.5rem' }}
                                    invalid={Boolean(errores.daysOff)}
                                    aria-invalid={Boolean(errores.daysOff) || undefined}
                                    aria-describedby={errores.daysOff ? 'error-certificado-dias' : undefined}
                                />
                                <ErrorDeCampo id="error-certificado-dias" mensaje={errores.daysOff} />
                                <small className="text-muted">
                                    Número de días de reposo recomendados
                                </small>
                            </CCol>
                            <CCol xs={12} md={8} className="d-flex align-items-end pb-2">
                                <div className="alert alert-warning py-2 px-3 mb-0 w-100" role="alert">
                                    <CIcon icon={cilMedicalCross} className="me-2" />
                                    Se emitirá certificado por <strong>{formData.days_off} día(s)</strong> de incapacidad.
                                </div>
                            </CCol>
                        </CRow>
                    )}

                    {/* ── Notes ──────────────────────────────────────── */}
                    <CRow className="mb-3">
                        <CCol xs={12}>
                            <label htmlFor="notes_cert" className="form-label">
                                Observaciones (Opcional)
                            </label>
                            <CFormTextarea
                                id="notes_cert"
                                className="gems-campo"
                                rows={2}
                                placeholder="Recomendaciones, indicaciones adicionales..."
                                value={formData.notes}
                                onChange={enMayusculas((valor) => handleChange('notes', valor))}
                                disabled={readOnly}
                            />
                        </CCol>
                    </CRow>

                    {/* ── Info Box ────────────────────────────────────── */}
                    <div className={`alert ${
                        formData.certificate_type === CertificateType.SICK_LEAVE ? 'alert-warning' :
                        formData.certificate_type === CertificateType.FITNESS ? 'alert-primary' :
                        'alert-info'
                    }`} role="alert">
                        {formData.certificate_type === CertificateType.SICK_LEAVE && (
                            <p className="mb-0">
                                Este certificado justificará la ausencia del paciente por{' '}
                                <strong>{formData.days_off} día(s)</strong> a partir de la fecha de la consulta.
                            </p>
                        )}
                        {formData.certificate_type === CertificateType.FITNESS && (
                            <p className="mb-0">
                                El paciente queda apto para realizar sus actividades habituales.
                            </p>
                        )}
                        {formData.certificate_type === CertificateType.OTHER && (
                            <p className="mb-0">Certificado médico de propósito general.</p>
                        )}
                    </div>

                    {/* ── Action Buttons ──────────────────────────────── */}
                    <div className="d-grid gap-2 d-md-flex justify-content-md-end" data-tour="certificado-botones">
                        <CButton type="submit" color="primary" disabled={loading || readOnly}>
                            {loading && <CSpinner size="sm" className="me-2" />}
                            {certificadoId !== null ? 'Actualizar' : 'Generar'} Certificado
                        </CButton>
                        {certificadoId !== null && (
                            <CButton
                                color="secondary"
                                variant="outline"
                                onClick={() => downloadCertificatePDF(
                                    certificadoId,
                                    `${certificadoEmitido?.folio_number ?? `Certificado_${certificadoId}`}.pdf`,
                                )}
                                title="Descargar PDF"
                            >
                                <CIcon icon={cilCloudDownload} className="me-2" />
                                Descargar PDF
                            </CButton>
                        )}
                    </div>
                </CForm>
            </CCardBody>
        </CCard>
    )
}

export default CertificateForm
