import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import DatosPacienteEditables from './DatosPacienteEditables'
import {
    TabKeyContext,
    etiquetasSinGuardar,
    limpiarRegistro,
} from '../../../shared/tabs/cambiosSinGuardar'
import type { Patient } from '../../secretaria/types'

/**
 * Completar el expediente desde la consulta toca información clínica en vivo.
 * Lo que estas pruebas cuidan es que un formulario corto no pueda borrar lo que
 * no se tocó, y que nada se anuncie como guardado si el servidor lo rechazó.
 */

// Declarado con `vi.hoisted` porque el factory del módulo de api corre al
// importarlo, antes que cualquier `const` de este archivo.
const { put } = vi.hoisted(() => ({ put: vi.fn() }))

vi.mock('../../../shared/services/api', () => {
    const cliente = { get: vi.fn(), post: vi.fn(), put, patch: vi.fn(), delete: vi.fn() }
    return { apiClient: cliente, default: cliente }
})

// Fuera del factory: uno declarado adentro sería un espía nuevo en cada render
// y no se podría asertar sobre él.
const onGuardado = vi.fn()

const paciente = (extra: Partial<Patient> = {}): Patient => ({
    id: 4,
    tenant_id: 2,
    first_name: 'PAOLA',
    last_name: 'LIZETH',
    date_of_birth: null,
    gender: 'Femenino',
    phone: '',
    cell_phone: '',
    allergies: null,
    personal_history: 'HIPERTENSIÓN',
    patient_type: 'OBSTETRICA',
    is_active: true,
    created_at: '2026-09-19T10:00:00',
    updated_at: '2026-09-19T10:00:00',
    ...extra,
})

const abrirModal = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.click(screen.getByRole('button', { name: 'Completar datos de la paciente' }))
    await screen.findByLabelText('Fecha de nacimiento')
    // CoreUI activa la trampa de foco de su modal cuando termina la animación,
    // y al activarse mueve el foco al principio del cuadro. Una prueba teclea
    // mucho más rápido que una persona y perdía ahí las primeras letras, así
    // que se espera a que el modal quede en 'show', que es cuando ya no se
    // mueve solo.
    await waitFor(() => expect(document.querySelector('.modal.show')).not.toBeNull())
}

const guardar = (usuario: ReturnType<typeof userEvent.setup>) =>
    usuario.click(screen.getByRole('button', { name: 'Guardar datos' }))

beforeEach(() => {
    put.mockReset()
    onGuardado.mockReset()
    limpiarRegistro()
})

afterEach(() => limpiarRegistro())

describe('DatosPacienteEditables · accesibilidad del ícono (U-08)', () => {
    it('el lápiz discreto (expediente completo) tiene aria-label y title', () => {
        // Con el expediente completo el botón es sólo el ícono: necesita title
        // además del aria-label (plan 21).
        render(
            <DatosPacienteEditables
                paciente={paciente({ date_of_birth: '1990-05-10', cell_phone: '5512345678' })}
                onGuardado={onGuardado}
            />,
        )
        const boton = screen.getByRole('button', { name: 'Completar datos de la paciente' })
        expect(boton).toHaveAttribute('title', 'Completar datos de la paciente')
    })
})

describe('DatosPacienteEditables · sólo viaja lo que se tocó', () => {
    it('manda únicamente los campos capturados, no el expediente entero', async () => {
        const usuario = userEvent.setup()
        put.mockResolvedValue({
            data: paciente({ cell_phone: '5512345678', allergies: 'PENICILINA' }),
        })
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />)
        await abrirModal(usuario)

        await usuario.type(screen.getByLabelText('Celular'), '5512345678')
        await usuario.type(screen.getByLabelText('Alergias'), 'penicilina')
        await guardar(usuario)

        expect(put).toHaveBeenCalledTimes(1)
        expect(put).toHaveBeenCalledWith('/patients/4', {
            cell_phone: '5512345678',
            allergies: 'PENICILINA',
        })
        // Los antecedentes que ya estaban no viajan: el backend usa
        // `exclude_unset`, así que lo que no se manda no se toca.
        const [, cuerpo] = put.mock.calls[0]
        expect(cuerpo).not.toHaveProperty('personal_history')
        expect(cuerpo).not.toHaveProperty('first_name')
        expect(cuerpo).not.toHaveProperty('patient_type')
    })

    it('no deja guardar mientras no haya un solo cambio', async () => {
        const usuario = userEvent.setup()
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />)
        await abrirModal(usuario)

        expect(screen.getByRole('button', { name: 'Guardar datos' })).toBeDisabled()
        expect(put).not.toHaveBeenCalled()
    })

    it('la fecha de nacimiento viaja como fecha, no como edad', async () => {
        const usuario = userEvent.setup()
        put.mockResolvedValue({ data: paciente({ date_of_birth: '1990-05-10' }) })
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />)
        await abrirModal(usuario)

        await usuario.type(screen.getByLabelText('Fecha de nacimiento'), '10051990')
        await guardar(usuario)

        expect(put).toHaveBeenCalledWith('/patients/4', { date_of_birth: '1990-05-10' })
        expect(onGuardado).toHaveBeenCalledWith(
            expect.objectContaining({ date_of_birth: '1990-05-10' }),
        )
    })
})

/**
 * La regla que salió de producción: si el sistema no hizo algo, la interfaz no
 * puede decir que sí.
 */
describe('DatosPacienteEditables · un guardado que falla se ve', () => {
    it('un 403 se muestra y NO se anuncia éxito', async () => {
        const usuario = userEvent.setup()
        put.mockRejectedValue({
            response: { status: 403, data: { detail: 'No tienes permiso para editar pacientes' } },
        })
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />)
        await abrirModal(usuario)

        await usuario.type(screen.getByLabelText('Celular'), '5512345678')
        await guardar(usuario)

        expect(await screen.findByText(/No tienes permiso para editar pacientes/)).toBeInTheDocument()
        expect(screen.getByText('No se guardó nada.')).toBeInTheDocument()
        expect(onGuardado).not.toHaveBeenCalled()
        expect(screen.queryByText(/Datos actualizados en el expediente/)).not.toBeInTheDocument()
        // El modal sigue abierto con lo capturado: hay que poder reintentar sin
        // volver a teclearlo.
        expect(screen.getByLabelText('Celular')).toHaveValue('5512345678')
    })

    it('el 400 de correo duplicado se muestra tal cual lo manda el backend', async () => {
        const usuario = userEvent.setup()
        put.mockRejectedValue({
            response: {
                status: 400,
                data: {
                    detail: 'Ese correo ya está registrado en el expediente de otra paciente.',
                },
            },
        })
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />)
        await abrirModal(usuario)

        await usuario.type(screen.getByLabelText('Correo'), 'paola@ejemplo.com')
        await guardar(usuario)

        expect(
            await screen.findByText('Ese correo ya está registrado en el expediente de otra paciente.'),
        ).toBeInTheDocument()
        expect(onGuardado).not.toHaveBeenCalled()
    })
})

/**
 * El correo es opcional (vacío lo borra; hay expedientes migrados sin él),
 * pero el servidor lo exige con forma de correo cuando se escribe. El aviso
 * sale junto al campo en vez del globo del navegador (`noValidate`).
 */
describe('DatosPacienteEditables · el correo opcional se revisa junto al campo', () => {
    it('un correo a medio escribir se avisa junto al campo y no se manda', async () => {
        const usuario = userEvent.setup()
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />)
        await abrirModal(usuario)

        await usuario.type(screen.getByLabelText('Correo'), 'paola@')
        await guardar(usuario)

        expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()
        expect(put).not.toHaveBeenCalled()
    })

    it('el aviso se quita al corregir y entonces sí guarda', async () => {
        const usuario = userEvent.setup()
        put.mockResolvedValue({ data: paciente({ email: 'paola@ejemplo.com' }) })
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />)
        await abrirModal(usuario)

        const correo = screen.getByLabelText('Correo')
        await usuario.type(correo, 'paola@')
        await guardar(usuario)
        expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()

        await usuario.clear(correo)
        await usuario.type(correo, 'paola@ejemplo.com')
        expect(screen.queryByText('Escribe un correo válido.')).not.toBeInTheDocument()

        await guardar(usuario)
        await waitFor(() =>
            expect(put).toHaveBeenCalledWith('/patients/4', { email: 'paola@ejemplo.com' }),
        )
    })

    it('dejar el correo vacío lo borra sin estorbar: sigue siendo opcional', async () => {
        const usuario = userEvent.setup()
        put.mockResolvedValue({ data: paciente() })
        render(
            <DatosPacienteEditables
                paciente={paciente({ email: 'vieja@ejemplo.com' })}
                onGuardado={onGuardado}
            />,
        )
        await abrirModal(usuario)

        await usuario.clear(screen.getByLabelText('Correo'))
        await guardar(usuario)

        await waitFor(() => expect(put).toHaveBeenCalledWith('/patients/4', { email: null }))
    })
})

describe('DatosPacienteEditables · el embarazo no se captura aquí', () => {
    it('ya no ofrece la FUR: esa fecha es del embarazo, no del expediente', async () => {
        const usuario = userEvent.setup()
        // Guardarla aquí dejaba una segunda respuesta a "de cuándo es este
        // embarazo", y en 8 embarazos activos las dos ya no coincidían.
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />)
        await abrirModal(usuario)

        expect(screen.queryByLabelText(/Fecha de última regla/)).not.toBeInTheDocument()
        expect(screen.getByText(/se capturan en el control prenatal/)).toBeInTheDocument()
    })
})

describe('DatosPacienteEditables · cambios sin guardar', () => {
    const conPestana = (nodo: ReactNode) => (
        <TabKeyContext.Provider value="/doctor/consulta/10">{nodo}</TabKeyContext.Provider>
    )

    it('lo capturado queda anotado en el registro de la pestaña', async () => {
        const usuario = userEvent.setup()
        render(conPestana(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />))
        await abrirModal(usuario)

        expect(etiquetasSinGuardar('/doctor/consulta/10')).toEqual([])

        await usuario.type(screen.getByLabelText('Celular'), '5512345678')

        expect(etiquetasSinGuardar('/doctor/consulta/10')).toEqual(['Datos de la paciente'])
    })

    it('cerrar con la ✕ con trabajo dentro avisa en vez de tirarlo', async () => {
        const usuario = userEvent.setup()
        render(conPestana(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />))
        await abrirModal(usuario)
        await usuario.type(screen.getByLabelText('Celular'), '5512345678')

        await usuario.click(screen.getByRole('button', { name: 'Cerrar' }))

        expect(await screen.findByText(/Si cierras ahora se pierden/)).toBeInTheDocument()
        // Sigue abierto y con lo capturado intacto mientras no se decida.
        expect(screen.getByLabelText('Celular')).toHaveValue('5512345678')

        await usuario.click(screen.getByRole('button', { name: 'Seguir editando' }))
        expect(screen.queryByText(/Si cierras ahora se pierden/)).not.toBeInTheDocument()
        expect(screen.getByLabelText('Celular')).toHaveValue('5512345678')
    })

    it('sin nada capturado la ✕ cierra sin molestar', async () => {
        const usuario = userEvent.setup()
        render(conPestana(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />))
        await abrirModal(usuario)

        await usuario.click(screen.getByRole('button', { name: 'Cerrar' }))

        expect(screen.queryByText(/Si cierras ahora se pierden/)).not.toBeInTheDocument()
        expect(etiquetasSinGuardar('/doctor/consulta/10')).toEqual([])
    })

    it('después de guardar ya no queda nada pendiente', async () => {
        const usuario = userEvent.setup()
        put.mockResolvedValue({ data: paciente({ cell_phone: '5512345678' }) })
        render(conPestana(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} />))
        await abrirModal(usuario)
        await usuario.type(screen.getByLabelText('Celular'), '5512345678')

        await guardar(usuario)

        expect(await screen.findByText(/Datos actualizados en el expediente/)).toBeInTheDocument()
        expect(etiquetasSinGuardar('/doctor/consulta/10')).toEqual([])
    })
})

describe('DatosPacienteEditables · dónde se nota el hueco', () => {
    it('sin expediente cargado no ofrece editar: no sabemos qué hay guardado', () => {
        render(<DatosPacienteEditables paciente={null} onGuardado={onGuardado} />)

        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('en consulta cerrada tampoco', () => {
        render(<DatosPacienteEditables paciente={paciente()} onGuardado={onGuardado} readOnly />)

        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('con el expediente completo el lápiz es discreto', () => {
        render(
            <DatosPacienteEditables
                paciente={paciente({ date_of_birth: '1990-05-10', cell_phone: '5512345678' })}
                onGuardado={onGuardado}
            />,
        )

        expect(
            screen.getByRole('button', { name: 'Completar datos de la paciente' }),
        ).toBeInTheDocument()
        expect(screen.queryByText('Completar datos')).not.toBeInTheDocument()
    })
})
