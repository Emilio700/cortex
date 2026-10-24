import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import CertificateForm from './CertificateForm'
import { CertificateType, type MedicalCertificate } from '../types'

// Declarados afuera del factory para poder contar creates contra updates.
const createCertificate = vi.fn()
const updateCertificate = vi.fn()
const downloadCertificatePDF = vi.fn()

vi.mock('../hooks/useCertificates', () => ({
    useCertificates: () => ({
        loading: false,
        error: null,
        createCertificate,
        updateCertificate,
        downloadCertificatePDF,
    }),
}))

const certificado = (id: number): MedicalCertificate => ({
    id,
    appointment_id: 1,
    patient_id: 2,
    doctor_id: 3,
    tenant_id: 2,
    folio_number: `CER-2-2026-${String(id).padStart(4, '0')}`,
    certificate_type: CertificateType.SICK_LEAVE,
    diagnosis: 'GRIPE ESTACIONAL',
    days_off: 3,
    notes: '',
    created_at: '2026-09-23T10:00:00',
    updated_at: '2026-09-23T10:00:00',
})

const diagnostico = () => screen.getByLabelText(/Diagnóstico Completo/) as HTMLTextAreaElement

beforeEach(() => {
    createCertificate.mockReset()
    updateCertificate.mockReset()
    downloadCertificatePDF.mockReset()
})

describe('CertificateForm · certificado que llega tarde', () => {
    it('puebla los campos cuando el certificado existente llega despues del render', () => {
        const { rerender } = render(<CertificateForm appointmentId={1} patientId={2} />)
        expect(diagnostico().value).toBe('')

        rerender(
            <CertificateForm
                appointmentId={1}
                patientId={2}
                existingCertificate={certificado(12)}
            />,
        )

        expect(diagnostico().value).toBe('GRIPE ESTACIONAL')
        expect(screen.getByText(/CER-2-2026-0012/)).toBeInTheDocument()
    })

    it('NO pisa lo que la doctora ya esta escribiendo', async () => {
        const usuario = userEvent.setup()
        const { rerender } = render(<CertificateForm appointmentId={1} patientId={2} />)
        await usuario.type(diagnostico(), 'lo mio')

        rerender(
            <CertificateForm
                appointmentId={1}
                patientId={2}
                existingCertificate={certificado(12)}
            />,
        )

        expect(diagnostico().value).toBe('LO MIO')
    })
})

describe('CertificateForm · identidad del certificado', () => {
    it('dos guardados seguidos son 1 create y 1 update, nunca 2 certificados', async () => {
        const usuario = userEvent.setup()
        createCertificate.mockResolvedValue(certificado(12))
        updateCertificate.mockResolvedValue(certificado(12))
        render(<CertificateForm appointmentId={1} patientId={2} />)

        await usuario.type(diagnostico(), 'gripe')
        await usuario.click(screen.getByRole('button', { name: /Generar Certificado/ }))
        await waitFor(() => expect(createCertificate).toHaveBeenCalledTimes(1))

        await usuario.type(diagnostico(), ' aguda')
        await usuario.click(screen.getByRole('button', { name: /Actualizar Certificado/ }))

        await waitFor(() => expect(updateCertificate).toHaveBeenCalledTimes(1))
        expect(createCertificate).toHaveBeenCalledTimes(1)
        expect(updateCertificate).toHaveBeenCalledWith(12, expect.anything())
    })
})

describe('CertificateForm · tipo de certificado (plan 29, lote 6)', () => {
    it('es un grupo de opciones que dice cuál está elegida', async () => {
        const usuario = userEvent.setup()
        render(<CertificateForm appointmentId={1} patientId={2} />)

        const grupo = screen.getByRole('radiogroup', { name: 'Tipo de Certificado' })
        const opciones = within(grupo).getAllByRole('radio')
        expect(opciones).toHaveLength(3)
        expect(opciones.filter((o) => o.getAttribute('aria-checked') === 'true')).toHaveLength(1)

        await usuario.click(opciones[1])
        expect(opciones[1]).toHaveAttribute('aria-checked', 'true')
    })
})

describe('CertificateForm · avisos junto al campo', () => {
    it('sin diagnóstico no llama al servidor y el aviso sale junto al campo', async () => {
        const usuario = userEvent.setup()
        render(<CertificateForm appointmentId={1} patientId={2} />)

        await usuario.click(screen.getByRole('button', { name: /Generar Certificado/ }))

        expect(await screen.findByText('Escribe el diagnóstico.')).toBeInTheDocument()
        expect(createCertificate).not.toHaveBeenCalled()
        expect(diagnostico()).toHaveAttribute('aria-invalid', 'true')

        // El aviso se retira en cuanto se corrige el campo.
        await usuario.type(diagnostico(), 'gripe')
        expect(screen.queryByText('Escribe el diagnóstico.')).toBeNull()
    })

    it('los días de incapacidad fuera del rango del campo se avisan y no se guarda', async () => {
        const usuario = userEvent.setup()
        render(<CertificateForm appointmentId={1} patientId={2} />)
        await usuario.type(diagnostico(), 'lumbalgia')

        const dias = screen.getByLabelText(/Días de Incapacidad/)
        fireEvent.change(dias, { target: { value: '400' } })
        await usuario.click(screen.getByRole('button', { name: /Generar Certificado/ }))

        expect(
            await screen.findByText('Indica entre 1 y 365 días de incapacidad.'),
        ).toBeInTheDocument()
        expect(createCertificate).not.toHaveBeenCalled()

        // El aviso se retira en cuanto se corrige el campo.
        fireEvent.change(dias, { target: { value: '8' } })
        expect(screen.queryByText('Indica entre 1 y 365 días de incapacidad.')).toBeNull()
    })
})
