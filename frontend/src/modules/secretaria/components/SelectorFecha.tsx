/**
 * Panel izquierdo del modal de cita: "Selecciona la fecha".
 *
 * Calendario mensual con navegación y la leyenda que pidió el consultorio:
 * Fecha seleccionada · Disponible · No disponible. Los días se colorean con lo
 * que responde el endpoint de disponibilidad, nunca por suposición: una
 * casilla sin dato se queda neutra en vez de prometer un hueco que no existe.
 */
import React from 'react'
import { CButton } from '@coreui/react-pro'
import {
    casillasDelMes,
    desplazarMes,
    estadoDeCasilla,
    mesYAnio,
    mismoDia,
    DIAS_SEMANA,
    type EstadoDia,
} from '../utils/horarios'
import type { DiaDisponible } from '../../../shared/services/disponibilidad'
import { indexarDias } from '../utils/horarios'

interface Props {
    /** Mes que se está mirando (cualquier día de él). */
    mes: Date
    onCambiarMes: (mes: Date) => void
    /** Día elegido, "AAAA-MM-DD", o null. */
    seleccionada: string | null
    onSeleccionar: (clave: string) => void
    dias: DiaDisponible[]
    cargando?: boolean
    disabled?: boolean
}

/** Colores de la leyenda. Verde = libre, rojo = sin hueco (docs/DESIGN.md §2). */
const ESTILOS: Record<EstadoDia, React.CSSProperties> = {
    seleccionada: {
        backgroundColor: 'var(--hf-blue, #2563eb)',
        color: '#fff',
        borderColor: 'var(--hf-blue, #2563eb)',
        fontWeight: 700,
    },
    disponible: {
        backgroundColor: 'var(--hf-green-light, #dcfce7)',
        color: 'var(--hf-text, #1a1a1a)',
        borderColor: 'var(--hf-green-border, #86efac)',
    },
    'no-disponible': {
        backgroundColor: 'var(--hf-surface-alt, #f3f2ef)',
        // Más oscuro que el gris secundario: tachado y chico, #6b6b6b no
        // llegaba a 4.5:1 sobre este fondo (axe).
        color: '#57534e',
        borderColor: 'var(--hf-border, #e8e5e0)',
        textDecoration: 'line-through',
    },
    'sin-datos': {
        backgroundColor: 'transparent',
        // Mismo gris oscuro que «no disponible»: mientras carga, el día queda
        // sobre el fondo gris y #6b6b6b no llegaba a 4.5:1 (axe).
        color: '#57534e',
        borderColor: 'transparent',
    },
}

const Muestra: React.FC<{ estado: EstadoDia; texto: string }> = ({ estado, texto }) => (
    <span className="d-inline-flex align-items-center gap-1">
        <span
            aria-hidden="true"
            style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                border: '1px solid',
                display: 'inline-block',
                ...ESTILOS[estado],
            }}
        />
        {texto}
    </span>
)

export const SelectorFecha: React.FC<Props> = ({
    mes,
    onCambiarMes,
    seleccionada,
    onSeleccionar,
    dias,
    cargando,
    disabled,
}) => {
    const porFecha = indexarDias(dias)
    const casillas = casillasDelMes(mes)
    const hoy = new Date()

    return (
        <div className="gems-selector-fecha">
            <div className="d-flex align-items-center justify-content-between mb-2">
                <CButton
                    color="light"
                    size="sm"
                    type="button"
                    aria-label="Mes anterior"
                    disabled={disabled}
                    onClick={() => onCambiarMes(desplazarMes(mes, -1))}
                >
                    ‹
                </CButton>
                <strong className="text-capitalize" aria-live="polite">
                    {mesYAnio(mes)}
                </strong>
                <CButton
                    color="light"
                    size="sm"
                    type="button"
                    aria-label="Mes siguiente"
                    disabled={disabled}
                    onClick={() => onCambiarMes(desplazarMes(mes, 1))}
                >
                    ›
                </CButton>
            </div>

            <div
                // «group» y no «grid»: un grid exige renglones y celdas, y aquí
                // los días son botones sueltos (axe, aria-required-children).
                role="group"
                aria-label="Calendario"
                aria-busy={cargando ? true : undefined}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}
            >
                {DIAS_SEMANA.map((dia, i) => (
                    <div
                        key={`${dia}-${i}`}
                        className="text-center small text-body-secondary"
                        aria-hidden="true"
                    >
                        {dia}
                    </div>
                ))}

                {casillas.map((casilla) => {
                    const estado = estadoDeCasilla(casilla, seleccionada, porFecha)
                    const dia = porFecha[casilla.clave]
                    const sinHueco = estado === 'no-disponible'
                    // Una casilla sin hueco no se deshabilita: se puede mirar y
                    // el aviso explica por qué no hay horarios. Deshabilitarla
                    // dejaría al usuario sin saber qué pasó.
                    return (
                        <button
                            key={casilla.clave}
                            type="button"
                            disabled={disabled || !casilla.delMes}
                            aria-pressed={estado === 'seleccionada'}
                            aria-label={
                                casilla.delMes
                                    ? `${casilla.clave}${sinHueco ? ' · sin horarios libres' : ''}`
                                    : undefined
                            }
                            title={dia ? `${dia.huecos} horario(s) libre(s)` : undefined}
                            onClick={() => onSeleccionar(casilla.clave)}
                            className="border rounded"
                            style={{
                                padding: '6px 0',
                                fontSize: 13,
                                cursor: casilla.delMes ? 'pointer' : 'default',
                                visibility: casilla.delMes ? 'visible' : 'hidden',
                                outline: mismoDia(casilla.fecha, hoy)
                                    ? '2px solid var(--hf-amber, #d97706)'
                                    : undefined,
                                ...ESTILOS[estado],
                            }}
                        >
                            {casilla.fecha.getDate()}
                        </button>
                    )
                })}
            </div>

            <div className="d-flex flex-wrap gap-3 mt-2 small text-body-secondary">
                <Muestra estado="seleccionada" texto="Fecha seleccionada" />
                <Muestra estado="disponible" texto="Disponible" />
                <Muestra estado="no-disponible" texto="No disponible" />
            </div>
        </div>
    )
}

export default SelectorFecha
