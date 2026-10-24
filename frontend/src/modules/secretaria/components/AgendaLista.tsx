/**
 * Vista "Lista" de la agenda: el rango visible en forma de tabla, agrupado
 * por día.
 *
 * Para qué sirve: repasar el día en voz alta con la paciente enfrente e
 * imprimir la hoja del día o de la semana. Por eso es una tabla y no otra
 * rejilla: se lee de arriba abajo y el navegador la imprime bien.
 *
 * El rango lo sigue mandando FullCalendar: esta vista sólo pinta las citas
 * que la página ya trajo del servidor para el rango que se está mirando.
 */
import React, { useMemo } from 'react'
import CIcon from '@coreui/icons-react'
import { cilCalendar } from '@coreui/icons'
import type { Appointment } from '../types'
import type { CamposCobroDeCita } from '../../finanzas/types'
import { InsigniaCobro } from '../../finanzas/components/InsigniaCobro'
import { InsigniaExpress } from '../../finanzas/components/InsigniaExpress'
import {
    agruparCitasPorDia,
    ESTADO_COLORES,
    ESTADO_LABELS,
    etiquetaTipoCita,
    horaLocal,
    motivoDeCita,
    nombrePaciente,
    tituloDia,
} from '../utils/tablero'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'

interface AgendaListaProps {
    citas: Appointment[]
    onCitaClick: (cita: Appointment) => void
}

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export const AgendaLista: React.FC<AgendaListaProps> = ({ citas, onCitaClick }) => {
    const dias = useMemo(() => {
        const grupos = agruparCitasPorDia(citas)
        return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b))
    }, [citas])

    if (dias.length === 0) {
        return (
            <div className="agenda-lista-vacia">
                <CIcon icon={cilCalendar} size="xxl" className="opacity-25 mb-3" />
                <p className="mb-0">
                    No hay ninguna cita en el periodo que estás mirando. Cambia de mes o de semana
                    con los botones de arriba, o quita algún filtro.
                </p>
            </div>
        )
    }

    return (
        <div className="agenda-lista">
            {dias.map(([clave, delDia]) => {
                const fecha = delDia[0] ? new Date(delDia[0].scheduled_at) : new Date(clave)
                return (
                    <section className="agenda-lista-dia" key={clave}>
                        <h6 className="agenda-lista-dia-titulo">
                            <span className="text-capitalize">{DIAS_LARGOS[fecha.getDay()]}</span>,{' '}
                            {tituloDia(fecha)}
                            <span className="agenda-lista-dia-total">
                                {delDia.length} cita{delDia.length === 1 ? '' : 's'}
                            </span>
                        </h6>
                        <table className="table agenda-lista-tabla">
                            <thead>
                                <tr>
                                    <th scope="col" style={{ width: '4.5rem' }}>
                                        Hora
                                    </th>
                                    <th scope="col">Paciente</th>
                                    <th scope="col">Doctora</th>
                                    <th scope="col">Tipo</th>
                                    <th scope="col">Motivo</th>
                                    <th scope="col">Sala</th>
                                    <th scope="col">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {delDia.map((cita) => (
                                    // La fila entera se pincha con el ratón, pero el enlace
                                    // real al que se llega con el teclado es el nombre de la
                                    // paciente: así la tabla sigue siendo una tabla para quien
                                    // la recorre con lector de pantalla.
                                    <tr key={cita.id} onClick={() => onCitaClick(cita)}>
                                        <td className="fw-bold">{horaLocal(cita.scheduled_at)}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="agenda-lista-abrir"
                                                aria-label={`Abrir la cita de ${nombrePaciente(cita)}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onCitaClick(cita)
                                                }}
                                            >
                                                {nombrePaciente(cita)}
                                            </button>
                                        </td>
                                        <td className="text-body-secondary">
                                            {cita.doctor?.full_name ? nombreConTratamiento(cita.doctor) : 'Sin asignar'}
                                        </td>
                                        <td className="text-body-secondary">{etiquetaTipoCita(cita)}</td>
                                        {/* Nota para el doctor, opcional. Sin motivo se pone una
                                            raya: un hueco en blanco se lee como un dato perdido. */}
                                        <td className="agenda-lista-motivo">
                                            {motivoDeCita(cita) ?? (
                                                <span
                                                    className="text-body-secondary"
                                                    title="Esta cita no tiene ningún motivo anotado."
                                                >
                                                    —
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-body-secondary">{cita.room_name || 'Sin sala'}</td>
                                        <td>
                                            <span
                                                className="agenda-lista-estado"
                                                style={{
                                                    color: ESTADO_COLORES[cita.status],
                                                    borderColor: ESTADO_COLORES[cita.status],
                                                }}
                                            >
                                                {ESTADO_LABELS[cita.status] ?? cita.status}
                                            </span>
                                            {/* Junto al estado, para que "Atendida" nunca se lea
                                                como "ya pagó" cuando falta cobrarla. */}
                                            <InsigniaCobro
                                                cita={cita as Appointment & CamposCobroDeCita}
                                                className="ms-1"
                                            />
                                            {/* Que una consulta sin cita no se lea como agendada. */}
                                            <InsigniaExpress
                                                cita={cita as Appointment & CamposCobroDeCita}
                                                className="ms-1"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                )
            })}
        </div>
    )
}
