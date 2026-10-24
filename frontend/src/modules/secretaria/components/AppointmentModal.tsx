/**
 * Modal de cita — crear y editar. Es la pantalla que más se usa del sistema.
 *
 * Estructura acordada con el consultorio (docs/DESIGN.md §5):
 * cabecera con el estado · identificación (tipo · paciente · doctor) ·
 * dos paneles (elegir fecha / elegir horario) · duración y sala ·
 * aviso contextual · notas · Cerrar y Guardar.
 *
 * LO QUE SOSTIENE ESTA PANTALLA
 * -----------------------------
 * La rejilla de horarios y la leyenda "Disponible / No disponible" NO se
 * pintan por suposición: salen de `GET /doctor-schedule/availability`, que
 * compone en el servidor las mismas reglas que se validan al guardar
 * (empalme del doctor, bloqueos de agenda, horario de atención y choque de
 * sala). Si esto se pintara a ojo, la asistente elegiría una hora, el servidor
 * la rechazaría, y habríamos empeorado la pantalla.
 *
 * TRAMPAS QUE YA COSTARON CARO
 * ----------------------------
 * - `room_id` sólo viaja en el PUT **si cambió**: mandarlo en `null` le borra
 *   la sala a la cita.
 * - Las horas son **hora local del consultorio**, sin zona. Nada de
 *   `toISOString()` sobre `scheduled_at`: desfasa siete horas.
 * - Los `detail` de error del backend ya vienen en español para el usuario;
 *   se muestran tal cual.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
    CAlert,
    CButton,
    CCloseButton,
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
    CBadge,
    CInputGroup,
    CInputGroupText,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilUser, cilPhone, cilRoom } from '@coreui/icons'
import { useAppointments } from '../hooks/useAppointments'
import { useTriage } from '../hooks/useTriage'
import { usePatients } from '../hooks/usePatients'
import type { Appointment, AppointmentCreate, Patient, PatientCreate, Triage, AppointmentType } from '../types'
import { AppointmentStatus } from '../types'
import { User } from '../../../shared/types'
import { TriageForm } from './TriageForm'
import { PacienteForm } from './PacienteForm'
import AppointmentStatusBadge from '../../../shared/components/AppointmentStatusBadge'
import { listSalas } from '../../../shared/services/salas'
import type { Sala } from '../../../shared/services/salas'
import { salaEsObligatoria, salaPorDefecto, salasActivas } from '../utils/salas'
import { getDisponibilidad } from '../../../shared/services/disponibilidad'
import type { DiaDisponible, Franja } from '../../../shared/services/disponibilidad'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { MOTIVOS_SUGERIDOS } from '../utils/tablero'
import SelectorFecha from './SelectorFecha'
import SelectorHorario from './SelectorHorario'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'
import {
    aClaveFecha,
    cambiarDia,
    deClaveFecha,
    fechaLarga,
    meridianoInicial,
    type Meridiano,
} from '../utils/horarios'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'
import { useToast } from '../../../shared/components/ToastProvider'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { mensajeDeError } from '../../../shared/utils/errors'
import { format, isValid, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatearInstante } from '../../../shared/utils/date'
import { salidaDeConsulta } from '../utils/salidaDeConsulta'
import { useCambiosDesdeQueAbrio, useCierreSeguro } from '../../../shared/hooks/useCierreSeguro'

/**
 * «Cita guardada para el martes 30 de septiembre a las 10:00». La hora es
 * local del consultorio y sin zona, por eso `parseISO` y no `new Date`.
 */
const avisoDeCitaGuardada = (scheduledAt: string): string => {
    const fecha = parseISO(scheduledAt)
    if (!isValid(fecha)) return 'Cita guardada.'
    return `Cita guardada para el ${format(fecha, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })}.`
}

interface AppointmentModalProps {
    visible: boolean
    onClose: () => void
    onSaved: () => void
    appointment?: Appointment | null
    defaultDate?: Date
    doctors: User[]
    /** Sala preseleccionada al crear (p. ej. al pinchar un hueco de la vista por salas). */
    defaultRoomId?: number | null
    /**
     * Paciente ya elegida al crear (p. ej. la que se acaba de dar de alta desde
     * un preregistro, plan 29): no hay que volver a buscarla.
     */
    defaultPatient?: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'phone' | 'email'> | null
    /**
     * Abre el cobro de esta cita. Sólo lo pasa quien puede cobrar: sin él no
     * se dibuja el botón, en vez de ofrecer algo que el servidor rechazaría.
     */
    onCobrar?: (cita: Appointment) => void
    /** Con permiso de alta de pacientes se ofrece registrar al paciente desde aquí. */
    puedeRegistrarPaciente?: boolean
    /**
     * El médico que agenda en su propia Agenda (sin recepción, plan 32,
     * punto 5): la cita nueva nace con ella y la lista sólo la ofrece a ella.
     * El servidor ya rechaza agendar en la agenda de una colega; aquí sólo se
     * evita ofrecerle una opción que le daría un error al guardar.
     */
    doctoraPropiaId?: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** La cita está en sala, en consulta o atendida y es de hoy (hora local): lo que el mostrador cobra. */
export const seCobraHoy = (cita: Pick<Appointment, 'status' | 'scheduled_at'>, hoy = new Date()): boolean =>
    (cita.status === 'en_sala' || cita.status === 'en_consulta' || cita.status === 'atendida') &&
    cita.scheduled_at.slice(0, 10) === aClaveFecha(hoy)

/** "AAAA-MM-DDTHH:MM:SS" en hora local a partir de un Date. Sin pasar por UTC. */
const aScheduledLocal = (fecha: Date): string =>
    `${aClaveFecha(fecha)}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:00`

export const AppointmentModal: React.FC<AppointmentModalProps> = ({
    visible,
    onClose,
    onSaved,
    appointment,
    defaultDate,
    doctors,
    defaultRoomId,
    defaultPatient = null,
    onCobrar,
    puedeRegistrarPaciente = false,
    doctoraPropiaId,
}) => {
    const { createAppointment, updateAppointment, changeStatus, reenviarConfirmacion } = useAppointments()
    const { showSuccess } = useToast()
    const { fetchPatients, createPatient, getPatient } = usePatients()
    const { getTriageByAppointment } = useTriage()

    const [patients, setPatients] = useState<Patient[]>([])
    // Si la búsqueda falla, la lista vacía NO quiere decir que el paciente no
    // exista: se dice, para que no la registren dos veces (plan 29, T-1).
    const [errorBusqueda, setErrorBusqueda] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [showPatientDropdown, setShowPatientDropdown] = useState(false)
    const [selectedPatient, setSelectedPatient] = useState<Pick<Patient, 'id' | 'first_name' | 'last_name' | 'phone' | 'email'> | null>(null)
    const patientInputRef = useRef<HTMLInputElement>(null)
    const patientDropdownRef = useRef<HTMLDivElement>(null)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Errores junto al campo (`noValidate`): el navegador ya no enseña su globo.
    const [errores, setErrores] = useState<{
        paciente?: string
        doctora?: string
        fechaHora?: string
        sala?: string
        duracionHoras?: string
    }>({})
    const limpiarError = (campo: keyof typeof errores) =>
        setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
    const [hasTriage, setHasTriage] = useState(false)
    // Si la lectura de signos falló no sabemos si hay o no: «Pendiente» sería
    // afirmar algo que el sistema no confirmó. Un 403 (doctora sin relación
    // asistencial con el paciente) se dice aparte porque reintentar no lo arregla.
    const [falloTriage, setFalloTriage] = useState<{ sinAcceso: boolean; mensaje: string } | null>(null)
    // Mientras la lectura está en vuelo no se afirma nada: el botón dice
    // «Consultando triage…» y no se ofrece capturar signos sobre lo que quizá
    // ya existe.
    const [consultandoTriage, setConsultandoTriage] = useState(false)

    // Cancellation flow (Fase 3.5): the reason input is only revealed after
    // clicking "Cancelar Cita", and cancelling is blocked until it's non-empty.
    const [showCancelReason, setShowCancelReason] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    // S-05: reenviar la confirmación por correo al paciente.
    const [reenviando, setReenviando] = useState(false)
    const [avisoConfirmacion, setAvisoConfirmacion] = useState<
        { tipo: 'ok' | 'warn' | 'error'; texto: string } | null
    >(null)

    // Triage modal state
    const [showTriageModal, setShowTriageModal] = useState(false)

    // Alta de paciente sin salir de la cita (S-02): con una llamada en curso no
    // se puede ir a Pacientes y volver. El formulario de alta es el mismo de
    // Pacientes y se abre encima; este modal no se toca, así que si se cancela
    // el alta lo capturado de la cita sigue ahí.
    const [altaPacienteVisible, setAltaPacienteVisible] = useState(false)
    const [existingTriage, setExistingTriage] = useState<Triage | null>(null)

    // Salas de la sucursal activa. La sala NO vive en `formData`: se mantiene
    // aparte porque al actualizar sólo se manda si de verdad cambió (un
    // `room_id: null` explícito en el PUT le borra la sala a la cita).
    const [salas, setSalas] = useState<Sala[]>([])
    const [roomId, setRoomId] = useState<number | null>(null)

    const [formData, setFormData] = useState<AppointmentCreate>({
        patient_id: 0,
        doctor_id: 0,
        scheduled_at: '',
        duration_minutes: 30,
        notes: '',
        appointment_type: 'consulta',
        cirugia_type: '',
        hospital: '',
        anestesiologo: '',
        preop_notes: '',
        duration_hours: undefined,
    })

    // ── Disponibilidad ────────────────────────────────────────────────
    const [mesVisible, setMesVisible] = useState<Date>(() => new Date())
    // Al EDITAR una cita que ya tiene dia y hora, el calendario grande y la
    // rejilla no aportan nada: ya esta decidido. Se muestran plegados con un
    // resumen, y se abren solo si se quiere cambiar.
    const [editandoFechaHora, setEditandoFechaHora] = useState(!appointment)
    const [franjas, setFranjas] = useState<Franja[]>([])
    const [diasDelMes, setDiasDelMes] = useState<DiaDisponible[]>([])
    const [jornadaPorDefecto, setJornadaPorDefecto] = useState(false)
    const [cargandoFranjas, setCargandoFranjas] = useState(false)
    const [avisoHorarios, setAvisoHorarios] = useState<string | null>(null)
    const [meridiano, setMeridiano] = useState<Meridiano>('am')
    /** Se fija la primera vez que llegan franjas para no pelearse con el usuario. */
    const meridianoFijado = useRef(false)

    // ── Patient search with debounce ──────────────────────────────────
    const loadPatients = useCallback(async (query: string) => {
        try {
            const data = await fetchPatients(query || undefined)
            setPatients(data)
            setErrorBusqueda(false)
        } catch {
            setPatients([])
            setErrorBusqueda(true)
        }
    }, [fetchPatients])

    // El modal no se desmonta entre aperturas, asi que el valor inicial de
    // useState solo corre una vez: sin esto, abrir una cita existente despues
    // de haber creado una nueva mostraba el calendario desplegado.
    useEffect(() => {
        if (!visible) return
        setEditandoFechaHora(!appointment)
    }, [visible, appointment])

    useEffect(() => {
        if (!visible) return

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }

        // Elasticsearch-like: search with >= 1 character
        if (searchTerm.trim().length >= 1) {
            searchTimeoutRef.current = setTimeout(() => {
                loadPatients(searchTerm.trim())
            }, 250)
        } else if (searchTerm.trim().length === 0 && !selectedPatient) {
            // Load initial batch when opening (no search term)
            loadPatients('')
        } else {
            setPatients([])
        }

        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
        }
    }, [visible, searchTerm, loadPatients, selectedPatient])

    // Salas de la sucursal activa (sólo las activas: son las que se pueden
    // elegir hoy). Se recargan al abrir por si el administrador acaba de
    // dar de alta una.
    useEffect(() => {
        if (!visible) return
        let cancelado = false
        listSalas()
            .then((data) => {
                if (!cancelado) setSalas(salasActivas(data))
            })
            .catch(() => {
                // Sin catálogo de salas el selector no se muestra y el
                // backend sigue decidiendo: no se bloquea el agendado.
                if (!cancelado) setSalas([])
            })
        return () => {
            cancelado = true
        }
    }, [visible])

    // Donde sólo hay una sala (San Ignacio) queda seleccionada sola en
    // cuanto se conoce el catálogo: al usuario no se le pregunta nada.
    useEffect(() => {
        if (!visible || appointment) return
        setRoomId((prev) => salaPorDefecto(salas, prev))
    }, [salas, visible, appointment])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                patientDropdownRef.current &&
                !patientDropdownRef.current.contains(e.target as Node) &&
                patientInputRef.current &&
                !patientInputRef.current.contains(e.target as Node)
            ) {
                setShowPatientDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const loadTriageData = async () => {
        if (appointment && appointment.id) {
            setConsultandoTriage(true)
            setFalloTriage(null)
            try {
                const triageData = await getTriageByAppointment(appointment.id)
                setExistingTriage(triageData)
                setHasTriage(triageData !== null)
            } catch (err) {
                setExistingTriage(null)
                setHasTriage(false)
                const sinAcceso = (err as { status?: number })?.status === 403
                setFalloTriage({
                    sinAcceso,
                    mensaje: sinAcceso
                        ? 'No tienes acceso a los signos vitales de este paciente.'
                        : 'No se pudieron cargar los signos vitales. No sabemos si ya se registraron.',
                })
            } finally {
                setConsultandoTriage(false)
            }
        }
    }

    // Load appointment data when editing
    useEffect(() => {
        if (appointment) {
            setFormData({
                patient_id: appointment.patient_id,
                doctor_id: appointment.doctor_id,
                scheduled_at: appointment.scheduled_at,
                duration_minutes: appointment.duration_minutes,
                notes: appointment.notes || '',
                motivo_extra: appointment.motivo_extra || '',
                appointment_type: (appointment.appointment_type as AppointmentType) || 'consulta',
                cirugia_type: appointment.cirugia_type || '',
                hospital: appointment.hospital || '',
                anestesiologo: appointment.anestesiologo || '',
                preop_notes: appointment.preop_notes || '',
                duration_hours: appointment.duration_hours || undefined,
            })
            setSelectedPatient(appointment.patient || null)
            if (appointment.patient) {
                setSearchTerm(`${appointment.patient.first_name} ${appointment.patient.last_name}`)
            }
            setMesVisible(deClaveFecha(appointment.scheduled_at.slice(0, 10)))
            loadTriageData()
        } else {
            // Cita nueva: la fecha que venga del calendario, o ahora mismo.
            const base = defaultDate ?? new Date()
            setFormData({
                patient_id: defaultPatient?.id ?? 0,
                doctor_id: doctoraPropiaId ?? 0,
                scheduled_at: aScheduledLocal(base),
                duration_minutes: 30,
                notes: '',
                motivo_extra: '',
                appointment_type: 'consulta',
            })
            setMesVisible(new Date(base.getFullYear(), base.getMonth(), 1))
            setHasTriage(false)
            setExistingTriage(null)
            setFalloTriage(null)
            setConsultandoTriage(false)
        }
        setError(null)
        setErrores({})
        if (!appointment) {
            setSearchTerm('')
            setSelectedPatient(defaultPatient)
        }
        setRoomId(appointment ? (appointment.room_id ?? null) : (defaultRoomId ?? null))
        setShowCancelReason(false)
        setCancelReason('')
        meridianoFijado.current = false
        setFranjas([])
        setDiasDelMes([])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appointment, defaultDate, defaultRoomId, defaultPatient, visible])

    // Con la cita a medio capturar (o editada), cerrar por accidente pregunta
    // (plan 29, lote 8). Cuenta el formulario y la sala.
    const citaSucia = useCambiosDesdeQueAbrio(visible, { formData, roomId }, appointment?.id ?? 'nueva')
    const { propsModal: propsCierre, pedirCierre } = useCierreSeguro({ visible, sucio: citaSucia, onClose })

    // ── Fecha y hora derivadas del formulario ─────────────────────────
    const fechaClave = formData.scheduled_at.slice(0, 10)
    const horaSeleccionada = formData.scheduled_at
        ? `${fechaClave}T${(formData.scheduled_at.slice(11, 19) || '00:00:00').padEnd(8, '0')}`
        : null

    const doctorElegido = formData.doctor_id > 0

    /** La consulta de disponibilidad se repite sólo si cambia algo que la afecta. */
    const consultaBase = useMemo(
        () => ({
            doctorId: formData.doctor_id,
            duracionMinutos: formData.duration_minutes,
            salaId: roomId,
            excluirCitaId: appointment?.id ?? null,
        }),
        [formData.doctor_id, formData.duration_minutes, roomId, appointment?.id],
    )

    // Franjas del día elegido.
    useEffect(() => {
        if (!visible || !doctorElegido || !fechaClave) {
            setFranjas([])
            setAvisoHorarios(
                !doctorElegido ? 'Elige primero al médico para ver sus horarios libres.' : null,
            )
            return
        }
        let cancelado = false
        setCargandoFranjas(true)
        setAvisoHorarios(null)
        getDisponibilidad({ ...consultaBase, fecha: fechaClave })
            .then((data) => {
                if (cancelado) return
                setFranjas(data.franjas)
                setJornadaPorDefecto(data.jornada_por_defecto)
                if (!meridianoFijado.current) {
                    setMeridiano(meridianoInicial(data.franjas, horaSeleccionada))
                    meridianoFijado.current = true
                }
            })
            .catch((err: Error) => {
                if (cancelado) return
                // Sin disponibilidad NO se inventan horarios: se dice que no se
                // pudieron consultar, y la cita se sigue pudiendo guardar (el
                // backend valida igual antes de aceptarla).
                setFranjas([])
                setAvisoHorarios(err.message)
            })
            .finally(() => {
                if (!cancelado) setCargandoFranjas(false)
            })
        return () => {
            cancelado = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, doctorElegido, fechaClave, consultaBase])

    // Días con hueco del mes que se está mirando (la leyenda del calendario).
    useEffect(() => {
        if (!visible || !doctorElegido) {
            setDiasDelMes([])
            return
        }
        let cancelado = false
        const primero = aClaveFecha(new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1))
        getDisponibilidad({ ...consultaBase, fecha: primero, incluirMes: true })
            .then((data) => {
                if (!cancelado) setDiasDelMes(data.dias)
            })
            .catch(() => {
                // El calendario se queda neutro: mejor sin colores que con
                // colores inventados.
                if (!cancelado) setDiasDelMes([])
            })
        return () => {
            cancelado = true
        }
    }, [visible, doctorElegido, mesVisible, consultaBase])

    // ── Reglas de sala ────────────────────────────────────────────────
    // Obligatoria donde hay más de una sala activa (G & G). Al editar una
    // cita histórica que nunca tuvo sala NO se fuerza: el backend tampoco lo
    // hace en el PUT, y obligar aquí impediría tocar 25 658 citas viejas.
    const esHistoricaSinSala = !!appointment && appointment.room_id == null
    const salaRequerida = salaEsObligatoria(salas) && !esHistoricaSinSala
    const salaUnica = salas.length === 1 ? salas[0] : null

    const handleChange = (field: keyof AppointmentCreate, value: unknown) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
    }

    const elegirDia = (clave: string) => {
        setFormData((prev) => ({ ...prev, scheduled_at: cambiarDia(prev.scheduled_at, clave) }))
        setMesVisible(deClaveFecha(clave))
        limpiarError('fechaHora')
    }

    const elegirFranja = (franja: Franja) => {
        handleChange('scheduled_at', franja.inicio)
        setMeridiano(franja.meridiano)
        limpiarError('fechaHora')
        // Elegida la hora, ya está decidido: el calendario y la rejilla se
        // pliegan y queda el resumen, como las secciones de la consulta.
        setEditandoFechaHora(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Se recogen todos los faltantes de una vez: corregirlos de uno en uno
        // desespera a la asistente con el paciente enfrente.
        const faltas: typeof errores = {}
        if (formData.patient_id === 0) faltas.paciente = 'Elige al paciente.'
        if (formData.doctor_id === 0) faltas.doctora = 'Elige al médico.'
        if (!formData.scheduled_at) faltas.fechaHora = 'Elige la fecha y el horario de la cita.'
        if (salaRequerida && roomId == null) faltas.sala = 'Elige la sala donde será la cita.'
        // `noValidate` apagó el min/max del navegador: el rango de la duración
        // de cirugía se cuida aquí para no mandarle un disparate al servidor.
        if (
            formData.duration_hours != null &&
            (formData.duration_hours < 0.5 || formData.duration_hours > 12)
        ) {
            faltas.duracionHoras = 'La duración debe estar entre 0.5 y 12 horas.'
        }
        if (Object.keys(faltas).length > 0) {
            setErrores(faltas)
            return
        }
        setErrores({})

        setLoading(true)
        setError(null)

        try {
            let guardada: Appointment
            if (appointment) {
                // OJO: mandar `room_id: null` en el PUT le BORRA la sala a la
                // cita. Por eso la clave sólo viaja cuando de verdad cambió;
                // si no se tocó, ni se menciona.
                const cambios: Partial<AppointmentCreate> = { ...formData }
                if (roomId !== (appointment.room_id ?? null)) cambios.room_id = roomId
                guardada = await updateAppointment(appointment.id, cambios)
            } else {
                guardada = await createAppointment(roomId != null ? { ...formData, room_id: roomId } : formData)
            }
            // Sólo aquí, con la respuesta del servidor en la mano: antes el
            // guardado era silencioso y no había forma de saber si la cita
            // quedó ni para cuándo. La fecha es la que devolvió el servidor.
            showSuccess(avisoDeCitaGuardada(guardada?.scheduled_at || formData.scheduled_at))
            onSaved()
            onClose()
        } catch (err) {
            // El `detail` del backend ya viene redactado en español para quien
            // usa el sistema: se muestra tal cual, sin reescribirlo.
            setError((err as Error).message || 'Error al guardar cita')
        } finally {
            setLoading(false)
        }
    }

    /**
     * Alta desde la cita. Si el servidor la rechaza, el error sube al
     * formulario de alta, que se queda abierto con el motivo; sólo con la
     * paciente creado se elige y se avisa.
     */
    const registrarPaciente = async (datos: PatientCreate) => {
        const nueva = await createPatient(datos)
        const nombre = `${nueva.first_name} ${nueva.last_name}`
        setSelectedPatient(nueva)
        handleChange('patient_id', nueva.id)
        limpiarError('paciente')
        setSearchTerm(nombre)
        setShowPatientDropdown(false)
        showSuccess(`Paciente ${nombre} registrada y elegida para esta cita.`)
    }

    /**
     * S-06: si el aviso de duplicado muestra que el paciente ya existe, se
     * elige a la existente para la cita en vez de crearla de nuevo. Sólo se
     * confirma si el servidor devolvió el paciente.
     */
    const elegirPacienteExistente = async (candidato: { patient_id: number; full_name: string }) => {
        try {
            const existente = await getPatient(candidato.patient_id)
            setSelectedPatient(existente)
            handleChange('patient_id', existente.id)
            setSearchTerm(`${existente.first_name} ${existente.last_name}`)
            setShowPatientDropdown(false)
            setAltaPacienteVisible(false)
            limpiarError('paciente')
            showSuccess(`Se eligió a ${candidato.full_name} para esta cita.`)
        } catch {
            // Si no se pudo traer, el alta se queda abierta: no se afirma nada.
        }
    }

    /**
     * S-05: reenvía la confirmación por correo. Sólo se afirma «se reenvió» si
     * el servidor lo confirma (`enviado`); si el paciente no tiene correo o el
     * envío falló, se dice con honestidad, sin fingir éxito.
     */
    const handleReenviarConfirmacion = async () => {
        if (!appointment) return
        setReenviando(true)
        setAvisoConfirmacion(null)
        try {
            const r = await reenviarConfirmacion(appointment.id)
            if (r.enviado) {
                setAvisoConfirmacion({
                    tipo: 'ok',
                    texto: `Se reenvió la confirmación a ${r.destinatario ?? 'el paciente'}.`,
                })
            } else if (r.motivo === 'sin_email') {
                setAvisoConfirmacion({
                    tipo: 'warn',
                    texto: 'El paciente no tiene correo capturado, así que no se envió nada.',
                })
            } else {
                setAvisoConfirmacion({
                    tipo: 'error',
                    texto: 'No se pudo reenviar la confirmación. Intenta de nuevo en un momento.',
                })
            }
        } catch (err) {
            setAvisoConfirmacion({
                tipo: 'error',
                texto: mensajeDeError(err, 'No se pudo reenviar la confirmación.'),
            })
        } finally {
            setReenviando(false)
        }
    }

    const handleStatusChange = async (newStatus: AppointmentStatus, reason?: string) => {
        if (!appointment) return

        // Regresar a sala desde la consulta no es una llegada: no pide triage
        // (el servidor tampoco).
        if (newStatus === 'en_sala' && !hasTriage && appointment.status !== 'en_consulta') {
            setError('Registra el triage antes de pasar a «En sala».')
            return
        }

        if (newStatus === 'cancelada' && !reason?.trim()) {
            setError('Escribe el motivo de la cancelación.')
            return
        }

        try {
            setLoading(true)
            setError(null)
            await changeStatus(appointment.id, newStatus, reason)
            onSaved()
            onClose()
        } catch (err) {
            setError((err as Error).message || 'Error al cambiar estado')
        } finally {
            setLoading(false)
        }
    }

    const diaLargo = fechaClave ? fechaLarga(deClaveFecha(fechaClave)) : ''
    const horaLegible = horaSeleccionada ? horaSeleccionada.slice(11, 16) : null
    /** La hora guardada no cae en la rejilla (una cita vieja a las 10:07, p. ej.). */
    const horaFueraDeRejilla =
        !!horaSeleccionada && franjas.length > 0 && !franjas.some((f) => f.inicio === horaSeleccionada)

    return (
        <CModal
            visible={visible}
            onClose={onClose}
            size="xl"
            scrollable
            className="gems-modal-cita"
            aria-labelledby="titulo-modal-cita"
            {...propsCierre}
        >
            <CModalHeader closeButton={false}>
                {/* h2 con aspecto de h5: va debajo del h1 de la pantalla (axe,
                    heading-order) y da nombre al diálogo (aria-dialog-name). */}
                <CModalTitle as="h2" className="h5" id="titulo-modal-cita">
                    {appointment ? 'Editar Cita' : 'Nueva Cita'}
                    {appointment && (
                        <AppointmentStatusBadge status={appointment.status} className="ms-2" />
                    )}
                </CModalTitle>
                <BotonAyudaContextual recorridoId="cita-formulario" />
                <CCloseButton className="ms-auto" onClick={pedirCierre} aria-label="Cerrar" />
            </CModalHeader>
            <CForm onSubmit={handleSubmit} noValidate>
                <CModalBody data-tour="cita-formulario">
                    {/* ── 1. Identificación: tipo · paciente · doctor ── */}
                    <CRow className="mb-3" data-tour="cita-identificacion">
                        <CCol md={4}>
                            <CFormLabel htmlFor="appointment_type">Tipo de Cita</CFormLabel>
                            <CFormSelect
                                id="appointment_type"
                                className="gems-campo"
                                value={formData.appointment_type || 'consulta'}
                                onChange={(e) => handleChange('appointment_type', e.target.value as AppointmentType)}
                                disabled={loading}
                            >
                                <option value="consulta">Consulta</option>
                                <option value="cirugia">Cirugía</option>
                                <option value="procedimiento">Procedimiento</option>
                            </CFormSelect>
                        </CCol>
                        <CCol md={4} data-tour="cita-paciente">
                            <CFormLabel htmlFor="patient_search">
                                Paciente <span className="text-danger">*</span>
                            </CFormLabel>
                            <div style={{ position: 'relative' }}>
                                <CInputGroup>
                                    <CInputGroupText className="bg-transparent">
                                        <CIcon icon={cilSearch} />
                                    </CInputGroupText>
                                    <CFormInput
                                        ref={patientInputRef}
                                        id="patient_search"
                                        className="gems-campo"
                                        type="text"
                                        value={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : searchTerm}
                                        onChange={(e) => {
                                            const val = e.target.value
                                            setSearchTerm(val)
                                            setSelectedPatient(null)
                                            handleChange('patient_id', 0)
                                            setShowPatientDropdown(true)
                                            limpiarError('paciente')
                                        }}
                                        onFocus={() => {
                                            if (!selectedPatient) setShowPatientDropdown(true)
                                        }}
                                        disabled={loading || !!appointment}
                                        autoComplete="off"
                                        invalid={Boolean(errores.paciente)}
                                        aria-invalid={Boolean(errores.paciente) || undefined}
                                        aria-describedby={errores.paciente ? 'error-cita-paciente' : undefined}
                                    />
                                </CInputGroup>

                                {showPatientDropdown && !appointment && (
                                    <div
                                        ref={patientDropdownRef}
                                        className="patient-search-dropdown position-absolute w-100"
                                        style={{
                                            zIndex: 1050,
                                            maxHeight: '280px',
                                            overflowY: 'auto',
                                            backgroundColor: 'var(--cui-body-bg, #fff)',
                                            border: '1px solid var(--cui-border-color, #dbdfe6)',
                                            borderRadius: '8px',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                            marginTop: '4px',
                                        }}
                                    >
                                        {errorBusqueda ? (
                                            <div className="p-3 text-center text-danger small" role="alert">
                                                No se pudo buscar. Esto no quiere decir que el paciente no exista: no la
                                                registres de nuevo.{' '}
                                                <button
                                                    type="button"
                                                    className="btn btn-link btn-sm p-0 align-baseline"
                                                    onClick={() => void loadPatients(searchTerm.trim())}
                                                >
                                                    Reintentar
                                                </button>
                                            </div>
                                        ) : searchTerm.trim().length === 0 && patients.length === 0 ? (
                                            <div className="p-3 text-center text-muted small">
                                                Escribe el apellido, el nombre o el teléfono del paciente.
                                            </div>
                                        ) : patients.length === 0 ? (
                                            <div className="p-3 text-center text-muted small">
                                                {puedeRegistrarPaciente
                                                    ? 'Sin resultados. Si es nueva, regístrala con «Registrar paciente nuevo».'
                                                    : 'Sin resultados. Revisa cómo está escrito el nombre o el teléfono.'}
                                            </div>
                                        ) : (
                                            patients.map((patient) => {
                                                const fullName = `${patient.first_name} ${patient.last_name}`
                                                const isSelected = selectedPatient?.id === patient.id
                                                return (
                                                    <div
                                                        key={patient.id}
                                                        className={`d-flex align-items-center gap-2 px-3 py-2 ${isSelected ? 'bg-primary bg-opacity-10' : ''}`}
                                                        style={{ cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                                                        onClick={() => {
                                                            setSelectedPatient(patient)
                                                            handleChange('patient_id', patient.id)
                                                            setSearchTerm(fullName)
                                                            setShowPatientDropdown(false)
                                                            limpiarError('paciente')
                                                        }}
                                                    >
                                                        <div
                                                            className="rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0"
                                                            style={{ width: '38px', height: '38px', backgroundColor: '#0d6efd', fontSize: '14px' }}
                                                        >
                                                            <CIcon icon={cilUser} />
                                                        </div>
                                                        <div className="flex-grow-1 min-width-0">
                                                            <div className="fw-semibold small text-truncate">{fullName}</div>
                                                            <div className="small text-muted d-flex gap-2">
                                                                {patient.phone && (
                                                                    <span><CIcon icon={cilPhone} size="sm" className="me-1" />{patient.phone}</span>
                                                                )}
                                                                {patient.email && (
                                                                    <span className="text-truncate">{patient.email}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {isSelected && (
                                                            <CBadge color="primary" shape="rounded-pill" className="flex-shrink-0">Seleccionado</CBadge>
                                                        )}
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                            <ErrorDeCampo id="error-cita-paciente" mensaje={errores.paciente} />
                            {!appointment && puedeRegistrarPaciente && (
                                <CButton
                                    color="link"
                                    size="sm"
                                    className="px-0"
                                    type="button"
                                    data-tour="cita-paciente-nueva"
                                    onClick={() => {
                                        setShowPatientDropdown(false)
                                        setAltaPacienteVisible(true)
                                    }}
                                    disabled={loading}
                                >
                                    + Registrar paciente nuevo
                                </CButton>
                            )}
                            {/* Etiqueta verde: que no quede duda de a quién se le agenda. */}
                            {selectedPatient && (
                                <div className="mt-2">
                                    <CBadge color="success" shape="rounded-pill" className="small d-inline-flex align-items-center gap-1 px-2 py-1">
                                        <CIcon icon={cilUser} size="sm" />
                                        {selectedPatient.first_name} {selectedPatient.last_name}
                                        {selectedPatient.phone && (
                                            <span className="ms-1 fw-normal opacity-75">{selectedPatient.phone}</span>
                                        )}
                                    </CBadge>
                                </div>
                            )}
                        </CCol>
                        <CCol md={4} data-tour="cita-doctor">
                            <CFormLabel htmlFor="doctor_id">
                                Médico <span className="text-danger">*</span>
                            </CFormLabel>
                            <CFormSelect
                                id="doctor_id"
                                className="gems-campo"
                                value={formData.doctor_id}
                                onChange={(e) => {
                                    handleChange('doctor_id', parseInt(e.target.value))
                                    limpiarError('doctora')
                                }}
                                required
                                disabled={loading}
                                invalid={Boolean(errores.doctora)}
                                aria-invalid={Boolean(errores.doctora) || undefined}
                                aria-describedby={errores.doctora ? 'error-cita-doctora' : undefined}
                            >
                                <option value={0}>Elige al médico...</option>
                                {(doctoraPropiaId
                                    ? doctors.filter((doctor) => doctor.id === doctoraPropiaId)
                                    : doctors
                                ).map((doctor) => (
                                    <option key={doctor.id} value={doctor.id}>
                                        {nombreConTratamiento(doctor)}
                                    </option>
                                ))}
                            </CFormSelect>
                            <ErrorDeCampo id="error-cita-doctora" mensaje={errores.doctora} />
                        </CCol>
                    </CRow>

                    {formData.appointment_type === 'cirugia' && (
                        <CRow className="mb-3">
                            <CCol md={6}>
                                <CFormLabel htmlFor="cirugia_type">Tipo de Cirugía</CFormLabel>
                                <CFormInput
                                    id="cirugia_type"
                                    className="gems-campo"
                                    value={formData.cirugia_type || ''}
                                    onChange={enMayusculas((v) => handleChange('cirugia_type', v))}
                                />
                            </CCol>
                            <CCol md={6}>
                                <CFormLabel htmlFor="hospital">Hospital</CFormLabel>
                                <CFormInput
                                    id="hospital"
                                    className="gems-campo"
                                    value={formData.hospital || ''}
                                    onChange={enMayusculas((v) => handleChange('hospital', v))}
                                />
                            </CCol>
                            <CCol md={6} className="mt-2">
                                <CFormLabel htmlFor="anestesiologo">Anestesiólogo</CFormLabel>
                                <CFormInput
                                    id="anestesiologo"
                                    className="gems-campo"
                                    value={formData.anestesiologo || ''}
                                    onChange={enMayusculas((v) => handleChange('anestesiologo', v))}
                                />
                            </CCol>
                            <CCol md={6} className="mt-2">
                                <CFormLabel htmlFor="duration_hours">Duración (horas)</CFormLabel>
                                <CFormInput
                                    id="duration_hours"
                                    className="gems-campo"
                                    type="number"
                                    inputMode="decimal"
                                    step="0.5"
                                    min="0.5"
                                    max="12"
                                    value={formData.duration_hours || ''}
                                    onChange={(e) => {
                                        handleChange('duration_hours', e.target.value ? Number(e.target.value) : undefined)
                                        limpiarError('duracionHoras')
                                    }}
                                    invalid={Boolean(errores.duracionHoras)}
                                    aria-invalid={Boolean(errores.duracionHoras) || undefined}
                                    aria-describedby={errores.duracionHoras ? 'error-cita-duracion-horas' : undefined}
                                />
                                <ErrorDeCampo id="error-cita-duracion-horas" mensaje={errores.duracionHoras} />
                            </CCol>
                            <CCol md={12} className="mt-2">
                                <CFormLabel htmlFor="preop_notes">Notas Pre-operatorias</CFormLabel>
                                <CFormInput
                                    id="preop_notes"
                                    className="gems-campo"
                                    value={formData.preop_notes || ''}
                                    onChange={enMayusculas((v) => handleChange('preop_notes', v))}
                                />
                            </CCol>
                        </CRow>
                    )}

                    {/* ── 2. Dos paneles: fecha y horario ── */}
                    {!editandoFechaHora && horaLegible ? (
                        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded p-3 mb-3 bg-body-tertiary" data-tour="cita-fecha-hora">
                            <div>
                                <div className="small text-body-secondary">Fecha y hora</div>
                                <div className="fw-semibold">
                                    {diaLargo} a las {horaLegible}
                                </div>
                            </div>
                            <CButton
                                color="primary"
                                variant="outline"
                                size="sm"
                                onClick={() => setEditandoFechaHora(true)}
                                disabled={loading}
                            >
                                {appointment ? 'Reagendar' : 'Cambiar fecha u hora'}
                            </CButton>
                        </div>
                    ) : (
                    <CRow className="mb-3" data-tour="cita-fecha-hora">
                        <CCol lg={6} className="mb-3 mb-lg-0">
                            <div className="border rounded p-3 h-100">
                                <div className="fw-semibold mb-2">Selecciona la fecha</div>
                                <SelectorFecha
                                    mes={mesVisible}
                                    onCambiarMes={setMesVisible}
                                    seleccionada={fechaClave || null}
                                    onSeleccionar={elegirDia}
                                    dias={diasDelMes}
                                    disabled={loading}
                                />
                            </div>
                        </CCol>
                        <CCol lg={6}>
                            <div className="border rounded p-3 h-100">
                                <div className="fw-semibold mb-2">Selecciona un horario</div>
                                <SelectorHorario
                                    franjas={franjas}
                                    seleccionada={horaSeleccionada}
                                    onSeleccionar={elegirFranja}
                                    meridiano={meridiano}
                                    onCambiarMeridiano={setMeridiano}
                                    fechaLarga={diaLargo}
                                    cargando={cargandoFranjas}
                                    disabled={loading}
                                    aviso={avisoHorarios}
                                />
                                {horaLegible && (
                                    <div className="small mt-2">
                                        <strong>Cita:</strong> {diaLargo} a las {horaLegible}
                                        {horaFueraDeRejilla && (
                                            <span className="text-body-secondary">
                                                {' '}— esta hora no cae en la rejilla; se conserva
                                                tal cual si no eliges otra.
                                            </span>
                                        )}
                                    </div>
                                )}
                                {jornadaPorDefecto && doctorElegido && !avisoHorarios && (
                                    <div className="small text-body-secondary mt-1">
                                        Esta doctora no tiene horario de atención configurado ese día;
                                        se muestra la jornada del consultorio (07:00 a 20:00).
                                    </div>
                                )}
                            </div>
                        </CCol>
                    </CRow>
                    )}
                    <ErrorDeCampo id="error-cita-fecha-hora" mensaje={errores.fechaHora} />

                    {/* ── 3. Duración y sala, lado a lado ── */}
                    <CRow className="mb-3" data-tour="cita-duracion-sala">
                        <CCol md={6}>
                            <CFormLabel htmlFor="duration_minutes">Duración</CFormLabel>
                            <CFormSelect
                                id="duration_minutes"
                                className="gems-campo"
                                value={formData.duration_minutes}
                                onChange={(e) => handleChange('duration_minutes', parseInt(e.target.value))}
                                disabled={loading}
                            >
                                <option value={15}>15 min</option>
                                <option value={30}>30 min</option>
                                <option value={45}>45 min</option>
                                <option value={60}>60 min</option>
                            </CFormSelect>
                        </CCol>
                        {salas.length > 0 && (
                            <CCol md={6}>
                                <CFormLabel htmlFor="room_id">
                                    Sala {salaRequerida && <span className="text-danger">*</span>}
                                </CFormLabel>
                                {salaUnica ? (
                                    // Una sola sala: no se pregunta nada, sólo se deja constancia.
                                    <div className="d-flex align-items-center gap-2 pt-1">
                                        <CBadge color="info" className="p-2 rounded-1">
                                            <CIcon icon={cilRoom} size="sm" className="me-1" />
                                            {salaUnica.name}
                                        </CBadge>
                                        <span className="small text-body-secondary">
                                            única sala de esta sucursal
                                        </span>
                                    </div>
                                ) : (
                                    <CFormSelect
                                        id="room_id"
                                        className="gems-campo"
                                        value={roomId ?? ''}
                                        onChange={(e) => {
                                            setRoomId(e.target.value ? Number(e.target.value) : null)
                                            limpiarError('sala')
                                        }}
                                        // `aria-required` y no `required`: así el aviso
                                        // que ve el usuario es el nuestro, en español, y
                                        // no el genérico del navegador.
                                        aria-required={salaRequerida}
                                        disabled={loading}
                                        invalid={Boolean(errores.sala)}
                                        aria-invalid={Boolean(errores.sala) || undefined}
                                        aria-describedby={errores.sala ? 'error-cita-sala' : undefined}
                                    >
                                        <option value="">
                                            {esHistoricaSinSala
                                                ? 'Sin sala (cita anterior a las salas)'
                                                : 'Seleccionar sala...'}
                                        </option>
                                        {salas.map((sala) => (
                                            <option key={sala.id} value={sala.id}>
                                                {sala.name}
                                            </option>
                                        ))}
                                    </CFormSelect>
                                )}
                                <ErrorDeCampo id="error-cita-sala" mensaje={errores.sala} />
                            </CCol>
                        )}
                    </CRow>

                    {/* ── 4. Aviso contextual ── */}
                    {esHistoricaSinSala && salas.length > 0 && (
                        <CAlert color="warning" className="py-2 small">
                            Esta cita se agendó antes de que hubiera salas. Puedes dejarla en blanco
                            o asignarle una.
                        </CAlert>
                    )}

                    {/* ── 5. Motivo extra ──
                        Nota OPCIONAL para el doctor: "Control", "Primera vez",
                        "Ultrasonido"... Las sugerencias son atajos de un clic,
                        no una lista cerrada: debajo se puede escribir lo que
                        sea. NO son tipos de cita (los del sistema siguen
                        siendo tres) y no bloquean nunca el guardado. */}
                    <CRow className="mb-3" data-tour="cita-motivo">
                        <CCol>
                            <CFormLabel htmlFor="motivo_extra">Motivo (opcional)</CFormLabel>
                            <p className="small text-body-secondary mb-2">
                                ¿Por qué viene el paciente? Es una nota para el médico; puedes
                                dejarla en blanco.
                            </p>
                            <div className="d-flex flex-wrap gap-1 mb-2" role="group" aria-label="Sugerencias de motivo">
                                {MOTIVOS_SUGERIDOS.map((sugerencia) => {
                                    const elegida = (formData.motivo_extra || '') === sugerencia
                                    return (
                                        <CButton
                                            key={sugerencia}
                                            type="button"
                                            size="sm"
                                            color="primary"
                                            variant="outline"
                                            className={`gems-chip gems-chip-motivo${elegida ? ' gems-chip-activo' : ''}`}
                                            aria-pressed={elegida}
                                            disabled={loading}
                                            // Volver a pulsar la que ya está puesta la quita: es
                                            // opcional, tiene que poder deshacerse sin borrar a mano.
                                            onClick={() => handleChange('motivo_extra', elegida ? '' : sugerencia)}
                                        >
                                            {sugerencia}
                                        </CButton>
                                    )
                                })}
                            </div>
                            <CFormInput
                                id="motivo_extra"
                                className="gems-campo"
                                type="text"
                                maxLength={120}
                                value={formData.motivo_extra || ''}
                                onChange={enMayusculas((v) => handleChange('motivo_extra', v))}
                                disabled={loading}
                            />
                        </CCol>
                    </CRow>

                    {/* ── 6. Notas ── */}
                    <CRow className="mb-3">
                        <CCol>
                            <CFormLabel htmlFor="notes">Notas adicionales (opcional)</CFormLabel>
                            <CFormTextarea
                                id="notes"
                                className="gems-campo"
                                rows={3}
                                value={formData.notes}
                                onChange={enMayusculas((v) => handleChange('notes', v))}
                                disabled={loading}
                            />
                        </CCol>
                    </CRow>

                    {error && <div className="alert alert-danger">{error}</div>}

                    {/* Status change buttons (only when editing) */}
                    {appointment && appointment.status !== 'atendida' && appointment.status !== 'cancelada' && (
                        <>
                            <hr />
                            <div className="d-flex gap-2 flex-wrap align-items-center" data-tour="cita-estado">
                                <strong>Cambiar Estado:</strong>
                                {appointment.status === 'agendada' && (
                                    <CButton
                                        color="success"
                                        size="sm"
                                        type="button"
                                        onClick={() => handleStatusChange(AppointmentStatus.CONFIRMADA)}
                                        disabled={loading}
                                    >
                                        Confirmar
                                    </CButton>
                                )}
                                {appointment.status === 'confirmada' && (
                                    <CButton
                                        color="warning"
                                        size="sm"
                                        type="button"
                                        onClick={() => handleStatusChange(AppointmentStatus.EN_SALA)}
                                        disabled={loading || consultandoTriage || !hasTriage}
                                    >
                                        Pasar a Sala
                                        {consultandoTriage ? (
                                            <small className="ms-1">(Consultando triage…)</small>
                                        ) : !hasTriage && !falloTriage ? (
                                            <small className="ms-1">(Requiere triage)</small>
                                        ) : null}
                                    </CButton>
                                )}
                                {(appointment.status === 'en_sala' || appointment.status === 'en_consulta') && (
                                    <CButton
                                        color="info"
                                        size="sm"
                                        type="button"
                                        onClick={() => handleStatusChange(AppointmentStatus.ATENDIDA)}
                                        disabled={loading}
                                    >
                                        Marcar como Atendida
                                    </CButton>
                                )}
                                {appointment.status === 'en_consulta' && (
                                    // El médico salió sin cerrar la consulta: vuelve al
                                    // estado del que entró. «En consulta» no se elige:
                                    // lo pone abrir la consulta (plan 28, D-3).
                                    <CButton
                                        color="warning"
                                        variant="outline"
                                        size="sm"
                                        type="button"
                                        onClick={() =>
                                            handleStatusChange(
                                                salidaDeConsulta(appointment).destino as AppointmentStatus,
                                            )
                                        }
                                        disabled={loading}
                                        title={salidaDeConsulta(appointment).explicacion}
                                    >
                                        {salidaDeConsulta(appointment).texto}
                                    </CButton>
                                )}
                                {!showCancelReason && (
                                    <CButton
                                        color="danger"
                                        size="sm"
                                        type="button"
                                        onClick={() => setShowCancelReason(true)}
                                        disabled={loading}
                                    >
                                        Cancelar Cita
                                    </CButton>
                                )}
                            </div>

                            {showCancelReason && (
                                <div className="mt-2">
                                    <CFormLabel htmlFor="cancel_reason">
                                        Motivo de cancelación <span className="text-danger">*</span>
                                    </CFormLabel>
                                    <CFormTextarea
                                        id="cancel_reason"
                                        className="gems-campo"
                                        rows={2}
                                        value={cancelReason}
                                        onChange={enMayusculas(setCancelReason)}
                                        disabled={loading}
                                        autoFocus
                                    />
                                    <div className="d-flex gap-2 mt-2">
                                        <CButton
                                            color="danger"
                                            size="sm"
                                            type="button"
                                            onClick={() => handleStatusChange(AppointmentStatus.CANCELADA, cancelReason)}
                                            disabled={loading || !cancelReason.trim()}
                                        >
                                            Confirmar cancelación
                                        </CButton>
                                        <CButton
                                            color="secondary"
                                            variant="outline"
                                            size="sm"
                                            type="button"
                                            onClick={() => {
                                                setShowCancelReason(false)
                                                setCancelReason('')
                                            }}
                                            disabled={loading}
                                        >
                                            Volver
                                        </CButton>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Cancellation trail (Fase 3.5) - shown read-only once cancelled */}
                    {appointment && appointment.status === 'cancelada' && appointment.cancellation_reason && (
                        <>
                            <hr />
                            <div className="alert alert-danger mb-0">
                                <strong>Cita cancelada</strong>
                                {appointment.cancelled_at && (
                                    <span className="text-muted">
                                        {' '}
                                        el {formatearInstante(appointment.cancelled_at, { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                )}
                                <div className="mt-1">
                                    <strong>Motivo:</strong> {appointment.cancellation_reason}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Cobro desde la cita (S-03). Mismas citas que ofrece «Registrar
                        pago»: las de hoy en sala (cobro anticipado) y atendidas. Una
                        agendada o confirmada todavía no se cobra en el flujo del mostrador. */}
                    {appointment && onCobrar && seCobraHoy(appointment) && (
                        <>
                            <hr />
                            <div className="d-flex justify-content-between align-items-center" data-tour="cita-cobrar">
                                <strong>Cobro de la cita</strong>
                                <CButton
                                    color="success"
                                    size="sm"
                                    type="button"
                                    onClick={() => onCobrar(appointment)}
                                    disabled={loading}
                                >
                                    Cobrar
                                </CButton>
                            </div>
                        </>
                    )}

                    {/* Triage section (only for existing appointments) */}
                    {appointment && (
                        <>
                            <hr />
                            <div className="d-flex justify-content-between align-items-center" data-tour="cita-triage">
                                <div>
                                    <strong>Triage:</strong>{' '}
                                    {consultandoTriage ? (
                                        <CBadge color="secondary">Consultando…</CBadge>
                                    ) : falloTriage ? (
                                        <CBadge color="secondary">
                                            {falloTriage.sinAcceso ? 'Sin acceso' : 'No se pudo cargar'}
                                        </CBadge>
                                    ) : hasTriage ? (
                                        <CBadge color="success">Completado ✓</CBadge>
                                    ) : (
                                        <CBadge color="warning">Pendiente</CBadge>
                                    )}
                                    {falloTriage && (
                                        <div className="small text-body-secondary mt-1" role="status">
                                            {falloTriage.mensaje}
                                        </div>
                                    )}
                                </div>
                                {/* Con la lectura en vuelo o fallida no se ofrece «Registrar»:
                                    se capturarían signos encima de unos que quizá ya existen. */}
                                {consultandoTriage ? null : falloTriage ? (
                                    !falloTriage.sinAcceso && (
                                        <CButton
                                            color="secondary"
                                            variant="outline"
                                            size="sm"
                                            type="button"
                                            onClick={() => loadTriageData()}
                                            disabled={loading}
                                        >
                                            Reintentar
                                        </CButton>
                                    )
                                ) : (
                                    <CButton
                                        color={hasTriage ? 'secondary' : 'primary'}
                                        size="sm"
                                        type="button"
                                        onClick={() => setShowTriageModal(true)}
                                        disabled={loading}
                                    >
                                        {hasTriage ? 'Ver/Editar Triage' : 'Registrar Triage'}
                                    </CButton>
                                )}
                            </div>
                        </>
                    )}

                    {/* S-05: reenviar la confirmación por correo (útil al reagendar). */}
                    {appointment && appointment.status !== 'cancelada' && (
                        <>
                            <hr />
                            <div
                                className="d-flex justify-content-between align-items-center gap-2 flex-wrap"
                                data-tour="cita-reenviar-confirmacion"
                            >
                                <div>
                                    <strong>Confirmación por correo</strong>
                                    <div className="small text-body-secondary">
                                        Reenvía al paciente el correo con la fecha y hora de su cita.
                                    </div>
                                </div>
                                <CButton
                                    color="secondary"
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => void handleReenviarConfirmacion()}
                                    disabled={reenviando}
                                >
                                    {reenviando ? 'Reenviando…' : 'Reenviar confirmación'}
                                </CButton>
                            </div>
                            {avisoConfirmacion && (
                                <div
                                    className={`small mt-1 ${
                                        avisoConfirmacion.tipo === 'ok'
                                            ? 'text-success'
                                            : avisoConfirmacion.tipo === 'warn'
                                              ? 'text-warning-emphasis'
                                              : 'text-danger'
                                    }`}
                                    role={avisoConfirmacion.tipo === 'error' ? 'alert' : 'status'}
                                >
                                    {avisoConfirmacion.texto}
                                </div>
                            )}
                        </>
                    )}
                </CModalBody>
                <CModalFooter>
                    <CButton color="secondary" variant="outline" type="button" onClick={pedirCierre} disabled={loading}>
                        Cerrar
                    </CButton>
                    <CButton color="primary" type="submit" disabled={loading} data-tour="cita-guardar">
                        {loading ? (
                            <>
                                <CSpinner size="sm" className="me-2" />
                                Guardando...
                            </>
                        ) : appointment ? (
                            'Guardar cambios'
                        ) : (
                            'Guardar cita'
                        )}
                    </CButton>
                </CModalFooter>
            </CForm>

            {/* Triage Modal */}
            {appointment && (
                <TriageForm
                    visible={showTriageModal}
                    onClose={() => setShowTriageModal(false)}
                    onSaved={() => {
                        setShowTriageModal(false)
                        setHasTriage(true)
                        if (appointment.id) {
                            getTriageByAppointment(appointment.id).then((data) => {
                                setExistingTriage(data)
                            })
                        }
                        onSaved() // Refresh parent
                    }}
                    appointmentId={appointment.id}
                    existingTriage={existingTriage}
                />
            )}

            {/* Fuera del <CForm> de la cita a propósito: el submit del alta
                burbujea por el árbol de React aunque el modal viva en un portal,
                y dentro guardaría también la cita. */}
            {altaPacienteVisible && (
                <PacienteForm
                    visible
                    onClose={() => setAltaPacienteVisible(false)}
                    onSubmit={registrarPaciente}
                    onElegirExistente={elegirPacienteExistente}
                    title="Nuevo paciente"
                />
            )}
        </CModal>
    )
}
