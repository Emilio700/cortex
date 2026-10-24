import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CButton, CForm, CFormInput, CFormLabel, CSpinner, CAlert } from '@coreui/react-pro'
import { useAuth } from '../../../shared/context/AuthContext'
import apiClient from '../../../shared/services/api'
import AuthLayout from './AuthLayout'
import { rutaDeInicio } from '../../../shared/utils/inicio'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { CONTRASENA, estaVacio } from '../../../shared/utils/validacion'


const ForceChangePasswordPage = () => {
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): sin globo del navegador.
    const [errores, setErrores] = useState<{ actual?: string; nueva?: string; confirmar?: string }>({})
    const navigate = useNavigate()
    const { user } = useAuth()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null)
        const faltas: typeof errores = {}
        if (estaVacio(currentPassword)) faltas.actual = CONTRASENA.actualFalta
        if (estaVacio(newPassword)) faltas.nueva = CONTRASENA.nuevaFalta
        else if (newPassword.length < 8) faltas.nueva = CONTRASENA.corta
        if (estaVacio(confirmPassword)) faltas.confirmar = CONTRASENA.confirmarFalta
        else if (newPassword !== confirmPassword) faltas.confirmar = CONTRASENA.noCoinciden
        if (Object.keys(faltas).length > 0) { setErrores(faltas); return }
        setErrores({})
        setLoading(true)
        try {
            await apiClient.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword })
            navigate(rutaDeInicio(user?.role))
        } catch (err: any) {
            const d = err.response?.data?.detail
            setError(typeof d === 'string' ? d : (Array.isArray(d) ? d[0]?.msg : 'Error al cambiar la contraseña'))
        } finally { setLoading(false) }
    }

    return (
        <AuthLayout title="Cambio de Contraseña Obligatorio" subtitle="Por seguridad, debes cambiar tu contraseña antes de continuar.">
            {error && <CAlert color="danger" className="py-2 small">{error}</CAlert>}
            <CForm onSubmit={handleSubmit} noValidate>
                <div className="mb-3">
                    <CFormLabel style={{ color: '#374151', fontWeight: 500 }}>Contraseña Actual</CFormLabel>
                    <CFormInput
                        type="password"
                        value={currentPassword}
                        onChange={(e) => { setCurrentPassword(e.target.value); if (errores.actual) setErrores((p) => ({ ...p, actual: undefined })) }}
                        placeholder="Tu contraseña actual"
                        required
                        disabled={loading}
                        invalid={Boolean(errores.actual)}
                        aria-invalid={Boolean(errores.actual) || undefined}
                        aria-describedby={errores.actual ? 'error-fcp-actual' : undefined}
                    />
                    <ErrorDeCampo id="error-fcp-actual" mensaje={errores.actual} />
                </div>
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
                        aria-describedby={errores.nueva ? 'error-fcp-nueva' : undefined}
                    />
                    <ErrorDeCampo id="error-fcp-nueva" mensaje={errores.nueva} />
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
                        aria-describedby={errores.confirmar ? 'error-fcp-confirmar' : undefined}
                    />
                    <ErrorDeCampo id="error-fcp-confirmar" mensaje={errores.confirmar} />
                </div>
                <div className="d-grid"><CButton type="submit" disabled={loading} className="acceso-boton">{loading ? <><CSpinner size="sm" className="me-2" /> Cambiando...</> : 'Cambiar Contraseña'}</CButton></div>
            </CForm>
        </AuthLayout>
    )
}

export default ForceChangePasswordPage
