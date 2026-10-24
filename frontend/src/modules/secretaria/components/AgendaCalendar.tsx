/**
 * Agenda Calendar Component with FullCalendar
 */
import React, { useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import { EventClickArg, DateSelectArg, DatesSetArg } from '@fullcalendar/core'
import type { Appointment } from '../types'
import { relojLocalDelConsultorio } from '../../../shared/utils/date'
import type { Sala } from '../../../shared/services/salas'
import { colorDeSala, nombreSalaDeCita } from '../utils/salas'
import type { CamposCobroDeCita } from '../../finanzas/types'
import { InsigniaCobro } from '../../finanzas/components/InsigniaCobro'
import { InsigniaExpress } from '../../finanzas/components/InsigniaExpress'

interface AgendaCalendarProps {
    appointments: Appointment[]
    onEventClick: (appointment: Appointment) => void
    onDateSelect: (date: Date) => void
    /** Se dispara cada vez que cambia el rango visible (mes/semana/día anterior
     * o siguiente). Permite recargar del servidor solo las citas visibles. */
    onDatesSet?: (start: Date, end: Date) => void
    /** Catálogo de salas, sólo para colorear cada cita según la suya. */
    salas?: Sala[]
    /**
     * Vista "Lista": se esconde la rejilla y se deja SÓLO la barra de arriba
     * (anterior / siguiente / Hoy / Mes / Semana / Día).
     *
     * OJO, esto es a propósito y no es un apaño: FullCalendar sigue montado y
     * es él quien manda el rango visible por `datesSet`. Desmontarlo para
     * enseñar la lista haría que al volver saltara al mes actual — que es
     * exactamente el fallo del mes vacío que ya se corrigió una vez.
     */
    soloToolbar?: boolean
    /**
     * Llevar el calendario a un día (lo pide el inicio del médico, plan 28).
     * `vista: 'dia'` cambia a la vista de día; `clave` distinto repite el salto
     * aunque sea al mismo día.
     */
    irA?: { fecha: Date; vista?: 'dia'; clave: number } | null
}

/**
 * En el teléfono la vista Mes son fichas de color ilegibles: se abre en Día
 * y la barra se reduce a lo que cabe (plan 29, A-3). Se decide al montar.
 */
export const esTelefono = () =>
    typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 575.98px)').matches)

export const AgendaCalendar: React.FC<AgendaCalendarProps> = ({
    appointments,
    onEventClick,
    onDateSelect,
    onDatesSet,
    salas = [],
    soloToolbar = false,
    irA = null,
}) => {
    const calendarRef = useRef<FullCalendar>(null)
    // Los chevrones de FullCalendar salen con role="img" y sin nombre; el
    // botón que los lleva ya se anuncia por su `title` («Día antes»…), así
    // que los iconos se ocultan del árbol accesible (paso axe: cada barra
    // sumaba dos imágenes sin descripción).
    const contenedorRef = useRef<HTMLDivElement>(null)
    const [telefono] = useState(esTelefono)

    useEffect(() => {
        const raiz = contenedorRef.current
        if (!raiz) return undefined
        const ocultarIconos = () => {
            raiz.querySelectorAll('.fc-icon[role="img"]').forEach((icono) => {
                icono.setAttribute('aria-hidden', 'true')
            })
        }
        ocultarIconos()
        // La barra se vuelve a pintar al cambiar de vista: se repasa cuando
        // llegue DOM nuevo en vez de sólo al montar.
        const observador = new MutationObserver(ocultarIconos)
        observador.observe(raiz, { childList: true, subtree: true })
        return () => observador.disconnect()
    }, [])

    useEffect(() => {
        if (!irA) return
        const api = calendarRef.current?.getApi()
        if (!api) return
        if (irA.vista === 'dia') api.changeView('timeGridDay', irA.fecha)
        else api.gotoDate(irA.fecha)
    }, [irA])

    // Al volver de la lista, la rejilla estuvo oculta y FullCalendar midió
    // con altura cero: hay que pedirle que se vuelva a medir.
    useEffect(() => {
        if (soloToolbar) return
        const api = calendarRef.current?.getApi()
        if (!api) return
        const id = window.setTimeout(() => api.updateSize(), 0)
        return () => window.clearTimeout(id)
    }, [soloToolbar])

    // Transform appointments to FullCalendar events
    const events = appointments.map((apt) => {
        const start = new Date(apt.scheduled_at)
        const end = new Date(start.getTime() + apt.duration_minutes * 60000)

        return {
            id: apt.id.toString(),
            title: apt.patient
                ? `${apt.patient.first_name} ${apt.patient.last_name}`
                : 'Paciente sin nombre',
            start: start.toISOString(),
            end: end.toISOString(),
            classNames: [`fc-status-${apt.status}`],
            extendedProps: {
                appointment: apt,
                doctor: apt.doctor?.full_name || '',
                status: apt.status,
                hasTriage: apt.has_triage,
                // El estado manda el color de fondo (es lo que ya conocía el
                // consultorio); la sala se distingue con un punto de color y
                // su nombre, sin pelearse con esa convención.
                salaNombre: nombreSalaDeCita(apt),
                salaColor: colorDeSala(apt.room_id ?? null, salas),
            },
        }
    })

    // Handle event click
    const handleEventClick = (info: EventClickArg) => {
        const appointment = info.event.extendedProps.appointment as Appointment
        onEventClick(appointment)
    }

    // Handle date/time selection
    const handleDateSelect = (selectInfo: DateSelectArg) => {
        onDateSelect(selectInfo.start)
    }

    // Handle visible range change (prev/next/today or view switch)
    const handleDatesSet = (arg: DatesSetArg) => {
        onDatesSet?.(arg.start, arg.end)
    }

    return (
        <div
            ref={contenedorRef}
            className={`agenda-calendar${soloToolbar ? ' agenda-calendar--solo-toolbar' : ''}`}
            data-tour="agenda-calendario"
        >
            <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView={telefono ? 'timeGridDay' : 'dayGridMonth'}
                headerToolbar={
                    telefono
                        ? { left: 'prev,next', center: 'title', right: 'today,timeGridWeek,timeGridDay' }
                        : {
                              left: 'prev,next today',
                              center: 'title',
                              right: 'dayGridMonth,timeGridWeek,timeGridDay',
                          }
                }
                buttonText={{
                    today: 'Hoy',
                    month: 'Mes',
                    week: 'Semana',
                    day: 'Día',
                }}
                locale={esLocale}
                // «Hoy» del consultorio y no del navegador: una laptop con otro
                // huso marcaba otro día y el botón «Hoy» llevaba ahí (plan 28).
                now={() => relojLocalDelConsultorio()}
                events={events}
                editable={false}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={false}
                weekends={true}
                slotMinTime="07:00:00"
                slotMaxTime="20:00:00"
                // En el teléfono, renglones de media hora: con 15 min el día medía 3 pantallas.
                slotDuration={telefono ? "00:30:00" : "00:15:00"}
                snapDuration="00:15:00"
                eventClick={handleEventClick}
                select={handleDateSelect}
                datesSet={handleDatesSet}
                selectLongPressDelay={50}
                height="auto"
                eventTimeFormat={{
                    hour: 'numeric',
                    minute: '2-digit',
                    meridiem: 'short',
                }}
                eventDisplay="block"
                eventBackgroundColor=""
                eventContent={(eventInfo) => {
                    const salaNombre = eventInfo.event.extendedProps.salaNombre as string | null
                    return (
                        <div className="gc-event-pill">
                            {salaNombre && (
                                <span
                                    className="gc-event-sala-dot"
                                    style={{
                                        backgroundColor: eventInfo.event.extendedProps.salaColor as string,
                                    }}
                                    aria-hidden="true"
                                />
                            )}
                            <span className="gc-event-time">{eventInfo.timeText}</span>
                            <span className="gc-event-title">{eventInfo.event.title}</span>
                            {salaNombre && <span className="gc-event-sala">{salaNombre}</span>}
                            <InsigniaCobro
                                cita={eventInfo.event.extendedProps.appointment as Appointment & CamposCobroDeCita}
                                compacta
                                className="ms-1"
                            />
                            <InsigniaExpress
                                cita={eventInfo.event.extendedProps.appointment as Appointment & CamposCobroDeCita}
                                compacta
                                className="ms-1"
                            />
                        </div>
                    )
                }}
            />
        </div>
    )
}
