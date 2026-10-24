/**
 * Leyenda de colores de la agenda, siempre visible al pie del calendario.
 *
 * QUÉ SIGNIFICA CADA COSA, y por qué la leyenda es ésta y no otra:
 *
 * El boceto pedía una leyenda "por tipo de cita" con seis entradas (Consulta,
 * Control, Primera vez, Procedimiento, Ultrasonido, No disponible). En el
 * sistema real sólo existen TRES tipos de cita (`consulta`, `cirugia`,
 * `procedimiento`) y el color de fondo de una cita no codifica el tipo:
 * codifica el ESTADO, que es lo que el consultorio lleva meses leyendo en
 * esta pantalla. Pintar seis colores por tipos que no existen sería una
 * leyenda que no explica nada de lo que se ve.
 *
 * Así que la leyenda dice la verdad de lo que hay en la pantalla: el fondo es
 * el estado, el punto de color es la sala, y el tipo de cita se lee en la
 * lista y en el panel lateral.
 */
import React from 'react'
import CIcon from '@coreui/icons-react'
import { cilCheckAlt } from '@coreui/icons'
import type { Sala } from '../../../shared/services/salas'
import { colorDeSala, salasActivas, SIN_SALA_LABEL, COLOR_SIN_SALA } from '../utils/salas'
import { ESTADO_COLORES, ESTADO_LABELS } from '../utils/tablero'

interface AgendaLeyendaProps {
    /** Catálogo de salas activas, para explicar los puntos de color. */
    salas?: Sala[]
    /** Hay citas sin sala a la vista: se explica también el punto gris. */
    mostrarSinSala?: boolean
}

const ORDEN_ESTADOS = ['agendada', 'confirmada', 'en_sala', 'en_consulta', 'atendida', 'cancelada']

export const AgendaLeyenda: React.FC<AgendaLeyendaProps> = ({
    salas = [],
    mostrarSinSala = true,
}) => {
    const activas = salasActivas(salas)

    return (
        <div className="agenda-leyenda" data-tour="agenda-leyenda">
            <div className="agenda-leyenda-grupo">
                <span className="agenda-leyenda-titulo">Color de la cita: estado</span>
                {ORDEN_ESTADOS.map((estado) => (
                    <span className="agenda-leyenda-item" key={estado}>
                        <span
                            className="agenda-leyenda-cuadro"
                            style={{ backgroundColor: ESTADO_COLORES[estado] }}
                            aria-hidden="true"
                        />
                        {ESTADO_LABELS[estado]}
                    </span>
                ))}
            </div>

            {activas.length > 0 && (
                <div className="agenda-leyenda-grupo">
                    <span className="agenda-leyenda-titulo">Punto de color: sala</span>
                    {activas.map((sala) => (
                        <span className="agenda-leyenda-item" key={sala.id}>
                            <span
                                className="agenda-leyenda-punto"
                                style={{ backgroundColor: colorDeSala(sala.id, salas) }}
                                aria-hidden="true"
                            />
                            {sala.name}
                        </span>
                    ))}
                    {mostrarSinSala && (
                        <span className="agenda-leyenda-item">
                            <span
                                className="agenda-leyenda-punto"
                                style={{ backgroundColor: COLOR_SIN_SALA }}
                                aria-hidden="true"
                            />
                            {SIN_SALA_LABEL}
                        </span>
                    )}
                </div>
            )}

            <div className="agenda-leyenda-grupo">
                <span className="agenda-leyenda-item">
                    <CIcon icon={cilCheckAlt} size="sm" className="text-success" aria-hidden="true" />
                    Triage completado
                </span>
            </div>
        </div>
    )
}
