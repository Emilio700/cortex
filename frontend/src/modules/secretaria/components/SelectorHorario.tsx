/**
 * Panel derecho del modal de cita: "Selecciona un horario".
 *
 * Rejilla de horarios con conmutador a. m. / p. m. El elegido se rellena en
 * azul sólido (docs/DESIGN.md §3.3: lo seleccionado se rellena, no se subraya).
 *
 * Lo importante: **sólo se ofrece lo que el servidor dice que está libre**.
 * Las franjas ocupadas se muestran igualmente, deshabilitadas y con su motivo
 * en el `title`, porque a la asistente le sirve ver que las 10:00 existen y
 * están tomadas; lo que no puede pasar es que pinche una y el guardado falle.
 */
import React from 'react'
import { CButton, CSpinner } from '@coreui/react-pro'
import type { Franja } from '../../../shared/services/disponibilidad'
import { contarLibres, repartirPorMeridiano, type Meridiano } from '../utils/horarios'

interface Props {
    franjas: Franja[]
    /** `inicio` de la franja elegida, o null. */
    seleccionada: string | null
    onSeleccionar: (franja: Franja) => void
    meridiano: Meridiano
    onCambiarMeridiano: (meridiano: Meridiano) => void
    /** "19 de septiembre de 2026". */
    fechaLarga: string
    cargando?: boolean
    disabled?: boolean
    /** Texto que explica por qué no hay rejilla (sin doctor, error de red…). */
    aviso?: string | null
}

const ETIQUETAS: Record<Meridiano, string> = { am: 'a. m.', pm: 'p. m.' }

export const SelectorHorario: React.FC<Props> = ({
    franjas,
    seleccionada,
    onSeleccionar,
    meridiano,
    onCambiarMeridiano,
    fechaLarga,
    cargando,
    disabled,
    aviso,
}) => {
    const porMeridiano = repartirPorMeridiano(franjas)
    const visibles = porMeridiano[meridiano]
    const libres = contarLibres(visibles)

    return (
        <div className="gems-selector-horario">
            <div className="d-flex align-items-center justify-content-between mb-2 gap-2">
                <div className="small text-body-secondary">
                    Horarios disponibles para el {fechaLarga}
                </div>
                <div className="btn-group btn-group-sm flex-shrink-0" role="group" aria-label="Franja del día">
                    {(['am', 'pm'] as const).map((valor) => (
                        <CButton
                            key={valor}
                            type="button"
                            size="sm"
                            color={meridiano === valor ? 'primary' : 'secondary'}
                            variant={meridiano === valor ? undefined : 'outline'}
                            aria-pressed={meridiano === valor}
                            disabled={disabled}
                            onClick={() => onCambiarMeridiano(valor)}
                        >
                            {ETIQUETAS[valor]}
                        </CButton>
                    ))}
                </div>
            </div>

            {cargando ? (
                <div className="text-center py-4 text-body-secondary small">
                    <CSpinner size="sm" className="me-2" />
                    Consultando horarios...
                </div>
            ) : aviso ? (
                <div className="alert alert-light border small mb-0">{aviso}</div>
            ) : visibles.length === 0 ? (
                <div className="alert alert-light border small mb-0">
                    No hay horarios por la {ETIQUETAS[meridiano]} ese día. Prueba la otra mitad del
                    día o elige otra fecha.
                </div>
            ) : (
                <>
                    <div
                        role="group"
                        aria-label="Horarios"
                        // Se desplaza por sí misma en el teléfono: con foco se
                        // puede recorrer con el teclado (axe).
                        tabIndex={0}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
                            gap: 6,
                            maxHeight: 220,
                            overflowY: 'auto',
                        }}
                    >
                        {visibles.map((franja) => {
                            const elegida = seleccionada === franja.inicio
                            // Lo ocupado en rojo apagado y tachado: gris sobre
                            // gris obligaba a pasar el ratón por cada franja
                            // para saber cuáles se podían pulsar.
                            const color = elegida
                                ? 'primary'
                                : franja.disponible
                                  ? 'success'
                                  : 'danger'
                            return (
                                <CButton
                                    key={franja.inicio}
                                    type="button"
                                    size="sm"
                                    color={color}
                                    variant={elegida ? undefined : 'outline'}
                                    className={franja.disponible ? undefined : 'gems-franja-ocupada'}
                                    aria-pressed={elegida}
                                    aria-label={
                                        franja.disponible
                                            ? `${franja.hora}, disponible`
                                            : `${franja.hora}, no disponible: ${franja.motivo ?? 'ocupado'}`
                                    }
                                    disabled={disabled || !franja.disponible}
                                    // El motivo viene del backend ya redactado
                                    // en español: se muestra tal cual.
                                    title={franja.motivo ?? undefined}
                                    onClick={() => onSeleccionar(franja)}
                                >
                                    {franja.hora}
                                </CButton>
                            )
                        })}
                    </div>
                    <div className="small text-body-secondary mt-2">
                        {libres === 0
                            ? 'Sin horarios libres en esta mitad del día.'
                            : `${libres} horario${libres === 1 ? '' : 's'} libre${libres === 1 ? '' : 's'}.`}
                    </div>
                </>
            )}
        </div>
    )
}

export default SelectorHorario
