/**
 * Pruebas de la marca visual de pestaña con trabajo sin guardar.
 *
 * La marca tiene que llegar también a quien no ve el punto: el aviso va en
 * texto, no sólo en color.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TabsBar from './TabsBar'
import { TabsProvider, useTabs } from './TabsContext'
import { TabKeyContext, limpiarRegistro, useCambiosSinGuardar } from './cambiosSinGuardar'

let pestanas: ReturnType<typeof useTabs> | null = null

function Espia() {
    pestanas = useTabs()
    return null
}

function Declarante({ etiqueta, hayCambios }: { etiqueta: string; hayCambios: boolean }) {
    useCambiosSinGuardar(hayCambios, etiqueta)
    return null
}

function FormularioPendiente({
    tabKey,
    etiqueta,
    hayCambios = true,
}: {
    tabKey: string
    etiqueta: string
    hayCambios?: boolean
}) {
    return (
        <TabKeyContext.Provider value={tabKey}>
            <Declarante etiqueta={etiqueta} hayCambios={hayCambios} />
        </TabKeyContext.Provider>
    )
}

const abrir = (key: string, title: string) => {
    act(() => {
        pestanas!.openTab({ key, path: key, title })
    })
}

describe('TabsBar · pestaña con cambios sin guardar', () => {
    beforeEach(() => {
        sessionStorage.clear()
        pestanas = null
    })

    afterEach(() => {
        // Envuelto en act: `limpiarRegistro` avisa a los suscriptores y este
        // hook corre antes de que testing-library desmonte, así que sin act
        // React se queja de una actualización fuera de act.
        act(() => limpiarRegistro())
        vi.restoreAllMocks()
    })

    function montar(hayCambios: boolean) {
        render(
            <TabsProvider>
                <Espia />
                <TabsBar />
                <FormularioPendiente
                    tabKey="/doctor/consultation/41"
                    etiqueta="Notas de consulta"
                    hayCambios={hayCambios}
                />
            </TabsProvider>,
        )
        abrir('/dashboard', 'Dashboard')
        abrir('/doctor/consultation/41', 'Consulta de Ana')
    }

    it('anuncia en texto que la pestaña tiene cambios sin guardar', () => {
        montar(true)

        expect(screen.getByTitle('Consulta de Ana — tiene cambios sin guardar')).toBeInTheDocument()
        expect(screen.getByText('Tiene cambios sin guardar')).toBeInTheDocument()
        expect(
            screen.getByLabelText('Cerrar Consulta de Ana (tiene cambios sin guardar)'),
        ).toBeInTheDocument()
    })

    it('una pestaña guardada no lleva marca', () => {
        montar(false)

        expect(screen.getByTitle('Consulta de Ana')).toBeInTheDocument()
        expect(screen.queryByText('Tiene cambios sin guardar')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Cerrar Consulta de Ana')).toBeInTheDocument()
    })

    it('la marca aparece y desaparece sin remontar la barra', () => {
        montar(false)
        expect(screen.queryByText('Tiene cambios sin guardar')).not.toBeInTheDocument()

        // Segundo formulario en la misma pestaña: la barra debe enterarse por la
        // suscripción al registro, no por un re-render suyo.
        act(() => {
            render(
                <TabKeyContext.Provider value="/doctor/consultation/41">
                    <Declarante etiqueta="Receta 1" hayCambios />
                </TabKeyContext.Provider>,
            )
        })

        expect(screen.getByText('Tiene cambios sin guardar')).toBeInTheDocument()
    })

    it('la "x" de una pestaña sucia pasa por la confirmación', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
        montar(true)

        fireEvent.click(screen.getByLabelText('Cerrar Consulta de Ana (tiene cambios sin guardar)'))

        expect(confirmar).toHaveBeenCalledTimes(1)
        expect(String(confirmar.mock.calls[0][0])).toContain('Notas de consulta')
        expect(screen.getByTitle('Consulta de Ana — tiene cambios sin guardar')).toBeInTheDocument()
    })

    it('la «x» es un botón con nombre, no un icono escondido para el lector de pantalla', () => {
        montar(false)
        const cerrar = screen.getByRole('button', { name: 'Cerrar Consulta de Ana' })
        expect(cerrar.tagName).toBe('BUTTON')
        expect(cerrar.closest('[aria-hidden="true"]')).toBeNull()
    })
})

describe('TabsBar · diseño de pestañas (plan 32, punto 2)', () => {
    beforeEach(() => {
        sessionStorage.clear()
        pestanas = null
    })

    afterEach(() => {
        act(() => limpiarRegistro())
        vi.restoreAllMocks()
    })

    function montarBarra() {
        render(
            <TabsProvider>
                <Espia />
                <TabsBar />
            </TabsProvider>,
        )
    }

    it('el nombre completo queda en el título aunque se corte con «…»', () => {
        montarBarra()
        abrir('/doctor/results', 'Órdenes y resultados')
        expect(screen.getByTitle('Órdenes y resultados')).toBeInTheDocument()
    })

    it('la activa se anuncia como la página actual', () => {
        montarBarra()
        abrir('/a', 'Agenda')
        abrir('/b', 'Pacientes')
        expect(screen.getByTitle('Pacientes')).toHaveAttribute('aria-current', 'page')
        expect(screen.getByTitle('Agenda')).not.toHaveAttribute('aria-current')
    })

    it('el clic derecho ofrece «Cerrar las demás» y «Cerrar todas»', () => {
        montarBarra()
        abrir('/a', 'Agenda')
        abrir('/b', 'Pacientes')
        abrir('/c', 'Triage')

        fireEvent.contextMenu(screen.getByTitle('Pacientes'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar las demás' }))

        expect(pestanas!.tabs.map((t) => t.key)).toEqual(['/b'])
        expect(screen.queryByRole('menu')).toBeNull()
    })

    it('Escape cierra el menú sin hacer nada', () => {
        montarBarra()
        abrir('/a', 'Agenda')
        fireEvent.contextMenu(screen.getByTitle('Agenda'))
        expect(screen.getByRole('menu')).toBeInTheDocument()
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('menu')).toBeNull()
        expect(pestanas!.tabs).toHaveLength(1)
    })

    it('al pasar de 8 avisa qué se cerró y deja deshacerlo', () => {
        montarBarra()
        for (let i = 1; i <= 8; i++) abrir(`/p/${i}`, `Paciente ${i}`)
        abrir('/p/9', 'Paciente 9')

        expect(screen.getByRole('status')).toHaveTextContent('Se cerró Paciente 1')
        fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))

        expect(pestanas!.tabs.map((t) => t.key)).toContain('/p/1')
        expect(screen.getByRole('status')).toHaveTextContent('')
    })
})
