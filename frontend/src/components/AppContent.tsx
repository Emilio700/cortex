import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CContainer } from '@coreui/react-pro'

import TabsBar from '../shared/tabs/TabsBar'
import TabsOutlet from '../shared/tabs/TabsOutlet'
import { useTabs } from '../shared/tabs/TabsContext'
import { useAuth } from '../shared/context/AuthContext'
import { buildRouteEntries, matchRoutePath, resolveTabTitle, destinoDeRedireccion } from '../shared/tabs/routeMatch'
import { rutaDeInicioPermitida } from '../shared/utils/inicio'

const AppContent = () => {
    const location = useLocation()
    const { openTab, clearTabs } = useTabs()
    const { isAuthenticated, user, permissions } = useAuth()
    const navigate = useNavigate()
    const routeEntries = useMemo(() => buildRouteEntries(), [])

    // Clear tabs when user logs out
    useEffect(() => {
        if (!isAuthenticated) {
            clearTabs()
        }
    }, [isAuthenticated, clearTabs])

    // Abre una pestaña para la ruta actual. «/» no tiene pantalla y una ruta que
    // no existe abría una pestaña en blanco: las dos llevan al inicio del rol
    // (el médico, a su tablero con métricas), en vez de dejar «Selecciona una
    // sección del menú» o una pantalla vacía (plan 26, D-6).
    useEffect(() => {
        const path = location.pathname
        const ruta = path === '/' || path === '' ? undefined : matchRoutePath(path, routeEntries)
        // Una pantalla retirada lleva a donde vive ahora lo suyo (el
        // preregistro, a la Agenda; plan 32, punto 5), no al inicio del rol.
        if (ruta?.redirigeA) {
            navigate(destinoDeRedireccion(path, ruta) ?? ruta.redirigeA, { replace: true })
            return
        }
        if (!ruta?.element) {
            const inicio = rutaDeInicioPermitida(user?.role, permissions)
            if (path !== inicio) navigate(inicio, { replace: true })
            return
        }
        const title = resolveTabTitle(path, routeEntries)
        openTab({ key: path, path, title })
    }, [location.pathname, openTab, routeEntries, navigate, user?.role, permissions])

    return (
        <CContainer lg className="px-4 pb-4">
            {/* «Pestañas abiertas»: la tira de pestañas es navegación; sin su
                landmark el texto quedaba «fuera de regiones» (paso axe). */}
            <nav aria-label="Pestañas abiertas">
                <TabsBar />
            </nav>
            {/* El contenido de cada pantalla vive en su propio landmark
                `main` (paso axe): sin él, axe marcaba el contenido fuera de
                regiones y el lector no tenía atajo directo. Las pestañas
                quedan fuera a propósito: son navegación, no contenido. Las migas se
                quitaron (plan 32, punto 2): el título lo da el `<h1>` de cada
                pantalla y la ubicación, las pestañas. */}
            <main id="contenido-principal">
                <TabsOutlet />
            </main>
        </CContainer>
    )
}

export default AppContent
