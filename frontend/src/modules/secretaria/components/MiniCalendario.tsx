/**
 * Mini calendario del mes para el panel lateral de la agenda.
 *
 * Sirve para una sola cosa: saltar de día rápido sin tocar el calendario
 * grande. Cada día con citas lleva un punto debajo, para que se vea de un
 * vistazo dónde está el trabajo del mes.
 *
 * El cálculo de la rejilla no está aquí: vive en `../utils/tablero.ts`, con
 * pruebas (meses que empiezan en domingo, cambio de año, etc.).
 */
import React from 'react'
import CIcon from '@coreui/icons-react'
import { cilChevronLeft, cilChevronRight } from '@coreui/icons'
import {
    claveDia,
    DIAS_SEMANA_CORTOS,
    esDelMes,
    mismoDia,
    semanasDelMes,
    tituloMes,
    tituloDia,
} from '../utils/tablero'
import { hoyDelConsultorio } from '../../../shared/utils/date'

interface MiniCalendarioProps {
    /** Mes que se está mostrando (cualquier fecha de ese mes vale). */
    mes: Date
    diaSeleccionado: Date
    /** Cuántas citas hay en cada día, por clave "YYYY-MM-DD". */
    conteoPorDia: Map<string, number>
    onSeleccionarDia: (dia: Date) => void
    /** -1 mes anterior, +1 mes siguiente. */
    onCambiarMes: (delta: number) => void
    /** El día que se marca como hoy. Por omisión, hoy en el consultorio (no en el navegador). */
    hoy?: Date
}

export const MiniCalendario: React.FC<MiniCalendarioProps> = ({
    mes,
    diaSeleccionado,
    conteoPorDia,
    onSeleccionarDia,
    onCambiarMes,
    hoy = hoyDelConsultorio(),
}) => {
    const semanas = semanasDelMes(mes)

    return (
        <div className="mini-calendario">
            <div className="mini-calendario-cabecera">
                <button
                    type="button"
                    className="mini-calendario-nav"
                    onClick={() => onCambiarMes(-1)}
                    aria-label="Mes anterior"
                >
                    <CIcon icon={cilChevronLeft} size="sm" />
                </button>
                <span className="mini-calendario-titulo">{tituloMes(mes)}</span>
                <button
                    type="button"
                    className="mini-calendario-nav"
                    onClick={() => onCambiarMes(1)}
                    aria-label="Mes siguiente"
                >
                    <CIcon icon={cilChevronRight} size="sm" />
                </button>
            </div>

            <div className="mini-calendario-rejilla" role="grid" aria-label={tituloMes(mes)}>
                <div className="mini-calendario-fila mini-calendario-dias" role="row">
                    {DIAS_SEMANA_CORTOS.map((inicial, i) => (
                        <abbr
                            key={`${inicial}-${i}`}
                            className="mini-calendario-inicial"
                            role="columnheader"
                        >
                            {inicial}
                        </abbr>
                    ))}
                </div>

                {semanas.map((semana) => (
                    <div className="mini-calendario-fila" role="row" key={claveDia(semana[0])}>
                        {semana.map((dia) => {
                            const clave = claveDia(dia)
                            const total = conteoPorDia.get(clave) ?? 0
                            const seleccionado = mismoDia(dia, diaSeleccionado)
                            const esHoy = mismoDia(dia, hoy)
                            const fuera = !esDelMes(dia, mes)
                            const etiqueta = total
                                ? `${tituloDia(dia)}, ${total} cita${total === 1 ? '' : 's'}`
                                : `${tituloDia(dia)}, sin citas`

                            // `gridcell` no admite `aria-pressed` (axe, crítico);
                            // el estado se anuncia con `aria-selected`.
                            return (
                                <button
                                    key={clave}
                                    type="button"
                                    role="gridcell"
                                    className={[
                                        'mini-calendario-dia',
                                        fuera ? 'es-relleno' : '',
                                        esHoy ? 'es-hoy' : '',
                                        seleccionado ? 'es-seleccionado' : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    aria-selected={seleccionado}
                                    aria-current={esHoy ? 'date' : undefined}
                                    aria-label={etiqueta}
                                    onClick={() => onSeleccionarDia(dia)}
                                >
                                    <span aria-hidden="true">{dia.getDate()}</span>
                                    {total > 0 && (
                                        <span className="mini-calendario-punto" aria-hidden="true" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}
