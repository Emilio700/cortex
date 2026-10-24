/**
 * El selector avisa junto al campo lo que falta cuando el formulario de la
 * orden intentó emitir con una selección a medias. El aviso llega por la prop
 * `errores`: el padre lo enciende al validar y lo retira al editar.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useCatalogoEstudios', () => ({
    useCatalogoEstudios: () => ({ grupos: [], cargando: false }),
}))

import SelectorEstudio from './SelectorEstudio'
import type { GrupoEstudios } from '../utils/catalogoEstudios'

describe('SelectorEstudio · avisos junto al campo', () => {
    it('en modo manual pinta el aviso y marca el campo', () => {
        render(
            <SelectorEstudio
                seleccion={{ grupo: null, estudio: '', manual: '' }}
                onChange={vi.fn()}
                errores={{ manual: 'Escribe el estudio que necesitas.' }}
            />,
        )

        expect(screen.getByText('Escribe el estudio que necesitas.')).toBeInTheDocument()
        const campo = screen.getByPlaceholderText('Ej. Perfil tiroideo')
        expect(campo).toHaveAttribute('aria-invalid', 'true')
        expect(campo).toHaveAttribute('aria-describedby', 'error-selector-manual')
    })

    it('la región que pide el estudio se avisa bajo su campo', () => {
        const grupo: GrupoEstudios = {
            clave: 'rx-rodilla',
            nombre: 'Rayos X - Rodilla',
            modalidad: 'RX',
            estudios: ['Rodilla'],
            requiere_region: true,
        }
        render(
            <SelectorEstudio
                seleccion={{ grupo, estudio: 'Rodilla' }}
                onChange={vi.fn()}
                errores={{ region: 'Indica la región a estudiar.' }}
            />,
        )

        // El texto también sale como pista suave abajo; se busca el aviso del campo.
        expect(
            screen.getByText('Indica la región a estudiar.', { selector: '#error-selector-region' }),
        ).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Ej. Pélvico, miembro inferior')).toHaveAttribute(
            'aria-invalid',
            'true',
        )
    })

    it('sin errores no pinta ningún aviso', () => {
        render(
            <SelectorEstudio
                seleccion={{ grupo: null, estudio: '', manual: '' }}
                onChange={vi.fn()}
            />,
        )

        expect(screen.queryByRole('alert')).toBeNull()
    })
})
