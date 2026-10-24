import React, { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CButton, CForm, CFormInput, CFormLabel, CSpinner, CAlert } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilLockLocked, cilCheckCircle } from '@coreui/icons'
import apiClient from '../../../shared/services/api'
import AuthLayout from './AuthLayout'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { CONTRASENA, estaVacio } from '../../../shared/utils/validacion'

const ResetPasswordPage = () => {
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token') || ''
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): sin globo del navegador.
    const [errores, setErrores] = useState<{ nueva?: string; confirmar?: string }>({})

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null)
        const faltas: typeof errores = {}
        if (estaVacio(newPassword)) faltas.nueva = CONTRASENA.nuevaFalta
        else if (newPassword.length < 8) faltas.nueva = CONTRASENA.corta
        if (estaVacio(confirmPassword)) faltas.confirmar = CONTRASENA.confirmarFalta
        else if (newPassword !== confirmPassword) faltas.confirmar = CONTRASENA.noCoinciden
        if (Object.keys(faltas).length > 0) { setErrores(faltas); return }
        setErrores({})
        setLoading(true)
        try {
            await apiClient.post('/auth/reset-password', { token, new_password: newPassword })
            setSuccess(true)
        } catch (err: any) {
            setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Error al restablecer. El enlace puede haber expirado.')
        } finally { setLoading(false) }
    }

    if (!token) {
        return (
            <AuthLayout title="Enlace Inválido" subtitle="Falta el token de recuperación." footer={<Link to="/forgot-password" className="acceso-pie-enlace">← Solicitar nuevo enlace</Link>}>
                <div className="text-center"><CIcon icon={cilLockLocked} size="xl" className="text-danger mb-3" /></div>
            </AuthLayout>
        )
    }

    return (
        <AuthLayout title={success ? 'Contraseña Actualizada' : 'Nueva Contraseña'} subtitle={success ? 'Ya puedes iniciar sesión.' : 'Crea una nueva contraseña para tu cuenta.'} footer={success ? <Link to="/login" className="acceso-pie-enlace">← Ir al inicio de sesión</Link> : undefined}>
            {error && <CAlert color="danger" className="py-2 small">{error}</CAlert>}
            {!success ? (
                <CForm onSubmit={handleSubmit} noValidate>
                    <div className="mb-3">
                        <CFormLabel style={{ color: '#374151', fontWeight: 500 }}>Nueva Contraseña</CFormLabel>
                        <CFormInput
                            type="password"
                            value={newPassword}
                            onChange={(e) => { setNewPassword(e.target.value); if (errores.nueva) setErrores((p) => ({ ...p, nueva: undefined })) }}
                            placeholder="Mínimo 8 caracteres"
                            required
                            disabled={loading}
                            invalid={Boolean(errores.nueva)}
                            aria-invalid={Boolean(errores.nueva) || undefined}
                            aria-describedby={errores.nueva ? 'error-rp-nueva' : undefined}
                        />
                        <ErrorDeCampo id="error-rp-nueva" mensaje={errores.nueva} />
                    </div>
                    <div className="mb-3">
                        <CFormLabel style={{ color: '#374151', fontWeight: 500 }}>Confirmar Contraseña</CFormLabel>
                        <CFormInput
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => { setConfirmPassword(e.target.value); if (errores.confirmar) setErrores((p) => ({ ...p, confirmar: undefined })) }}
                            placeholder="Repite la contraseña"
                            required
                            disabled={loading}
                            invalid={Boolean(errores.confirmar)}
                            aria-invalid={Boolean(errores.confirmar) || undefined}
                            aria-describedby={errores.confirmar ? 'error-rp-confirmar' : undefined}
                        />
                        <ErrorDeCampo id="error-rp-confirmar" mensaje={errores.confirmar} />
                    </div>
                    <div className="d-grid"><CButton type="submit" disabled={loading} className="acceso-boton">{loading ? <><CSpinner size="sm" className="me-2" /> Restableciendo...</> : 'Restablecer Contraseña'}</CButton></div>
                </CForm>
            ) : (
                <div className="text-center"><CIcon icon={cilCheckCircle} size="xl" className="text-success mb-3" /><Link to="/login" className="btn btn-primary" style={{ borderRadius: 8 }}>Iniciar Sesión</Link></div>
            )}
        </AuthLayout>
    )
}

export default ResetPasswordPage
