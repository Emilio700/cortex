/**
 * Agenda Page - Calendar view for appointments
 *
 * Una sola pantalla de agenda con filtros combinables (doctor + sucursal +
 * tipo + sala). El rango de fechas visible y los filtros se resuelven en el
 * servidor: en producción hay decenas de miles de citas, traerlas al cliente
 * para filtrarlas ahí no es viable.
 *
 * ESTRUCTURA (DESIGN.md §4.1 a §4.4):
 *
 *   Cabecera (título + Exportar + Nueva Cita)
 *   Tarjeta de filtros
 *   Conmutador de vista: Calendario · Lista · Por salas (día)
 *   ┌────────────────────────────────┬──────────────────────┐
 *   │ Calendario (o lista) + leyenda │ Panel lateral:       │
 *   │                                │  mini calendario     │
 *   │                                │  citas del día       │
 *   │                                │  resumen del mes     │
 *   └────────────────────────────────┴──────────────────────┘
 *
 * Por debajo de xl el panel se apila bajo el calendario, no se recorta.
 *
 * DOS PETICIONES, DOS RANGOS, y cada una tiene su motivo:
 *   - `appointments`: el rango visible de FullCalendar. Alimenta el
 *     calendario, la lista y la exportación.
 *   - `citasDelMes`: el mes del panel lateral. Va aparte porque el panel
 *     tiene que seguir diciendo la verdad aunque el calendario esté en vista
 *     de semana o de día, y porque el resumen es del MES, no del rango.
 *
 * NO TOCAR sin entender por qué: el spinner es un overlay encima de la
 * tarjeta, nunca un nodo que sustituya al calendario. Si FullCalendar se
 * desmonta al cargar, al volver salta al mes actual y el mes que se estaba
 * mirando se queda vacío. Ya pasó una vez.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { CAlert, CButton, CCard, CCardBody, CCol, CFormInput, CFormSelect, CRow, CSpinner, CBadge } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
    cilPlus,
    cilReload,
    cilUser,
    cilFilter,
    cilBuilding,
    cilRoom,
    cilCalendar,
    cilList,
    cilCloudDownload,
    cilPrint,
} from '@coreui/icons'
import { AgendaCalendar } from '../components/AgendaCalendar'
import { AgendaSalasDia } from '../components/AgendaSalasDia'
import { AgendaLista } from '../components/AgendaLista'
import { filtrarCitasPorTexto } from '../utils/agendaBusqueda'
import { AgendaLeyenda } from '../components/AgendaLeyenda'
import { AgendaPanelLateral } from '../components/AgendaPanelLateral'
import { AppointmentModal } from '../components/AppointmentModal'
import { RegistrarPagoModal } from '../../finanzas/components/RegistrarPagoModal'
import type { Payment } from '../../finanzas/types'
import { etiquetaMetodo, formatoMoneda } from '../../finanzas/utils/cobro'
import { useAppointments } from '../hooks/useAppointments'
import { useAlReactivarPestana } from '../../../shared/tabs/useAlReactivarPestana'
import type { Appointment, AppointmentFilters, AppointmentType } from '../types'
import { User, Role } from '../../../shared/types'
import { apiClient } from '../../../shared/services/api'
import { useAuth } from '../../../shared/context/AuthContext'
import { useToast } from '../../../shared/components/ToastProvider'
import { useNavigate } from 'react-router-dom'
import { useAtenderPedido, type PedidosConocidos } from '../../../shared/utils/pedidos'
import { hoyDelConsultorio } from '../../../shared/utils/date'
import { listSalas } from '../../../shared/services/salas'
import type { Sala } from '../../../shared/services/salas'
import { salasActivas } from '../utils/salas'
import {
    claveDia,
    csvDeCitas,
    mesDesplazado,
    nombreArchivoCsv,
    nombrePaciente,
    primerDiaDelMes,
} from '../utils/tablero'
import { htmlDeAgendaImpresa, imprimirAgenda } from '../utils/agendaImpresion'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { rutaDelExpediente } from '../../expediente/rutas'

interface Sucursal {
    id: number
    name: string
}

const TYPE_LABELS: Record<string, string> = {
    consulta: 'Consultas',
    cirugia: 'Cirugías',
    procedimiento: 'Procedimientos',
}

const ALL = 'all'

/** Rango visible del calendario (lo entrega FullCalendar vía datesSet). */
interface DateRange {
    start: string
    end: string
}

const RUTA_AGENDA = '/secretaria/agenda'

/** «AAAA-MM-DD» → el `Date` de ese día a medianoche local, o null si no es una fecha. */
const diaDesdeClave = (clave: string | null | undefined): Date | null => {
    const encaje = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clave ?? '')
    if (!encaje) return null
    const dia = new Date(Number(encaje[1]), Number(encaje[2]) - 1, Number(encaje[3]))
    return Number.isNaN(dia.getTime()) ? null : dia
}

/**
 * Rango de días locales de lo que se ve (`fecha_desde`/`fecha_hasta`, plan 28).
 * `scheduled_at` es hora del consultorio sin zona: mandar el día como fecha
 * evita que el navegador lo traduzca a UTC y mueva citas cerca de medianoche.
 * FullCalendar entrega el fin exclusivo: el último día es el anterior.
 */
const diasDelRango = (range: DateRange) => ({
    fecha_desde: claveDia(new Date(range.start)),
    fecha_hasta: claveDia(new Date(new Date(range.end).getTime() - 1)),
})

type Vista = 'calendario' | 'lista' | 'salas'

const AgendaPage: React.FC = () => {
    const { fetchAppointments } = useAppointments()
    const { user, can } = useAuth()
    const { showError, showSuccess } = useToast()
    const navigate = useNavigate()

    // La pestaña se dibuja sin la parte `?…` de la URL (TabsOutlet), así que
    // `useSearchParams` aquí siempre venía vacío y «Ver citas de la paciente»
    // no filtraba nada. Se lee de la URL real, y solo mientras ésta sea la de
    // la agenda: con otra pestaña al frente se conserva lo último que se vio.
    const parametrosRef = useRef<URLSearchParams>(new URLSearchParams())
    const [rutaActual, consultaActual] = window.location.hash.replace(/^#/, '').split('?')
    if (rutaActual === RUTA_AGENDA) parametrosRef.current = new URLSearchParams(consultaActual ?? '')
    const searchParams = parametrosRef.current

    const [appointments, setAppointments] = useState<Appointment[]>([])
    // Un doctor solo ve SUS citas, asi que no sabria que un companero ya tiene
    // tomada la sala. Esto trae la ocupacion de toda la sucursal, sin ningun
    // dato de las pacientes ajenas: solo sala, hora y de quien es.
    const [ocupacionAjena, setOcupacionAjena] = useState<Appointment[]>([])
    // La ocupación ajena no se pudo leer (revisión de flujos): sin esto, el
    // fallo se pintaba como «sala libre». `intentoOcupacion` fuerza releerla.
    const [falloOcupacionAjena, setFalloOcupacionAjena] = useState(false)
    const [intentoOcupacion, setIntentoOcupacion] = useState(0)
    // Un fallo de carga no puede parecer «no hay citas»: el aviso se queda en
    // pantalla con «Reintentar» en vez de irse con el toast a los 5 segundos.
    const [errorCarga, setErrorCarga] = useState<string | null>(null)
    const [errorMes, setErrorMes] = useState<string | null>(null)
    const [doctors, setDoctors] = useState<User[]>([])
    const [sucursales, setSucursales] = useState<Sucursal[]>([])
    const [loading, setLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
    // Paciente ya elegida al abrir «Nueva cita» desde otra pantalla (p. ej. el
    // preregistro recién convertido).
    const [pacienteModal, setPacienteModal] = useState<PedidosConocidos['agenda:dia']['paciente'] | null>(null)
    const [range, setRange] = useState<DateRange | null>(null)

    // Vista: el calendario de siempre, la lista del rango, o el cuadrante
    // por salas del día.
    const [vista, setVista] = useState<Vista>('calendario')
    // S-07: búsqueda dentro de la vista Lista, sobre las citas ya cargadas.
    const [busquedaLista, setBusquedaLista] = useState('')
    const citasListaFiltradas = useMemo(
        () => filtrarCitasPorTexto(appointments, busquedaLista),
        [appointments, busquedaLista],
    )
    // «Hoy» es el del consultorio, no el del navegador (plan 28).
    const [diaSalas, setDiaSalas] = useState<Date>(() => hoyDelConsultorio())
    const [salas, setSalas] = useState<Sala[]>([])
    const [salaModal, setSalaModal] = useState<number | null>(null)
    // Cita que se está cobrando desde la agenda (S-03). El modal de la cita se
    // queda abierto debajo: lo que se estuviera editando ahí no se pierde.
    // La cita se conserva al cerrar para que, mientras el modal se desvanece,
    // no aparezcan de golpe las demás citas del día.
    const [citaPorCobrar, setCitaPorCobrar] = useState<number | null>(null)
    const [cobroVisible, setCobroVisible] = useState(false)
    // El mismo permiso que el botón «Nuevo pago» de Pagos y el cobro de la
    // consulta: quien no puede cobrar no ve el botón.
    const puedeCobrar = can('payments.create')

    // Panel lateral: día elegido en el mini calendario y citas de su mes.
    const [diaSeleccionado, setDiaSeleccionado] = useState<Date>(() => hoyDelConsultorio())
    // A qué día llevar el calendario cuando lo pide otra pantalla (el inicio).
    const [irA, setIrA] = useState<{ fecha: Date; vista?: 'dia'; clave: number } | null>(null)
    const [citasDelMes, setCitasDelMes] = useState<Appointment[]>([])
    const [cargandoMes, setCargandoMes] = useState(false)

    // Filtros combinables
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>(ALL)
    const [selectedTenantId, setSelectedTenantId] = useState<string>(ALL)
    const [selectedType, setSelectedType] = useState<string>(ALL)
    const [selectedRoomId, setSelectedRoomId] = useState<string>(ALL)

    // Citas de una paciente («Ver citas» en Pacientes o en el panel). Vive en
    // el estado y no solo en la URL: al cambiar de pestaña, TabsOutlet deja la
    // URL en la ruta sin `?…` y el filtro se perdía al instante.
    const [filtroPaciente, setFiltroPaciente] = useState<{ id: string; nombre: string } | null>(null)
    const idDeLaUrl = searchParams.get('patient_id')
    const nombreDeLaUrl = searchParams.get('patient_name')
    useEffect(() => {
        if (idDeLaUrl) setFiltroPaciente({ id: idDeLaUrl, nombre: nombreDeLaUrl ?? '' })
    }, [idDeLaUrl, nombreDeLaUrl])
    useAtenderPedido('agenda:paciente', ({ id, nombre }) => setFiltroPaciente({ id: String(id), nombre }))
    const filterPatientId = filtroPaciente?.id ?? null
    const filterPatientName = filtroPaciente?.nombre || null

    // El filtro de sucursal solo se ofrece cuando el usuario realmente tiene
    // acceso a más de una: el backend acota cada rol no-MASTER a su propio
    // tenant, así que mostrarlo siempre prometería algo que no puede cumplir.
    const canFilterBySucursal = sucursales.length > 1

    /** Filtros que van al servidor, comunes al calendario y al panel lateral. */
    const activeFilters = useMemo(() => {
        const filters: AppointmentFilters = {}
        if (selectedDoctorId !== ALL) filters.doctor_id = Number(selectedDoctorId)
        if (canFilterBySucursal && selectedTenantId !== ALL) filters.tenant_id = Number(selectedTenantId)
        if (selectedType !== ALL) filters.appointment_type = selectedType as AppointmentType
        if (selectedRoomId !== ALL) filters.room_id = Number(selectedRoomId)
        if (filterPatientId) filters.patient_id = Number(filterPatientId)
        return filters
    }, [
        selectedDoctorId,
        selectedTenantId,
        selectedType,
        selectedRoomId,
        filterPatientId,
        canFilterBySucursal,
    ])

    const hasActiveFilters =
        selectedDoctorId !== ALL ||
        selectedTenantId !== ALL ||
        selectedType !== ALL ||
        selectedRoomId !== ALL ||
        !!filterPatientId

    // Citas del rango visible del calendario
    const loadAppointments = useCallback(async () => {
        if (!range) return
        try {
            setLoading(true)
            const data = await fetchAppointments({
                ...activeFilters,
                ...diasDelRango(range),
                limit: 500,
            })
            setAppointments(data)
            setErrorCarga(null)
        } catch {
            // El aviso se queda en pantalla: un fallo de red no puede leerse
            // como «no hay citas» ni como el calendario de otro momento.
            setErrorCarga('No se pudieron cargar las citas. Lo que ves puede estar incompleto o desactualizado.')
        } finally {
            setLoading(false)
        }
    }, [range, activeFilters, fetchAppointments])

    useEffect(() => {
        loadAppointments()
    }, [loadAppointments])

    // Al volver a la agenda se recargan las citas del rango visible: lo que
    // cambió desde otra pestaña (una cancelación, un cobro) aparece al
    // instante. `loadAppointments` sólo reemplaza la lista de citas: no toca
    // la selección ni ningún modal abierto.
    useAlReactivarPestana(() => { void loadAppointments() })

    useEffect(() => {
        if (vista !== 'salas' || user?.role !== Role.DOCTOR) {
            setOcupacionAjena([])
            setFalloOcupacionAjena(false)
            return
        }
        let cancelado = false
        setFalloOcupacionAjena(false)
        const fecha = `${diaSalas.getFullYear()}-${String(diaSalas.getMonth() + 1).padStart(2, '0')}-${String(diaSalas.getDate()).padStart(2, '0')}`
        apiClient
            .get(`/appointments/ocupacion-salas?fecha=${fecha}`)
            .then((r) => {
                if (cancelado) return
                // Las propias ya vienen en `appointments`: aqui solo las ajenas,
                // como bloques sin identidad de paciente y no pinchables.
                const ajenas = (r.data as Array<Record<string, unknown>>)
                    .filter((o) => !o.es_mia)
                    .map(
                        (o) =>
                            ({
                                id: -Number(o.appointment_id),
                                patient_id: 0,
                                doctor_id: Number(o.doctor_id),
                                scheduled_at: String(o.scheduled_at),
                                duration_minutes: Number(o.duration_minutes),
                                status: String(o.status),
                                room_id: Number(o.room_id),
                                room_name: (o.room_name as string) ?? null,
                                patient_name: 'Ocupada',
                                doctor_name: (o.doctor_name as string) ?? '',
                            }) as unknown as Appointment,
                    )
                setOcupacionAjena(ajenas)
            })
            .catch(() => {
                // Si falla, la vista por salas lo dice con todas las letras: un
                // hueco que no se pudo leer no puede pintarse como «Libre».
                if (!cancelado) {
                    setOcupacionAjena([])
                    setFalloOcupacionAjena(true)
                }
            })
        return () => {
            cancelado = true
        }
    }, [vista, diaSalas, user?.role, intentoOcupacion])

    // Mes del panel lateral. Se deriva del día elegido, pero se memoriza por
    // clave de mes para que el objeto Date no cambie de identidad en cada
    // render y dispare la petición una y otra vez.
    const claveMes = `${diaSeleccionado.getFullYear()}-${diaSeleccionado.getMonth()}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const mesPanel = useMemo(() => primerDiaDelMes(diaSeleccionado), [claveMes])

    // El panel se consulta aparte: su resumen es del MES entero y tiene que
    // seguir siendo cierto aunque el calendario esté en semana o en día.
    const loadMes = useCallback(async () => {
        try {
            setCargandoMes(true)
            setErrorMes(null)
            const data = await fetchAppointments({
                ...activeFilters,
                fecha_desde: claveDia(mesPanel),
                fecha_hasta: claveDia(new Date(mesPanel.getFullYear(), mesPanel.getMonth() + 1, 0)),
                limit: 500,
            })
            setCitasDelMes(data)
        } catch {
            // No se vacía en silencio: el panel lo dice y ofrece reintentar. El
            // calendario ya tiene su propio aviso si esa carga también falló.
            setCitasDelMes([])
            setErrorMes('No se pudo cargar el resumen del mes.')
        } finally {
            setCargandoMes(false)
        }
    }, [mesPanel, activeFilters, fetchAppointments])

    useEffect(() => {
        loadMes()
    }, [loadMes])

    // Doctores y sucursales disponibles para los filtros
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const { data } = await apiClient.get<User[]>('/users/directory', {
                    params: { role: Role.DOCTOR },
                })
                setDoctors(data)
            } catch {
                showError('No se pudo cargar la lista de doctoras.')
            }
            try {
                const { data } = await apiClient.get<Sucursal[]>('/tenants')
                setSucursales(data)
            } catch {
                // Sin lista de sucursales el filtro simplemente no se muestra.
            }
        }
        loadFilterOptions()
    }, [])

    // Salas de la sucursal que se está mirando. Sólo las activas: son las
    // que pueden recibir una cita hoy y las que tienen columna en la vista.
    useEffect(() => {
        const tenantId =
            canFilterBySucursal && selectedTenantId !== ALL ? Number(selectedTenantId) : undefined
        let cancelado = false
        listSalas({ tenantId })
            .then((data) => {
                if (!cancelado) setSalas(salasActivas(data))
            })
            .catch(() => {
                // Sin catálogo de salas simplemente no se ofrece el filtro.
                if (!cancelado) setSalas([])
            })
        return () => {
            cancelado = true
        }
    }, [selectedTenantId, canFilterBySucursal])

    // Si cambia la sucursal, la sala filtrada puede dejar de existir ahí.
    useEffect(() => {
        if (selectedRoomId === ALL) return
        if (!salas.some((sala) => String(sala.id) === selectedRoomId)) setSelectedRoomId(ALL)
    }, [salas, selectedRoomId])

    // En la vista por salas el rango lo manda el día elegido, no FullCalendar
    // (que ni siquiera está montado).
    useEffect(() => {
        if (vista !== 'salas') return
        const inicio = new Date(diaSalas)
        inicio.setHours(0, 0, 0, 0)
        const fin = new Date(diaSalas)
        fin.setHours(23, 59, 59, 999)
        const next = { start: inicio.toISOString(), end: fin.toISOString() }
        setRange((prev) => (prev && prev.start === next.start && prev.end === next.end ? prev : next))
    }, [vista, diaSalas])

    const handleDatesSet = useCallback((start: Date, end: Date) => {
        const next = { start: start.toISOString(), end: end.toISOString() }
        setRange((prev) => (prev && prev.start === next.start && prev.end === next.end ? prev : next))

        // En la vista Día (la del teléfono) el panel sigue al día que se ve:
        // «Citas del día» habla del mismo día que el calendario (A-3).
        if (end.getTime() - start.getTime() <= 24 * 60 * 60 * 1000) {
            const dia = new Date(start.getFullYear(), start.getMonth(), start.getDate())
            setDiaSeleccionado((prev) => (claveDia(prev) === claveDia(dia) ? prev : dia))
            return
        }

        // El panel acompaña al calendario cuando éste cambia de mes, para que
        // no se queden mirando meses distintos. Si siguen en el mismo mes no
        // se toca el día elegido: la asistente lo puso ahí a propósito.
        const medio = new Date((start.getTime() + end.getTime()) / 2)
        setDiaSeleccionado((prev) =>
            prev.getFullYear() === medio.getFullYear() && prev.getMonth() === medio.getMonth()
                ? prev
                : new Date(medio.getFullYear(), medio.getMonth(), 1),
        )
    }, [])

    const clearPatientFilter = () => {
        setFiltroPaciente(null)
        navigate(RUTA_AGENDA)
    }

    const clearAllFilters = () => {
        setSelectedDoctorId(ALL)
        setSelectedTenantId(ALL)
        setSelectedType(ALL)
        setSelectedRoomId(ALL)
        if (filterPatientId) clearPatientFilter()
    }

    const handleEventClick = (appointment: Appointment) => {
        setSelectedAppointment(appointment)
        setSelectedDate(undefined)
        setSalaModal(null)
        setShowModal(true)
    }

    const handleDateSelect = (date: Date) => {
        setSelectedAppointment(null)
        setSelectedDate(date)
        setSalaModal(null)
        setShowModal(true)
    }

    const handleNewAppointment = () => {
        setSelectedAppointment(null)
        setSelectedDate(new Date())
        setSalaModal(null)
        setShowModal(true)
    }

    /**
     * Abrir la agenda en un día (plan 28, D-5): lo pide el calendario del
     * inicio, «Agendar cita» o un `?fecha=AAAA-MM-DD` en la URL. Con `nueva`
     * se abre además «Nueva cita» en ese día.
     */
    const abrirEnDia = (clave: string, nueva = false, paciente: PedidosConocidos['agenda:dia']['paciente'] | null = null) => {
        const dia = diaDesdeClave(clave)
        if (!dia) return
        setDiaSeleccionado(dia)
        setDiaSalas(dia)
        setIrA({ fecha: dia, vista: nueva ? undefined : 'dia', clave: Date.now() })
        if (nueva) {
            // Hoy, a la hora actual; otro día, a las 9 como «+ Agregar cita».
            const inicio = claveDia(dia) === claveDia(hoyDelConsultorio()) ? new Date() : new Date(dia)
            if (claveDia(dia) !== claveDia(hoyDelConsultorio())) inicio.setHours(9, 0, 0, 0)
            setSelectedAppointment(null)
            setSelectedDate(inicio)
            setSalaModal(null)
            setPacienteModal(paciente)
            setShowModal(true)
        }
    }

    useAtenderPedido('agenda:dia', ({ fecha, nueva, paciente }) => abrirEnDia(fecha, nueva, paciente ?? null))

    // `?fecha=` en la URL (un marcador, un enlace): se atiende una vez por valor.
    const fechaDeLaUrl = searchParams.get('fecha')
    const nuevaDeLaUrl = searchParams.get('nueva') === '1'
    const fechaAtendida = useRef<string | null>(null)
    useEffect(() => {
        if (!fechaDeLaUrl || fechaAtendida.current === fechaDeLaUrl) return
        fechaAtendida.current = fechaDeLaUrl
        abrirEnDia(fechaDeLaUrl, nuevaDeLaUrl)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fechaDeLaUrl, nuevaDeLaUrl])

    /** "+ Agregar cita para este día": el modal abre con ese día ya puesto. */
    const handleNuevaCitaEnDia = (dia: Date) => {
        const inicio = new Date(dia)
        inicio.setHours(9, 0, 0, 0)
        setSelectedAppointment(null)
        setSelectedDate(inicio)
        setSalaModal(null)
        setShowModal(true)
    }

    /** Pinchar un hueco libre del cuadrante: abre el modal con hora y sala puestas. */
    const handleHuecoClick = (inicio: Date, salaId: number | null) => {
        setSelectedAppointment(null)
        setSelectedDate(inicio)
        setSalaModal(salaId)
        setShowModal(true)
    }

    const handleModalClose = () => {
        setShowModal(false)
        setPacienteModal(null)
        setSelectedAppointment(null)
        setSelectedDate(undefined)
        setSalaModal(null)
    }

    const handleReload = () => {
        loadAppointments()
        loadMes()
    }

    const alCobrar = (pago: Payment) => {
        setCobroVisible(false)
        // Se anuncia lo que devolvió el servidor, igual que en Pagos.
        showSuccess(
            `Pago registrado: ${formatoMoneda(pago.amount)} con ${etiquetaMetodo(pago.method).toLowerCase()}${
                pago.patient_name ? ` de ${pago.patient_name}` : ''
            }.`,
        )
        // La insignia de cobro de la agenda sale del servidor: se vuelve a leer.
        handleReload()
    }

    const handleVerHistorial = (cita: Appointment) => {
        navigate(rutaDelExpediente(cita.patient_id))
    }

    const handleVerCitasDePaciente = (cita: Appointment) => {
        setFiltroPaciente({ id: String(cita.patient_id), nombre: nombrePaciente(cita) })
    }

    /**
     * Exportar: CSV de lo que se está viendo, ni más ni menos. Se genera en
     * el navegador a partir de las citas ya cargadas, así que exporta
     * exactamente el mismo rango y los mismos filtros que hay en pantalla.
     */
    const handleExportar = () => {
        if (!range || appointments.length === 0) {
            showError('No hay citas que exportar en el periodo que estás viendo.')
            return
        }
        const inicio = new Date(range.start)
        // FullCalendar entrega el fin exclusivo: el último día visible es el anterior.
        const fin = new Date(new Date(range.end).getTime() - 1)

        const blob = new Blob([`﻿${csvDeCitas(appointments)}`], {
            type: 'text/csv;charset=utf-8;',
        })
        const url = URL.createObjectURL(blob)
        const enlace = document.createElement('a')
        enlace.href = url
        enlace.download = nombreArchivoCsv(inicio, fin)
        document.body.appendChild(enlace)
        enlace.click()
        enlace.remove()
        URL.revokeObjectURL(url)
    }

    /**
     * Imprimir: la hoja del periodo visible en la vista Lista, con los filtros
     * aplicados. Igual que el CSV, sale de las citas ya cargadas.
     */
    const handleImprimir = () => {
        if (vista !== 'lista' || !range || appointments.length === 0) return
        const inicio = new Date(range.start)
        // FullCalendar entrega el fin exclusivo: el último día visible es el anterior.
        const fin = new Date(new Date(range.end).getTime() - 1)
        imprimirAgenda(htmlDeAgendaImpresa(appointments, { inicio, fin, filtros: filterSummary }))
    }

    // Resumen legible de lo que se está viendo ahora mismo
    const filterSummary = useMemo(() => {
        const parts: string[] = []
        if (selectedDoctorId !== ALL) {
            const doctor = doctors.find((d) => String(d.id) === selectedDoctorId)
            parts.push(doctor ? nombreConTratamiento(doctor) : 'Doctora seleccionada')
        }
        if (canFilterBySucursal && selectedTenantId !== ALL) {
            const sucursal = sucursales.find((s) => String(s.id) === selectedTenantId)
            parts.push(sucursal ? sucursal.name.replace('GEMS - ', '') : 'Sucursal seleccionada')
        }
        if (selectedType !== ALL) parts.push(TYPE_LABELS[selectedType] || selectedType)
        if (selectedRoomId !== ALL) {
            const sala = salas.find((s) => String(s.id) === selectedRoomId)
            parts.push(sala ? sala.name : 'Sala seleccionada')
        }
        if (filterPatientName) parts.push(`Paciente: ${filterPatientName}`)
        return parts
    }, [
        selectedDoctorId,
        selectedTenantId,
        selectedType,
        selectedRoomId,
        doctors,
        sucursales,
        salas,
        filterPatientName,
        canFilterBySucursal,
    ])

    // El filtro de sala sólo tiene sentido donde hay más de una.
    const canFilterBySala = salas.length > 1
    const nFiltros = 2 + (canFilterBySucursal ? 1 : 0) + (canFilterBySala ? 1 : 0)
    const anchoFiltro = nFiltros >= 4 ? 3 : nFiltros === 3 ? 4 : 6

    const hayCitasSinSala = appointments.some((cita) => !cita.room_name)

    return (
        <>
            {/* Cabecera de página (DESIGN.md §4.1) */}
            <EncabezadoPantalla
                titulo="Agenda"
                descripcion="Consulta y organiza las citas de la clínica"
                icono={cilCalendar}
                acciones={
                    <>
                        <CButton
                            color="light"
                            variant="ghost"
                            onClick={handleReload}
                            disabled={loading}
                            title="Actualizar"
                            aria-label="Actualizar las citas"
                        >
                            <CIcon icon={cilReload} />
                        </CButton>
                        <CButton
                            color="light"
                            variant="outline"
                            onClick={handleExportar}
                            data-tour="agenda-exportar"
                            disabled={appointments.length === 0}
                            title={
                                appointments.length === 0
                                    ? 'No hay citas que exportar en el periodo que estás viendo.'
                                    : 'Descarga en CSV las citas del periodo que estás viendo, con los filtros aplicados.'
                            }
                        >
                            <CIcon icon={cilCloudDownload} className="me-2" />
                            Exportar
                        </CButton>
                        {/* Siempre visible para que se sepa que existe; sólo imprime
                            desde la Lista, que es la hoja que se lleva la doctora. */}
                        <CButton
                            color="light"
                            variant="outline"
                            onClick={handleImprimir}
                            data-tour="agenda-imprimir"
                            disabled={vista !== 'lista' || appointments.length === 0}
                            title={
                                vista !== 'lista'
                                    ? 'Cambia a la vista Lista para imprimir la agenda.'
                                    : appointments.length === 0
                                      ? 'No hay citas que imprimir en el periodo que estás viendo.'
                                      : 'Imprime la lista de citas del periodo que estás viendo, con los filtros aplicados.'
                            }
                        >
                            <CIcon icon={cilPrint} className="me-2" />
                            Imprimir agenda
                        </CButton>
                        <CButton color="light" onClick={handleNewAppointment} data-tour="agenda-nueva-cita">
                            <CIcon icon={cilPlus} className="me-2" />
                            Nueva Cita
                        </CButton>
                    </>
                }
            />

            {/* Barra de filtros (DESIGN.md §4.2) */}
            <CCard className="mb-4" data-tour="agenda-filtros">
                <CCardBody>
                    <CRow className="g-3 align-items-end">
                        <CCol xs={12} md={anchoFiltro}>
                            <label className="form-label small fw-semibold mb-1" htmlFor="filtro-doctor">
                                <CIcon icon={cilUser} size="sm" className="me-1" />
                                Doctora
                            </label>
                            <CFormSelect
                                id="filtro-doctor"
                                className="gems-campo"
                                value={selectedDoctorId}
                                onChange={(e) => setSelectedDoctorId(e.target.value)}
                            >
                                <option value={ALL}>Todas las doctoras</option>
                                {doctors.map((doctor) => (
                                    <option key={doctor.id} value={doctor.id}>
                                        {nombreConTratamiento(doctor)}
                                    </option>
                                ))}
                            </CFormSelect>
                        </CCol>

                        {canFilterBySucursal && (
                            <CCol xs={12} md={anchoFiltro}>
                                <label className="form-label small fw-semibold mb-1" htmlFor="filtro-sucursal">
                                    <CIcon icon={cilBuilding} size="sm" className="me-1" />
                                    Sucursal
                                </label>
                                <CFormSelect
                                    id="filtro-sucursal"
                                    className="gems-campo"
                                    value={selectedTenantId}
                                    onChange={(e) => setSelectedTenantId(e.target.value)}
                                >
                                    <option value={ALL}>Todas las sucursales</option>
                                    {sucursales.map((sucursal) => (
                                        <option key={sucursal.id} value={sucursal.id}>
                                            {sucursal.name.replace('GEMS - ', '')}
                                        </option>
                                    ))}
                                </CFormSelect>
                            </CCol>
                        )}

                        <CCol xs={12} md={anchoFiltro}>
                            <label className="form-label small fw-semibold mb-1" htmlFor="filtro-tipo">
                                <CIcon icon={cilFilter} size="sm" className="me-1" />
                                Tipo de cita
                            </label>
                            <CFormSelect
                                id="filtro-tipo"
                                className="gems-campo"
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                            >
                                <option value={ALL}>Todos los tipos</option>
                                <option value="consulta">Consultas</option>
                                <option value="cirugia">Cirugías</option>
                                <option value="procedimiento">Procedimientos</option>
                            </CFormSelect>
                        </CCol>

                        {canFilterBySala && (
                            <CCol xs={12} md={anchoFiltro}>
                                <label className="form-label small fw-semibold mb-1" htmlFor="filtro-sala">
                                    <CIcon icon={cilRoom} size="sm" className="me-1" />
                                    Sala
                                </label>
                                <CFormSelect
                                    id="filtro-sala"
                                    className="gems-campo"
                                    value={selectedRoomId}
                                    onChange={(e) => setSelectedRoomId(e.target.value)}
                                >
                                    <option value={ALL}>Todas las salas</option>
                                    {salas.map((sala) => (
                                        <option key={sala.id} value={sala.id}>
                                            {sala.name}
                                        </option>
                                    ))}
                                </CFormSelect>
                            </CCol>
                        )}
                    </CRow>

                    <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                        <span className="small text-body-secondary">Estás viendo:</span>
                        {hasActiveFilters ? (
                            <>
                                {filterSummary.map((part) => (
                                    <CBadge key={part} color="info" className="p-2 rounded-1">
                                        {part}
                                    </CBadge>
                                ))}
                                <CButton color="secondary" variant="outline" size="sm" onClick={clearAllFilters}>
                                    Ver todas las citas
                                </CButton>
                            </>
                        ) : (
                            <CBadge color="success" className="p-2 rounded-1">
                                Todas las citas de la clínica
                            </CBadge>
                        )}
                    </div>
                </CCardBody>
            </CCard>

            {/* Conmutador de vista */}
            <div className="d-flex flex-wrap gap-2 mb-3" data-tour="agenda-vistas">
                <CButton
                    color="primary"
                    variant={vista === 'calendario' ? undefined : 'outline'}
                    aria-pressed={vista === 'calendario'}
                    onClick={() => setVista('calendario')}
                >
                    <CIcon icon={cilCalendar} className="me-2" />
                    Calendario
                </CButton>
                <CButton
                    color="primary"
                    variant={vista === 'lista' ? undefined : 'outline'}
                    aria-pressed={vista === 'lista'}
                    onClick={() => setVista('lista')}
                >
                    <CIcon icon={cilList} className="me-2" />
                    Lista
                </CButton>
                <CButton
                    color="primary"
                    variant={vista === 'salas' ? undefined : 'outline'}
                    aria-pressed={vista === 'salas'}
                    onClick={() => setVista('salas')}
                >
                    <CIcon icon={cilRoom} className="me-2" />
                    Por salas (día)
                </CButton>
            </div>

            <CRow className="g-4">
                <CCol xs={12} xl={8}>
                    {errorCarga && !loading && (
                        <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2" role="alert">
                            <span className="flex-grow-1">{errorCarga}</span>
                            <CButton color="danger" variant="outline" size="sm" onClick={() => void loadAppointments()}>
                                Reintentar
                            </CButton>
                        </CAlert>
                    )}
                    <CCard className="mb-4" data-tour="agenda-calendario">
                        <CCardBody className="position-relative">
                            {loading && (
                                <div
                                    className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-body bg-opacity-75"
                                    style={{ zIndex: 5 }}
                                >
                                    <CSpinner color="primary" />
                                    <p className="mt-2 mb-0">Cargando citas...</p>
                                </div>
                            )}
                            {vista === 'salas' ? (
                                <AgendaSalasDia
                                    dia={diaSalas}
                                    citas={[...appointments, ...ocupacionAjena]}
                                    salas={
                                        selectedRoomId === ALL
                                            ? salas
                                            : salas.filter((sala) => String(sala.id) === selectedRoomId)
                                    }
                                    ocupacionIncompleta={falloOcupacionAjena}
                                    onReintentarOcupacion={() => setIntentoOcupacion((n) => n + 1)}
                                    onCitaClick={(cita) => {
                                        // Las de otros doctores llegan con id
                                        // negativo: son bloques de ocupacion,
                                        // no citas que este doctor pueda abrir.
                                        if (cita.id < 0) return
                                        handleEventClick(cita)
                                    }}
                                    onHuecoClick={handleHuecoClick}
                                    onCambiarDia={setDiaSalas}
                                />
                            ) : (
                                <>
                                    {/* En la vista Lista el calendario NO se desmonta: se le
                                        esconde la rejilla y se le deja la barra de arriba, que
                                        es la que sigue mandando el rango visible. */}
                                    <AgendaCalendar
                                        irA={irA}
                                        appointments={appointments}
                                        onEventClick={handleEventClick}
                                        onDateSelect={handleDateSelect}
                                        onDatesSet={handleDatesSet}
                                        salas={salas}
                                        soloToolbar={vista === 'lista'}
                                    />
                                    {vista === 'lista' && (
                                        <>
                                            <CFormInput
                                                data-tour="agenda-buscar"
                                                className="mt-3 mb-2"
                                                style={{ maxWidth: 420 }}
                                                placeholder="Buscar por nombre, teléfono o folio…"
                                                value={busquedaLista}
                                                onChange={(e) => setBusquedaLista(e.target.value)}
                                            />
                                            {busquedaLista.trim() && citasListaFiltradas.length === 0 ? (
                                                <CAlert color="info">
                                                    Ninguna cita del periodo visible coincide con «
                                                    {busquedaLista.trim()}».
                                                </CAlert>
                                            ) : (
                                                <AgendaLista
                                                    citas={citasListaFiltradas}
                                                    onCitaClick={handleEventClick}
                                                />
                                            )}
                                        </>
                                    )}
                                </>
                            )}

                            {/* Leyenda, siempre visible al pie del calendario */}
                            <AgendaLeyenda salas={salas} mostrarSinSala={hayCitasSinSala} />
                        </CCardBody>
                    </CCard>
                </CCol>

                {/* Panel lateral de contexto (DESIGN.md §4.3). Bajo xl se apila. */}
                <CCol xs={12} xl={4}>
                    <AgendaPanelLateral
                        mes={mesPanel}
                        diaSeleccionado={diaSeleccionado}
                        citasDelMes={citasDelMes}
                        cargando={cargandoMes}
                        errorMes={errorMes}
                        onReintentarMes={() => void loadMes()}
                        onSeleccionarDia={setDiaSeleccionado}
                        onCambiarMes={(delta) => setDiaSeleccionado((prev) => mesDesplazado(prev, delta))}
                        onAbrirCita={handleEventClick}
                        onNuevaCitaEnDia={handleNuevaCitaEnDia}
                        onVerHistorial={handleVerHistorial}
                        onVerCitasDePaciente={handleVerCitasDePaciente}
                    />
                </CCol>
            </CRow>

            {/* Appointment Modal */}
            <AppointmentModal
                visible={showModal}
                onClose={handleModalClose}
                onSaved={handleReload}
                appointment={selectedAppointment}
                defaultDate={selectedDate}
                defaultRoomId={salaModal}
                defaultPatient={pacienteModal}
                doctors={doctors}
                puedeRegistrarPaciente={can('patients.create')}
                doctoraPropiaId={user?.role === Role.DOCTOR ? user.id : undefined}
                onCobrar={
                    puedeCobrar
                        ? (cita) => {
                              setCitaPorCobrar(cita.id)
                              setCobroVisible(true)
                          }
                        : undefined
                }
            />

            {puedeCobrar && (
                <RegistrarPagoModal
                    visible={cobroVisible}
                    onClose={() => setCobroVisible(false)}
                    onRegistrado={alCobrar}
                    esDoctora={user?.role === Role.DOCTOR}
                    doctoras={doctors}
                    citaFija={citaPorCobrar}
                />
            )}
        </>
    )
}

export default AgendaPage
