import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { CButton, CForm, CFormInput, CFormLabel, CSpinner, CAlert } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCheckCircle } from '@coreui/icons'
import apiClient from '../../../shared/services/api'
import AuthLayout from './AuthLayout'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { CORREO, estaVacio, esCorreo } from '../../../shared/utils/validacion'

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [errorCampo, setErrorCampo] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (estaVacio(email)) { setErrorCampo(CORREO.falta); return }
        if (!esCorreo(email)) { setErrorCampo(CORREO.invalido); return }
        setErrorCampo(null)
        setLoading(true)
        try {
            await apiClient.post('/auth/forgot-password', { email })
            setSent(true)
        } catch {
            setError('Error al enviar el correo. Intenta de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout
            title={sent ? 'Correo Enviado' : 'Recuperar Contraseña'}
            subtitle={sent ? 'Revisa tu bandeja de entrada y sigue el enlace.' : 'Te enviaremos un enlace para restablecer tu contraseña.'}
            footer={<Link to="/login" className="acceso-pie-enlace">← Volver al inicio de sesión</Link>}
        >
            {error && <CAlert color="danger" className="py-2 small">{error}</CAlert>}
            {!sent ? (
                <CForm onSubmit={handleSubmit} noValidate>
                    <div className="mb-3">
                        <CFormLabel style={{ color: '#374151', fontWeight: 500 }}>Correo Electrónico</CFormLabel>
                        <CFormInput
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); if (errorCampo) setErrorCampo(null) }}
                            placeholder="tu@email.com"
                            required
                            disabled={loading}
                            invalid={Boolean(errorCampo)}
                            aria-invalid={Boolean(errorCampo) || undefined}
                            aria-describedby={errorCampo ? 'error-correo-recuperar' : undefined}
                        />
                        <ErrorDeCampo id="error-correo-recuperar" mensaje={errorCampo} />
                    </div>
                    <div className="d-grid">
                        <CButton type="submit" disabled={loading} className="acceso-boton">
                            {loading ? <><CSpinner size="sm" className="me-2" /> Enviando...</> : 'Enviar Enlace'}
                        </CButton>
                    </div>
                </CForm>
            ) : (
                <div className="text-center">
                    <CIcon icon={cilCheckCircle} size="xl" className="text-success mb-3" />
                    <p className="text-muted small">Si el correo está registrado, recibirás un enlace en los próximos minutos.</p>
                    <Link to="/login" className="btn btn-primary mt-2" style={{ borderRadius: 8 }}>Ir al inicio de sesión</Link>
                </div>
            )}
        </AuthLayout>
    )
}

export default ForgotPasswordPage
