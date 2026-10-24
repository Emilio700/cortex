/**
 * Completar el expediente del paciente SIN salir de la consulta.
 *
 * Hasta ahora, para capturar una fecha de nacimiento o un teléfono que faltaba,
 * el médico tenía que irse al perfil del paciente, editarlo y volver: al
 * salir de la pestaña perdía la nota que llevaba escrita. Es exactamente la
 * pérdida de trabajo que ya nos costó caro, sólo que por otra puerta.
 *
 * Por eso esto es un lápiz en el encabezado y un modal corto encima de la
 * consulta: la pestaña no se mueve y la nota ni se entera.
 *
 * Qué se puede tocar aquí y qué no:
 *
 * - SÍ: lo que el médico levanta en el interrogatorio (contacto, alergias,
 *   tipo de sangre, antecedentes y la historia gineco-obstétrica).
 * - NO el nombre ni los apellidos: es identidad, se corrige en recepción con
 *   una identificación en la mano.
 * - NO la dirección ni el doctor dueño: son administrativos.
 * - NO `patient_type`. No es un dato, es un interruptor que nadie apaga: el
 *   97% de los pacientes marcadas como obstétricas no tienen ningún embarazo
 *   activo. Ya no se edita en ninguna pantalla.
 * - NO la FUR ni la fecha probable de parto: son del embarazo, no del
 *   expediente. Se capturan en el control prenatal, junto con el método de
 *   fechado y el desenlace, para que el sistema tenga UNA sola respuesta a
 *   "de cuándo es este embarazo".
 *
 * La edición es parcial de verdad: sólo viajan los campos que cambiaron, y el
 * backend usa `exclude_unset`, así que un cuerpo de tres campos toca tres
 * campos y no borra el resto del expediente.
 */
import React, { useEffect, useRef, useState } from 'react'
import {
    CAlert,
    CButton,
    CCol,
    CForm,
    CFormInput,
    CFormLabel,
    CFormSelect,
    CFormTextarea,
    CModal,
    CModalBody,
    CModalFooter,
    CModalHeader,
    CModalTitle,
    CRow,
    CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilPencil } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { DateInput } from '../../../shared/components/DateInput'
import { useCambiosSinGuardar } from '../../../shared/tabs/cambiosSinGuardar'
import { mensajeDeError } from '../../../shared/utils/errors'
import { FECHA_NACIMIENTO_RELLENO_LEGACY, getAge } from '../../../shared/utils/date'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { CORREO, esCorreo } from '../../../shared/utils/validacion'
import type { Patient } from '../../secretaria/types'

/** Etiqueta del registro de cambios sin guardar, tal como la lee el médico. */
export const ETIQUETA_CAMBIOS = 'Datos del paciente'

/** Lo único que este formulario puede escribir. La lista es la salvaguarda. */
const CAMPOS = [
    'date_of_birth',
    'phone',
    'cell_phone',
    'email',
    'allergies',
    'blood_type',
    'personal_history',
    'family_history',
    'dominant_hand',
    'neurological_history',
    'implanted_devices',
    'anticoagulants',
] as const

type CampoEditable = (typeof CAMPOS)[number]

/** Van como número o como null; nunca como cadena. */
// Hoy no queda ninguno: los de G/P/C/A eran de GEMS. La conversión a número
// se conserva para el siguiente campo numérico que se agregue.
const CAMPOS_NUMERICOS: CampoEditable[] = []

type Formulario = Record<CampoEditable, string>

const TIPOS_DE_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/**
 * Estado inicial del formulario a partir del expediente guardado.
 *
 * La fecha de nacimiento se muestra vacía cuando vale el relleno 1900-01-01 de
 * la migración: el sistema ya la trata como "no se sabe" en todas las
 * pantallas, así que pintarla en el campo sería afirmar en el formulario una
 * fecha que el resto de la aplicación niega. Como el campo arranca vacío y sólo
 * se envía lo que cambió, dejarlo sin tocar no borra nada.
 */
const aFormulario = (paciente: Patient): Formulario => ({
    date_of_birth:
        paciente.date_of_birth && paciente.date_of_birth !== FECHA_NACIMIENTO_RELLENO_LEGACY
            ? paciente.date_of_birth
            : '',
    phone: paciente.phone ?? '',
    cell_phone: paciente.cell_phone ?? '',
    email: paciente.email ?? '',
    allergies: paciente.allergies ?? '',
    blood_type: paciente.blood_type ?? '',
    personal_history: paciente.personal_history ?? '',
    family_history: paciente.family_history ?? '',
    dominant_hand: paciente.dominant_hand ?? '',
    neurological_history: paciente.neurological_history ?? '',
    implanted_devices: paciente.implanted_devices ?? '',
    anticoagulants: paciente.anticoagulants ?? '',
})

interface DatosPacienteEditablesProps {
    /** Expediente ya cargado. Sin él no se edita: ver el comentario de abajo. */
    paciente: Patient | null
    /** Recibe al paciente tal como quedó guardada en el servidor. */
    onGuardado: (paciente: Patient) => void
    /** Consulta cerrada: se mira, no se escribe. */
    readOnly?: boolean
}

const DatosPacienteEditables: React.FC<DatosPacienteEditablesProps> = ({
    paciente,
    onGuardado,
    readOnly = false,
}) => {
    const [abierto, setAbierto] = useState(false)
    const [valores, setValores] = useState<Formulario | null>(null)
    const [iniciales, setIniciales] = useState<Formulario | null>(null)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [exito, setExito] = useState(false)
    const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)
    // Errores junto al campo (`noValidate`): sin globo del navegador.
    const [errores, setErrores] = useState<{ email?: string }>({})
    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
    const temporizadorExito = useRef<ReturnType<typeof setTimeout> | null>(null)

    const camposCambiados: CampoEditable[] =
        valores && iniciales ? CAMPOS.filter((campo) => valores[campo] !== iniciales[campo]) : []
    const hayCambios = camposCambiados.length > 0

    useCambiosSinGuardar(hayCambios, ETIQUETA_CAMBIOS)

    // El aviso de éxito se retira solo; si el componente se va antes, el
    // temporizador se cancela para no despertar sobre un árbol desmontado.
    useEffect(
        () => () => {
            if (temporizadorExito.current) clearTimeout(temporizadorExito.current)
        },
        [],
    )

    /**
     * Sin expediente cargado no se ofrece editar.
     *
     * Si la lectura del paciente falló, no sabemos qué hay guardado: un
     * formulario en blanco invitaría a escribir encima de datos que sí existen.
     */
    if (!paciente || readOnly) return null

    const abrir = () => {
        const inicial = aFormulario(paciente)
        setValores(inicial)
        setIniciales(inicial)
        setError(null)
        setExito(false)
        setErrores({})
        setConfirmandoDescarte(false)
        setAbierto(true)
    }

    const cerrarDescartando = () => {
        setAbierto(false)
        setConfirmandoDescarte(false)
        setValores(null)
        setIniciales(null)
        setError(null)
        setErrores({})
    }

    /**
     * Cerrar con la ✕ (o con Esc, o tocando fuera) tiene que avisar igual que
     * cerrar la pestaña: el trabajo capturado aquí se pierde de la misma forma.
     */
    const intentarCerrar = () => {
        if (hayCambios) {
            setConfirmandoDescarte(true)
            return
        }
        cerrarDescartando()
    }

    const cambiar = (campo: CampoEditable) => (valor: string) => {
        setValores((previos) => (previos ? { ...previos, [campo]: valor } : previos))
    }

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!valores || !hayCambios) return

        // El correo es opcional (vacío lo borra; hay expedientes migrados sin
        // él), pero si se escribe tiene que tener forma de correo: el servidor
        // lo exige con EmailStr al guardar. Sólo se revisa si viaja entre los
        // campos que cambiaron, para no bloquear otros cambios por un correo
        // viejo que no se está tocando.
        if (camposCambiados.includes('email')) {
            const correo = valores.email.trim()
            if (correo !== '' && !esCorreo(correo)) {
                setErrores({ email: CORREO.invalido })
                return
            }
        }
        setErrores({})

        // Sólo los campos que el médico tocó. Lo que no viaja, el backend no lo
        // toca: es lo que hace segura una edición parcial desde un formulario
        // corto como éste.
        const cuerpo: Record<string, string | number | null> = {}
        for (const campo of camposCambiados) {
            const bruto = valores[campo].trim()
            if (CAMPOS_NUMERICOS.includes(campo)) {
                cuerpo[campo] = bruto === '' ? null : Number(bruto)
            } else {
                cuerpo[campo] = bruto === '' ? null : bruto
            }
        }

        setGuardando(true)
        setError(null)
        try {
            const respuesta = await apiClient.put<Patient>(`/patients/${paciente.id}`, cuerpo)
            const guardada = respuesta.data

            // Lo que se pinta arriba sale de lo que contestó el servidor, no de
            // lo que se tecleó: si el backend normalizó o descartó algo, en
            // pantalla tiene que verse lo que de verdad quedó en la base.
            onGuardado(guardada)

            const yaGuardado = aFormulario(guardada)
            setValores(yaGuardado)
            setIniciales(yaGuardado)

            setExito(true)
            if (temporizadorExito.current) clearTimeout(temporizadorExito.current)
            temporizadorExito.current = setTimeout(() => setExito(false), 6000)
            cerrarDescartando()
        } catch (err: any) {
            // Ni se cierra el modal ni se anuncia nada: si el sistema no guardó,
            // la interfaz no puede decir que sí, y lo capturado se queda donde
            // está para poder reintentar.
            setError(mensajeDeError(err))
        } finally {
            setGuardando(false)
        }
    }

    const texto = (campo: CampoEditable) => ({
        value: valores?.[campo] ?? '',
        onChange: enMayusculas(cambiar(campo)),
        disabled: guardando,
    })

    // El lápiz se vuelve un botón con texto cuando falta justo lo que se nota en
    // el encabezado —la edad en guion o un expediente sin ningún teléfono—,
    // porque ése es el hueco que manda al médico a salirse de la consulta.
    const faltanDatosClave =
        getAge(paciente.date_of_birth) === null || (!paciente.phone && !paciente.cell_phone)

    return (
        <>
            {faltanDatosClave ? (
                <CButton
                    color="warning"
                    size="sm"
                    variant="outline"
                    className="d-inline-flex align-items-center gap-1 py-0 px-2"
                    aria-label="Completar datos del paciente"
                    data-tour="consulta-datos-paciente"
                    onClick={abrir}
                >
                    <CIcon icon={cilPencil} size="sm" />
                    <span className="small">Completar datos</span>
                </CButton>
            ) : (
                <CButton
                    color="link"
                    size="sm"
                    className="p-0 text-decoration-none"
                    data-tour="consulta-datos-paciente"
                    aria-label="Completar datos del paciente"
                    title="Completar datos del paciente"
                    onClick={abrir}
                >
                    <CIcon icon={cilPencil} size="sm" />
                </CButton>
            )}

            {exito && (
                <span className="small text-success ms-2" role="status">
                    Datos actualizados en el expediente.
                </span>
            )}

            <CModal visible={abierto} onClose={intentarCerrar} size="lg" scrollable>
                <CModalHeader closeButton={false}>
                    <CModalTitle>Datos del paciente</CModalTitle>
                    <CButton
                        color="link"
                        className="ms-auto p-0 text-decoration-none fs-4 lh-1 text-body"
                        aria-label="Cerrar"
                        onClick={intentarCerrar}
                    >
                        ×
                    </CButton>
                </CModalHeader>
                <CForm onSubmit={guardar} noValidate>
                    <CModalBody>
                        {/* Se dice de entrada qué NO se puede arreglar desde aquí,
                            para que nadie busque el campo y acabe saliéndose de la
                            consulta a mitad de la nota. */}
                        <p className="text-body-secondary small">
                            Completa lo que levantaste en el interrogatorio sin salir de la consulta.
                            El nombre y la dirección se cambian desde el perfil del paciente, en
                            recepción. Las fechas del embarazo (FUR y fecha probable de parto) se
                            capturan en el control prenatal.
                        </p>

                        {error && (
                            <CAlert color="danger" className="py-2">
                                <strong>No se guardó nada.</strong> {error}
                            </CAlert>
                        )}
                        {confirmandoDescarte && (
                            <CAlert color="warning" className="py-2">
                                <div className="mb-2">
                                    Tienes cambios sin guardar en <strong>{ETIQUETA_CAMBIOS}</strong>.
                                    Si cierras ahora se pierden.
                                </div>
                                <div className="d-flex gap-2">
                                    <CButton
                                        color="secondary"
                                        size="sm"
                                        onClick={() => setConfirmandoDescarte(false)}
                                    >
                                        Seguir editando
                                    </CButton>
                                    <CButton color="danger" size="sm" onClick={cerrarDescartando}>
                                        Descartar cambios
                                    </CButton>
                                </div>
                            </CAlert>
                        )}

                        <CRow className="g-3">
                            <CCol md={4}>
                                <CFormLabel htmlFor="dpe-date_of_birth">
                                    Fecha de nacimiento
                                </CFormLabel>
                                <DateInput
                                    id="dpe-date_of_birth"
                                    value={valores?.date_of_birth ?? ''}
                                    onChange={cambiar('date_of_birth')}
                                    disabled={guardando}
                                />
                            </CCol>
                            <CCol md={4}>
                                <CFormLabel htmlFor="dpe-cell_phone">Celular</CFormLabel>
                                <CFormInput
                                    id="dpe-cell_phone"
                                    type="tel"
                                    {...texto('cell_phone')}
                                />
                            </CCol>
                            <CCol md={4}>
                                <CFormLabel htmlFor="dpe-phone">Teléfono</CFormLabel>
                                <CFormInput id="dpe-phone" type="tel" {...texto('phone')} />
                            </CCol>
                            <CCol md={8}>
                                <CFormLabel htmlFor="dpe-email">Correo</CFormLabel>
                                {/* Sin `enMayusculas`: los correos van en minúscula. */}
                                <CFormInput
                                    id="dpe-email"
                                    type="email"
                                    value={valores?.email ?? ''}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        cambiar('email')(e.target.value)
                                        limpiarError('email')
                                    }}
                                    disabled={guardando}
                                    invalid={Boolean(errores.email)}
                                    aria-invalid={Boolean(errores.email) || undefined}
                                    aria-describedby={errores.email ? 'error-dpe-email' : undefined}
                                />
                                <ErrorDeCampo id="error-dpe-email" mensaje={errores.email} />
                            </CCol>
                            <CCol md={4}>
                                <CFormLabel htmlFor="dpe-blood_type">Tipo de sangre</CFormLabel>
                                <CFormSelect
                                    id="dpe-blood_type"
                                    value={valores?.blood_type ?? ''}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                        cambiar('blood_type')(e.target.value)
                                    }
                                    disabled={guardando}
                                >
                                    <option value="">Desconocido</option>
                                    {TIPOS_DE_SANGRE.map((tipo) => (
                                        <option key={tipo} value={tipo}>
                                            {tipo}
                                        </option>
                                    ))}
                                </CFormSelect>
                            </CCol>
                            <CCol xs={12}>
                                <CFormLabel htmlFor="dpe-allergies">Alergias</CFormLabel>
                                <CFormTextarea id="dpe-allergies" rows={2} {...texto('allergies')} />
                                {/* Dejarlo en blanco no significa "no tiene": el
                                    encabezado sólo pinta la insignia cuando hay algo
                                    capturado, nunca un "sin alergias" que nadie dijo. */}
                                <small className="text-body-secondary">
                                    En blanco significa que no se ha preguntado, no que no tenga.
                                </small>
                            </CCol>
                        </CRow>

                        <hr />
                        <h6 className="mb-3">Antecedentes</h6>
                        <CRow className="g-3">
                            <CCol md={4}>
                                <CFormLabel htmlFor="dpe-personal_history">Personales</CFormLabel>
                                <CFormTextarea
                                    id="dpe-personal_history"
                                    rows={3}
                                    {...texto('personal_history')}
                                />
                            </CCol>
                            <CCol md={4}>
                                <CFormLabel htmlFor="dpe-family_history">Familiares</CFormLabel>
                                <CFormTextarea
                                    id="dpe-family_history"
                                    rows={3}
                                    {...texto('family_history')}
                                />
                            </CCol>
                            <CCol md={4}>
                                <CFormLabel htmlFor="dpe-neurological_history">Neurológicos</CFormLabel>
                                <CFormTextarea
                                    id="dpe-neurological_history"
                                    rows={3}
                                    {...texto('neurological_history')}
                                />
                            </CCol>
                        </CRow>

                        <hr />
                        <h6 className="mb-3">Antes de operar o de pedir resonancia</h6>
                        <CRow className="g-3">
                            <CCol md={4}>
                                <CFormLabel htmlFor="dpe-dominant_hand">Lateralidad</CFormLabel>
                                <CFormSelect
                                    id="dpe-dominant_hand"
                                    value={valores?.dominant_hand ?? ''}
                                    onChange={(e) => cambiar('dominant_hand')(e.target.value)}
                                    disabled={guardando}
                                >
                                    <option value="">Sin registrar</option>
                                    <option value="DIESTRO">Diestro</option>
                                    <option value="ZURDO">Zurdo</option>
                                    <option value="AMBIDIESTRO">Ambidiestro</option>
                                </CFormSelect>
                            </CCol>
                            <CCol md={8}>
                                <CFormLabel htmlFor="dpe-anticoagulants">Anticoagulantes / antiagregantes</CFormLabel>
                                <CFormInput
                                    id="dpe-anticoagulants"
                                    placeholder="ASPIRINA, CLOPIDOGREL, WARFARINA…"
                                    {...texto('anticoagulants')}
                                />
                            </CCol>
                            <CCol xs={12}>
                                <CFormLabel htmlFor="dpe-implanted_devices">Implantes y dispositivos</CFormLabel>
                                <CFormTextarea
                                    id="dpe-implanted_devices"
                                    rows={2}
                                    placeholder="VÁLVULA DE DERIVACIÓN, MARCAPASOS, NEUROESTIMULADOR, MATERIAL METÁLICO…"
                                    {...texto('implanted_devices')}
                                />
                            </CCol>
                        </CRow>
                    </CModalBody>
                    <CModalFooter>
                        <CButton color="secondary" onClick={intentarCerrar} disabled={guardando}>
                            Cancelar
                        </CButton>
                        <CButton type="submit" color="primary" disabled={guardando || !hayCambios}>
                            {guardando ? (
                                <>
                                    <CSpinner size="sm" className="me-2" />
                                    Guardando...
                                </>
                            ) : (
                                'Guardar datos'
                            )}
                        </CButton>
                    </CModalFooter>
                </CForm>
            </CModal>
        </>
    )
}

export default DatosPacienteEditables
