/**
 * Pruebas del guard de cambios sin guardar en el contexto de pestañas.
 *
 * Lo que se protege aquí pasó de verdad: una doctora escribió la nota de una
 * consulta, no oprimió Guardar y el texto se fue sin un solo aviso. Cada prueba
 * de este archivo cubre una de las formas de perderlo.
 */
import type { ReactNode } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TabsProvider, useTabs } from './TabsContext'
import { TabKeyContext, limpiarRegistro, useCambiosSinGuardar } from './cambiosSinGuardar'

let pestanas: ReturnType<typeof useTabs> | null = null

/** Deja el API del contexto al alcance de la prueba, sin interfaz de por medio. */
function Espia() {
    pestanas = useTabs()
    return null
}

function Declarante({ etiqueta, hayCambios }: { etiqueta: string; hayCambios: boolean }) {
    useCambiosSinGuardar(hayCambios, etiqueta)
    return null
}

/**
 * Formulario de mentira que declara trabajo pendiente en una pestaña, tal como
 * lo harán los formularios reales de la consulta.
 */
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

function montar(extra?: ReactNode) {
    return render(
        <TabsProvider>
            <Espia />
            {extra}
        </TabsProvider>,
    )
}

const abrir = (key: string, title = key) => {
    act(() => {
        pestanas!.openTab({ key, path: key, title })
    })
}

const cerrar = (key: string) => {
    act(() => {
        pestanas!.closeTab(key)
    })
}

const llaves = () => pestanas!.tabs.map((t) => t.key)

describe('TabsContext · cambios sin guardar', () => {
    beforeEach(() => {
        sessionStorage.clear()
        pestanas = null
    })

    afterEach(() => {
        // El registro es un módulo: si no se limpia, lo pendiente de una prueba
        // se filtra a la siguiente. Va en act porque avisa a los suscriptores y
        // este hook corre antes de que testing-library desmonte.
        act(() => limpiarRegistro())
        vi.restoreAllMocks()
    })

    it('al cerrar una pestaña con cambios pide confirmación y nombra lo pendiente', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
        montar(
            <FormularioPendiente tabKey="/doctor/consultation/41" etiqueta="Notas de consulta" />,
        )
        abrir('/dashboard', 'Dashboard')
        abrir('/doctor/consultation/41', 'Consulta de Ana')

        cerrar('/doctor/consultation/41')

        expect(confirmar).toHaveBeenCalledTimes(1)
        const mensaje = String(confirmar.mock.calls[0][0])
        expect(mensaje).toContain('Notas de consulta')
        expect(mensaje).toContain('Consulta de Ana')
        expect(llaves()).toEqual(['/dashboard'])
    })

    it('enumera todos los formularios pendientes de la pestaña', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
        montar(
            <>
                <FormularioPendiente tabKey="/doctor/consultation/41" etiqueta="Notas de consulta" />
                <FormularioPendiente tabKey="/doctor/consultation/41" etiqueta="Receta 1" />
            </>,
        )
        abrir('/dashboard', 'Dashboard')
        abrir('/doctor/consultation/41', 'Consulta de Ana')

        cerrar('/doctor/consultation/41')

        const mensaje = String(confirmar.mock.calls[0][0])
        expect(mensaje).toContain('Notas de consulta')
        expect(mensaje).toContain('Receta 1')
    })

    it('al cerrar una pestaña limpia no pregunta nada', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
        montar()
        abrir('/dashboard', 'Dashboard')
        abrir('/secretaria/pacientes', 'Pacientes')

        cerrar('/secretaria/pacientes')

        expect(confirmar).not.toHaveBeenCalled()
        expect(llaves()).toEqual(['/dashboard'])
    })

    it('cancelar la confirmación deja la pestaña abierta y activa', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
        montar(
            <FormularioPendiente tabKey="/doctor/consultation/41" etiqueta="Notas de consulta" />,
        )
        abrir('/dashboard', 'Dashboard')
        abrir('/doctor/consultation/41', 'Consulta de Ana')

        cerrar('/doctor/consultation/41')

        expect(confirmar).toHaveBeenCalledTimes(1)
        expect(llaves()).toEqual(['/dashboard', '/doctor/consultation/41'])
        expect(pestanas!.activeTabKey).toBe('/doctor/consultation/41')
    })

    it('al llegar al límite descarta una pestaña limpia, no la sucia más vieja', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
        montar(<FormularioPendiente tabKey="/p/1" etiqueta="Notas de consulta" />)
        for (let i = 1; i <= 8; i++) abrir(`/p/${i}`, `Paciente ${i}`)

        abrir('/p/9', 'Paciente 9')

        expect(confirmar).not.toHaveBeenCalled()
        expect(llaves()).toContain('/p/1')
        expect(llaves()).not.toContain('/p/2')
        expect(llaves()).toContain('/p/9')
        expect(llaves()).toHaveLength(8)
    })

    it('si todas las pestañas están sucias, no descarta ninguna en silencio', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
        const sucias = Array.from({ length: 8 }, (_, i) => (
            <FormularioPendiente
                key={i + 1}
                tabKey={`/p/${i + 1}`}
                etiqueta={`Notas de consulta ${i + 1}`}
            />
        ))
        montar(<>{sucias}</>)
        for (let i = 1; i <= 8; i++) abrir(`/p/${i}`, `Paciente ${i}`)

        abrir('/p/9', 'Paciente 9')

        expect(confirmar).toHaveBeenCalledTimes(1)
        const mensaje = String(confirmar.mock.calls[0][0])
        expect(mensaje).toContain('Paciente 1')
        expect(mensaje).toContain('Notas de consulta 1')
        // Cancelar: ni se abre la nueva ni se pierde la vieja.
        expect(llaves()).not.toContain('/p/9')
        expect(llaves()).toContain('/p/1')
        expect(pestanas!.activeTabKey).toBe('/p/8')
    })

    it('si todas están sucias y la usuaria acepta, sólo entonces se descarta', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const sucias = Array.from({ length: 8 }, (_, i) => (
            <FormularioPendiente key={i + 1} tabKey={`/p/${i + 1}`} etiqueta="Notas de consulta" />
        ))
        montar(<>{sucias}</>)
        for (let i = 1; i <= 8; i++) abrir(`/p/${i}`, `Paciente ${i}`)

        abrir('/p/9', 'Paciente 9')

        expect(llaves()).not.toContain('/p/1')
        expect(llaves()).toContain('/p/9')
        expect(pestanas!.activeTabKey).toBe('/p/9')
    })
})

describe('TabsContext · aviso al salir del navegador', () => {
    beforeEach(() => {
        sessionStorage.clear()
    })

    afterEach(() => {
        // Envuelto en act: `limpiarRegistro` avisa a los suscriptores y este
        // hook corre antes de que testing-library desmonte, así que sin act
        // React se queja de una actualización fuera de act.
        act(() => limpiarRegistro())
        vi.restoreAllMocks()
    })

    const deSalida = (espia: { mock: { calls: unknown[][] } }) =>
        espia.mock.calls.filter((llamada) => llamada[0] === 'beforeunload')

    it('sólo se arma cuando hay algo pendiente, y se desarma al terminar', () => {
        const agregar = vi.spyOn(window, 'addEventListener')
        const quitar = vi.spyOn(window, 'removeEventListener')

        const { rerender, unmount } = render(
            <TabsProvider>
                <FormularioPendiente
                    tabKey="/doctor/consultation/41"
                    etiqueta="Notas de consulta"
                    hayCambios={false}
                />
            </TabsProvider>,
        )
        expect(deSalida(agregar)).toHaveLength(0)

        rerender(
            <TabsProvider>
                <FormularioPendiente
                    tabKey="/doctor/consultation/41"
                    etiqueta="Notas de consulta"
                    hayCambios
                />
            </TabsProvider>,
        )
        expect(deSalida(agregar)).toHaveLength(1)

        // Al guardar se retira: si no, el navegador seguiría estorbando para
        // siempre con un aviso que ya no protege nada.
        rerender(
            <TabsProvider>
                <FormularioPendiente
                    tabKey="/doctor/consultation/41"
                    etiqueta="Notas de consulta"
                    hayCambios={false}
                />
            </TabsProvider>,
        )
        expect(deSalida(quitar)).toHaveLength(1)

        unmount()
        expect(deSalida(quitar).length).toBeGreaterThanOrEqual(1)
    })

    it('el listener cancela el evento, que es lo único que el navegador respeta', () => {
        const agregar = vi.spyOn(window, 'addEventListener')

        render(
            <TabsProvider>
                <FormularioPendiente tabKey="/doctor/consultation/41" etiqueta="Notas de consulta" />
            </TabsProvider>,
        )

        const llamada = deSalida(agregar)[0]
        expect(llamada).toBeTruthy()
        const evento = new Event('beforeunload', { cancelable: true })
        ;(llamada[1] as EventListener)(evento)
        expect(evento.defaultPrevented).toBe(true)
    })
})

describe('TabsContext · límite suave, cerrar las demás y cerrar todas (plan 32)', () => {
    beforeEach(() => {
        sessionStorage.clear()
        pestanas = null
    })

    afterEach(() => {
        act(() => limpiarRegistro())
        vi.restoreAllMocks()
    })

    it('al pasar de 8 cierra la usada hace más tiempo, no la primera de la fila', () => {
        montar()
        for (let i = 1; i <= 8; i++) abrir(`/p/${i}`, `Paciente ${i}`)
        // La primera se vuelve a usar: ya no es la más vieja.
        act(() => pestanas!.setActiveTab('/p/1'))

        abrir('/p/9', 'Paciente 9')

        expect(llaves()).toContain('/p/1')
        expect(llaves()).not.toContain('/p/2')
        expect(pestanas!.cierrePorLimite?.title).toBe('Paciente 2')
    })

    it('«Deshacer» devuelve la pestaña cerrada a su lugar', () => {
        montar()
        for (let i = 1; i <= 8; i++) abrir(`/p/${i}`, `Paciente ${i}`)
        abrir('/p/9', 'Paciente 9')

        act(() => pestanas!.deshacerCierre())

        expect(llaves()[0]).toBe('/p/1')
        expect(llaves()).toHaveLength(9)
        expect(pestanas!.cierrePorLimite).toBeNull()
        expect(pestanas!.activeTabKey).toBe('/p/9')
    })

    it('«Cerrar las demás» deja sólo la elegida, activa', () => {
        montar()
        abrir('/a', 'A')
        abrir('/b', 'B')
        abrir('/c', 'C')

        act(() => pestanas!.closeOthers('/a'))

        expect(llaves()).toEqual(['/a'])
        expect(pestanas!.activeTabKey).toBe('/a')
    })

    it('«Cerrar todas» deja el inicio del rol, nunca la pantalla vacía', () => {
        montar()
        abrir('/a', 'A')
        abrir('/b', 'B')

        act(() => pestanas!.closeAll())

        expect(llaves()).toEqual(['/'])
        expect(pestanas!.activeTabKey).toBe('/')
    })

    it('cerrar varias con trabajo pendiente pregunta una vez y nombra cada una', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
        montar(
            <>
                <FormularioPendiente tabKey="/b" etiqueta="Notas de consulta" />
                <FormularioPendiente tabKey="/c" etiqueta="Receta 1" />
            </>,
        )
        abrir('/a', 'A')
        abrir('/b', 'Consulta de Ana')
        abrir('/c', 'Consulta de Bea')

        act(() => pestanas!.closeOthers('/a'))

        expect(confirmar).toHaveBeenCalledTimes(1)
        const mensaje = String(confirmar.mock.calls[0][0])
        expect(mensaje).toContain('Consulta de Ana')
        expect(mensaje).toContain('Receta 1')
        // Cancelar no cierra nada.
        expect(llaves()).toEqual(['/a', '/b', '/c'])
    })
})
