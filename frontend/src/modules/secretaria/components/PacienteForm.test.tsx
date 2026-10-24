import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PacienteForm } from './PacienteForm'

/**
 * Dar de alta ya no pregunta si el paciente es obstétrica o ginecológica.
 *
 * Todas son ginecológicas; algunas *están* embarazadas. Ese estado vive en el
 * registro de embarazo, con su propio fechado y su desenlace, y no en una
 * bandera del expediente que alguien tiene que acordarse de apagar (el 97% de
 * las marcadas como obstétricas no tenían ningún embarazo activo).
 */

vi.mock('../../../shared/context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 1, role: 'secretaria' } }),
}))

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../../../shared/services/api', () => {
    const cliente = { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
    return { apiClient: cliente, default: cliente }
})

const onSubmit = vi.fn()
const onClose = vi.fn()

const renderForm = () =>
    render(
        <PacienteForm visible onClose={onClose} onSubmit={onSubmit} />,
    )

beforeEach(() => {
    get.mockResolvedValue({ data: [] })
    onSubmit.mockReset()
    onSubmit.mockResolvedValue(undefined)
    onClose.mockReset()
})

describe('PacienteForm · el alta ya no clasifica al paciente', () => {
    it('no pide el tipo de paciente', () => {
        renderForm()

        expect(screen.queryByLabelText('Tipo de Paciente')).not.toBeInTheDocument()
        expect(screen.queryByText('Obstétricas')).not.toBeInTheDocument()
        expect(screen.queryByText('Ginecológicas')).not.toBeInTheDocument()
    })

    it('no pide fechas del embarazo: ni FPP ni FUR (eran de GEMS)', () => {
        renderForm()

        expect(screen.queryByLabelText('FPP')).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/Última menstruación/)).not.toBeInTheDocument()
    })

    it('el alta express sale sin tipo ni fechas de embarazo en el cuerpo', async () => {
        const usuario = userEvent.setup()
        renderForm()

        await usuario.type(screen.getByLabelText(/Nombre/), 'ana')
        await usuario.type(screen.getByLabelText(/Apellidos/), 'lópez')
        await usuario.type(screen.getByLabelText(/Celular/), '5512345678')
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        const [cuerpo] = onSubmit.mock.calls[0]
        expect(cuerpo).not.toHaveProperty('patient_type')
        expect(cuerpo).not.toHaveProperty('last_menstrual_period')
        expect(cuerpo).not.toHaveProperty('expected_delivery_date')
        expect(cuerpo.first_name).toBe('ANA')
    })
})

describe('PacienteForm · teléfono (plan 29, lote 8)', () => {
  it('celular con teclado de teléfono y, con datos, cancelar pregunta', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onClose = vi.fn()
    render(<PacienteForm visible onClose={onClose} onSubmit={vi.fn()} title="Nuevo Paciente" />)

    expect(screen.getByLabelText(/Celular/)).toHaveAttribute('inputmode', 'tel')
    // La foto de «cómo se abrió» se toma un instante después de abrir.
    await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'ANA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(confirmar).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    confirmar.mockRestore()
  })
})

describe('PacienteForm · errores junto al campo', () => {
    it('sin nombre, apellidos ni celular avisa junto a cada campo y no llama al servidor', () => {
        renderForm()
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

        expect(screen.getByText('Escribe el nombre.')).toBeInTheDocument()
        expect(screen.getByText('Escribe los apellidos.')).toBeInTheDocument()
        expect(screen.getByText('Escribe el celular.')).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('el aviso se quita al corregir el campo; los demás siguen', () => {
        renderForm()
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
        fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'ANA' } })

        expect(screen.queryByText('Escribe el nombre.')).not.toBeInTheDocument()
        expect(screen.getByText('Escribe los apellidos.')).toBeInTheDocument()
    })

    it('un correo mal escrito en el alta exprés se avisa y no se manda', async () => {
        // El correo ya está en el alta exprés (plan 32, punto 5): no hace
        // falta abrir el expediente completo para capturarlo.
        const usuario = userEvent.setup()
        renderForm()
        await usuario.type(screen.getByLabelText(/^Nombre/), 'ANA')
        await usuario.type(screen.getByLabelText(/Apellidos/), 'LÓPEZ')
        await usuario.type(screen.getByLabelText(/Celular/), '5512345678')
        await usuario.type(screen.getByLabelText('Correo (opcional)'), 'ana@')
        await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

        expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })
})
