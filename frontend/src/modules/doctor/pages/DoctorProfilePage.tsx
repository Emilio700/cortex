import React, { useEffect, useState, useRef } from 'react'
import {
    CButton,
    CCard,
    CCardBody,
    CCardHeader,
    CCol,
    CContainer,
    CForm,
    CFormCheck,
    CFormSwitch,
    CFormInput,
    CFormLabel,
    CFormSelect,
    CFormTextarea,
    CRow,
    CSpinner,
    CAlert,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilSave, cilCloudUpload, cilCheckCircle, cilBell, cilUser } from '@coreui/icons'
import { useDoctorProfile } from '../hooks/useDoctorProfile'
import { useReminderPreferences } from '../hooks/useReminderPreferences'
import { useSpecialties } from '../../../shared/hooks/useSpecialties'
import DoctorScheduleCard from '../components/DoctorScheduleCard'
import apiClient from '../../../shared/services/api'
import ImagenProtegida from '../../../shared/components/ImagenProtegida'
import RecetaConfigCard, { type ConfiguracionReceta } from '../components/RecetaConfigCard'
import OrdenConfigCard from '../components/OrdenConfigCard'
import PlazosAtrasadoCard from '../components/PlazosAtrasadoCard'
import type { AjustesOrden } from '../utils/ajustesOrden'
import { recordarModoImpresion } from '../hooks/useModoImpresionPredeterminado'
import { useAvisosOpcional } from '../../../shared/avisos/AvisosContext'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { CONTRASENA, CORREO, esCorreo, estaVacio } from '../../../shared/utils/validacion'
import SeccionPerfil from '../components/SeccionPerfil'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const REMINDER_OPTIONS = [
    { label: '24 horas antes', minutes: 1440 },
    { label: '1 hora antes', minutes: 60 },
    { label: '30 minutos antes', minutes: 30 },
]

const DoctorProfilePage = () => {
    const avisos = useAvisosOpcional()
    // Secciones abiertas en el teléfono (en la computadora todo está a la vista).
    const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(['datos']))
    const seccionesIniciadas = useRef(false)
    const alternarSeccion = (id: string) =>
        setAbiertas((actuales) => {
            const nuevas = new Set(actuales)
            if (nuevas.has(id)) nuevas.delete(id)
            else nuevas.add(id)
            return nuevas
        })
    /** Abre la sección y la lleva a la vista: el aviso de «falta» manda ahí. */
    // El desplazamiento espera a que la sección se pinte abierta. Se cancela al
    // salir de la pantalla para no tocar un elemento que ya no existe.
    const desplazamiento = useRef<number | null>(null)
    useEffect(
        () => () => {
            if (desplazamiento.current !== null) cancelAnimationFrame(desplazamiento.current)
        },
        [],
    )
    const irASeccion = (id: string) => {
        setAbiertas((actuales) => new Set(actuales).add(id))
        if (desplazamiento.current !== null) cancelAnimationFrame(desplazamiento.current)
        desplazamiento.current = requestAnimationFrame(() => {
            desplazamiento.current = null
            document.getElementById(`perfil-seccion-${id}`)?.scrollIntoView?.({ block: 'start' })
        })
    }
    const { profile, loading, error, getProfile, updateProfile, uploadLogo, uploadSignature } = useDoctorProfile()
    const {
        preference,
        loading: loadingReminders,
        error: reminderError,
        getPreference,
        updatePreference,
    } = useReminderPreferences()
    const { specialties, getSpecialties } = useSpecialties()

    // Form state
    const [specialtyId, setSpecialtyId] = useState<number | ''>('')
    const [professionalId, setProfessionalId] = useState('')
    const [university, setUniversity] = useState('')
    const [phone, setPhone] = useState('')
    const [clinicAddress, setClinicAddress] = useState('')
    const [contactEmail, setContactEmail] = useState('')
    const [mobilePhone, setMobilePhone] = useState('')
    const [generalRegistry, setGeneralRegistry] = useState('')
    const [specialtyLicense, setSpecialtyLicense] = useState('')
    const [healthRegistry, setHealthRegistry] = useState('')
    const [councilCert, setCouncilCert] = useState('')
    const [personalEmail, setPersonalEmail] = useState('')
    const [nombreDeLaCuenta, setNombreDeLaCuenta] = useState('')
    const [tratamientoDeLaCuenta, setTratamientoDeLaCuenta] = useState<string | null>(null)

    // Change password state
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): sin globo del navegador.
    const [erroresDatos, setErroresDatos] = useState<{
        specialtyId?: string
        professionalId?: string
        contacto?: string
        personal?: string
    }>({})
    const [erroresContrasena, setErroresContrasena] = useState<{ actual?: string; nueva?: string; confirmar?: string }>({})
    const limpiarErrorDatos = (campo: keyof typeof erroresDatos) =>
        setErroresDatos((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
    const limpiarErrorContrasena = (campo: keyof typeof erroresContrasena) =>
        setErroresContrasena((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))

    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const logoInputRef = useRef<HTMLInputElement>(null)
    const signatureInputRef = useRef<HTMLInputElement>(null)

    // Reminder preferences form state
    const [remindersEnabled, setRemindersEnabled] = useState(true)
    const [selectedReminderMinutes, setSelectedReminderMinutes] = useState<number[]>([1440, 60])

    // ── Mis Consultorios ─────────────────────────────────────
    const [doctorClinics, setDoctorClinics] = useState<any[]>([])
    const [loadingClinics, setLoadingClinics] = useState(false)

    useEffect(() => {
        getProfile()
        getPreference()
        getSpecialties()
    }, [getProfile, getPreference, getSpecialties])

    useEffect(() => {
        if (profile) {
            setSpecialtyId(profile.specialty_id ?? '')
            setProfessionalId(profile.professional_id || '')
            setUniversity(profile.university || '')
            setPhone(profile.phone || '')
            setContactEmail(profile.contact_email || '')
            setMobilePhone(profile.mobile_phone || '')
            setClinicAddress(profile.clinic_address || '')
            setGeneralRegistry(profile.general_registry || '')
            setSpecialtyLicense(profile.specialty_license || '')
            setHealthRegistry(profile.health_registry || '')
            setCouncilCert(profile.council_cert || '')
        }
        // Load personal_email from user object (AuthContext)
        const storedUser = localStorage.getItem('user')
        if (storedUser) {
            try {
                const u = JSON.parse(storedUser)
                setPersonalEmail(u.personal_email || '')
                setNombreDeLaCuenta(u.full_name || '')
                setTratamientoDeLaCuenta(u.tratamiento || null)
            } catch { /* ignore */ }
        }
    }, [profile])

    useEffect(() => {
        if (preference) {
            setRemindersEnabled(preference.enabled)
            setSelectedReminderMinutes(preference.reminder_times_parsed)
        }
    }, [preference])

    // ── Mis Consultorios: load & handlers ────────────────────
    useEffect(() => {
        loadDoctorClinics()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const loadDoctorClinics = async () => {
        setLoadingClinics(true)
        try { const { data } = await apiClient.get('/doctor-clinics'); setDoctorClinics(data) } catch { }
        finally { setLoadingClinics(false) }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        // Se valida antes de llamar al servidor; el aviso sale junto al campo.
        // La especialidad y la cédula ya eran obligatorias en este formulario;
        // el correo es opcional y sólo se revisa su forma si hay algo escrito.
        const faltas: typeof erroresDatos = {}
        if (specialtyId === '') faltas.specialtyId = 'Selecciona una especialidad.'
        if (estaVacio(professionalId)) faltas.professionalId = 'Escribe la cédula profesional.'
        const contacto = contactEmail.trim()
        if (!estaVacio(contacto) && !esCorreo(contacto)) faltas.contacto = CORREO.invalido
        const personal = personalEmail.trim()
        if (!estaVacio(personal) && !esCorreo(personal)) faltas.personal = CORREO.invalido
        if (Object.keys(faltas).length > 0) {
            setErroresDatos(faltas)
            return
        }
        setErroresDatos({})
        // El vacío ya quedó descartado arriba; el `return` condicional no le
        // dice a TypeScript que aquí la especialidad es número.
        const especialidad = specialtyId as number
        const updated = await updateProfile({
            specialty_id: especialidad,
            professional_id: professionalId,
            university,
            phone,
            clinic_address: clinicAddress,
            // Vacío lo borra: así se puede dejar de imprimir un dato viejo.
            contact_email: contactEmail.trim() || null,
            mobile_phone: mobilePhone.trim() || null,
            general_registry: generalRegistry || undefined,
            specialty_license: specialtyLicense || undefined,
            health_registry: healthRegistry || undefined,
            council_cert: councilCert || undefined,
        })
        if (updated) {
            // Also save personal_email via PATCH /auth/me
            try {
                await apiClient.patch('/auth/me', { personal_email: personalEmail || null })
                const storedUser = localStorage.getItem('user')
                if (storedUser) {
                    const u = JSON.parse(storedUser)
                    u.personal_email = personalEmail || null
                    localStorage.setItem('user', JSON.stringify(u))
                }
            } catch { /* non-critical */ }
            setSuccessMessage('Perfil actualizado correctamente')
            setTimeout(() => setSuccessMessage(null), 3000)
        }
    }

    const guardarConfiguracionReceta = async (
        configuracion: ConfiguracionReceta,
    ): Promise<boolean> => {
        const actualizado = await updateProfile({
            prescription_display_name: configuracion.nombre,
            prescription_settings: configuracion.ajustes,
            prescription_footer_text: configuracion.leyenda,
            prescription_accent_color: configuracion.color,
            prescription_signature_style: configuracion.estilo,
        })
        return Boolean(actualizado)
    }

    /** Plan 26, D-7: el JSON de la orden se manda completo y se guarda completo. */
    const guardarConfiguracionOrden = async (ajustes: AjustesOrden): Promise<boolean> => {
        const actualizado = await updateProfile({ order_settings: ajustes })
        // La siguiente vista previa al imprimir ya abre con el modo nuevo.
        if (actualizado) recordarModoImpresion(ajustes.modo_impresion)
        return Boolean(actualizado)
    }

    const toggleReminderMinutes = (minutes: number) => {
        setSelectedReminderMinutes((prev) =>
            prev.includes(minutes) ? prev.filter((m) => m !== minutes) : [...prev, minutes].sort((a, b) => a - b),
        )
    }

    const handleSaveReminders = async () => {
        const reminderTimes = selectedReminderMinutes.join(',')
        const updated = await updatePreference(remindersEnabled, reminderTimes)
        if (updated) {
            setSuccessMessage('Preferencias de recordatorio actualizadas')
            setTimeout(() => setSuccessMessage(null), 3000)
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'signature') => {
        const file = e.target.files?.[0]
        if (!file) return

        if (type === 'logo') {
            await uploadLogo(file)
        } else {
            await uploadSignature(file)
        }
        // Success message handled by re-render showing new image, but can add alert
        setSuccessMessage(`${type === 'logo' ? 'Logo' : 'Firma'} actualizado correctamente`)
        setTimeout(() => setSuccessMessage(null), 3000)
    }

    // Lo que falta para que la receta salga completa, por sección: lo dice el
    // aviso de arriba, lo dice el botón de la sección plegada y decide cuál se
    // abre sola en el teléfono.
    const faltanEnDatos = profile
        ? [!profile.general_registry && 'R.G.P.', !profile.specialty_license && 'cédula de especialidad'].filter(
              (x): x is string => Boolean(x),
          )
        : []
    const faltanEnLogoFirma = profile
        ? [!profile.logo_url && 'logo', !profile.signature_url && 'firma'].filter((x): x is string => Boolean(x))
        : []
    const faltaDatos = faltanEnDatos.length ? `Falta ${faltanEnDatos.join(' y ')}` : null
    const faltaLogoFirma = faltanEnLogoFirma.length ? `Falta ${faltanEnLogoFirma.join(' y ')}` : null

    // Al llegar el perfil, en el teléfono se abre la sección incompleta (una
    // sola vez: después manda lo que el médico abra o cierre).
    useEffect(() => {
        if (!profile || seccionesIniciadas.current) return
        seccionesIniciadas.current = true
        const incompletas = [faltaDatos && 'datos', faltaLogoFirma && 'logo-firma'].filter(
            (x): x is string => Boolean(x),
        )
        if (incompletas.length) setAbiertas(new Set(incompletas))
    }, [profile, faltaDatos, faltaLogoFirma])

    if (loading && !profile) {
        return (
            <CContainer className="py-4 text-center">
                <CSpinner color="primary" />
                <div className="mt-3">Cargando perfil...</div>
            </CContainer>
        )
    }


    return (
        <CContainer fluid className="px-4 py-4">
            <EncabezadoPantalla
                titulo="Mi Perfil"
                descripcion="Especialidad, cédula, membrete y preferencias de tu consultorio"
                icono={cilUser}
            />

            {profile && (!profile.logo_url || !profile.signature_url || !profile.general_registry || !profile.specialty_license) && (
                <CAlert color="warning" className="d-flex align-items-center gap-2" data-tour="perfil-incompleto">
                    <span>⚠️</span>
                    <div>
                        <strong>Perfil incompleto.</strong>{' '}
                        {faltaDatos && (
                            <CButton color="link" className="p-0 align-baseline" onClick={() => irASeccion('datos')}>
                                {faltaDatos}
                            </CButton>
                        )}
                        {faltaDatos && faltaLogoFirma && ' · '}
                        {faltaLogoFirma && (
                            <CButton color="link" className="p-0 align-baseline" onClick={() => irASeccion('logo-firma')}>
                                {faltaLogoFirma}
                            </CButton>
                        )}
                        .{' '}
                        Completa tu perfil para que recetas y certificados se impriman correctamente.
                    </div>
                </CAlert>
            )}

            {error && <CAlert color="danger">{error}</CAlert>}
            {successMessage && <CAlert color="success"><CIcon icon={cilCheckCircle} className="me-2" />{successMessage}</CAlert>}

            {/* Orden de lo que más se llena a lo que menos (plan 29): primero lo
                que hace falta para imprimir, después el aspecto del membrete. En
                el teléfono cada sección se pliega y la incompleta abre sola. */}
            <SeccionPerfil
                id="datos"
                titulo="Datos profesionales"
                falta={faltaDatos}
                abierta={abiertas.has('datos')}
                onAlternar={alternarSeccion}
            >
                <CRow>
                    <CCol lg={8}>
                        <CCard className="mb-4 glass-card" data-tour="perfil-datos">
                                                <CCardHeader>
                                                    <strong>Datos Profesionales</strong>
                                                    <small className="text-muted ms-2">(Aparecerán en tus recetas y certificados)</small>
                                                </CCardHeader>
                                                <CCardBody>
                                                    <CForm onSubmit={handleSubmit} noValidate>
                                                        <CRow className="mb-3 g-3">
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-especialidad">Especialidad</CFormLabel>
                                                                <CFormSelect id="perfil-especialidad"
                                                                    value={specialtyId}
                                                                    onChange={(e) => {
                                                                        setSpecialtyId(e.target.value ? Number(e.target.value) : '')
                                                                        limpiarErrorDatos('specialtyId')
                                                                    }}
                                                                    required
                                                                    invalid={Boolean(erroresDatos.specialtyId)}
                                                                    aria-invalid={Boolean(erroresDatos.specialtyId) || undefined}
                                                                    aria-describedby={erroresDatos.specialtyId ? 'error-perfil-especialidad' : undefined}
                                                                >
                                                                    <option value="">Selecciona una especialidad</option>
                                                                    {specialties.map((s) => (
                                                                        <option key={s.id} value={s.id}>
                                                                            {s.name}
                                                                        </option>
                                                                    ))}
                                                                </CFormSelect>
                                                                <ErrorDeCampo id="error-perfil-especialidad" mensaje={erroresDatos.specialtyId} />
                                                            </CCol>
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-cedula-profesional">Cédula Profesional</CFormLabel>
                                                                <CFormInput id="perfil-cedula-profesional"
                                                                    value={professionalId}
                                                                    onChange={(e) => {
                                                                        setProfessionalId(e.target.value)
                                                                        limpiarErrorDatos('professionalId')
                                                                    }}
                                                                    placeholder="Cédula profesional"
                                                                    required
                                                                    invalid={Boolean(erroresDatos.professionalId)}
                                                                    aria-invalid={Boolean(erroresDatos.professionalId) || undefined}
                                                                    aria-describedby={erroresDatos.professionalId ? 'error-perfil-cedula' : undefined}
                                                                />
                                                                <ErrorDeCampo id="error-perfil-cedula" mensaje={erroresDatos.professionalId} />
                                                            </CCol>
                                                        </CRow>

                                                        <CRow className="mb-3">
                                                            <CCol md={12}>
                                                                <CFormLabel htmlFor="perfil-universidad-de-egreso">Universidad de Egreso</CFormLabel>
                                                                <CFormInput id="perfil-universidad-de-egreso"
                                                                    value={university}
                                                                    onChange={(e) => setUniversity(e.target.value)}
                                                                    placeholder="Ej: Universidad Nacional Autónoma de México"
                                                                />
                                                            </CCol>
                                                        </CRow>

                                                        <CRow className="mb-3 g-3" data-tour="perfil-contacto">
                                                            <CCol md={4}>
                                                                <CFormLabel htmlFor="perfil-telefono">Teléfono de Consultorio</CFormLabel>
                                                                <CFormInput
                                                                    id="perfil-telefono"
                                                                    type="tel"
                                                                    value={phone}
                                                                    onChange={(e) => setPhone(e.target.value)}
                                                                    placeholder="Para contacto de pacientes"
                                                                />
                                                            </CCol>
                                                            <CCol md={4}>
                                                                <CFormLabel htmlFor="perfil-celular">Celular / WhatsApp</CFormLabel>
                                                                <CFormInput
                                                                    id="perfil-celular"
                                                                    type="tel"
                                                                    inputMode="tel"
                                                                    value={mobilePhone}
                                                                    onChange={(e) => setMobilePhone(e.target.value)}
                                                                    placeholder="Ej. 669 123 4567"
                                                                />
                                                            </CCol>
                                                            <CCol md={4}>
                                                                <CFormLabel htmlFor="perfil-correo-contacto">Correo de contacto</CFormLabel>
                                                                <CFormInput
                                                                    id="perfil-correo-contacto"
                                                                    type="email"
                                                                    inputMode="email"
                                                                    value={contactEmail}
                                                                    onChange={(e) => {
                                                                        setContactEmail(e.target.value)
                                                                        limpiarErrorDatos('contacto')
                                                                    }}
                                                                    placeholder="Para que el paciente te escriba"
                                                                    invalid={Boolean(erroresDatos.contacto)}
                                                                    aria-invalid={Boolean(erroresDatos.contacto) || undefined}
                                                                    aria-describedby={erroresDatos.contacto ? 'error-perfil-correo-contacto' : undefined}
                                                                />
                                                                <ErrorDeCampo id="error-perfil-correo-contacto" mensaje={erroresDatos.contacto} />
                                                            </CCol>
                                                            <CCol xs={12}>
                                                                <small className="text-body-secondary">
                                                                    En la receta, el celular y el correo salen solo si los enciendes; en la orden salen de fábrica (puedes apagarlos en «Mi orden de estudio»).
                                                                </small>
                                                            </CCol>
                                                        </CRow>

                                                        <div className="mb-3">
                                                            <CFormLabel htmlFor="perfil-direccion-del-consultorio">Dirección del Consultorio</CFormLabel>
                                                            <CFormTextarea id="perfil-direccion-del-consultorio"
                                                                rows={3}
                                                                value={clinicAddress}
                                                                onChange={(e) => setClinicAddress(e.target.value)}
                                                                placeholder="Dirección completa que aparecerá en el membrete"
                                                            />
                                                        </div>

                                                        <CRow className="mb-3 g-3">
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-r-g-p-registro-general-de-prof">R.G.P. (Registro General de Profesiones)</CFormLabel>
                                                                <CFormInput id="perfil-r-g-p-registro-general-de-prof"
                                                                    value={generalRegistry}
                                                                    onChange={(e) => setGeneralRegistry(e.target.value)}
                                                                    placeholder="Número de R.G.P."
                                                                />
                                                            </CCol>
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-cedula-de-especialidad">Cédula de Especialidad</CFormLabel>
                                                                <CFormInput id="perfil-cedula-de-especialidad"
                                                                    value={specialtyLicense}
                                                                    onChange={(e) => setSpecialtyLicense(e.target.value)}
                                                                    placeholder="Número de Cédula de Especialidad"
                                                                />
                                                            </CCol>
                                                        </CRow>

                                                        <CRow className="mb-3 g-3">
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-ssa-rssa">SSA / RSSA</CFormLabel>
                                                                <CFormInput id="perfil-ssa-rssa"
                                                                    value={healthRegistry}
                                                                    onChange={(e) => setHealthRegistry(e.target.value)}
                                                                    placeholder="Número de registro SSA"
                                                                />
                                                            </CCol>
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-consejo-conacem">Consejo / CONACEM</CFormLabel>
                                                                <CFormInput id="perfil-consejo-conacem"
                                                                    value={councilCert}
                                                                    onChange={(e) => setCouncilCert(e.target.value)}
                                                                    placeholder="Certificado de Consejo o CONACEM"
                                                                />
                                                            </CCol>
                                                        </CRow>
                                                        <hr />
                                                        <CRow className="mb-3">
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-correo-personal-para-recordato">Correo Personal (para recordatorios)</CFormLabel>
                                                                <CFormInput id="perfil-correo-personal-para-recordato"
                                                                    type="email"
                                                                    value={personalEmail}
                                                                    onChange={(e) => {
                                                                        setPersonalEmail(e.target.value)
                                                                        limpiarErrorDatos('personal')
                                                                    }}
                                                                    placeholder="tucorreo@ejemplo.com"
                                                                    invalid={Boolean(erroresDatos.personal)}
                                                                    aria-invalid={Boolean(erroresDatos.personal) || undefined}
                                                                    aria-describedby={erroresDatos.personal ? 'error-perfil-correo-personal' : undefined}
                                                                />
                                                                <ErrorDeCampo id="error-perfil-correo-personal" mensaje={erroresDatos.personal} />
                                                                <small className="text-muted">Opcional. Se usará para enviar recordatorios de citas.</small>
                                                            </CCol>
                                                        </CRow>
                                                        <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                                                            <CButton type="submit" color="primary" disabled={loading}>
                                                                <CIcon icon={cilSave} className="me-2" />
                                                                Guardar Cambios
                                                            </CButton>
                                                        </div>
                                                    </CForm>
                                                </CCardBody>
                                            </CCard>
                    </CCol>
                    <CCol lg={4}>
                        {/* ── Mis Consultorios ─────────────────────────────── */}
                                            <CCard className="mb-4 glass-card" data-tour="perfil-consultorios">
                                                <CCardHeader>
                                                    <strong>Mis Consultorios</strong>
                                                    <small className="text-muted ms-2">(Sucursales donde atiendes)</small>
                                                </CCardHeader>
                                                <CCardBody>
                                                    {loadingClinics ? (
                                                        <div className="text-center py-3"><CSpinner size="sm" color="primary" /></div>
                                                    ) : doctorClinics.length === 0 ? (
                                                        <p className="text-muted small">No tienes consultorios asignados.</p>
                                                    ) : (
                                                        <div>
                                                            {doctorClinics.map((clinic: any) => (
                                                                <div key={clinic.id} className="border rounded px-3 py-2 mb-2 bg-light">
                                                                    <span className="fw-medium">{clinic.tenant_name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <small className="text-muted">Las asignaciones de sucursal las administra la plataforma.</small>
                                                </CCardBody>
                                            </CCard>
                    </CCol>
                </CRow>
            </SeccionPerfil>

            <SeccionPerfil
                id="logo-firma"
                titulo="Logo y firma"
                falta={faltaLogoFirma}
                abierta={abiertas.has('logo-firma')}
                onAlternar={alternarSeccion}
            >
                <CRow>
                    <CCol md={6}>
                        {/* Logo Configuration */}
                                            <CCard className="mb-4 glass-card" data-tour="perfil-logo">
                                                <CCardHeader><strong>Logo Institucional</strong></CCardHeader>
                                                <CCardBody className="text-center">
                                                    <div className="mb-3 d-flex justify-content-center align-items-center bg-light border rounded" style={{ height: '150px' }}>
                                                        {profile?.logo_url ? (
                                                            <ImagenProtegida url={profile.logo_url} alt="Logo del consultorio" style={{ maxHeight: '140px', maxWidth: '100%' }} />
                                                        ) : (
                                                            <span className="text-muted">Sin Logo</span>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        style={{ display: 'none' }}
                                                        ref={logoInputRef}
                                                        onChange={(e) => handleFileChange(e, 'logo')}
                                                    />
                                                    <CButton color="secondary" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                                                        <CIcon icon={cilCloudUpload} className="me-2" />
                                                        Subir Logo
                                                    </CButton>
                                                </CCardBody>
                                            </CCard>
                    </CCol>
                    <CCol md={6}>
                        {/* Signature Configuration */}
                                            <CCard className="mb-4 glass-card" data-tour="perfil-firma">
                                                <CCardHeader><strong>Firma Digital</strong></CCardHeader>
                                                <CCardBody className="text-center">
                                                    <div className="mb-3 d-flex justify-content-center align-items-center bg-light border rounded" style={{ height: '100px' }}>
                                                        {profile?.signature_url ? (
                                                            <ImagenProtegida url={profile.signature_url} alt="Tu firma" style={{ maxHeight: '90px', maxWidth: '100%' }} />
                                                        ) : (
                                                            <span className="text-muted">Sin Firma</span>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        style={{ display: 'none' }}
                                                        ref={signatureInputRef}
                                                        onChange={(e) => handleFileChange(e, 'signature')}
                                                    />
                                                    <CButton color="secondary" variant="outline" size="sm" onClick={() => signatureInputRef.current?.click()}>
                                                        <CIcon icon={cilCloudUpload} className="me-2" />
                                                        Subir Firma
                                                    </CButton>
                                                    <div className="text-muted small mt-2">
                                                        Se recomienda una imagen PNG con fondo transparente.
                                                    </div>
                                                </CCardBody>
                                            </CCard>
                    </CCol>
                </CRow>
            </SeccionPerfil>

            {/* Receta y orden van a lo ancho: la vista previa es una hoja A4 y
                en media columna no se lee. */}
            <SeccionPerfil
                id="receta"
                titulo="Mi receta"
                abierta={abiertas.has('receta')}
                onAlternar={alternarSeccion}
            >
                <div data-tour="perfil-receta">
                    <RecetaConfigCard
                                            nombreDeLaCuenta={nombreDeLaCuenta}
                                            tratamientoDeLaCuenta={tratamientoDeLaCuenta}
                                            nombreGuardado={profile?.prescription_display_name}
                                            ajustesGuardados={profile?.prescription_settings}
                                            leyendaGuardada={profile?.prescription_footer_text}
                                            colorGuardado={profile?.prescription_accent_color}
                                            estiloGuardado={profile?.prescription_signature_style}
                                            logoUrl={profile?.logo_url}
                                            firmaUrl={profile?.signature_url}
                                            onGuardar={guardarConfiguracionReceta}
                                            guardando={loading}
                                        />
                </div>
            </SeccionPerfil>

            {/* Junto a la receta y con su mismo modelo, pero con configuración propia (D-11). */}
            <SeccionPerfil
                id="orden"
                titulo="Mi orden de estudio"
                abierta={abiertas.has('orden')}
                onAlternar={alternarSeccion}
            >
                <div data-tour="perfil-orden">
                    <OrdenConfigCard
                                            nombreDeLaCuenta={nombreDeLaCuenta}
                                            tratamientoDeLaCuenta={tratamientoDeLaCuenta}
                                            guardados={profile?.order_settings}
                                            onGuardar={guardarConfiguracionOrden}
                                            guardando={loading}
                                        />
                </div>
                {/* Junto a la orden, como pide el plan 32 (punto 3). */}
                <PlazosAtrasadoCard />
            </SeccionPerfil>

            <SeccionPerfil
                id="agenda"
                titulo="Agenda y recordatorios"
                abierta={abiertas.has('agenda')}
                onAlternar={alternarSeccion}
            >
                <CRow>
                    <CCol lg={6}>
                        <CCard className="mb-4 glass-card" data-tour="perfil-recordatorios">
                                                <CCardHeader>
                                                    <CIcon icon={cilBell} className="me-2" />
                                                    <strong>Recordatorios por correo a tus pacientes</strong>
                                                </CCardHeader>
                                                <CCardBody>
                                                    {reminderError && <CAlert color="danger">{reminderError}</CAlert>}

                                                    {/* Esto sólo gobierna el correo al paciente. Decía
                                                        «correo y notificación in-app», pero desde el plan 27
                                                        el aviso para el médico se decide en el centro de
                                                        avisos y el de 24 h ya no existe: el texto prometía
                                                        algo que el sistema no hace (plan 29). */}
                                                    <p className="small text-body-secondary">
                                                        Antes de cada cita le llega un correo al paciente, si tiene uno registrado.
                                                        El aviso para ti, una hora antes de cada cita, se activa en tus avisos
                                                        (la campana, abajo, en <b>Preferencias</b>).
                                                        {avisos && (
                                                            <>
                                                                {' '}
                                                                <CButton
                                                                    color="link"
                                                                    size="sm"
                                                                    className="p-0 align-baseline"
                                                                    onClick={avisos.abrirCentro}
                                                                >
                                                                    Abrir mis avisos
                                                                </CButton>
                                                            </>
                                                        )}
                                                    </p>

                                                    <CFormSwitch
                                                        id="reminders-enabled"
                                                        label="Mandar recordatorios por correo a mis pacientes"
                                                        checked={remindersEnabled}
                                                        onChange={(e) => setRemindersEnabled(e.target.checked)}
                                                        className="mb-3"
                                                    />

                                                    <CFormLabel>Mandar el correo:</CFormLabel>
                                                    <div className="mb-3">
                                                        {REMINDER_OPTIONS.map((opt) => (
                                                            <CFormCheck
                                                                key={opt.minutes}
                                                                id={`reminder-${opt.minutes}`}
                                                                label={opt.label}
                                                                checked={selectedReminderMinutes.includes(opt.minutes)}
                                                                disabled={!remindersEnabled}
                                                                onChange={() => toggleReminderMinutes(opt.minutes)}
                                                            />
                                                        ))}
                                                    </div>

                                                    <CButton
                                                        color="primary"
                                                        size="sm"
                                                        disabled={loadingReminders || selectedReminderMinutes.length === 0}
                                                        onClick={handleSaveReminders}
                                                    >
                                                        <CIcon icon={cilSave} className="me-2" />
                                                        Guardar Preferencias
                                                    </CButton>
                                                </CCardBody>
                                            </CCard>
                    </CCol>
                    <CCol lg={6}>
                        <div data-tour="perfil-horario">
                                                <DoctorScheduleCard />
                                            </div>
                    </CCol>
                </CRow>
            </SeccionPerfil>

            <SeccionPerfil
                id="contrasena"
                titulo="Contraseña"
                abierta={abiertas.has('contrasena')}
                onAlternar={alternarSeccion}
            >
                <CRow>
                    <CCol lg={6}>
                        {/* ── Change Password ────────────────────────────── */}
                                            <CCard className="mb-4 glass-card">
                                                <CCardHeader>
                                                    <strong>Cambiar Contraseña</strong>
                                                </CCardHeader>
                                                <CCardBody>
                                                    {passwordError && <CAlert color="danger">{passwordError}</CAlert>}
                                                    {passwordSuccess && <CAlert color="success">{passwordSuccess}</CAlert>}
                                                    <CForm
                                                        noValidate
                                                        onSubmit={async (e) => {
                                                            e.preventDefault()
                                                            setPasswordError(null)
                                                            setPasswordSuccess(null)
                                                            const faltas: typeof erroresContrasena = {}
                                                            if (estaVacio(currentPassword)) faltas.actual = CONTRASENA.actualFalta
                                                            if (estaVacio(newPassword)) faltas.nueva = CONTRASENA.nuevaFalta
                                                            else if (newPassword.length < 8) faltas.nueva = CONTRASENA.corta
                                                            if (estaVacio(confirmPassword)) faltas.confirmar = CONTRASENA.confirmarFalta
                                                            else if (newPassword !== confirmPassword) faltas.confirmar = CONTRASENA.noCoinciden
                                                            if (Object.keys(faltas).length > 0) {
                                                                setErroresContrasena(faltas)
                                                                return
                                                            }
                                                            setErroresContrasena({})
                                                            try {
                                                                await apiClient.post('/auth/change-password', {
                                                                    current_password: currentPassword,
                                                                    new_password: newPassword,
                                                                })
                                                                setPasswordSuccess('Contraseña actualizada correctamente')
                                                                setCurrentPassword('')
                                                                setNewPassword('')
                                                                setConfirmPassword('')
                                                            } catch (err: any) {
                                                                setPasswordError(err.response?.data?.detail || 'Error al cambiar la contraseña')
                                                            }
                                                        }}
                                                    >
                                                        <CRow className="mb-3">
                                                            <CCol md={12}>
                                                                <CFormLabel htmlFor="perfil-contrasena-actual">Contraseña Actual</CFormLabel>
                                                                <CFormInput id="perfil-contrasena-actual"
                                                                    type="password"
                                                                    value={currentPassword}
                                                                    onChange={(e) => {
                                                                        setCurrentPassword(e.target.value)
                                                                        limpiarErrorContrasena('actual')
                                                                    }}
                                                                    required
                                                                    invalid={Boolean(erroresContrasena.actual)}
                                                                    aria-invalid={Boolean(erroresContrasena.actual) || undefined}
                                                                    aria-describedby={erroresContrasena.actual ? 'error-perfil-contrasena-actual' : undefined}
                                                                />
                                                                <ErrorDeCampo id="error-perfil-contrasena-actual" mensaje={erroresContrasena.actual} />
                                                            </CCol>
                                                        </CRow>
                                                        <CRow className="mb-3">
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-nueva-contrasena">Nueva Contraseña</CFormLabel>
                                                                <CFormInput id="perfil-nueva-contrasena"
                                                                    type="password"
                                                                    value={newPassword}
                                                                    onChange={(e) => {
                                                                        setNewPassword(e.target.value)
                                                                        limpiarErrorContrasena('nueva')
                                                                    }}
                                                                    required
                                                                    invalid={Boolean(erroresContrasena.nueva)}
                                                                    aria-invalid={Boolean(erroresContrasena.nueva) || undefined}
                                                                    aria-describedby={erroresContrasena.nueva ? 'error-perfil-contrasena-nueva' : undefined}
                                                                />
                                                                <ErrorDeCampo id="error-perfil-contrasena-nueva" mensaje={erroresContrasena.nueva} />
                                                            </CCol>
                                                            <CCol md={6}>
                                                                <CFormLabel htmlFor="perfil-confirmar-contrasena">Confirmar Contraseña</CFormLabel>
                                                                <CFormInput id="perfil-confirmar-contrasena"
                                                                    type="password"
                                                                    value={confirmPassword}
                                                                    onChange={(e) => {
                                                                        setConfirmPassword(e.target.value)
                                                                        limpiarErrorContrasena('confirmar')
                                                                    }}
                                                                    required
                                                                    invalid={Boolean(erroresContrasena.confirmar)}
                                                                    aria-invalid={Boolean(erroresContrasena.confirmar) || undefined}
                                                                    aria-describedby={erroresContrasena.confirmar ? 'error-perfil-contrasena-confirmar' : undefined}
                                                                />
                                                                <ErrorDeCampo id="error-perfil-contrasena-confirmar" mensaje={erroresContrasena.confirmar} />
                                                            </CCol>
                                                        </CRow>
                                                        <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                                                            <CButton type="submit" color="warning">
                                                                Cambiar Contraseña
                                                            </CButton>
                                                        </div>
                                                    </CForm>
                                                </CCardBody>
                                            </CCard>
                    </CCol>
                </CRow>
            </SeccionPerfil>
        </CContainer>
    )
}

export default DoctorProfilePage
