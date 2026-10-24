/**
 * Refrescar los datos de una pestaña al volver a ella.
 *
 * Las pestañas son keep-alive: su componente nunca se desmonta, así que una
 * lista que se cargó al abrir la pestaña se queda con los datos de ese momento
 * —hasta cerrarla y volver a abrirla—. Lo que se pide es lo contrario: que al
 * cambiarse a una pestaña, y al volver a la ventana del navegador, sus datos
 * se pongan al día solos.
 *
 * Este hook junta las dos señales en una sola regla. Dispara cuando:
 *  - la pestaña de ESTE componente pasa a ser la activa después de haber
 *    estado oculta, o
 *  - la ventana recupera el foco o la visibilidad mientras ESTA pestaña es la
 *    activa.
 *
 * Se eligió leer la activación del contexto y no de un evento en `window`
 * (p. ej. `CustomEvent('gems:tab-activada')` con la ruta en `detail`): la
 * pestaña que contiene al componente ya se la da `TabsOutlet` por
 * `TabKeyContext`, y el estado activo ya está en `TabsContext`. Un evento
 * global obligaría a cada pantalla a emparejar su propia ruta contra la del
 * evento —con las rutas dinámicas, dos pestañas abiertas del mismo patrón
 * (`/doctor/consultation/:id`) coincidirían y refrescarían la que no se ve—,
 * y encima llegaría a cualquier componente desmontado que no haya alcanzado a
 * quitar su oyente. El contexto no tiene ninguno de esos dos problemas.
 *
 * Nada de esto dispara en el primer montaje (ahí cada pantalla ya carga sola),
 * ni con la pestaña oculta (no se está viendo: sería un gasto inútil), ni dos
 * veces por el mismo regreso: `focus` y `visibilitychange` llegan juntos al
 * volver a la ventana, y a veces la activación se suma; el enfriamiento de un
 * segundo funde esos avisos en un solo refresco. Mientras un refresco pedido
 * aquí sigue en curso tampoco se pide otro.
 *
 * `refrescar` debe recargar SÓLO datos. Jamás algo que pueda descartar lo que
 * una persona está escribiendo: cada pantalla decide qué recarga (y muchas
 * veces no conviene recargar nada mientras hay un modal de captura abierto).
 */
import { useCallback, useContext, useEffect, useRef } from 'react'

import { TabKeyContext } from './cambiosSinGuardar'
import { useTabsOpcional } from './TabsContext'

/**
 * Mínimo entre dos refrescos del mismo hook.
 *
 * Al volver a la ventana, `focus` y `visibilitychange` llegan juntos —y a
 * veces también la activación de la pestaña—: con un segundo de por medio se
 * consideran un solo regreso. De paso evita tormentas de peticiones cuando se
 * recorren pestañas de un tirón.
 */
export const ENFRIAMIENTO_REFRESCO_MS = 1000

export function useAlReactivarPestana(refrescar: () => void | Promise<void>): void {
    const tabs = useTabsOpcional()
    const tabKey = useContext(TabKeyContext)

    // Fuera del sistema de pestañas (una prueba que monta la pantalla suelta,
    // p. ej.) no hay «pestaña activa» que valga: el hook queda mudo a
    // propósito, para no obligar a envolver cada componente en el proveedor.
    const activa = tabKey !== null && tabs !== null && tabs.activeTabKey === tabKey

    // Siempre la última versión de lo que pasa cada render, para que los
    // oyentes y efectos sean estables y no se reinicien en balde.
    const ultimoRef = useRef(refrescar)
    ultimoRef.current = refrescar
    const activaRef = useRef(activa)
    activaRef.current = activa

    // `null` = el efecto todavía no ha corrido ni una vez. Distingue «acaba de
    // montarse» (no se refresca: ya cargó solo) de «volvió».
    const activaAnteriorRef = useRef<boolean | null>(null)
    const enCursoRef = useRef(false)
    const ultimoRefrescoRef = useRef(0)

    const solicitar = useCallback(() => {
        if (!activaRef.current) return
        if (enCursoRef.current) return
        const ahora = Date.now()
        if (ahora - ultimoRefrescoRef.current < ENFRIAMIENTO_REFRESCO_MS) return

        ultimoRefrescoRef.current = ahora
        enCursoRef.current = true
        try {
            // Si la pantalla devuelve su promesa de carga, se respeta: mientras
            // esté en curso no se repite, aunque pase el enfriamiento.
            Promise.resolve(ultimoRef.current())
                .catch(() => {
                    // La pantalla ya pinta su propio error de carga; un fallo
                    // aquí no tiene por qué ensuciar la consola por duplicado.
                })
                .finally(() => {
                    enCursoRef.current = false
                })
        } catch {
            // Un refresco que falla no puede tumbar una pestaña que estaba
            // mostrándose bien: se queda con los datos que ya tenía.
            enCursoRef.current = false
        }
    }, [])

    // Reactivación: la pestaña de este componente deja de estar oculta. El
    // primer efecto sólo memoriza el estado inicial —el montaje ya carga—; a
    // partir de ahí, un cambio de falsa a verdadera es un regreso de verdad.
    useEffect(() => {
        const eraActiva = activaAnteriorRef.current
        activaAnteriorRef.current = activa
        if (eraActiva === null) return
        if (!eraActiva && activa) solicitar()
    }, [activa, solicitar])

    // Regreso a la ventana: foco y visibilidad, como ya hace
    // `useResultadosSinRevisar` para su contador. `solicitar` descarta los
    // avisos de una pestaña que no es la activa.
    useEffect(() => {
        const alVolver = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            solicitar()
        }
        window.addEventListener('focus', alVolver)
        document.addEventListener('visibilitychange', alVolver)
        return () => {
            window.removeEventListener('focus', alVolver)
            document.removeEventListener('visibilitychange', alVolver)
        }
    }, [solicitar])
}
