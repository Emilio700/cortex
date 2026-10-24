import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  CButton,
  CForm,
  CFormCheck,
  CFormInput,
  CInputGroup,
  CInputGroupText,
  CAlert,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilLockLocked, cilEnvelopeClosed, cilShieldAlt } from '@coreui/icons'
import { useAuth } from '../../../shared/context/AuthContext'
import { Role } from '../../../shared/types'
import AuthLayout from './AuthLayout'
import { mensajeDeError } from '../../../shared/utils/errors'
import { rutaDeInicio } from '../../../shared/utils/inicio'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { CONTRASENA, CORREO, estaVacio, esCorreo } from '../../../shared/utils/validacion'


// «Recordar mi correo» (plan 32, punto 1): sólo el correo, nunca la
// contraseña, y sólo en este equipo. Los médicos entran varias veces al día
// desde el teléfono. El almacenamiento puede no existir (navegación privada):
// entonces simplemente no se recuerda.
const CLAVE_CORREO = 'gems_correo_recordado'

const leerCorreoRecordado = (): string => {
  try {
    return localStorage.getItem(CLAVE_CORREO) ?? ''
  } catch {
    return ''
  }
}

const guardarCorreoRecordado = (correo: string | null) => {
  try {
    if (correo) localStorage.setItem(CLAVE_CORREO, correo)
    else localStorage.removeItem(CLAVE_CORREO)
  } catch {
    /* sin almacenamiento no hay nada que recordar */
  }
}

const Login = () => {
  const [email, setEmail] = useState(leerCorreoRecordado)
  const [recordarCorreo, setRecordarCorreo] = useState(() => leerCorreoRecordado() !== '')
  const [password, setPassword] = useState('')
  const [mostrarContrasena, setMostrarContrasena] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Errores junto al campo (`noValidate`): el navegador ya no enseña su globo.
  const [errores, setErrores] = useState<{ email?: string; password?: string; codigo?: string }>({})

  const limpiarError = (campo: keyof typeof errores) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
  const [mfaTicket, setMfaTicket] = useState<string | null>(null)
  const [mfaMode, setMfaMode] = useState<'confirm' | 'verify' | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [manualSecret, setManualSecret] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [completedMfa, setCompletedMfa] = useState<{ user: { role: Role }; must_change_password: boolean } | null>(null)
  const navigate = useNavigate()
  const { login, setupMfa, completeMfa } = useAuth()

  const finishLogin = (result: { user: { role: Role }; must_change_password: boolean }) => {
    if (result.must_change_password) navigate('/force-change-password')
    else navigate(rutaDeInicio(result.user.role))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const faltas: typeof errores = {}
    if (estaVacio(email)) faltas.email = CORREO.falta
    else if (!esCorreo(email)) faltas.email = CORREO.invalido
    if (estaVacio(password)) faltas.password = CONTRASENA.falta
    if (Object.keys(faltas).length > 0) {
      setErrores(faltas)
      return
    }
    setErrores({})
    setIsLoading(true)
    try {
      const result = await login({ email, password })
      // Se recuerda (o se olvida) sólo cuando el correo resultó ser el bueno:
      // un correo mal escrito no se queda guardado para la siguiente vez.
      guardarCorreoRecordado(recordarCorreo ? email.trim() : null)
      if ('mfa_required' in result && result.mfa_required && result.mfa_ticket) {
        if (result.mfa_enrollment_required) {
          const setup = await setupMfa(result.mfa_ticket)
          setMfaTicket(setup.mfa_ticket)
          setQrCode(setup.qr_code_data_url)
          setManualSecret(setup.secret)
          setMfaMode('confirm')
        } else {
          setMfaTicket(result.mfa_ticket)
          setMfaMode('verify')
        }
      } else if ('user' in result) {
        finishLogin(result)
      }
    } catch (err: any) {
      setError(mensajeDeError(err, 'Error al iniciar sesión. Verifica tus credenciales.'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaTicket || !mfaMode) return
    setError(null)
    if (estaVacio(mfaCode)) {
      setErrores({ codigo: 'Escribe el código de 6 dígitos.' })
      return
    }
    setErrores({})
    setIsLoading(true)
    try {
      const result = await completeMfa(mfaMode, mfaTicket, mfaCode)
      if (result.recovery_codes?.length) {
        setCompletedMfa(result)
        setRecoveryCodes(result.recovery_codes)
        return
      }
      finishLogin(result)
    } catch (err: any) {
      setError(err.message || 'Código incorrecto o vencido.')
    } finally {
      setIsLoading(false)
    }
  }

  if (recoveryCodes.length) {
    return (
      <AuthLayout title="Códigos de recuperación" subtitle="Guárdalos ahora; cada código funciona una sola vez.">
        <CAlert color="warning">No se volverán a mostrar. Consérvalos fuera del expediente clínico.</CAlert>
        <div className="bg-light rounded p-3 font-monospace mb-3">
          {recoveryCodes.map((code) => <div key={code}>{code}</div>)}
        </div>
        <CButton className="w-100" color="primary" disabled={!completedMfa} onClick={() => completedMfa && finishLogin(completedMfa)}>Ya los guardé, continuar</CButton>
      </AuthLayout>
    )
  }

  if (mfaMode) {
    return (
      <AuthLayout title={mfaMode === 'confirm' ? 'Protege tu cuenta' : 'Verificación en dos pasos'} subtitle="Usa una app autenticadora compatible con TOTP.">
        {error && <CAlert color="danger" className="py-2 small">{error}</CAlert>}
        {qrCode && <div className="text-center mb-3"><img src={qrCode} alt="Código QR para configurar MFA" width={190} height={190} /></div>}
        {manualSecret && <p className="small text-center">Clave manual: <code>{manualSecret}</code></p>}
        <CForm onSubmit={handleMfa} noValidate>
          <div className="mb-3">
            <CInputGroup>
              <CInputGroupText><CIcon icon={cilShieldAlt} /></CInputGroupText>
              <CFormInput
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Código de 6 dígitos o recuperación"
                value={mfaCode}
                onChange={(e) => { setMfaCode(e.target.value); limpiarError('codigo') }}
                required
                invalid={Boolean(errores.codigo)}
                aria-invalid={Boolean(errores.codigo) || undefined}
                aria-describedby={errores.codigo ? 'error-login-codigo' : undefined}
              />
            </CInputGroup>
            <ErrorDeCampo id="error-login-codigo" mensaje={errores.codigo} />
          </div>
          <CButton type="submit" color="primary" className="w-100" disabled={isLoading}>{isLoading ? <CSpinner size="sm" /> : 'Verificar'}</CButton>
        </CForm>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Iniciar Sesión"
      subtitle="Ingresa tus credenciales para acceder al sistema"
      footer={
        <>
          © 2026 CORTEX · Neurocirugía
        </>
      }
    >
      {error && <CAlert color="danger" className="py-2 small">{error}</CAlert>}
      <CForm onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <CInputGroup>
            <CInputGroupText>
              <CIcon icon={cilEnvelopeClosed} />
            </CInputGroupText>
            <CFormInput
              type="email"
              placeholder="Correo electrónico"
              aria-label="Correo electrónico"
              autoComplete="username"
              value={email}
              onChange={(e) => { setEmail(e.target.value); limpiarError('email') }}
              required
              disabled={isLoading}
              style={{ borderLeft: 0 }}
              invalid={Boolean(errores.email)}
              aria-invalid={Boolean(errores.email) || undefined}
              aria-describedby={errores.email ? 'error-login-email' : undefined}
            />
          </CInputGroup>
          <ErrorDeCampo id="error-login-email" mensaje={errores.email} />
        </div>
        <div className="mb-3">
          <CInputGroup>
            <CInputGroupText>
              <CIcon icon={cilLockLocked} />
            </CInputGroupText>
            <CFormInput
              type={mostrarContrasena ? 'text' : 'password'}
              placeholder="Contraseña"
              aria-label="Contraseña"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); limpiarError('password') }}
              required
              disabled={isLoading}
              style={{ borderLeft: 0, borderRight: 0 }}
              invalid={Boolean(errores.password)}
              aria-invalid={Boolean(errores.password) || undefined}
              aria-describedby={errores.password ? 'error-login-password' : undefined}
            />
            {/* Sin esto no hay forma de saber si la contraseña se tecleó bien. */}
            <CButton
              type="button"
              color="light"
              onClick={() => setMostrarContrasena((visible) => !visible)}
              disabled={isLoading}
              title={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-label={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={mostrarContrasena}
              tabIndex={-1}
              style={{ borderLeft: 0 }}
            >
              <span className="small fw-semibold">{mostrarContrasena ? 'Ocultar' : 'Mostrar'}</span>
            </CButton>
          </CInputGroup>
          <ErrorDeCampo id="error-login-password" mensaje={errores.password} />
        </div>
        <CFormCheck
          id="recordar-correo"
          className="mb-3 small"
          label="Recordar mi correo en este equipo"
          checked={recordarCorreo}
          onChange={(e) => setRecordarCorreo(e.target.checked)}
          disabled={isLoading}
        />
        <div className="d-grid mb-3">
          <CButton type="submit" disabled={isLoading} className="acceso-boton">
            {isLoading ? (
              <><CSpinner size="sm" className="me-2" aria-hidden="true" /> Entrando…</>
            ) : (
              'Iniciar Sesión'
            )}
          </CButton>
        </div>
        <div className="text-center">
          <Link to="/forgot-password" className="acceso-enlace">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </CForm>
    </AuthLayout>
  )
}

export default Login
