/**
 * Patient form component for create/edit
 *
 * Captura express: al registrar solo son obligatorios NOMBRE, APELLIDOS y
 * CELULAR. El resto del expediente queda detrás del interruptor "Mostrar todos
 * los campos" para que la asistente dé de alta en segundos y alguien más
 * complete la historia clínica después.
 *
 * Aquí no se captura el tipo de paciente ni la FUR/FPP. Ninguna paciente *es*
 * obstétrica: *está* embarazada, y el embarazo se registra aparte, con su
 * propio fechado y su desenlace. Preguntarlo en el alta dejaba una bandera que
 * nadie apagaba (el 97% de las marcadas como obstétricas no tenían embarazo
 * activo) y una segunda FUR que en 8 embarazos activos ya no coincidía con la
 * del embarazo, que es de donde sale la fecha probable de parto.
 */
import React, { useState, useEffect, useRef } from 'react'
import { useCambiosDesdeQueAbrio, useCierreSeguro } from '../../../shared/hooks/useCierreSeguro'
import {
    CAlert,
    CBadge,
    CButton,
    CCloseButton,
    CCol,
    CForm,
    CFormInput,
    CFormLabel,
    CFormSelect,
    CFormSwitch,
    CFormTextarea,
    CModal,
    CModalBody,
    CModalFooter,
    CModalHeader,
    CModalTitle,
    CRow,
    CSpinner,
} from '@coreui/react-pro'
import { useAuth } from '../../../shared/context/AuthContext'
import apiClient from '../../../shared/services/api'
import { DateInput } from '../../../shared/components/DateInput'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { normalizarValorCampo } from '../../../shared/utils/patientForm'
import { CORREO, esCorreo, estaVacio } from '../../../shared/utils/validacion'
import {
    usePosiblesDuplicados,
    type CandidatoDuplicado,
} from '../hooks/usePosiblesDuplicados'
import type { Patient, PatientCreate } from '../types'

/** Lo clínico de la ficha: no sale del formulario de recepción (opción C, plan 32). */
const CAMPOS_CLINICOS: (keyof PatientCreate)[] = [
    'personal_history', 'family_history', 'gynecological_history', 'menarca_age', 'menstrual_rhythm',
    'ivsa_age', 'birth_control', 'notas_referencia', 'gestas', 'paras', 'cesareas', 'abortos',
]

const sinLoClinico = (datos: PatientCreate): PatientCreate => {
    const copia = { ...datos } as Record<string, unknown>
    for (const campo of CAMPOS_CLINICOS) delete copia[campo]
    return copia as unknown as PatientCreate
}

interface PacienteFormProps {
    visible: boolean
    onClose: () => void
    onSubmit: (data: PatientCreate) => Promise<void>
    patient?: Patient | null
    title?: string
    /**
     * Al elegir una candidata del aviso de posible duplicado (S-06). Si no se
     * pasa, el aviso sólo ofrece «Es otra persona» para seguir con el alta.
     */
    onElegirExistente?: (candidato: CandidatoDuplicado) => void
}

const Obligatorio: React.FC = () => <span className="text-danger">*</span>

/** Traduce los motivos de coincidencia del servidor a algo legible (S-06). */
const MOTIVO_TEXTO: Record<string, string> = {
    telefono: 'mismo teléfono',
    email: 'mismo correo',
    nombre: 'mismo nombre',
    fecha_de_nacimiento: 'misma fecha de nacimiento',
}
const motivosLegibles = (motivos: string[]): string =>
    motivos.map((m) => MOTIVO_TEXTO[m] ?? m).join(', ')

/** Mismo tope que el `min="0"` de los contadores: el globo del navegador ya no lo dice. */
const CONTEO_NEGATIVO = 'Escribe un número igual o mayor a 0.'

export const PacienteForm: React.FC<PacienteFormProps> = ({
    visible,
    onClose,
    onSubmit,
    patient,
    title = 'Nuevo Paciente',
    onElegirExistente,
}) => {
    const emptyForm: PatientCreate = {
        first_name: '',
        last_name: '',
        date_of_birth: '',
        gender: '',
        phone: '',
        cell_phone: '',
        email: '',
        address: '',
        blood_type: '',
        religion: '',
        menarca_age: undefined,
        menstrual_rhythm: '',
        ivsa_age: undefined,
        birth_control: '',
        gestas: undefined,
        paras: undefined,
        cesareas: undefined,
        abortos: undefined,
        allergies: '',
        notas_referencia: '',
        personal_history: '',
        family_history: '',
        gynecological_history: '',
    }

    const [formData, setFormData] = useState<PatientCreate>(emptyForm)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): sin globo del navegador.
    const [errores, setErrores] = useState<{
        first_name?: string
        last_name?: string
        cell_phone?: string
        email?: string
        gestas?: string
        paras?: string
        cesareas?: string
        abortos?: string
    }>({})
    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
    const [doctors, setDoctors] = useState<{ id: number; full_name: string }[]>([])
    const [mostrarTodo, setMostrarTodo] = useState(false)
    // S-06: aviso de posibles duplicadas. Sólo al crear, nunca al editar.
    const { resultado: duplicados, consultar: consultarDuplicados, limpiar: limpiarDuplicados } =
        usePosiblesDuplicados()
    const [duplicadosDescartados, setDuplicadosDescartados] = useState(false)
    const { user, can } = useAuth()
    // Opción C (plan 32, decisión de Emilio): lo clínico de la ficha —antecedentes,
    // historia gineco-obstétrica, G/P/C/A y las notas de referencia de la
    // doctora— sólo lo ve y lo captura quien tiene el expediente clínico.
    // Recepción captura nombre, contacto, fecha de nacimiento, alergias y FUR.
    // El servidor además ignora lo clínico que mande recepción.
    const veAntecedentes =
        (user?.role === 'master' || Boolean(can?.('medical_history.read'))) &&
        patient?.antecedentes_visibles !== false
    const isSecretaryOrAdmin = user?.role === 'secretaria' || user?.role === 'admin' || user?.role === 'master'

    // Load patient data when editing
    useEffect(() => {
        if (patient) {
            setFormData({
                first_name: patient.first_name,
                last_name: patient.last_name,
                // Un paciente dada de alta express llega sin fecha: el campo se
                // abre vacío para que se capture, no relleno con nada inventado.
                date_of_birth: patient.date_of_birth || '',
                gender: patient.gender || '',
                phone: patient.phone || '',
                cell_phone: patient.cell_phone || '',
                email: patient.email || '',
                address: patient.address || '',
                blood_type: patient.blood_type || '',
                religion: patient.religion || '',
                menarca_age: patient.menarca_age ?? undefined,
                menstrual_rhythm: patient.menstrual_rhythm || '',
                ivsa_age: patient.ivsa_age ?? undefined,
                birth_control: patient.birth_control || '',
                gestas: patient.gestas ?? undefined,
                paras: patient.paras ?? undefined,
                cesareas: patient.cesareas ?? undefined,
                abortos: patient.abortos ?? undefined,
                allergies: patient.allergies || '',
                notas_referencia: patient.notas_referencia || '',
                personal_history: patient.personal_history || '',
                family_history: patient.family_history || '',
                gynecological_history: patient.gynecological_history || '',
                last_menstrual_period: patient.last_menstrual_period || '',
                owner_doctor_id: (patient as any).owner_doctor_id ?? undefined,
            })
            // Al editar se asume que se viene a completar el expediente.
            setMostrarTodo(true)
        } else {
            setFormData(emptyForm)
            setMostrarTodo(false)
        }
        setError(null)
        setErrores({})
        // El aviso de duplicados arranca limpio en cada apertura.
        limpiarDuplicados()
        setDuplicadosDescartados(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patient, visible])

    // S-06: al crear, consulta posibles duplicadas cuando ya hay con qué
    // (apellido o algún teléfono). Con debounce, para no pegarle a cada tecla.
    useEffect(() => {
        if (!visible || patient) return
        const { first_name, last_name, phone, cell_phone, email, date_of_birth } = formData
        const hayConQue =
            !!last_name.trim() || !!(cell_phone || '').trim() || !!(phone || '').trim()
        if (!hayConQue) {
            limpiarDuplicados()
            return
        }
        const temporizador = window.setTimeout(() => {
            // Cada consulta nueva vuelve a mostrar el aviso si lo habían descartado.
            setDuplicadosDescartados(false)
            void consultarDuplicados({
                first_name: first_name || undefined,
                last_name: last_name || undefined,
                phone: phone || undefined,
                cell_phone: cell_phone || undefined,
                email: email || undefined,
                date_of_birth: date_of_birth || undefined,
            })
        }, 400)
        return () => clearTimeout(temporizador)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        visible,
        patient,
        formData.first_name,
        formData.last_name,
        formData.phone,
        formData.cell_phone,
        formData.email,
        formData.date_of_birth,
    ])

    // Fetch doctors list for secretary/admin role
    useEffect(() => {
        if (visible && isSecretaryOrAdmin) {
            apiClient.get('/users/directory?role=doctor').then((res) => {
                setDoctors(res.data || [])
            }).catch(() => {})
        }
    }, [visible, isSecretaryOrAdmin])

    // Lo que había al abrir: si cambió, cerrar por accidente pregunta (plan 29, lote 8).
    const sucio = useCambiosDesdeQueAbrio(visible, formData, patient?.id)
    const { propsModal, pedirCierre } = useCierreSeguro({ visible, sucio, onClose })
    const errorRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' })
    }, [error])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Solo NOMBRE, APELLIDOS y CELULAR son obligatorios en el alta express;
        // se avisa junto al campo y no se manda nada al servidor hasta corregir.
        const faltas: typeof errores = {}
        const correo = formData.email || ''
        if (estaVacio(formData.first_name)) faltas.first_name = 'Escribe el nombre.'
        if (estaVacio(formData.last_name)) faltas.last_name = 'Escribe los apellidos.'
        if (estaVacio(formData.cell_phone || '')) faltas.cell_phone = 'Escribe el celular.'
        if (!estaVacio(correo) && !esCorreo(correo)) faltas.email = CORREO.invalido
        if (formData.gestas != null && formData.gestas < 0) faltas.gestas = CONTEO_NEGATIVO
        if (formData.paras != null && formData.paras < 0) faltas.paras = CONTEO_NEGATIVO
        if (formData.cesareas != null && formData.cesareas < 0) faltas.cesareas = CONTEO_NEGATIVO
        if (formData.abortos != null && formData.abortos < 0) faltas.abortos = CONTEO_NEGATIVO
        if (Object.keys(faltas).length > 0) {
            setErrores(faltas)
            return
        }
        setErrores({})

        setLoading(true)
        setError(null)

        try {
            await onSubmit(veAntecedentes ? formData : sinLoClinico(formData))
            onClose()
        } catch (err: any) {
            setError(err.message || 'Error al guardar paciente')
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (field: keyof PatientCreate, value: string | number) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
        // El aviso se retira en cuanto se corrige ese campo (para los campos que
        // no se validan no hay nada que limpiar).
        limpiarError(field as keyof typeof errores)
    }

    /**
     * onChange de los campos de texto normalizados (mayúsculas, o minúsculas en
     * el correo). Se corrige el valor en el propio DOM antes de avisar a React
     * para que el cursor no salte al final al escribir en medio de una palabra.
     */
    const handleTextoNormalizado = (field: keyof PatientCreate) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        const el = e.target
        const normalizado = normalizarValorCampo(field as string, el.value)
        if (normalizado !== el.value) {
            const inicio = el.selectionStart
            const fin = el.selectionEnd
            el.value = normalizado
            if (inicio !== null && fin !== null) el.setSelectionRange(inicio, fin)
        }
        handleChange(field, normalizado)
    }

    return (
        <CModal visible={visible} onClose={onClose} size="lg" {...propsModal}>
            <CModalHeader closeButton={false}>
                <CModalTitle>{title}</CModalTitle>
                <CCloseButton className="ms-auto" onClick={pedirCierre} aria-label="Cerrar" />
            </CModalHeader>
            <CForm onSubmit={handleSubmit} noValidate>
                <CModalBody>
                    {/* Arriba y a la vista: en el teléfono quedaba al final del formulario. */}
                    {error && (
                        <div className="alert alert-danger" role="alert" ref={errorRef}>
                            {error}
                        </div>
                    )}
                    <div
                        className={`d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded p-2 mb-3 ${
                            mostrarTodo
                                ? 'border-secondary bg-body-tertiary'
                                : 'border-success bg-success-subtle'
                        }`}
                    >
                        <div>
                            <CBadge color={mostrarTodo ? 'secondary' : 'success'}>
                                {mostrarTodo ? 'Expediente completo' : 'Llenado express'}
                            </CBadge>
                            <small className="text-muted ms-2">
                                {mostrarTodo
                                    ? 'Se muestran todos los campos del expediente.'
                                    : 'Solo lo esencial: nombre, apellidos y celular.'}
                            </small>
                        </div>
                        <CFormSwitch
                            id="mostrar_todo"
                            label="Mostrar todos los campos"
                            checked={mostrarTodo}
                            onChange={(e) => setMostrarTodo(e.target.checked)}
                            disabled={loading}
                        />
                    </div>

                    <CRow className="mb-3">
                        <CCol md={6}>
                            <CFormLabel htmlFor="first_name">
                                Nombre <Obligatorio />
                            </CFormLabel>
                            <CFormInput
                                id="first_name"
                                value={formData.first_name}
                                onChange={handleTextoNormalizado('first_name')}
                                required
                                disabled={loading}
                                invalid={Boolean(errores.first_name)}
                                aria-invalid={Boolean(errores.first_name) || undefined}
                                aria-describedby={errores.first_name ? 'error-paciente-nombre' : undefined}
                            />
                            <ErrorDeCampo id="error-paciente-nombre" mensaje={errores.first_name} />
                        </CCol>
                        <CCol md={6}>
                            <CFormLabel htmlFor="last_name">
                                Apellidos <Obligatorio />
                            </CFormLabel>
                            <CFormInput
                                id="last_name"
                                value={formData.last_name}
                                onChange={handleTextoNormalizado('last_name')}
                                required
                                disabled={loading}
                                invalid={Boolean(errores.last_name)}
                                aria-invalid={Boolean(errores.last_name) || undefined}
                                aria-describedby={errores.last_name ? 'error-paciente-apellidos' : undefined}
                            />
                            <ErrorDeCampo id="error-paciente-apellidos" mensaje={errores.last_name} />
                        </CCol>
                    </CRow>

                    <CRow className="mb-3">
                        <CCol md={6}>
                            <CFormLabel htmlFor="cell_phone">
                                Celular <Obligatorio />
                            </CFormLabel>
                            <CFormInput
                                id="cell_phone"
                                type="tel"
                                inputMode="tel"
                                autoComplete="off"
                                value={formData.cell_phone || ''}
                                onChange={(e) => handleChange('cell_phone', e.target.value)}
                                placeholder="(669) 123-45-67"
                                required
                                disabled={loading}
                                invalid={Boolean(errores.cell_phone)}
                                aria-invalid={Boolean(errores.cell_phone) || undefined}
                                aria-describedby={errores.cell_phone ? 'error-paciente-celular' : undefined}
                            />
                            <ErrorDeCampo id="error-paciente-celular" mensaje={errores.cell_phone} />
                        </CCol>
                        {/* El correo sube al alta exprés (plan 32, punto 5): era lo que el
                            preregistro guardaba de más, y con él le llegan la
                            confirmación y los recordatorios de su cita. */}
                        <CCol md={6}>
                            <CFormLabel htmlFor="email">Correo (opcional)</CFormLabel>
                            <CFormInput
                                id="email"
                                type="email"
                                inputMode="email"
                                autoComplete="off"
                                autoCapitalize="none"
                                value={formData.email}
                                onChange={handleTextoNormalizado('email')}
                                placeholder="ejemplo@email.com"
                                disabled={loading}
                                invalid={Boolean(errores.email)}
                                aria-invalid={Boolean(errores.email) || undefined}
                                aria-describedby={errores.email ? 'error-paciente-correo' : undefined}
                            />
                            <ErrorDeCampo id="error-paciente-correo" mensaje={errores.email} />
                        </CCol>
                    </CRow>

                    {/* Alergias y FUR van en el alta exprés (opción C, plan 32): son lo
                        que recepción pregunta en la llamada y lo que el médico
                        necesita ver primero. Las dos son opcionales. */}
                    <CRow className="mb-3">
                        <CCol md={8}>
                            <CFormLabel htmlFor="allergies">Alergias (opcional)</CFormLabel>
                            <CFormTextarea
                                id="allergies"
                                rows={1}
                                value={formData.allergies}
                                onChange={handleTextoNormalizado('allergies')}
                                placeholder="Ej. PENICILINA, LÁTEX… en blanco si aún no se pregunta"
                                disabled={loading}
                            />
                            <small className="text-muted">
                                Se imprime en las recetas. Vacío quiere decir &quot;no registrado&quot;, no &quot;sin alergias&quot;.
                            </small>
                        </CCol>
                        <CCol md={4}>
                            <CFormLabel htmlFor="last_menstrual_period">Última menstruación (FUR, opcional)</CFormLabel>
                            <DateInput
                                id="last_menstrual_period"
                                value={formData.last_menstrual_period || ''}
                                onChange={(iso) => handleChange('last_menstrual_period', iso)}
                                disabled={loading}
                            />
                        </CCol>
                    </CRow>

                    {/* S-06: aviso de teléfono con formato inválido (no bloquea). */}
                    {!patient &&
                        (duplicados?.telefonos || []).some((t) => !t.valido) && (
                            <div className="small text-warning-emphasis mb-3" role="status">
                                El teléfono debe tener 10 dígitos (formato de México). Puedes
                                guardar de todos modos.
                            </div>
                        )}

                    {/* S-06: posibles pacientes ya registradas. Sólo advierte. */}
                    {!patient &&
                        !duplicadosDescartados &&
                        (duplicados?.candidatos.length ?? 0) > 0 && (
                            <CAlert color="warning" className="mb-3">
                                <div className="fw-semibold mb-1">
                                    Puede que este paciente ya esté registrada
                                </div>
                                <div className="small mb-2">
                                    Revisa si es alguna de estas antes de crearla de nuevo:
                                </div>
                                <ul className="mb-2 ps-3">
                                    {duplicados!.candidatos.map((c) => (
                                        <li key={c.patient_id} className="mb-1">
                                            <strong>{c.full_name}</strong>
                                            {c.date_of_birth ? ` · ${c.date_of_birth}` : ''}
                                            {c.telefono_enmascarado
                                                ? ` · tel. ${c.telefono_enmascarado}`
                                                : ''}
                                            <span className="text-body-secondary">
                                                {' '}
                                                ({motivosLegibles(c.motivos)})
                                            </span>
                                            {onElegirExistente && (
                                                <CButton
                                                    size="sm"
                                                    color="warning"
                                                    variant="outline"
                                                    className="ms-2"
                                                    onClick={() => onElegirExistente(c)}
                                                >
                                                    Es este paciente
                                                </CButton>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <CButton
                                    size="sm"
                                    color="secondary"
                                    onClick={() => setDuplicadosDescartados(true)}
                                >
                                    Es otra persona, continuar
                                </CButton>
                            </CAlert>
                        )}

                    {!mostrarTodo && (
                        <CAlert color="light" className="py-2 small mb-0">
                            El resto del expediente (antecedentes, historia gineco-obstétrica,
                            dirección...) se puede completar después activando{' '}
                            <strong>Mostrar todos los campos</strong>.
                        </CAlert>
                    )}

                    {mostrarTodo && (
                        <>
                            <CRow className="mb-3">
                                <CCol md={6}>
                                    <CFormLabel htmlFor="date_of_birth">Fecha de Nacimiento</CFormLabel>
                                    <DateInput
                                        id="date_of_birth"
                                        value={formData.date_of_birth || ''}
                                        onChange={(iso) => handleChange('date_of_birth', iso)}
                                        disabled={loading}
                                    />
                                </CCol>
                                <CCol md={6}>
                                    <CFormLabel htmlFor="gender">Género</CFormLabel>
                                    <CFormSelect
                                        id="gender"
                                        value={formData.gender}
                                        onChange={(e) => handleChange('gender', e.target.value)}
                                        disabled={loading}
                                    >
                                        <option value="">Seleccionar...</option>
                                        <option value="Femenino">Femenino</option>
                                        <option value="Masculino">Masculino</option>
                                        <option value="Otro">Otro</option>
                                    </CFormSelect>
                                </CCol>
                            </CRow>

                            {isSecretaryOrAdmin && (
                                <CRow className="mb-3">
                                    <CCol md={6}>
                                        <CFormLabel htmlFor="owner_doctor_id">Médico titular</CFormLabel>
                                        <CFormSelect
                                            id="owner_doctor_id"
                                            value={formData.owner_doctor_id ?? ''}
                                            onChange={(e) => handleChange('owner_doctor_id', e.target.value ? Number(e.target.value) : '' as any)}
                                            disabled={loading}
                                        >
                                            <option value="">Sin asignar</option>
                                            {doctors.map((d) => (
                                                <option key={d.id} value={d.id}>{d.full_name}</option>
                                            ))}
                                        </CFormSelect>
                                        <small className="text-muted">Asigna este paciente a un médico.</small>
                                    </CCol>
                                </CRow>
                            )}

                            <CRow className="mb-3">
                                <CCol md={6}>
                                    <CFormLabel htmlFor="phone">Teléfono</CFormLabel>
                                    <CFormInput
                                        id="phone"
                                        type="tel"
                                        inputMode="tel"
                                        autoComplete="off"
                                        value={formData.phone}
                                        onChange={(e) => handleChange('phone', e.target.value)}
                                        placeholder="+52 555 123 4567"
                                        disabled={loading}
                                    />
                                </CCol>
                            </CRow>

                            <CRow className="mb-3">
                                <CCol>
                                    <CFormLabel htmlFor="address">Dirección</CFormLabel>
                                    <CFormTextarea
                                        id="address"
                                        rows={3}
                                        value={formData.address}
                                        onChange={handleTextoNormalizado('address')}
                                        disabled={loading}
                                    />
                                </CCol>
                            </CRow>

                            <CRow className="mb-3">
                                <CCol md={6}>
                                    <CFormLabel htmlFor="religion">Religión</CFormLabel>
                                    <CFormInput
                                        id="religion"
                                        value={formData.religion || ''}
                                        onChange={handleTextoNormalizado('religion')}
                                        placeholder="CATÓLICA, CRISTIANA..."
                                        disabled={loading}
                                    />
                                </CCol>
                                <CCol md={6}>
                                    <CFormLabel htmlFor="blood_type">Tipo Sangre</CFormLabel>
                                    <CFormSelect
                                        id="blood_type"
                                        value={formData.blood_type || ''}
                                        onChange={(e) => handleChange('blood_type', e.target.value)}
                                        disabled={loading}
                                    >
                                        <option value="">Desconocido</option>
                                        <option value="A+">A+</option>
                                        <option value="A-">A-</option>
                                        <option value="B+">B+</option>
                                        <option value="B-">B-</option>
                                        <option value="AB+">AB+</option>
                                        <option value="AB-">AB-</option>
                                        <option value="O+">O+</option>
                                        <option value="O-">O-</option>
                                    </CFormSelect>
                                </CCol>
                            </CRow>

                            {veAntecedentes && (
                            <>
                            <hr />
                            <h6 className="mb-3">Historia gineco-obstétrica</h6>

                            <CRow className="mb-3">
                                <CCol md={3}>
                                    <CFormLabel htmlFor="menarca_age">Menarca (edad)</CFormLabel>
                                    <CFormInput
                                        id="menarca_age"
                                        type="number"
                                        inputMode="numeric"
                                        value={formData.menarca_age ?? ''}
                                        onChange={(e) => handleChange('menarca_age', e.target.value ? parseInt(e.target.value) : '')}
                                        placeholder="12"
                                        disabled={loading}
                                    />
                                </CCol>
                                <CCol md={3}>
                                    <CFormLabel htmlFor="menstrual_rhythm">Ritmo</CFormLabel>
                                    <CFormInput
                                        id="menstrual_rhythm"
                                        value={formData.menstrual_rhythm || ''}
                                        onChange={handleTextoNormalizado('menstrual_rhythm')}
                                        placeholder="28X4 EU"
                                        disabled={loading}
                                    />
                                </CCol>
                                <CCol md={3}>
                                    <CFormLabel htmlFor="ivsa_age">IVSA (edad)</CFormLabel>
                                    <CFormInput
                                        id="ivsa_age"
                                        type="number"
                                        inputMode="numeric"
                                        value={formData.ivsa_age ?? ''}
                                        onChange={(e) => handleChange('ivsa_age', e.target.value ? parseInt(e.target.value) : '')}
                                        placeholder="18"
                                        disabled={loading}
                                    />
                                </CCol>
                                <CCol md={3}>
                                    <CFormLabel htmlFor="birth_control">Control Fertilidad</CFormLabel>
                                    <CFormInput
                                        id="birth_control"
                                        value={formData.birth_control || ''}
                                        onChange={handleTextoNormalizado('birth_control')}
                                        placeholder="OTB, DIU, HORMONAL..."
                                        disabled={loading}
                                    />
                                </CCol>
                            </CRow>

                            <CRow className="mb-3">
                                <CCol md={3}>
                                    <CFormLabel htmlFor="gestas">Gestas</CFormLabel>
                                    <CFormInput
                                        id="gestas"
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={formData.gestas ?? ''}
                                        onChange={(e) => handleChange('gestas', e.target.value ? parseInt(e.target.value) : '')}
                                        disabled={loading}
                                        invalid={Boolean(errores.gestas)}
                                        aria-invalid={Boolean(errores.gestas) || undefined}
                                        aria-describedby={errores.gestas ? 'error-paciente-gestas' : undefined}
                                    />
                                    <ErrorDeCampo id="error-paciente-gestas" mensaje={errores.gestas} />
                                </CCol>
                                <CCol md={3}>
                                    <CFormLabel htmlFor="paras">Paras</CFormLabel>
                                    <CFormInput
                                        id="paras"
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={formData.paras ?? ''}
                                        onChange={(e) => handleChange('paras', e.target.value ? parseInt(e.target.value) : '')}
                                        disabled={loading}
                                        invalid={Boolean(errores.paras)}
                                        aria-invalid={Boolean(errores.paras) || undefined}
                                        aria-describedby={errores.paras ? 'error-paciente-paras' : undefined}
                                    />
                                    <ErrorDeCampo id="error-paciente-paras" mensaje={errores.paras} />
                                </CCol>
                                <CCol md={3}>
                                    <CFormLabel htmlFor="cesareas">Cesáreas</CFormLabel>
                                    <CFormInput
                                        id="cesareas"
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={formData.cesareas ?? ''}
                                        onChange={(e) => handleChange('cesareas', e.target.value ? parseInt(e.target.value) : '')}
                                        disabled={loading}
                                        invalid={Boolean(errores.cesareas)}
                                        aria-invalid={Boolean(errores.cesareas) || undefined}
                                        aria-describedby={errores.cesareas ? 'error-paciente-cesareas' : undefined}
                                    />
                                    <ErrorDeCampo id="error-paciente-cesareas" mensaje={errores.cesareas} />
                                </CCol>
                                <CCol md={3}>
                                    <CFormLabel htmlFor="abortos">Abortos</CFormLabel>
                                    <CFormInput
                                        id="abortos"
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={formData.abortos ?? ''}
                                        onChange={(e) => handleChange('abortos', e.target.value ? parseInt(e.target.value) : '')}
                                        disabled={loading}
                                        invalid={Boolean(errores.abortos)}
                                        aria-invalid={Boolean(errores.abortos) || undefined}
                                        aria-describedby={errores.abortos ? 'error-paciente-abortos' : undefined}
                                    />
                                    <ErrorDeCampo id="error-paciente-abortos" mensaje={errores.abortos} />
                                </CCol>
                            </CRow>

                            <hr />
                            <h6 className="mb-3">Antecedentes clínicos</h6>

                            <CRow className="mb-3">
                                <CCol>
                                    <CFormLabel htmlFor="notas_referencia">
                                        Notas de referencia
                                    </CFormLabel>
                                    <CFormTextarea
                                        id="notas_referencia"
                                        rows={2}
                                        value={formData.notas_referencia}
                                        onChange={(e) =>
                                            setFormData({ ...formData, notas_referencia: e.target.value })
                                        }
                                        placeholder="Ej. Vecina de la Sra. López, viene de El Quelite, la recomendó el Dr. Castro..."
                                        disabled={loading}
                                    />
                                    <small className="text-muted">
                                        Para recordar al paciente: de dónde es, quién la recomendó, a qué se
                                        dedica. <strong>No se imprime en las recetas.</strong>
                                    </small>
                                </CCol>
                            </CRow>

                            <CRow className="mb-3">
                                <CCol md={6}>
                                    <CFormLabel htmlFor="personal_history">Antecedentes personales</CFormLabel>
                                    <CFormTextarea
                                        id="personal_history"
                                        rows={2}
                                        value={formData.personal_history}
                                        onChange={handleTextoNormalizado('personal_history')}
                                        disabled={loading}
                                    />
                                </CCol>
                                <CCol md={6}>
                                    <CFormLabel htmlFor="family_history">Antecedentes familiares</CFormLabel>
                                    <CFormTextarea
                                        id="family_history"
                                        rows={2}
                                        value={formData.family_history}
                                        onChange={handleTextoNormalizado('family_history')}
                                        disabled={loading}
                                    />
                                </CCol>
                            </CRow>

                            <CRow className="mb-3">
                                <CCol>
                                    <CFormLabel htmlFor="gynecological_history">Antecedentes gineco-obstétricos</CFormLabel>
                                    <CFormTextarea
                                        id="gynecological_history"
                                        rows={2}
                                        value={formData.gynecological_history}
                                        onChange={handleTextoNormalizado('gynecological_history')}
                                        disabled={loading}
                                    />
                                </CCol>
                            </CRow>
                            </>
                            )}
                            {!veAntecedentes && (
                                <p className="small text-body-secondary mb-0">
                                    Los antecedentes y la historia gineco-obstétrica los captura el médico
                                    en el expediente clínico.
                                </p>
                            )}
                        </>
                    )}

                </CModalBody>
                <CModalFooter>
                    <CButton color="secondary" onClick={pedirCierre} disabled={loading}>
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
