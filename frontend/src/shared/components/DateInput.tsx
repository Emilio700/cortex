/**
 * Campo de fecha que se puede TECLEAR (dd/mm/aaaa) sin que se borre a medias.
 *
 * El texto vive en estado local y solo se consolida hacia arriba cuando la
 * fecha está completa y es válida (o al vaciar el campo). Así, escribir
 * "01/01/1970" ya no se limpia solo mientras se teclea, y no hace falta
 * navegar el calendario año por año.
 */
import React, { useEffect, useState } from 'react'
import { CFormFeedback, CFormInput, CInputGroup } from '@coreui/react-pro'
import { displayAIso, formatearTecleoFecha, isoADisplay } from '../utils/patientForm'

interface DateInputProps {
    id: string
    value?: string | null
    onChange: (valorIso: string) => void
    disabled?: boolean
    required?: boolean
    min?: string
    max?: string
}

export const DateInput: React.FC<DateInputProps> = ({
    id,
    value,
    onChange,
    disabled = false,
    required = false,
    min,
    max,
}) => {
    const [texto, setTexto] = useState<string>(() => isoADisplay(value))
    const [tocado, setTocado] = useState(false)

    // Refleja los cambios que vienen de fuera (carga de paciente, FPP calculada)
    // sin pisar lo que se está tecleando.
    useEffect(() => {
        const isoActual = displayAIso(texto)
        const isoNuevo = (value || '').trim()
        // Mientras la fecha esté a medio teclear ambos lados valen '' y no se
        // pisa el texto del usuario.
        if (isoActual === isoNuevo) return
        setTexto(isoADisplay(isoNuevo))
    }, [value, texto])

    const handleTexto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formateado = formatearTecleoFecha(e.target.value)
        setTexto(formateado)
        if (formateado === '') {
            onChange('')
            return
        }
        const iso = displayAIso(formateado)
        if (iso) onChange(iso)
    }

    const handleBlur = () => {
        setTocado(true)
        if (texto === '') {
            onChange('')
            return
        }
        const iso = displayAIso(texto)
        if (iso) {
            setTexto(isoADisplay(iso))
            onChange(iso)
        }
    }

    const handleCalendario = (e: React.ChangeEvent<HTMLInputElement>) => {
        const iso = e.target.value
        setTexto(isoADisplay(iso))
        onChange(iso)
    }

    const invalido = tocado && texto !== '' && displayAIso(texto) === ''

    return (
        <>
            <CInputGroup>
                <CFormInput
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="dd/mm/aaaa"
                    value={texto}
                    onChange={handleTexto}
                    onBlur={handleBlur}
                    disabled={disabled}
                    required={required}
                    invalid={invalido}
                    aria-describedby={`${id}-ayuda`}
                />
                <input
                    type="date"
                    className="form-control flex-grow-0 w-auto"
                    style={{ maxWidth: '3rem' }}
                    aria-label="Abrir calendario"
                    title="Abrir calendario"
                    tabIndex={-1}
                    value={displayAIso(texto)}
                    onChange={handleCalendario}
                    disabled={disabled}
                    min={min}
                    max={max}
                />
            </CInputGroup>
            {invalido ? (
                <CFormFeedback className="d-block text-danger">
                    Fecha incompleta o inexistente. Usa dd/mm/aaaa.
                </CFormFeedback>
            ) : (
                <small id={`${id}-ayuda`} className="text-muted">
                    Escríbela como dd/mm/aaaa o usa el calendario.
                </small>
            )}
        </>
    )
}
