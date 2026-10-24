/**
 * Global Tabs Context — Phase D (Pestañas tipo navegador).
 *
 * Manages open tabs with keep-alive (CSS display:none) so form state
 * survives tab switches. Persists tab list to sessionStorage so page
 * reloads retain which tabs were open.
 *
 * Como el estado de los formularios vive sólo en memoria hasta que la usuaria
 * oprime Guardar, cerrar o descartar una pestaña destruye trabajo real. Por eso
 * este archivo consulta el registro de `cambiosSinGuardar` antes de quitar
 * cualquier pestaña del arreglo.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { etiquetasSinGuardar, hayCambiosSinGuardar, pestanasSinGuardar, suscribir } from './cambiosSinGuardar'

export interface Tab {
    key: string          // unique identifier (usually the path)
    path: string          // route path
    title: string         // display title
    icon?: string         // optional icon name
}

interface TabsContextType {
    tabs: Tab[]
    activeTabKey: string | null
    openTab: (tab: Tab) => void
    closeTab: (key: string) => void
    setActiveTab: (key: string) => void
    clearTabs: () => void
    /** Cierra todas menos `key` (clic derecho, plan 32). Pregunta si hay trabajo. */
    closeOthers: (key: string) => void
    /** Cierra todas; queda el inicio del rol. Pregunta si hay trabajo. */
    closeAll: () => void
    /** La pestaña que cerró el límite de 8, mientras se puede deshacer. */
    cierrePorLimite: Tab | null
    deshacerCierre: () => void
    descartarCierre: () => void
}

const MAX_TABS = 8
const STORAGE_KEY = 'gems_tabs'

const TabsContext = createContext<TabsContextType | null>(null)

function loadFromStorage(): { tabs: Tab[]; activeTabKey: string | null } {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (raw) {
            const data = JSON.parse(raw)
            return {
                tabs: data.tabs || [],
                activeTabKey: data.activeTabKey || null,
            }
        }
    } catch { /* corrupt storage, start fresh */ }
    return { tabs: [], activeTabKey: null }
}

function saveToStorage(tabs: Tab[], activeTabKey: string | null) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabKey }))
    } catch { /* storage full — non-critical */ }
}

/** Enumera en palabras lo que se va a perder: "Notas de consulta y Receta 1". */
function enumerar(etiquetas: string[]): string {
    if (etiquetas.length <= 1) return etiquetas[0] ?? 'trabajo sin guardar'
    return `${etiquetas.slice(0, -1).join(', ')} y ${etiquetas[etiquetas.length - 1]}`
}

/**
 * Pregunta antes de tirar una pestaña con trabajo dentro.
 *
 * Se usa `window.confirm` y no un `CModal` a propósito. La decisión tiene que
 * tomarse *dentro* de `closeTab`/`openTab`, que es el único punto por el que
 * pasan todas las formas de quitar una pestaña; con un modal habría que subir
 * la pregunta a `TabsBar` y cualquier otro llamador —hoy `openTab` al llegar al
 * límite, mañana un atajo de teclado o un "cerrar las demás"— volvería a tirar
 * la pestaña sin avisar. El guard vive en el cuello de botella o no sirve.
 * El precio es un diálogo con estilo del navegador, que para una advertencia de
 * pérdida de datos incluso ayuda: se ve distinto a la interfaz y detiene.
 */
function confirmarPerdida(mensaje: string): boolean {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
    return window.confirm(mensaje)
}

/** Pestaña que queda cuando se cierran todas: el inicio del rol (plan 26, D-6). */
// Solo si quien monta el proveedor no dice cuál es el inicio (las pruebas):
// «/», que `AppContent` resuelve al inicio del rol. «/dashboard» ya no existe.
const INICIO_GENERICO = { path: '/', title: 'Inicio' }

export const TabsProvider: React.FC<{
    children: React.ReactNode
    inicio?: { path: string; title: string }
}> = ({ children, inicio = INICIO_GENERICO }) => {
    const [tabs, setTabs] = useState<Tab[]>(() => loadFromStorage().tabs)
    const [activeTabKey, setActiveTabKeyState] = useState<string | null>(
        () => loadFromStorage().activeTabKey
    )

    // Espejo de `tabs` para decidir fuera de los updaters de `setTabs`. Un
    // updater debe ser puro: React lo puede ejecutar dos veces (StrictMode) y
    // preguntarle dos veces a la usuaria sería inaceptable.
    const tabsRef = useRef(tabs)
    tabsRef.current = tabs

    // Cuándo se usó cada pestaña por última vez. Al pasar de 8 se cierra la
    // usada hace más tiempo, no la primera de la fila: la de la izquierda
    // puede ser la agenda que la recepción consulta a cada rato.
    const usoRef = useRef(new Map<string, number>())
    const relojDeUso = useRef(0)
    const marcarUso = useCallback((key: string) => {
        relojDeUso.current += 1
        usoRef.current.set(key, relojDeUso.current)
    }, [])

    // Lo que el límite cerró, con su lugar, para que «Deshacer» la devuelva
    // donde estaba. Sólo se guarda la última: el aviso enseña una a la vez.
    const [cierrePorLimite, setCierrePorLimite] = useState<{ tab: Tab; indice: number } | null>(null)

    // Se actualiza también al escribir, sin esperar al render: dos aperturas en
    // el mismo tick (navegar dos veces rápido) verían la misma lista vieja y la
    // segunda creería que todavía cabe una pestaña más.
    const guardarTabs = useCallback((siguiente: Tab[]) => {
        tabsRef.current = siguiente
        setTabs(siguiente)
    }, [])

    useAvisoDeSalida()

    // Persist on change
    useEffect(() => {
        saveToStorage(tabs, activeTabKey)
    }, [tabs, activeTabKey])

    const openTab = useCallback((tab: Tab) => {
        const actuales = tabsRef.current

        marcarUso(tab.key)

        if (actuales.some((t) => t.key === tab.key)) {
            // Tab already open — nothing to change in the array
            setActiveTabKeyState(tab.key)
            return
        }

        if (actuales.length < MAX_TABS) {
            guardarTabs([...actuales, tab])
            setActiveTabKeyState(tab.key)
            return
        }

        // Lleno. Antes se descartaba la más vieja en silencio, así se perdían
        // notas ya escritas. La antigüedad importa menos que el trabajo dentro:
        // se sacrifica la pestaña limpia usada hace más tiempo (una pestaña
        // restaurada de la sesión y nunca tocada cuenta como la más vieja).
        const porUso = [...actuales].sort(
            (a, b) => (usoRef.current.get(a.key) ?? 0) - (usoRef.current.get(b.key) ?? 0),
        )
        const limpia = porUso.find((t) => !hayCambiosSinGuardar(t.key))
        const victima = limpia ?? porUso[0]

        if (!limpia) {
            // Todas tienen trabajo pendiente: no se tira nada a la brava.
            const pendientes = etiquetasSinGuardar(victima.key)
            const aceptó = confirmarPerdida(
                `Tienes ${MAX_TABS} pestañas abiertas y todas tienen cambios sin guardar.\n\n` +
                `Para abrir «${tab.title}» hay que cerrar «${victima.title}», ` +
                `y se perdería: ${enumerar(pendientes)}.\n\n` +
                `Cancela para quedarte donde estás, guardar y volver a intentarlo.`,
            )
            // Al cancelar no se abre la pestaña nueva y la activa no cambia: la
            // usuaria sigue exactamente donde estaba, con su trabajo intacto.
            if (!aceptó) return
        }

        guardarTabs([...actuales.filter((t) => t.key !== victima.key), tab])
        setActiveTabKeyState(tab.key)
        setCierrePorLimite({ tab: victima, indice: actuales.indexOf(victima) })
    }, [guardarTabs, marcarUso])

    const closeTab = useCallback((key: string) => {
        const actuales = tabsRef.current
        const idx = actuales.findIndex((t) => t.key === key)
        if (idx === -1) return

        const pendientes = etiquetasSinGuardar(key)
        if (pendientes.length > 0) {
            const cerrada = actuales[idx]
            // Nombrar lo pendiente, no un genérico "hay cambios": el médico
            // tiene ocho pestañas y necesita saber qué es lo que va a perder.
            const aceptó = confirmarPerdida(
                `«${cerrada.title}» tiene cambios sin guardar: ${enumerar(pendientes)}.\n\n` +
                `Si cierras la pestaña se pierden. ¿Cerrar de todas formas?`,
            )
            if (!aceptó) return
        }

        const next = actuales.filter((t) => t.key !== key)

        // Sin pestañas no se deja la pantalla vacía: queda el inicio de su rol.
        if (next.length === 0) {
            setActiveTabKeyState(inicio.path)
            guardarTabs([{ key: inicio.path, path: inicio.path, title: inicio.title }])
            return
        }

        // If closing the active tab, activate the nearest one
        if (key === activeTabKey) {
            const newActive = next[Math.min(idx, next.length - 1)]
            setActiveTabKeyState(newActive?.key ?? null)
        }

        guardarTabs(next)
    }, [activeTabKey, guardarTabs, inicio.path, inicio.title])

    const setActiveTab = useCallback((key: string) => {
        marcarUso(key)
        setActiveTabKeyState(key)
    }, [marcarUso])

    const clearTabs = useCallback(() => {
        guardarTabs([])
        setActiveTabKeyState(null)
        setCierrePorLimite(null)
        try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
    }, [guardarTabs])

    /**
     * Cierra de golpe las pestañas `quitar`. Una sola pregunta que nombra cada
     * pestaña con trabajo: ocho diálogos seguidos se aceptan sin leer.
     */
    const cerrarVarias = useCallback((quitar: Tab[], activaNueva: string | null) => {
        const conTrabajo = quitar.filter((t) => etiquetasSinGuardar(t.key).length > 0)
        if (conTrabajo.length > 0) {
            const detalle = conTrabajo
                .map((t) => `«${t.title}»: ${enumerar(etiquetasSinGuardar(t.key))}`)
                .join('\n')
            const aceptó = confirmarPerdida(
                `Estas pestañas tienen cambios sin guardar:\n${detalle}\n\n` +
                `Si las cierras se pierden. ¿Cerrar de todas formas?`,
            )
            if (!aceptó) return
        }
        const fuera = new Set(quitar.map((t) => t.key))
        const next = tabsRef.current.filter((t) => !fuera.has(t.key))
        setCierrePorLimite(null)
        if (next.length === 0) {
            setActiveTabKeyState(inicio.path)
            guardarTabs([{ key: inicio.path, path: inicio.path, title: inicio.title }])
            return
        }
        guardarTabs(next)
        setActiveTabKeyState(activaNueva ?? next[next.length - 1].key)
    }, [guardarTabs, inicio.path, inicio.title])

    const closeOthers = useCallback((key: string) => {
        cerrarVarias(tabsRef.current.filter((t) => t.key !== key), key)
    }, [cerrarVarias])

    const closeAll = useCallback(() => {
        cerrarVarias(tabsRef.current, null)
    }, [cerrarVarias])

    const deshacerCierre = useCallback(() => {
        if (!cierrePorLimite) return
        const actuales = tabsRef.current
        setCierrePorLimite(null)
        if (actuales.some((t) => t.key === cierrePorLimite.tab.key)) return
        // Vuelve a su lugar aunque queden 9: el límite es suave y la usuaria
        // acaba de decir que la quiere de vuelta.
        const siguiente = [...actuales]
        siguiente.splice(Math.min(cierrePorLimite.indice, siguiente.length), 0, cierrePorLimite.tab)
        guardarTabs(siguiente)
    }, [cierrePorLimite, guardarTabs])

    const descartarCierre = useCallback(() => setCierrePorLimite(null), [])

    return (
        <TabsContext.Provider
            value={{
                tabs,
                activeTabKey,
                openTab,
                closeTab,
                setActiveTab,
                clearTabs,
                closeOthers,
                closeAll,
                cierrePorLimite: cierrePorLimite?.tab ?? null,
                deshacerCierre,
                descartarCierre,
            }}
        >
            {children}
        </TabsContext.Provider>
    )
}

/**
 * Aviso del navegador al cerrar la pestaña o recargar con trabajo pendiente.
 *
 * El listener se arma sólo mientras hay algo que perder: registrarlo siempre
 * hace que Chrome trate la página como "no descartable" y estorba en el uso
 * normal, cuando no hay nada que proteger.
 */
function useAvisoDeSalida() {
    const hayPendientes = useSyncExternalStore(
        suscribir,
        () => pestanasSinGuardar().length > 0,
        () => false,
    )

    useEffect(() => {
        if (!hayPendientes) return
        const alSalir = (evento: BeforeUnloadEvent) => {
            // El texto propio se ignora desde hace años en todos los
            // navegadores: lo único que dispara el diálogo es preventDefault.
            evento.preventDefault()
        }
        window.addEventListener('beforeunload', alSalir)
        return () => window.removeEventListener('beforeunload', alSalir)
    }, [hayPendientes])
}

export function useTabs() {
    const ctx = useContext(TabsContext)
    if (!ctx) throw new Error('useTabs must be used within TabsProvider')
    return ctx
}

/**
 * Como `useTabs`, pero devuelve `null` fuera del proveedor.
 *
 * Lo necesitan los hooks que deben poder montarse sueltos —una página en una
 * prueba, un componente reutilizado fuera del marco de pestañas— y quedarse
 * callados en vez de reventar. Pedir que todos envuelvan su pantalla en
 * `TabsProvider` sólo para usar un hook opcional sería obligar al doble.
 */
export function useTabsOpcional(): TabsContextType | null {
    return useContext(TabsContext)
}
