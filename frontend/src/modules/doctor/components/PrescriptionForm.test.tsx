import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PrescriptionForm from './PrescriptionForm'
import type { Prescription } from '../types'
import type { Triage } from '../../secretaria/types'

/**
 * Los dobles se declaran AFUERA del factory: uno declarado adentro se vuelve a
 * crear en cada render y no se puede asertar sobre él, que es justo lo que hace
 * falta aquí para contar creates contra updates.
 */
const createPrescription = vi.fn()
const updatePrescription = vi.fn()
const downloadPrescriptionPDF = vi.fn()
const printPrescription = vi.fn()
const previewPrescription = vi.fn()
const sendPrescriptionEmail = vi.fn()

vi.mock('../hooks/usePrescriptions', () => ({
    usePrescriptions: () => ({
        loading: false,
        error: null,
        createPrescription,
        updatePrescription,
        downloadPrescriptionPDF,
        printPrescription,
        previewPrescription,
        sendPrescriptionEmail,
    }),
}))

vi.mock('../hooks/useMedicamentosFrecuentes', () => ({
    useMedicamentosFrecuentes: () => ({
        medicamentos: [
            {
                id: 1,
                nombre: 'PARACETAMOL',
                presentacion: 'Tabletas',
                detalle: '500 MG',
                veces_recetado: 40,
            },
            {
                id: 2,
                nombre: 'FOLIVITAL',
                presentacion: 'Tabletas',
                detalle: '4 MG',
                veces_recetado: 12,
            },
        ],
        cargando: false,
    }),
}))

const receta = (parcial: Partial<Prescription> & { id: number }): Prescription => ({
    appointment_id: 1,
    patient_id: 2,
    doctor_id: 3,
    tenant_id: 2,
    folio_number: `REC-2-2026-000${parcial.id}`,
    medications: [
        {
            name: 'IBUPROFENO Tabletas',
            dosage: '1 tableta',
            frequency: 'Cada 8 h',
            duration: '3 dias',
        },
    ],
    instructions: '',
    created_at: '2026-09-23T10:00:00',
    updated_at: '2026-09-23T10:00:00',
    ...parcial,
})

const renderReceta = (props: Partial<React.ComponentProps<typeof PrescriptionForm>> = {}) =>
    render(<PrescriptionForm appointmentId={1} patientId={2} {...props} />)

/** El triage de la sala: es de donde se propone el motivo de la consulta. */
const triageConMotivo = (): Triage => ({
    id: 1,
    appointment_id: 1,
    weight_kg: 62,
    height_cm: 163,
    blood_pressure_systolic: 110,
    blood_pressure_diastolic: 70,
    temperature_celsius: 36.5,
    chief_complaint: 'SANGRADO IRREGULAR',
    created_by_user_id: 4,
    created_at: '2026-09-23T10:00:00',
})

const campoMedicamento = () => screen.getByLabelText(/Medicamento/) as HTMLInputElement
const indicaciones = () =>
    screen.getByLabelText(/Indicaciones adicionales/) as HTMLTextAreaElement

/** Captura un medicamento completo en la tarjeta abierta. */
const capturarMedicamento = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.type(campoMedicamento(), 'paracetamol')
    await usuario.click(screen.getByRole('button', { name: /PARACETAMOL · Tabletas/ }))
    await usuario.click(screen.getByRole('button', { name: '1 tableta' }))
    await usuario.click(screen.getByRole('button', { name: 'Cada 8 h' }))
    await usuario.click(screen.getByRole('button', { name: /Agregar a receta/ }))
}

beforeEach(() => {
    createPrescription.mockReset()
    updatePrescription.mockReset()
    downloadPrescriptionPDF.mockReset()
    printPrescription.mockReset().mockResolvedValue(true)
    previewPrescription.mockReset().mockResolvedValue('blob:vista-previa')
    sendPrescriptionEmail.mockReset()
})

describe('PrescriptionForm', () => {
    it('ya no ofrece la fila de atajos "Los que mas receta"', () => {
        renderReceta()
        expect(screen.queryByText('Los que mas receta')).not.toBeInTheDocument()
    })

    it('mantiene las sugerencias predictivas del vademecario', async () => {
        const usuario = userEvent.setup()
        renderReceta()
        await usuario.type(campoMedicamento(), 'foli')
        expect(
            screen.getByRole('button', { name: /FOLIVITAL · Tabletas · 4 MG/ }),
        ).toBeInTheDocument()
    })

    it('escribe el medicamento en MAYUSCULAS', async () => {
        const usuario = userEvent.setup()
        renderReceta()
        const campo = campoMedicamento()
        await usuario.type(campo, 'clindamicina')
        expect(campo.value).toBe('CLINDAMICINA')
    })

    it('pliega la tarjeta de captura al agregar y ofrece abrir otra vacia', async () => {
        const usuario = userEvent.setup()
        renderReceta()
        await capturarMedicamento(usuario)
        expect(screen.queryByRole('button', { name: /Agregar a receta/ })).not.toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: /Agregar otro medicamento/ }),
        ).toBeInTheDocument()
    })

    it('conserva el medicamento agregado en la lista de la receta', async () => {
        const usuario = userEvent.setup()
        renderReceta()
        await capturarMedicamento(usuario)
        expect(screen.getByText(/PARACETAMOL Tabletas 1 tableta/)).toBeInTheDocument()
    })

    it('vuelve a abrir la captura vacia con el boton grande', async () => {
        const usuario = userEvent.setup()
        renderReceta()
        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: /Agregar otro medicamento/ }))
        expect(campoMedicamento().value).toBe('')
        expect((screen.getByLabelText(/Dosis/) as HTMLInputElement).value).toBe('')
        expect((screen.getByLabelText(/Frecuencia/) as HTMLInputElement).value).toBe('')
    })

    it('marca el atajo elegido de cada columna de la pauta', async () => {
        const usuario = userEvent.setup()
        renderReceta()
        const atajo = screen.getByRole('button', { name: 'Cada 12 h' })
        await usuario.click(atajo)
        expect(atajo).toHaveAttribute('aria-pressed', 'true')
        expect(atajo).toHaveClass('gems-chip-activo')
    })

    it('captura las indicaciones adicionales en MAYUSCULAS', async () => {
        const usuario = userEvent.setup()
        renderReceta()
        await usuario.type(indicaciones(), 'reposo relativo')
        expect(indicaciones().value).toBe('REPOSO RELATIVO')
    })
})

describe('PrescriptionForm · receta que llega tarde', () => {
    it('puebla los campos cuando la receta existente llega despues del render', () => {
        const { rerender } = renderReceta({ prescriptions: [] })
        expect(screen.queryByText(/IBUPROFENO/)).not.toBeInTheDocument()

        rerender(
            <PrescriptionForm
                appointmentId={1}
                patientId={2}
                prescriptions={[receta({ id: 7, instructions: 'TOMAR CON ALIMENTOS' })]}
            />,
        )

        expect(screen.getByText(/IBUPROFENO Tabletas/)).toBeInTheDocument()
        expect(indicaciones().value).toBe('TOMAR CON ALIMENTOS')
        expect(screen.getByText(/REC-2-2026-0007/)).toBeInTheDocument()
    })

    it('NO pisa lo que la doctora ya esta escribiendo', async () => {
        const usuario = userEvent.setup()
        const { rerender } = renderReceta({ prescriptions: [] })
        await capturarMedicamento(usuario)
        await usuario.type(indicaciones(), 'lo mio')

        rerender(
            <PrescriptionForm
                appointmentId={1}
                patientId={2}
                prescriptions={[receta({ id: 7, instructions: 'TEXTO DEL SERVIDOR' })]}
            />,
        )

        expect(indicaciones().value).toBe('LO MIO')
        expect(screen.getByText(/Medicamentos en la receta \(1\)/)).toBeInTheDocument()
        expect(screen.getByText(/PARACETAMOL Tabletas 1 tableta/)).toBeInTheDocument()
    })
})

describe('PrescriptionForm · como se surte cada medicamento', () => {
    const presentacion = () =>
        screen.getByLabelText(/Presentación/) as HTMLInputElement
    const cantidad = () => screen.getByLabelText(/Cantidad a surtir/) as HTMLInputElement
    const notaDelMedicamento = () =>
        screen.getByLabelText(/Indicaciones de este medicamento/) as HTMLInputElement

    it('guarda la presentacion aparte, no pegada al nombre', async () => {
        const usuario = userEvent.setup()
        createPrescription.mockResolvedValue(receta({ id: 55 }))
        renderReceta()

        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

        await waitFor(() => expect(createPrescription).toHaveBeenCalledTimes(1))
        const enviados = createPrescription.mock.calls[0][0].medications
        expect(enviados[0]).toMatchObject({
            name: 'PARACETAMOL',
            presentation: 'Tabletas',
            dosage: '1 tableta',
        })
    })

    it('la via, la cantidad y la nota viajan con el medicamento', async () => {
        const usuario = userEvent.setup()
        createPrescription.mockResolvedValue(receta({ id: 55 }))
        renderReceta()

        await usuario.type(campoMedicamento(), 'paracetamol')
        await usuario.click(screen.getByRole('button', { name: /PARACETAMOL · Tabletas/ }))
        await usuario.click(screen.getByRole('button', { name: '1 tableta' }))
        await usuario.click(screen.getByRole('button', { name: 'Cada 8 h' }))
        await usuario.click(screen.getByRole('button', { name: 'Vía oral' }))
        await usuario.type(cantidad(), '15 tabletas')
        await usuario.type(notaDelMedicamento(), 'tomar con alimentos')
        await usuario.click(screen.getByRole('button', { name: /Agregar a receta/ }))

        // Lo capturado se ve en el resumen antes de guardar.
        expect(screen.getByText(/surtir 15 TABLETAS/)).toBeInTheDocument()

        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
        await waitFor(() => expect(createPrescription).toHaveBeenCalledTimes(1))
        expect(createPrescription.mock.calls[0][0].medications[0]).toMatchObject({
            route: 'Vía oral',
            quantity: '15 TABLETAS',
            notes: 'TOMAR CON ALIMENTOS',
        })
    })

    it('la presentacion capturada a mano tambien se guarda en su campo', async () => {
        const usuario = userEvent.setup()
        renderReceta()

        await usuario.type(presentacion(), 'ovulos')
        expect(presentacion().value).toBe('OVULOS')
    })

    it('sin via ni cantidad el resumen no inventa renglones', async () => {
        const usuario = userEvent.setup()
        renderReceta()

        await capturarMedicamento(usuario)

        expect(screen.getByText(/PARACETAMOL Tabletas 1 tableta/)).toBeInTheDocument()
        expect(screen.queryByText(/surtir/)).not.toBeInTheDocument()
    })
})

describe('PrescriptionForm · el motivo de la consulta', () => {
    const interruptorMotivo = () =>
        screen.getByLabelText(/Incluir el motivo de la consulta/) as HTMLInputElement
    const motivo = () => screen.getByLabelText(/^Motivo/) as HTMLTextAreaElement

    it('arranca apagado y no viaja al servidor', async () => {
        const usuario = userEvent.setup()
        createPrescription.mockResolvedValue(receta({ id: 55 }))
        renderReceta({ triage: triageConMotivo() })

        expect(interruptorMotivo()).not.toBeChecked()
        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

        await waitFor(() => expect(createPrescription).toHaveBeenCalledTimes(1))
        expect(createPrescription.mock.calls[0][0].diagnosis).toBeNull()
    })

    it('al encenderlo propone lo que dijo la paciente en el triage', async () => {
        const usuario = userEvent.setup()
        renderReceta({ triage: triageConMotivo() })

        await usuario.click(interruptorMotivo())

        expect(motivo().value).toBe('SANGRADO IRREGULAR')
    })

    it('lo capturado se guarda en la receta, no solo en el perfil', async () => {
        const usuario = userEvent.setup()
        createPrescription.mockResolvedValue(receta({ id: 55 }))
        renderReceta({ triage: triageConMotivo() })

        await usuario.click(interruptorMotivo())
        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

        await waitFor(() => expect(createPrescription).toHaveBeenCalledTimes(1))
        expect(createPrescription.mock.calls[0][0].diagnosis).toBe('SANGRADO IRREGULAR')
    })

    it('apagarlo borra lo escrito para que no se guarde a medias', async () => {
        const usuario = userEvent.setup()
        renderReceta({ triage: triageConMotivo() })

        await usuario.click(interruptorMotivo())
        await usuario.click(interruptorMotivo())

        expect(screen.queryByLabelText(/^Motivo/)).not.toBeInTheDocument()
    })
})

describe('PrescriptionForm · identidad de la receta', () => {
    it('guardar y luego Confirmar e Imprimir hace 1 create y 1 update, nunca 2 creates', async () => {
        const usuario = userEvent.setup()
        createPrescription.mockResolvedValue(receta({ id: 55 }))
        updatePrescription.mockResolvedValue(receta({ id: 55 }))
        renderReceta()

        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
        expect(createPrescription).toHaveBeenCalledTimes(1)

        await usuario.click(screen.getByRole('button', { name: /Vista previa/ }))
        const confirmar = await screen.findByRole('button', { name: /Confirmar e Imprimir/ })
        await usuario.click(confirmar)

        await waitFor(() => expect(updatePrescription).toHaveBeenCalledTimes(1))
        expect(createPrescription).toHaveBeenCalledTimes(1)
        expect(updatePrescription).toHaveBeenCalledWith(55, expect.anything())
    })

    it('"Agregar otra receta" es el unico camino que crea otra, y quedan rotuladas', async () => {
        const usuario = userEvent.setup()
        createPrescription
            .mockResolvedValueOnce(receta({ id: 1, created_at: '2026-09-23T10:00:00' }))
            .mockResolvedValueOnce(receta({ id: 2, created_at: '2026-09-23T10:05:00' }))
        renderReceta()

        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

        await usuario.click(screen.getByRole('button', { name: /Agregar otra receta/ }))
        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

        await waitFor(() => expect(createPrescription).toHaveBeenCalledTimes(2))
        expect(updatePrescription).not.toHaveBeenCalled()
        expect(screen.getByText('Receta 1 de 2')).toBeInTheDocument()
        expect(screen.getByText('Receta 2 de 2')).toBeInTheDocument()
    })
})

describe('PrescriptionForm · mensajes honestos', () => {
    it('al guardar sin imprimir NO dice que se envio a imprimir', async () => {
        const usuario = userEvent.setup()
        createPrescription.mockResolvedValue(receta({ id: 9 }))
        renderReceta()

        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

        expect(await screen.findByText(/Receta guardada\./)).toBeInTheDocument()
        expect(screen.queryByText(/enviada a imprimir/i)).not.toBeInTheDocument()
        expect(printPrescription).not.toHaveBeenCalled()
    })

    it('solo dice "enviada a imprimir" cuando de verdad se mando a la impresora', async () => {
        const usuario = userEvent.setup()
        createPrescription.mockResolvedValue(receta({ id: 9 }))
        renderReceta()

        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: /Guardar e imprimir/ }))

        expect(
            await screen.findByText(/Receta guardada y enviada a imprimir\./),
        ).toBeInTheDocument()
        expect(printPrescription).toHaveBeenCalledWith(9)
    })

    it('si la impresora falla lo dice, en vez de dar por hecho que imprimio', async () => {
        const usuario = userEvent.setup()
        createPrescription.mockResolvedValue(receta({ id: 9 }))
        printPrescription.mockResolvedValue(false)
        renderReceta()

        await capturarMedicamento(usuario)
        await usuario.click(screen.getByRole('button', { name: /Guardar e imprimir/ }))

        expect(await screen.findByText(/no se pudo enviar a imprimir/i)).toBeInTheDocument()
    })
})

describe('PrescriptionForm · consulta cerrada', () => {
    it('muestra las recetas emitidas en solo lectura, con folio y sin editor', () => {
        renderReceta({ readOnly: true, prescriptions: [receta({ id: 7 })] })

        expect(screen.getByText(/REC-2-2026-0007/)).toBeInTheDocument()
        expect(screen.getByText(/IBUPROFENO Tabletas/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Imprimir/ })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
})
