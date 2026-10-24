/**
 * Notas de Consulta - Rediseñado para doctores
 * Formulario simplificado sin etiquetas S-O-A-P, campos directos y limpios.
 * CIE-10 removido — diagnóstico en texto libre.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import {
    CButton,
    CForm,
    CFormTextarea,
    CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilSave } from '@coreui/icons'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { useCambiosSinGuardar } from '../../../shared/tabs/cambiosSinGuardar'
import { useSOAPNotes } from '../hooks/useSOAPNotes'
import type { SOAPNote, SOAPNoteCreate } from '../types'
import { formatearInstante } from '../../../shared/utils/date'

interface SOAPNoteFormProps {
    appointmentId: number
    existingNote?: SOAPNote | null
    onSaved?: (note: SOAPNote) => void
    compact?: boolean
    readOnly?: boolean
}

/**
 * Lo que la página necesita del formulario para poder cerrar la consulta sin
 * perder la nota: la nota vive en el estado de este componente, así que quien
 * finaliza tiene que poder pedirle que la guarde y enterarse si no pudo.
 */
export interface SOAPNoteFormHandle {
    /** Guarda la nota. Devuelve null si el guardado falló. */
    guardar: () => Promise<SOAPNote | null>
    /** true si hay texto capturado que todavía no está en el servidor. */
    tieneCambios: () => boolean
}

export const SOAPNoteForm = forwardRef<SOAPNoteFormHandle, SOAPNoteFormProps>(function SOAPNoteForm(
    { appointmentId, existingNote, onSaved, compact = false, readOnly = false },
    ref,
) {
    const { loading, error, createSOAPNote, updateSOAPNote } = useSOAPNotes()
    const [formData, setFormData] = useState<SOAPNoteCreate>({
        appointment_id: appointmentId,
        subjective: '',
        objective: '',
        assessment: '',
        plan: '',
    })

    // Las cuatro secciones son opcionales: el doctor decide si documenta la nota
    // ahora o despues. Solo se le avisa de como saldra la receta.
    const notaCompleta = Boolean(
        formData.subjective?.trim() &&
        formData.objective?.trim() &&
        formData.assessment?.trim() &&
        formData.plan?.trim(),
    )

    useEffect(() => {
        if (existingNote) {
            setFormData({
                appointment_id: existingNote.appointment_id,
                subjective: existingNote.subjective,
                objective: existingNote.objective,
                assessment: existingNote.assessment,
                plan: existingNote.plan,
            })
        }
    }, [existingNote])

    // Hay trabajo sin guardar cuando lo capturado difiere de lo que está en el
    // servidor. Con nota nueva basta con que haya algo escrito.
    const hayCambiosSinGuardar =
        !readOnly &&
        (existingNote
            ? formData.subjective !== existingNote.subjective ||
              formData.objective !== existingNote.objective ||
              formData.assessment !== existingNote.assessment ||
              formData.plan !== existingNote.plan
            : Boolean(
                  formData.subjective?.trim() ||
                      formData.objective?.trim() ||
                      formData.assessment?.trim() ||
                      formData.plan?.trim(),
              ))

    useCambiosSinGuardar(hayCambiosSinGuardar, 'Notas de consulta')

    const handleChange = (field: keyof SOAPNoteCreate, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
    }

    const guardarNota = async (): Promise<SOAPNote | null> => {
        let savedNote: SOAPNote | null = null
        if (existingNote) {
            savedNote = await updateSOAPNote(existingNote.id, {
                subjective: formData.subjective,
                objective: formData.objective,
                assessment: formData.assessment,
                plan: formData.plan,
            })
        } else {
            savedNote = await createSOAPNote(formData)
        }
        if (savedNote && onSaved) {
            onSaved(savedNote)
        }
        return savedNote
    }

    useImperativeHandle(ref, () => ({
        guardar: guardarNota,
        tieneCambios: () => hayCambiosSinGuardar,
    }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await guardarNota()
    }

    return (
        <div data-tour="nota-formulario">
            {error && (
                <div className="alert alert-danger mb-3 py-2 small">{error}</div>
            )}
            <CForm onSubmit={handleSubmit}>
                {/* Síntomas del paciente */}
                <div className="mb-3" data-tour="nota-sintomas">
                    <label className="form-label fw-semibold small text-secondary mb-1" htmlFor="nota-sintomas">
                        Síntomas / Motivo de consulta
                    </label>
                    <CFormTextarea
                        id="nota-sintomas"
                        rows={compact ? 3 : 4}
                        placeholder="¿Qué refiere el paciente? Desde cuándo, características..."
                        value={formData.subjective}
                        onChange={enMayusculas((valor) => handleChange('subjective', valor))}
                        disabled={readOnly}
                        className="gems-campo nota-campo"
                    />
                </div>

                {/* Examen físico */}
                <div className="mb-3" data-tour="nota-exploracion">
                    <label className="form-label fw-semibold small text-secondary mb-1" htmlFor="nota-exploracion">
                        Exploración física / Signos vitales
                    </label>
                    <CFormTextarea
                        id="nota-exploracion"
                        rows={compact ? 2 : 3}
                        placeholder="Hallazgos del examen físico, resultados de laboratorio..."
                        value={formData.objective}
                        onChange={enMayusculas((valor) => handleChange('objective', valor))}
                        disabled={readOnly}
                        className="gems-campo nota-campo"
                    />
                </div>

                {/* Diagnóstico */}
                <div className="mb-3" data-tour="nota-diagnostico">
                    <label className="form-label fw-semibold small text-secondary mb-1" htmlFor="nota-diagnostico">
                        Diagnóstico / Impresión diagnóstica
                    </label>
                    <CFormTextarea
                        id="nota-diagnostico"
                        rows={compact ? 2 : 3}
                        placeholder="Diagnóstico principal, diferencial..."
                        value={formData.assessment}
                        onChange={enMayusculas((valor) => handleChange('assessment', valor))}
                        disabled={readOnly}
                        className="gems-campo nota-campo"
                    />
                </div>

                {/* Plan */}
                <div className="mb-3" data-tour="nota-plan">
                    <label className="form-label fw-semibold small text-secondary mb-1" htmlFor="nota-plan">
                        Plan / Tratamiento
                    </label>
                    <CFormTextarea
                        id="nota-plan"
                        rows={compact ? 2 : 3}
                        placeholder="Plan de tratamiento, medicación, estudios, seguimiento..."
                        value={formData.plan}
                        onChange={enMayusculas((valor) => handleChange('plan', valor))}
                        disabled={readOnly}
                        className="gems-campo nota-campo"
                    />
                </div>

                {!readOnly && !notaCompleta && (
                    <div className="alert alert-warning py-2 px-3 small mb-2" role="status">
                        <strong>Nota clínica incompleta.</strong> Puedes guardarla así y completarla
                        después: la receta se generará sin las secciones que dejes en blanco.
                    </div>
                )}

                <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                    {existingNote && (
                        <small className="text-muted me-auto py-1">
                            Actualizado: {formatearInstante(existingNote.updated_at, { dateStyle: 'medium', timeStyle: 'short' })}
                        </small>
                    )}
                    {!readOnly && (
                        <CButton type="submit" color="primary" disabled={loading} size="sm" className="px-3" data-tour="nota-guardar">
                            {loading && <CSpinner size="sm" className="me-2" />}
                            <CIcon icon={cilSave} className="me-1" />
                            {existingNote ? 'Actualizar' : 'Guardar Notas'}
                        </CButton>
                    )}
                </div>
            </CForm>
        </div>
    )
})

export default SOAPNoteForm
