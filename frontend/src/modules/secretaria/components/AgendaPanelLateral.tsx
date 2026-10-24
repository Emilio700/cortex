/**
 * Panel lateral de contexto de la agenda (DESIGN.md §4.3).
 *
 * Tres bloques apilados, en este orden:
 *   1. Mini calendario del mes, para saltar de día.
 *   2. Las citas del día elegido, como tarjetas, con su menú de acciones y
 *      un botón para agendar en ese mismo día.
 *   3. Resumen del mes en cuatro cifras.
 *
 * Todas las cifras salen de las citas que la página ya trajo del servidor
 * para ese mes: aquí no se llama al backend.
 *
 * El porcentaje de asistencia se pinta SOLO si se puede calcular. Cuando no
 * hay ninguna cita resuelta en el mes, el bloque dice que todavía no hay nada
 * que medir en vez de enseñar un 0 % que no significa eso.
 */
import React, { useMemo } from 'react'
import {
    CAlert,
    CCard,
    CCardBody,
    CCardHeader,
    CBadge,
    CButton,
    CDropdown,
    CDropdownItem,
    CDropdownMenu,
    CDropdownToggle,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
    cilBan,
    cilCalendar,
    cilCheckCircle,
    cilChartPie,
    cilClock,
    cilOptions,
    cilPlus,
    cilRoom,
    cilTags,
    cilUser,
} from '@coreui/icons'
import type { Appointment } from '../types'
import {
    agruparCitasPorDia,
    citasDeDia,
    formatearTarjetaCita,
    resumenDelMes,
    tituloDia,
} from '../utils/tablero'
import { MiniCalendario } from './MiniCalendario'

interface AgendaPanelLateralProps {
    /** Mes que muestra el mini calendario y del que se calcula el resumen. */
    mes: Date
    diaSeleccionado: Date
    /** Citas del mes completo, tal como las devolvió el servidor. */
    citasDelMes: Appointment[]
    /** El mes todavía se está cargando: no se afirman cifras a medias. */
    cargando?: boolean
    /**
     * El mes no se pudo leer: el panel lo dice y no finge un vacío (revisión de
     * flujos: «no hay citas» no es lo mismo que «no se pudieron leer»).
     */
    errorMes?: string | null
    onReintentarMes?: () => void
    onSeleccionarDia: (dia: Date) => void
    onCambiarMes: (delta: number) => void
    onAbrirCita: (cita: Appointment) => void
    onNuevaCitaEnDia: (dia: Date) => void
    onVerHistorial: (cita: Appointment) => void
    onVerCitasDePaciente: (cita: Appointment) => void
}

/** Una cifra del resumen del mes. */
const Cifra: React.FC<{
    icono: string[]
    valor: string
    etiqueta: string
    tono: string
    ayuda: string
}> = ({ icono, valor, etiqueta, tono, ayuda }) => (
    <div className={`agenda-cifra agenda-cifra--${tono}`} title={ayuda}>
        <span className="agenda-cifra-icono" aria-hidden="true">
            <CIcon icon={icono} size="sm" />
        </span>
        <span className="agenda-cifra-valor">{valor}</span>
        <span className="agenda-cifra-etiqueta">{etiqueta}</span>
    </div>
)

const TarjetaDia: React.FC<{
    cita: Appointment
    onAbrir: () => void
    onVerHistorial: () => void
    onVerCitasDePaciente: () => void
}> = ({ cita, onAbrir, onVerHistorial, onVerCitasDePaciente }) => {
    const t = formatearTarjetaCita(cita)

    return (
        <div className="agenda-tarjeta-dia" data-tour="agenda-tarjeta-cita">
            <span
                className="agenda-tarjeta-dia-estado"
                style={{ backgroundColor: t.estadoColor }}
                title={t.estadoLabel}
                aria-hidden="true"
            />
            <button
                type="button"
                className="agenda-tarjeta-dia-cuerpo"
                onClick={onAbrir}
            >
                {/* El nombre es lo que se ve, con «Abrir la cita» delante: un
                    aria-label aparte no coincidía con el texto visible y el
                    control por voz no encontraba el botón (axe, plan 32). */}
                <span className="visually-hidden">Abrir la cita: </span>
                <span className="agenda-tarjeta-dia-hora">{t.hora}</span>
                <span className="agenda-tarjeta-dia-paciente">{t.paciente}</span>
                <span className="agenda-tarjeta-dia-meta">
                    <span className="agenda-tarjeta-dia-dato">
                        <CIcon icon={cilTags} size="sm" aria-hidden="true" />
                        {t.tipo}
                    </span>
                    <span className="agenda-tarjeta-dia-dato">
                        <CIcon icon={cilRoom} size="sm" aria-hidden="true" />
                        {t.sala ?? 'Sin sala'}
                    </span>
                </span>
                {/* Motivo extra: nota opcional para el doctor. Si la cita no
                    lo tiene, no se pinta nada: es opcional de verdad y una
                    línea vacía solo quitaría sitio en un panel estrecho. */}
                <span className="agenda-tarjeta-dia-pie">
                    {/* El estado en palabras: la barra de color sola no se lee
                        sin la leyenda, que en el teléfono queda lejos (T-6). */}
                    <span className="agenda-tarjeta-dia-estado-texto" style={{ borderColor: t.estadoColor }}>
                        <span
                            className="agenda-tarjeta-dia-estado-punto"
                            style={{ backgroundColor: t.estadoColor }}
                            aria-hidden="true"
                        />
                        {t.estadoLabel}
                    </span>
                    {t.motivo && (
                        <span className="agenda-tarjeta-dia-motivo" title="Motivo anotado para el médico">
                            {t.motivo}
                        </span>
                    )}
                </span>
            </button>

            <CDropdown variant="btn-group" alignment="end" className="agenda-tarjeta-dia-menu" data-tour="agenda-tarjeta-menu">
                <CDropdownToggle
                    color="light"
                    variant="ghost"
                    size="sm"
                    caret={false}
                    aria-label={`Acciones de la cita de ${t.paciente}`}
                >
                    <CIcon icon={cilOptions} />
                </CDropdownToggle>
                <CDropdownMenu>
                    <CDropdownItem role="button" onClick={onAbrir}>
                        Abrir la cita
                    </CDropdownItem>
                    <CDropdownItem role="button" onClick={onVerHistorial}>
                        Ver el historial del paciente
                    </CDropdownItem>
                    <CDropdownItem role="button" onClick={onVerCitasDePaciente}>
                        Ver sólo las citas de este paciente
                    </CDropdownItem>
                </CDropdownMenu>
            </CDropdown>
        </div>
    )
}

export const AgendaPanelLateral: React.FC<AgendaPanelLateralProps> = ({
    mes,
    diaSeleccionado,
    citasDelMes,
    cargando = false,
    errorMes = null,
    onReintentarMes,
    onSeleccionarDia,
    onCambiarMes,
    onAbrirCita,
    onNuevaCitaEnDia,
    onVerHistorial,
    onVerCitasDePaciente,
}) => {
    const conteoPorDia = useMemo(() => {
        const grupos = agruparCitasPorDia(citasDelMes)
        const conteo = new Map<string, number>()
        for (const [clave, lista] of grupos) conteo.set(clave, lista.length)
        return conteo
    }, [citasDelMes])

    const citasDelDia = useMemo(
        () => citasDeDia(citasDelMes, diaSeleccionado),
        [citasDelMes, diaSeleccionado],
    )

    const resumen = useMemo(() => resumenDelMes(citasDelMes), [citasDelMes])

    return (
        <div className="agenda-panel">
            {errorMes && (
                <CAlert color="warning" className="py-2" role="alert">
                    <div className="small">{errorMes}</div>
                    {onReintentarMes && (
                        <CButton
                            color="warning"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={onReintentarMes}
                        >
                            Reintentar
                        </CButton>
                    )}
                </CAlert>
            )}
            <CCard className="agenda-panel-bloque" data-tour="agenda-mini-calendario">
                <CCardBody>
                    <MiniCalendario
                        mes={mes}
                        diaSeleccionado={diaSeleccionado}
                        conteoPorDia={conteoPorDia}
                        onSeleccionarDia={onSeleccionarDia}
                        onCambiarMes={onCambiarMes}
                    />
                </CCardBody>
            </CCard>

            <CCard className="agenda-panel-bloque" data-tour="agenda-citas-dia">
                <CCardHeader className="agenda-panel-cabecera">
                    {/* h3 con la clase de h6: la página ya lleva su h1 y un h6
                        saltándose niveles era error de orden (paso axe). */}
                    <h3 className="h6 mb-0 fw-bold">Citas del {tituloDia(diaSeleccionado)}</h3>
                    <CBadge color={citasDelDia.length > 0 ? 'primary' : 'secondary'} shape="rounded-pill">
                        {citasDelDia.length}
                    </CBadge>
                </CCardHeader>
                <CCardBody className="agenda-panel-lista">
                    {cargando ? (
                        <p className="text-body-secondary small mb-0 py-3 text-center">
                            Cargando las citas del mes...
                        </p>
                    ) : errorMes ? (
                        // Sin lectura no se dice «no hay citas»: no es lo mismo.
                        <p className="text-body-secondary small mb-0 py-3 text-center">
                            No se pudieron leer las citas del mes.
                        </p>
                    ) : citasDelDia.length === 0 ? (
                        <div className="agenda-panel-vacio">
                            <CIcon icon={cilCalendar} size="xl" className="opacity-25 mb-2" />
                            <p className="mb-0 small">
                                No hay ninguna cita agendada el {tituloDia(diaSeleccionado)}.
                            </p>
                        </div>
                    ) : (
                        citasDelDia.map((cita) => (
                            <TarjetaDia
                                key={cita.id}
                                cita={cita}
                                onAbrir={() => onAbrirCita(cita)}
                                onVerHistorial={() => onVerHistorial(cita)}
                                onVerCitasDePaciente={() => onVerCitasDePaciente(cita)}
                            />
                        ))
                    )}
                </CCardBody>
                <div className="agenda-panel-pie">
                    <CButton
                        color="primary"
                        variant="outline"
                        className="w-100"
                        data-tour="agenda-cita-en-dia"
                        onClick={() => onNuevaCitaEnDia(diaSeleccionado)}
                    >
                        <CIcon icon={cilPlus} className="me-2" />
                        Agregar cita para este día
                    </CButton>
                </div>
            </CCard>

            <CCard className="agenda-panel-bloque" data-tour="agenda-resumen-mes">
                <CCardHeader className="agenda-panel-cabecera">
                    <h3 className="h6 mb-0 fw-bold">Resumen del mes</h3>
                </CCardHeader>
                <CCardBody>
                    {errorMes ? (
                        // Un cero fingido se leería como «no pasó nada en el
                        // mes»: mejor decir que las cifras no se pudieron leer.
                        <p className="agenda-cifras-nota mb-0">
                            Sin cifras: no se pudieron leer las citas del mes.
                        </p>
                    ) : (
                        <>
                            <div className="agenda-cifras">
                                <Cifra
                                    icono={cilCalendar}
                                    tono="azul"
                                    valor={String(resumen.programadas)}
                                    etiqueta="Programadas"
                                    ayuda="Todas las citas del mes, canceladas incluidas."
                                />
                                <Cifra
                                    icono={cilClock}
                                    tono="ambar"
                                    valor={String(resumen.pendientes)}
                                    etiqueta="Pendientes"
                                    ayuda="Citas agendadas o confirmadas que aún no se han atendido."
                                />
                                <Cifra
                                    icono={cilBan}
                                    tono="rojo"
                                    valor={String(resumen.canceladas)}
                                    etiqueta="Canceladas"
                                    ayuda="Citas del mes que se cancelaron."
                                />
                                {resumen.asistencia === null ? (
                                    <Cifra
                                        icono={cilChartPie}
                                        tono="gris"
                                        valor="—"
                                        etiqueta="Asistencia"
                                        ayuda="Todavía no hay ninguna cita atendida ni cancelada este mes: no hay nada que medir."
                                    />
                                ) : (
                                    <Cifra
                                        icono={cilCheckCircle}
                                        tono="verde"
                                        valor={`${resumen.asistencia}%`}
                                        etiqueta="Asistencia"
                                        ayuda="Citas atendidas sobre las ya resueltas del mes (atendidas más canceladas). Las citas futuras no cuentan."
                                    />
                                )}
                            </div>
                            <p className="agenda-cifras-nota mb-0">
                                <CIcon icon={cilUser} size="sm" className="me-1 opacity-50" aria-hidden="true" />
                                Cifras del mes completo, con los filtros que estás aplicando.
                            </p>
                        </>
                    )}
                </CCardBody>
            </CCard>
        </div>
    )
}
