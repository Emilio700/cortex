import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RecetaConfigCard from './RecetaConfigCard'
import {
    AJUSTES_RECETA_POR_DEFECTO,
    COLOR_ACENTO_POR_DEFECTO,
    ESTILO_FIRMA_POR_DEFECTO,
    LEYENDA_POR_DEFECTO,
} from '../utils/ajustesReceta'

const post = vi.fn()
const get = vi.fn()

vi.mock('../../../shared/services/api', () => ({
    default: {
        post: (...args: unknown[]) => post(...args),
        get: (...args: unknown[]) => get(...args),
    },
    apiClient: {
        post: (...args: unknown[]) => post(...args),
        get: (...args: unknown[]) => get(...args),
    },
}))

const pintar = (props: Partial<React.ComponentProps<typeof RecetaConfigCard>> = {}) => {
    const onGuardar = props.onGuardar ?? vi.fn().mockResolvedValue(true)
    render(
        <RecetaConfigCard
            nombreDeLaCuenta="YARA MONTSERRAT GUTIERREZ ROMERO"
            tratamientoDeLaCuenta="Dra."
            onGuardar={onGuardar}
            {...props}
        />,
    )
    return { onGuardar }
}

describe('RecetaConfigCard', () => {
    beforeEach(() => {
        post.mockReset()
        get.mockReset()
        post.mockResolvedValue({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })
        // jsdom no implementa los blob URL.
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:receta')
        globalThis.URL.revokeObjectURL = vi.fn()
    })

    it('dice cómo quedará el nombre impreso, sin duplicar el tratamiento', async () => {
        const user = userEvent.setup()
        pintar()

        expect(
            screen.getByText('En la receta saldrá: Dra. YARA MONTSERRAT GUTIERREZ ROMERO'),
        ).toBeInTheDocument()

        await user.type(screen.getByLabelText('Nombre para la receta'), 'Dra. Yara Gutiérrez')

        expect(screen.getByText('En la receta saldrá: Dra. Yara Gutiérrez')).toBeInTheDocument()
        expect(screen.queryByText(/Dr\. Dra\./)).not.toBeInTheDocument()
    })

    it('parte de lo que el médico ya tenía guardado', () => {
        pintar({ ajustesGuardados: { mostrar_registro_ssa: false }, nombreGuardado: 'Dra. Yara' })

        expect(screen.getByLabelText('Nombre para la receta')).toHaveValue('Dra. Yara')
        expect(screen.getByLabelText('Registro SSA')).not.toBeChecked()
        expect(screen.getByLabelText('Logo del consultorio')).toBeChecked()
    })

    it('manda al servidor los ajustes sin guardar y enseña el PDF que devuelve', async () => {
        const user = userEvent.setup()
        pintar()

        await user.click(screen.getByLabelText('Teléfono del consultorio'))
        await user.click(screen.getByRole('button', { name: /vista previa/i }))

        await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
        const [url, cuerpo, opciones] = post.mock.calls[0] as [string, any, any]
        expect(url).toBe('/doctor-profile/me/prescription-preview')
        expect(cuerpo.prescription_settings.mostrar_telefono).toBe(false)
        // Celular y correo, apagados de fábrica: ninguna receta existente cambia.
        expect(cuerpo.prescription_settings.mostrar_celular).toBe(false)
        expect(cuerpo.prescription_settings.mostrar_correo).toBe(false)
        expect(opciones.responseType).toBe('blob')

        await waitFor(() =>
            expect(screen.getByTitle('Vista previa de la receta')).toHaveAttribute(
                'src',
                'blob:receta',
            ),
        )
    })

    it('avisa de que la vista previa se quedó vieja al cambiar algo', async () => {
        const user = userEvent.setup()
        pintar()

        await user.click(screen.getByRole('button', { name: /vista previa/i }))
        await waitFor(() => expect(screen.getByTitle('Vista previa de la receta')).toBeInTheDocument())
        expect(screen.queryByText(/Actualízala para verlo/)).not.toBeInTheDocument()

        await user.click(screen.getByLabelText('Registro SSA'))

        expect(screen.getByText(/Actualízala para verlo/)).toBeInTheDocument()
    })

    it('si la vista previa falla lo dice, en vez de dejar el hueco en blanco', async () => {
        const user = userEvent.setup()
        post.mockRejectedValue(new Error('500'))
        pintar()

        await user.click(screen.getByRole('button', { name: /vista previa/i }))

        await waitFor(() =>
            expect(screen.getByText(/No se pudo generar la vista previa/)).toBeInTheDocument(),
        )
    })

    it('guarda el nombre y los interruptores tal como se ven', async () => {
        const user = userEvent.setup()
        const onGuardar = vi.fn().mockResolvedValue(true)
        pintar({ onGuardar })

        await user.type(screen.getByLabelText('Nombre para la receta'), 'Dra. Yara Gutiérrez')
        await user.click(screen.getByLabelText('Registro SSA'))
        await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))

        await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1))
        const [configuracion] = onGuardar.mock.calls[0]
        expect(configuracion.nombre).toBe('Dra. Yara Gutiérrez')
        expect(configuracion.ajustes).toEqual({
            ...AJUSTES_RECETA_POR_DEFECTO,
            mostrar_registro_ssa: false,
        })
    })

    it('sin tocar nada manda los valores de fábrica', async () => {
        const user = userEvent.setup()
        const onGuardar = vi.fn().mockResolvedValue(true)
        pintar({ onGuardar })

        await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))

        await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1))
        const [configuracion] = onGuardar.mock.calls[0]
        expect(configuracion.leyenda).toBe(LEYENDA_POR_DEFECTO)
        expect(configuracion.color).toBe(COLOR_ACENTO_POR_DEFECTO)
        expect(configuracion.estilo).toEqual(ESTILO_FIRMA_POR_DEFECTO)
    })

    it('deja la leyenda vacía en nulo para que el servidor ponga la de siempre', async () => {
        const user = userEvent.setup()
        const onGuardar = vi.fn().mockResolvedValue(true)
        pintar({ onGuardar })

        await user.clear(screen.getByLabelText('Leyenda del pie'))
        await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))

        await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1))
        expect(onGuardar.mock.calls[0][0].leyenda).toBeNull()
    })

    it('guarda la letra, el tamaño y la raya de la firma', async () => {
        const user = userEvent.setup()
        const onGuardar = vi.fn().mockResolvedValue(true)
        pintar({ onGuardar })

        await user.selectOptions(screen.getByLabelText('Letra'), 'cursiva')
        await user.click(screen.getByLabelText('Raya para firmar a mano'))
        await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))

        await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1))
        const estilo = onGuardar.mock.calls[0][0].estilo
        expect(estilo.fuente).toBe('cursiva')
        expect(estilo.linea_firma).toBe(true)
        expect(estilo.tamano).toBe(ESTILO_FIRMA_POR_DEFECTO.tamano)
    })

    it('la vista previa lleva el estilo sin guardar', async () => {
        const user = userEvent.setup()
        pintar()

        await user.selectOptions(screen.getByLabelText('Letra'), 'serif')
        await user.clear(screen.getByLabelText('Leyenda del pie'))
        await user.type(screen.getByLabelText('Leyenda del pie'), 'Agenda tu cita')
        await user.click(screen.getByRole('button', { name: /vista previa/i }))

        await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
        const cuerpo = post.mock.calls[0][1] as any
        expect(cuerpo.prescription_footer_text).toBe('Agenda tu cita')
        expect(cuerpo.prescription_signature_style.fuente).toBe('serif')
        expect(cuerpo.prescription_accent_color).toBe(COLOR_ACENTO_POR_DEFECTO)
    })

    it('un color elegido se manda normalizado en mayúsculas', async () => {
        const user = userEvent.setup()
        const onGuardar = vi.fn().mockResolvedValue(true)
        pintar({ onGuardar })

        // Los input de tipo color no admiten clear/type: se cambia el valor.
        fireEvent.change(screen.getByLabelText('Color del membrete'), {
            target: { value: '#0f6e4f' },
        })
        await user.click(screen.getByRole('button', { name: /Guardar configuración/i }))

        await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1))
        expect(onGuardar.mock.calls[0][0].color).toBe('#0F6E4F')
    })

    it('el nombre de la firma arranca en el gris de siempre', () => {
        pintar()

        expect(screen.getByText('En el gris de siempre')).toBeInTheDocument()
        expect(screen.getByLabelText('Color del nombre')).toHaveValue('#404040')
    })

    it('avisa de lo obligatorio solo mientras está apagado', async () => {
        const user = userEvent.setup()
        pintar()

        // La cédula viene apagada de origen (hoy la receta no la imprime).
        expect(screen.getAllByText(/Reglamento de Insumos para la Salud/)).toHaveLength(1)

        await user.click(screen.getByLabelText('Cédula profesional'))
        expect(screen.queryByText(/Reglamento de Insumos para la Salud/)).not.toBeInTheDocument()

        await user.click(screen.getByLabelText('Tu nombre'))
        expect(screen.getAllByText(/Reglamento de Insumos para la Salud/)).toHaveLength(1)
    })
})
