/**
 * User create/edit form (Admin module - Fase 3.4)
 *
 * Plan 23, ajustes del 2026-09-28:
 * - "Tratamiento" (Dr., Dra. o nada) en alta y edición. Sin tratamiento el
 *   sistema pone sólo el nombre: un "Dr." equivocado a un médico es peor.
 * - Al editar a una secretaria, "Médicos que apoya" y el permiso de ver el
 *   corte de caja de esas doctoras. Se guardan aparte de los datos de la
 *   cuenta, y si eso falla se dice qué sí quedó y qué no.
 */
import React, { useEffect, useState } from 'react'
import {
    CAlert,
    CButton,
    CCol,
    CForm,
    CFormCheck,
    CFormInput,
    CFormLabel,
    CFormSelect,
    CModal,
    CModalBody,
    CModalFooter,
    CModalHeader,
    CModalTitle,
    CRow,
    CSpinner,
} from '@coreui/react-pro'
import { apiClient } from '../../../shared/services/api'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { Role, type User } from '../../../shared/types'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { CONTRASENA, CORREO, esCorreo, estaVacio } from '../../../shared/utils/validacion'
import type { Tratamiento, UserCreate, UserUpdate } from '../types'

interface UserFormProps {
    visible: boolean
    onClose: () => void
    onSubmit: (data: UserCreate | UserUpdate) => Promise<void>
    /**
     * Se llama sólo cuando TODO quedó guardado (cuenta y, si se tocaron, las
     * doctoras que apoya). El aviso de éxito va aquí y no en `onSubmit`: si las
     * doctoras fallaban, la página decía "actualizado correctamente" encima del
     * error que decía lo contrario.
     */
    onGuardado?: () => void
    user?: User | null
}

const MANAGEABLE_ROLES = [Role.ADMIN, Role.SECRETARIA, Role.DOCTOR] as const
type ManageableRole = (typeof MANAGEABLE_ROLES)[number]

const ROLE_LABELS: Record<ManageableRole, string> = {
    [Role.ADMIN]: 'Administrador',
    [Role.SECRETARIA]: 'Secretaria',
    [Role.DOCTOR]: 'Doctor',
}

/** Las asignaciones tal como se leyeron del servidor. */
interface Apoyo {
    doctorIds: number[]
    puedeVerCorte: boolean
}

const mismoConjunto = (a: number[], b: number[]) => {
    const x = [...a].sort((m, n) => m - n)
    const y = [...b].sort((m, n) => m - n)
    return x.length === y.length && x.every((v, i) => v === y[i])
}

export const UserForm: React.FC<UserFormProps> = ({ visible, onClose, onSubmit, onGuardado, user }) => {
    const isEditing = !!user
    const { getDoctorasQueApoya, saveDoctorasQueApoya } = useAdminUsers()

    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [role, setRole] = useState<ManageableRole>(Role.SECRETARIA)
    const [tratamiento, setTratamiento] = useState<Tratamiento | ''>('')
    const [password, setPassword] = useState('')
    const [isActive, setIsActive] = useState(true)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): el navegador ya no enseña su globo.
    const [errores, setErrores] = useState<{ email?: string; full_name?: string; password?: string }>({})

    // Médicos que apoya (sólo al editar a una secretaria).
    const [doctoras, setDoctoras] = useState<User[]>([])
    const [apoyoLeido, setApoyoLeido] = useState<Apoyo | null>(null)
    const [errorApoyo, setErrorApoyo] = useState<string | null>(null)
    const [doctorIds, setDoctorIds] = useState<number[]>([])
    const [puedeVerCorte, setPuedeVerCorte] = useState(false)

    const editaSecretaria = isEditing && user?.role === Role.SECRETARIA && role === Role.SECRETARIA

    useEffect(() => {
        if (user) {
            setEmail(user.email)
            setFullName(user.full_name)
            setRole(user.role === Role.MASTER ? Role.SECRETARIA : user.role)
            setTratamiento((user.tratamiento as Tratamiento | null | undefined) ?? '')
            setIsActive(user.is_active)
        } else {
            setEmail('')
            setFullName('')
            setRole(Role.SECRETARIA)
            setTratamiento('')
            setPassword('')
            setIsActive(true)
        }
        setError(null)
        setErrores({})
        setApoyoLeido(null)
        setErrorApoyo(null)
        setDoctorIds([])
        setPuedeVerCorte(false)
    }, [user, visible])

    useEffect(() => {
        if (!visible || !user || user.role !== Role.SECRETARIA) return
        let vigente = true
        Promise.all([
            apiClient.get<User[]>('/users', { params: { role: Role.DOCTOR, limit: 500 } }),
            getDoctorasQueApoya(user.id),
        ])
            .then(([resDoctoras, apoyo]) => {
                if (!vigente) return
                const lista = Array.isArray(resDoctoras?.data) ? resDoctoras.data : []
                // Se ofrecen las activas, más las ya asignadas aunque estén dadas de
                // baja: esconderlas haría que un guardado las quitara sin que nadie
                // lo decidiera.
                setDoctoras(lista.filter((d) => d.is_active || apoyo.doctor_ids.includes(d.id)))
                setApoyoLeido({ doctorIds: apoyo.doctor_ids, puedeVerCorte: apoyo.puede_ver_corte })
                setDoctorIds(apoyo.doctor_ids)
                setPuedeVerCorte(apoyo.puede_ver_corte)
            })
            .catch((err: any) => {
                // Sin lo guardado no se ofrece editar: guardar sobre una lista vacía
                // le quitaría a la secretaria los médicos que ya apoya.
                if (vigente) setErrorApoyo(err?.message || 'No se pudieron cargar los médicos que apoya.')
            })
        return () => {
            vigente = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, visible])

    const alternarDoctora = (id: number) =>
        setDoctorIds((actuales) => (actuales.includes(id) ? actuales.filter((d) => d !== id) : [...actuales, id]))

    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Se valida antes de mandar nada al servidor: los avisos van junto al
        // campo y el navegador ya no los muestra por su cuenta (`noValidate`).
        const faltas: typeof errores = {}
        if (!isEditing) {
            if (estaVacio(email)) faltas.email = CORREO.falta
            else if (!esCorreo(email)) faltas.email = CORREO.invalido
        }
        if (estaVacio(fullName)) faltas.full_name = 'Escribe el nombre completo.'
        if (!isEditing) {
            if (estaVacio(password)) faltas.password = CONTRASENA.falta
            else if (password.length < 8) faltas.password = CONTRASENA.corta
        }
        if (Object.keys(faltas).length > 0) {
            setErrores(faltas)
            return
        }
        setErrores({})

        setLoading(true)
        setError(null)

        try {
            if (isEditing) {
                await onSubmit({ full_name: fullName, role, is_active: isActive, tratamiento } as UserUpdate)
            } else {
                await onSubmit({
                    email,
                    full_name: fullName,
                    role,
                    password,
                    tratamiento: tratamiento || null,
                } as UserCreate)
            }
        } catch (err: any) {
            setError(err.message || 'Error al guardar usuario')
            setLoading(false)
            return
        }

        const apoyoCambio =
            editaSecretaria &&
            apoyoLeido !== null &&
            (!mismoConjunto(apoyoLeido.doctorIds, doctorIds) || apoyoLeido.puedeVerCorte !== puedeVerCorte)
        if (apoyoCambio && user) {
            try {
                await saveDoctorasQueApoya(user.id, { doctor_ids: doctorIds, puede_ver_corte: puedeVerCorte })
            } catch (err: any) {
                // Los datos de la cuenta sí quedaron; esto no. Se dice tal cual y el
                // formulario sigue abierto para reintentar.
                setError(
                    `Los datos de la cuenta se guardaron, pero los médicos que apoya y el permiso del corte NO: ${err.message}`,
                )
                setLoading(false)
                return
            }
        }
        setLoading(false)
        onGuardado?.()
        onClose()
    }

    return (
        <CModal visible={visible} onClose={onClose}>
            <CModalHeader>
                <CModalTitle>{isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}</CModalTitle>
                {/* Con el modal abierto el "?" del encabezado queda tapado. */}
                <BotonAyudaContextual recorridoId="usuario-formulario" />
            </CModalHeader>
            <CForm onSubmit={handleSubmit} noValidate>
                <CModalBody data-tour="usuario-modal">
                    <CRow className="mb-3">
                        <CCol>
                            <CFormLabel htmlFor="email">
                                Correo <span className="text-danger">*</span>
                            </CFormLabel>
                            <CFormInput
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value)
                                    limpiarError('email')
                                }}
                                required
                                disabled={loading || isEditing}
                                invalid={Boolean(errores.email)}
                                aria-invalid={Boolean(errores.email) || undefined}
                                aria-describedby={errores.email ? 'error-usuario-correo' : undefined}
                            />
                            {isEditing && (
                                <small className="text-muted">El correo no se puede cambiar.</small>
                            )}
                            <ErrorDeCampo id="error-usuario-correo" mensaje={errores.email} />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        {/* El modal mide lo mismo en tablet que en escritorio: con 3
                            columnas "Sin tratamiento" salía cortado. */}
                        <CCol sm={5} data-tour="usuario-tratamiento">
                            <CFormLabel htmlFor="tratamiento">Tratamiento</CFormLabel>
                            <CFormSelect
                                id="tratamiento"
                                value={tratamiento}
                                onChange={(e) => setTratamiento(e.target.value as Tratamiento | '')}
                                disabled={loading}
                            >
                                <option value="">Sin tratamiento</option>
                                <option value="Dra.">Dra.</option>
                                <option value="Dr.">Dr.</option>
                            </CFormSelect>
                        </CCol>
                        <CCol sm={7}>
                            <CFormLabel htmlFor="full_name">
                                Nombre completo <span className="text-danger">*</span>
                            </CFormLabel>
                            <CFormInput
                                id="full_name"
                                value={fullName}
                                onChange={(e) => {
                                    setFullName(e.target.value)
                                    limpiarError('full_name')
                                }}
                                required
                                disabled={loading}
                                invalid={Boolean(errores.full_name)}
                                aria-invalid={Boolean(errores.full_name) || undefined}
                                aria-describedby={errores.full_name ? 'error-usuario-nombre' : undefined}
                            />
                            <ErrorDeCampo id="error-usuario-nombre" mensaje={errores.full_name} />
                        </CCol>
                        <CCol xs={12}>
                            <small className="text-muted">
                                El tratamiento sale en recibos, recetas y avisos. Sin tratamiento se usa sólo el
                                nombre.
                            </small>
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol md={isEditing ? 12 : 6}>
                            <CFormLabel htmlFor="role">
                                Rol <span className="text-danger">*</span>
                            </CFormLabel>
                            <CFormSelect
                                id="role"
                                value={role}
                                onChange={(e) => setRole(e.target.value as ManageableRole)}
                                disabled={loading}
                            >
                                {MANAGEABLE_ROLES.map((r) => (
                                    <option key={r} value={r}>
                                        {ROLE_LABELS[r]}
                                    </option>
                                ))}
                            </CFormSelect>
                        </CCol>
                        {!isEditing && (
                            <CCol md={6}>
                                <CFormLabel htmlFor="password">
                                    Contraseña <span className="text-danger">*</span>
                                </CFormLabel>
                                <CFormInput
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value)
                                        limpiarError('password')
                                    }}
                                    required
                                    minLength={8}
                                    disabled={loading}
                                    invalid={Boolean(errores.password)}
                                    aria-invalid={Boolean(errores.password) || undefined}
                                    aria-describedby={errores.password ? 'error-usuario-contrasena' : undefined}
                                />
                                <ErrorDeCampo id="error-usuario-contrasena" mensaje={errores.password} />
                            </CCol>
                        )}
                    </CRow>

                    {isEditing && (
                        <CRow className="mb-3">
                            <CCol>
                                <CFormCheck
                                    id="is_active"
                                    label="Usuario activo"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    disabled={loading}
                                />
                            </CCol>
                        </CRow>
                    )}

                    {editaSecretaria && (
                        <div className="border rounded-3 p-3 mb-3">
                            <div data-tour="usuario-doctoras-que-apoya">
                                <div className="fw-semibold mb-1">Médicos que apoya</div>
                                <small className="text-muted d-block mb-2">
                                    Sigue cobrando y viendo los pagos de toda la sucursal. Esto sólo decide de qué
                                    doctoras ve el corte de caja.
                                </small>
                                {errorApoyo ? (
                                    <CAlert color="danger" className="py-2 small mb-0">
                                        {errorApoyo} Esta sección no se puede cambiar hasta que carguen; los demás
                                        datos sí se guardan.
                                    </CAlert>
                                ) : apoyoLeido === null ? (
                                    <div className="small">
                                        <CSpinner size="sm" /> Cargando doctoras…
                                    </div>
                                ) : doctoras.length === 0 ? (
                                    <p className="small text-muted mb-0">No hay doctoras activas en la sucursal.</p>
                                ) : (
                                    doctoras.map((d) => (
                                        <CFormCheck
                                            key={d.id}
                                            id={`apoya-${d.id}`}
                                            label={`${d.full_name}${d.is_active ? '' : ' (dada de baja)'}`}
                                            checked={doctorIds.includes(d.id)}
                                            onChange={() => alternarDoctora(d.id)}
                                            disabled={loading}
                                        />
                                    ))
                                )}
                            </div>
                            {apoyoLeido !== null && !errorApoyo && (
                                <div className="mt-3" data-tour="usuario-corte-permiso">
                                    <CFormCheck
                                        id="puede-ver-corte"
                                        label="Puede ver el corte de caja de esas doctoras"
                                        checked={puedeVerCorte}
                                        onChange={(e) => setPuedeVerCorte(e.target.checked)}
                                        disabled={loading}
                                    />
                                    {puedeVerCorte && doctorIds.length === 0 && (
                                        <small className="text-warning d-block">
                                            Sin doctoras asignadas, el corte no le va a mostrar nada.
                                        </small>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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

export default UserForm
