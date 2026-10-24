/**
 * Pruebas de `useAlReactivarPestana`.
 *
 * Es la pieza que convierte el cambio de pestaña activa —y el regreso a la
 * ventana— en un refresco de datos de la pantalla que está al frente. Lo que
 * se cubre aquí es el contrato completo: cuándo se avisa, cuándo no, y que el
 * mecanismo equivale a lo que pedía el requisito («el sistema avisa a la
 * página de la pestaña activada»).
 */
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TabsProvider, useTabs } from './TabsContext'
import { TabKeyContext } from './cambiosSinGuardar'
import { useAlReactivarPestana } from './useAlReactivarPestana'

const refresco = vi.fn()
let pestanas: ReturnType<typeof useTabs> | null = null

/** Espía del contexto para abrir y activar pestañas desde la prueba. */
function Espia() {
    pestanas = useTabs()
    return null
}

/** Pantalla de mentira: sólo refresca cuando el hook se lo pide. */
function Pantalla() {
    useAlReactivarPestana(refresco)
    return null
}

function montar(tabKey: string) {
    return render(
        <TabsProvider>
            <Espia />
            <TabKeyContext.Provider value={tabKey}>
                <Pantalla />
            </TabKeyContext.Provider>
        </TabsProvider>,
    )
}

const activar = (key: string) => {
    act(() => pestanas!.setActiveTab(key))
}

/**
 * Deja la sesión con pestañas ya abiertas, como se la encuentra una página
 * real al montar: en la app, `openTab` activa la pestaña ANTES de que su
 * componente se monte, así que nace viéndose. Se simula aquí porque montar
 * el componente antes de abrir su pestaña es un orden que en producción no
 * existe (y dispararía el refresco que la prueba 1 descarta).
 */
function semilla(abiertas: Array<{ key: string }>, activa: string) {
    sessionStorage.setItem(
        'gems_tabs',
        JSON.stringify({
            tabs: abiertas.map((t) => ({ ...t, path: t.key, title: t.key })),
            activeTabKey: activa,
        }),
    )
}

const CLAVE = '/finanzas/pagos'
const otraPestana = (key = '/otra') => ({ key, path: key, title: key })

beforeEach(() => {
    sessionStorage.clear()
    pestanas = null
    refresco.mockReset()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useAlReactivarPestana', () => {
    it('al montarse no refresca, aunque su pestaña nazca activa: ya cargó sola', () => {
        semilla([{ key: CLAVE }], CLAVE)
        montar(CLAVE)

        expect(refresco).not.toHaveBeenCalled()
    })

    it('al activarse su pestaña con setActiveTab, el sistema avisa a la página y refresca', () => {
        semilla([otraPestana(), { key: CLAVE }], '/otra')
        montar(CLAVE)

        activar(CLAVE)

        expect(pestanas!.activeTabKey).toBe(CLAVE)
        expect(refresco).toHaveBeenCalledTimes(1)
    })

    it('no refresca cuando la que se activa es otra pestaña y esta queda oculta', () => {
        semilla([otraPestana(), { key: CLAVE }], '/otra')
        montar(CLAVE)

        activar('/tercera')

        expect(refresco).not.toHaveBeenCalled()
    })

    it('al volver la ventana refresca si su pestaña está activa', () => {
        semilla([{ key: CLAVE }], CLAVE)
        montar(CLAVE)

        act(() => {
            fireEvent(window, new Event('focus'))
        })

        expect(refresco).toHaveBeenCalledTimes(1)
    })

    it('al volver la ventana no refresca una pestaña que está oculta', () => {
        semilla([otraPestana(), { key: CLAVE }], '/otra')
        montar(CLAVE)

        act(() => {
            fireEvent(window, new Event('focus'))
        })

        expect(refresco).not.toHaveBeenCalled()
    })

    it('foco y visibilidad del mismo regreso cuentan como un solo refresco', () => {
        semilla([{ key: CLAVE }], CLAVE)
        montar(CLAVE)

        // Al volver a la ventana el navegador dispara ambos eventos juntos;
        // sin el enfriamiento serían dos peticiones por el mismo regreso.
        act(() => {
            fireEvent(window, new Event('focus'))
            fireEvent(document, new Event('visibilitychange'))
        })

        expect(refresco).toHaveBeenCalledTimes(1)
    })

    it('fuera del proveedor de pestañas queda mudo, sin reventar', () => {
        render(<Pantalla />)

        act(() => {
            fireEvent(window, new Event('focus'))
        })

        expect(refresco).not.toHaveBeenCalled()
    })
})
