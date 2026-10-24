/**
 * Agenda del día repartida por salas.
 *
 * POR QUÉ NO ES FULLCALENDAR: las vistas por recurso de FullCalendar
 * (resourceTimeGrid, que es exactamente "una columna por sala") son de pago y
 * el repo usa la edición gratuita. En lugar de prometer columnas por sala y
 * entregar otra cosa, esta vista es un cuadrante propio: una columna por
 * sala, la hora en el lateral y cada cita colocada en su franja. El
 * calendario de siempre (mes/semana/día) sigue ahí, sólo que ahora las citas
 * llevan el color y el nombre de su sala.
 *
 * Lo que responde de un vistazo: qué hueco queda libre en cada sala. Los
 * huecos no son decorativos: se pinchan y abren el modal con esa hora y esa
 * sala ya puestas.
 *
 * Todo el cálculo (repartir por sala, fusionar solapes, detectar huecos,
 * carriles) vive en `../utils/salas.ts`, que está cubierto por pruebas. Aquí
 * sólo queda el pintado.
 */
import React, { useMemo } from 'react'
import { CAlert, CBadge, CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilChevronLeft, cilChevronRight, cilRoom } from '@coreui/icons'
import type { Appointment } from '../types'
import type { Sala } from '../../../shared/services/salas'
import {
    agruparCitasPorSala,
    colorDeSala,
    esMismoDia,
    formatearMinutos,
    formatearTramo,
    huecosLibres,
    JORNADA_FIN_MIN,
    JORNADA_INICIO_MIN,
    repartirEnCarriles,
    SIN_SALA_LABEL,
} from '../utils/salas'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'

/** Alto de un minuto en píxeles. 13 h de jornada caben en ~780 px. */
const PX_POR_MINUTO = 1
/** Un hueco más corto que esto no tiene sitio para la etiqueta. */
const MIN_PX_ETIQUETA_HUECO = 26

interface AgendaSalasDiaProps {
    dia: Date
    citas: Appointment[]
    salas: Sala[]
    onCitaClick: (cita: Appointment) => void
    /** Pinchar un hueco libre: abre el modal en esa hora y esa sala. */
    onHuecoClick: (inicio: Date, salaId: number | null) => void
    onCambiarDia: (dia: Date) => void
    /**
     * La ocupación de las demás doctoras no se pudo leer (revisión de flujos):
     * los huecos no se pintan como «Libre» y se dice, para no ocultar lo que no
     * se pudo comprobar.
     */
    ocupacionIncompleta?: boolean
    onReintentarOcupacion?: () => void
}

const minutosAFecha = (dia: Date, minutos: number): Date => {
    const fecha = new Date(dia)
    fecha.setHours(0, 0, 0, 0)
    fecha.setMinutes(minutos)
    return fecha
}

const sumarDias = (dia: Date, dias: number): Date => {
    const fecha = new Date(dia)
    fecha.setDate(fecha.getDate() + dias)
    return fecha
}

const ALTO_TOTAL = (JORNADA_FIN_MIN - JORNADA_INICIO_MIN) * PX_POR_MINUTO

const HORAS = Array.from(
    { length: Math.floor((JORNADA_FIN_MIN - JORNADA_INICIO_MIN) / 60) + 1 },
    (_, i) => JORNADA_INICIO_MIN + i * 60,
)

export const AgendaSalasDia: React.FC<AgendaSalasDiaProps> = ({
    dia,
    citas,
    salas,
    onCitaClick,
    onHuecoClick,
    onCambiarDia,
    ocupacionIncompleta = false,
    onReintentarOcupacion,
}) => {
    // El padre puede traer un rango mayor (el mes visible); aquí sólo se
    // pinta el día elegido.
    const citasDelDia = useMemo(
        () => citas.filter((cita) => esMismoDia(cita.scheduled_at, dia)),
        [citas, dia],
    )

    const columnas = useMemo(() => agruparCitasPorSala(citasDelDia, salas), [citasDelDia, salas])

    const tituloDia = dia.toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })

    const esHoy = esMismoDia(new Date(), dia)

    if (salas.length === 0) {
        return (
            <div className="text-center text-body-secondary py-5">
                <CIcon icon={cilRoom} size="xl" className="mb-2" />
                <div>Esta sucursal todavía no tiene salas configuradas.</div>
                <div className="small">
                    Un administrador puede darlas de alta en Administración → Salas.
                </div>
            </div>
        )
    }

    return (
        <div className="agenda-salas-dia">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <CButton color="primary" variant="outline" size="sm" onClick={() => onCambiarDia(sumarDias(dia, -1))} title="Día anterior" aria-label="Día anterior">
                    <CIcon icon={cilChevronLeft} />
                </CButton>
                <CButton color="primary" size="sm" onClick={() => onCambiarDia(new Date())} disabled={esHoy}>
                    Hoy
                </CButton>
                <CButton color="primary" variant="outline" size="sm" onClick={() => onCambiarDia(sumarDias(dia, 1))} title="Día siguiente" aria-label="Día siguiente">
                    <CIcon icon={cilChevronRight} />
                </CButton>
                <h5 className="mb-0 ms-2 text-capitalize fw-bold">{tituloDia}</h5>
                <span className="ms-auto small text-body-secondary">
                    {ocupacionIncompleta ? 'Pincha un hueco para agendar ahí' : 'Pincha un hueco libre para agendar ahí'}
                </span>
            </div>

            {ocupacionIncompleta && (
                <CAlert color="warning" className="d-flex flex-wrap align-items-center gap-2" role="alert">
                    <span className="flex-grow-1">
                        No se pudo leer la ocupación de las demás doctoras: puede haber citas que no se ven
                        aquí y huecos que no estén libres.
                    </span>
                    {onReintentarOcupacion && (
                        <CButton color="warning" variant="outline" size="sm" onClick={onReintentarOcupacion}>
                            Reintentar
                        </CButton>
                    )}
                </CAlert>
            )}

            <div className="agenda-salas" style={{ display: 'flex', overflowX: 'auto' }}>
                {/* Regleta de horas */}
                <div style={{ flex: '0 0 56px', paddingTop: 34 }}>
                    <div style={{ position: 'relative', height: ALTO_TOTAL }}>
                        {HORAS.map((minuto) => (
                            <div
                                key={minuto}
                                className="small text-body-secondary"
                                style={{
                                    position: 'absolute',
                                    top: (minuto - JORNADA_INICIO_MIN) * PX_POR_MINUTO - 8,
                                    right: 8,
                                }}
                            >
                                {formatearMinutos(minuto)}
                            </div>
                        ))}
                    </div>
                </div>

                {columnas.map((columna) => {
                    const color = colorDeSala(columna.salaId, salas)
                    const huecos =
                        columna.salaId == null
                            ? []
                            : huecosLibres(columna.citas, JORNADA_INICIO_MIN, JORNADA_FIN_MIN)
                    const colocadas = repartirEnCarriles(columna.citas)
                    const minutosLibres = huecos.reduce((t, h) => t + (h.fin - h.inicio), 0)

                    return (
                        <div
                            key={columna.salaId ?? 'sin-sala'}
                            style={{ flex: '1 1 0', minWidth: 190, paddingRight: 6 }}
                        >
                            <div
                                className="d-flex align-items-center justify-content-between px-2 py-1 mb-1 rounded-top"
                                style={{ backgroundColor: color, color: '#fff', height: 30 }}
                            >
                                <span className="fw-semibold text-truncate">{columna.nombre}</span>
                                <CBadge color="light" className="text-body">
                                    {columna.citas.length}
                                </CBadge>
                            </div>

                            <div
                                style={{
                                    position: 'relative',
                                    height: ALTO_TOTAL,
                                    border: '1px solid var(--cui-border-color)',
                                    borderRadius: 6,
                                    backgroundColor: 'var(--cui-body-bg)',
                                }}
                            >
                                {/* Líneas de hora */}
                                {HORAS.map((minuto) => (
                                    <div
                                        key={minuto}
                                        style={{
                                            position: 'absolute',
                                            top: (minuto - JORNADA_INICIO_MIN) * PX_POR_MINUTO,
                                            left: 0,
                                            right: 0,
                                            borderTop: '1px solid var(--cui-border-color-translucent)',
                                        }}
                                    />
                                ))}

                                {/* Huecos libres: son el objetivo de esta vista */}
                                {huecos.map((hueco) => {
                                    const alto = (hueco.fin - hueco.inicio) * PX_POR_MINUTO
                                    return (
                                        <button
                                            key={`libre-${hueco.inicio}`}
                                            type="button"
                                            className="agenda-salas-hueco small"
                                            title={
                                                ocupacionIncompleta
                                                    ? `Sin confirmar: no se pudo leer la ocupación de las demás doctoras en ${columna.nombre}`
                                                    : `Agendar a las ${formatearMinutos(hueco.inicio)} en ${columna.nombre}`
                                            }
                                            onClick={() =>
                                                onHuecoClick(minutosAFecha(dia, hueco.inicio), columna.salaId)
                                            }
                                            style={{
                                                position: 'absolute',
                                                top: (hueco.inicio - JORNADA_INICIO_MIN) * PX_POR_MINUTO,
                                                left: 2,
                                                right: 2,
                                                height: Math.max(alto - 2, 8),
                                            }}
                                        >
                                            {alto >= MIN_PX_ETIQUETA_HUECO && (
                                                <span>
                                                    {ocupacionIncompleta ? 'Sin confirmar' : 'Libre'} ·{' '}
                                                    {formatearTramo(hueco)}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}

                                {/* Citas */}
                                {colocadas.map(({ cita, tramo, carril, carriles }) => {
                                    const alto = Math.max((tramo.fin - tramo.inicio) * PX_POR_MINUTO - 2, 18)
                                    const anchoPct = 100 / carriles
                                    const cancelada = cita.status === 'cancelada'
                                    return (
                                        <button
                                            key={cita.id}
                                            type="button"
                                            className={`agenda-salas-cita fc-status-${cita.status}`}
                                            onClick={() => onCitaClick(cita)}
                                            style={{
                                                position: 'absolute',
                                                top: (tramo.inicio - JORNADA_INICIO_MIN) * PX_POR_MINUTO,
                                                left: `calc(${carril * anchoPct}% + 2px)`,
                                                width: `calc(${anchoPct}% - 4px)`,
                                                height: alto,
                                                borderLeft: `4px solid ${color}`,
                                                opacity: cancelada ? 0.55 : 1,
                                                textDecoration: cancelada ? 'line-through' : 'none',
                                            }}
                                        >
                                            <span className="agenda-salas-cita-hora">
                                                {formatearMinutos(tramo.inicio)}
                                            </span>
                                            <span className="agenda-salas-cita-nombre">
                                                {cita.patient
                                                    ? `${cita.patient.first_name} ${cita.patient.last_name}`
                                                    : 'Paciente sin nombre'}
                                            </span>
                                            {cita.doctor?.full_name && (
                                                <span className="agenda-salas-cita-doctor">
                                                    {nombreConTratamiento(cita.doctor)}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="small text-body-secondary text-center mt-1">
                                {columna.salaId == null ? (
                                    <>Citas sin sala asignada</>
                                ) : minutosLibres === 0 ? (
                                    <span className="text-danger fw-semibold">Sin huecos libres</span>
                                ) : (
                                    <>
                                        {Math.floor(minutosLibres / 60)} h {minutosLibres % 60} min libres
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {columnas.some((columna) => columna.salaId === null) && (
                <div className="small text-body-secondary mt-3">
                    La columna «{SIN_SALA_LABEL}» recoge las citas anteriores a las salas: no
                    reservan ninguna, por eso no descuentan huecos.
                </div>
            )}
        </div>
    )
}

export default AgendaSalasDia
