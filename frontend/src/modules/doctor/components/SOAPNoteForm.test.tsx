import { createRef } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SOAPNoteForm, { type SOAPNoteFormHandle } from './SOAPNoteForm'

// Declarados afuera del factory para poder asertar sobre ellos.
const createSOAPNote = vi.fn()
const updateSOAPNote = vi.fn()

vi.mock('../hooks/useSOAPNotes', () => ({
    useSOAPNotes: () => ({
        loading: false,
        error: null,
        createSOAPNote,
        updateSOAPNote,
    }),
}))

const SECCIONES = [
    /Síntomas \/ Motivo de consulta/,
    /Exploración física \/ Signos vitales/,
    /Diagnóstico \/ Impresión diagnóstica/,
    /Plan \/ Tratamiento/,
]

beforeEach(() => {
    createSOAPNote.mockReset()
    updateSOAPNote.mockReset()
})

describe('SOAPNoteForm', () => {
    it.each(SECCIONES)('captura la seccion %s en MAYUSCULAS', async (etiqueta) => {
        const usuario = userEvent.setup()
        render(<SOAPNoteForm appointmentId={1} />)
        const campo = screen.getByLabelText(etiqueta) as HTMLTextAreaElement
        await usuario.type(campo, 'dolor abdominal')
        expect(campo.value).toBe('DOLOR ABDOMINAL')
    })
})

describe('SOAPNoteForm · guardado desde fuera', () => {
    it('no reporta cambios mientras la nota esta en blanco', () => {
        const ref = createRef<SOAPNoteFormHandle>()
        render(<SOAPNoteForm ref={ref} appointmentId={1} />)
        expect(ref.current?.tieneCambios()).toBe(false)
    })

    it('reporta cambios en cuanto hay texto capturado sin guardar', async () => {
        const usuario = userEvent.setup()
        const ref = createRef<SOAPNoteFormHandle>()
        render(<SOAPNoteForm ref={ref} appointmentId={1} />)
        await usuario.type(screen.getByLabelText(SECCIONES[0]), 'dolor')
        expect(ref.current?.tieneCambios()).toBe(true)
    })

    it('guardar() persiste la nota y la devuelve', async () => {
        const usuario = userEvent.setup()
        const nota = { id: 3, appointment_id: 1 }
        createSOAPNote.mockResolvedValue(nota)
        const ref = createRef<SOAPNoteFormHandle>()
        render(<SOAPNoteForm ref={ref} appointmentId={1} />)
        await usuario.type(screen.getByLabelText(SECCIONES[0]), 'dolor')

        await expect(ref.current?.guardar()).resolves.toBe(nota)
        expect(createSOAPNote).toHaveBeenCalledTimes(1)
    })

    it('guardar() devuelve null si el servidor no acepta la nota', async () => {
        const usuario = userEvent.setup()
        createSOAPNote.mockResolvedValue(null)
        const ref = createRef<SOAPNoteFormHandle>()
        render(<SOAPNoteForm ref={ref} appointmentId={1} />)
        await usuario.type(screen.getByLabelText(SECCIONES[0]), 'dolor')

        await expect(ref.current?.guardar()).resolves.toBeNull()
    })
})
