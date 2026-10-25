/**
 * TabsOutlet — true keep-alive tab rendering.
 *
 * React Router's <Routes> unmounts non-matching routes, destroying state.
 * The ONLY way to preserve state is to render ALL open tab components
 * simultaneously and control visibility with CSS display:none/block.
 *
 * Strategy:
 * 1. Build flat list of all route configs.
 * 2. For each open tab, render its component DIRECTLY (no <Routes>).
 * 3. Active tab: display:block. Inactive tabs: display:none.
 * 4. Components never unmount → React preserves all state.
 *
 * Dynamic routes (`/secretaria/pacientes/:patientId/historial`) are matched
 * via pattern matching so tab content renders even with concrete ids in the
 * URL.
 */
import React, { Suspense, useEffect, useRef } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { CSpinner } from '@coreui/react-pro'
import { useTabs } from './TabsContext'
import BarreraDeError from '../components/BarreraDeError'
import { buildRouteEntries, matchRoutePath } from './routeMatch'
import { AccessGuard } from '../guards/AccessGuard'
import { TabKeyContext } from './cambiosSinGuardar'

const routeEntries = buildRouteEntries()

const TabsOutlet: React.FC = () => {
    const { tabs, activeTabKey } = useTabs()
    const navigate = useNavigate()
    const lastSyncedPath = useRef<string | null>(null)

    // Sync browser URL when active tab changes (guard against infinite loop)
    useEffect(() => {
        const activeTab = tabs.find((t) => t.key === activeTabKey)
        if (!activeTab) return
        const targetPath = activeTab.path
        if (lastSyncedPath.current === targetPath) return // already synced
        const currentPath = window.location.hash.replace('#', '')
        if (currentPath !== targetPath) {
            lastSyncedPath.current = targetPath
            navigate(targetPath, { replace: true })
        }
    }, [activeTabKey]) // only react to tab changes, not tabs/navigate refs

    return (
        <Suspense fallback={<CSpinner color="primary" />}>
            {tabs.length === 0 && (
                <div className="text-center py-5 text-muted">
                    Selecciona una sección del menú para comenzar.
                </div>
            )}
            {tabs.map((tab) => {
                const route = matchRoutePath(tab.path, routeEntries)
                if (!route?.element) return null

                const isActive = tab.key === activeTabKey
                const Element = route.element
                const roles = route.roles
                const requires = route.requires
                const modulo = route.modulo

                // Synthetic location for THIS tab's concrete URL. The nested
                // <Routes> matches it against the route *pattern* (with
                // :params), which gives components using useParams() the
                // correct values (e.g. patientId, appointmentId). Without
                // this, components rendered outside <Routes> get no params
                // and silently skip their data fetch.
                const tabLocation = {
                    pathname: tab.path,
                    search: '',
                    hash: '',
                    state: null,
                    key: `tab-${tab.key}`,
                }

                return (
                    <div
                        key={tab.key}
                        style={{ display: isActive ? 'block' : 'none' }}
                    >
                        {/*
                          * Todas las pestañas se renderizan a la vez, así que un
                          * formulario no puede saber en cuál vive preguntando por la
                          * URL: la ruta del navegador es la de la pestaña activa, no
                          * la suya. Se la damos aquí para que declare sus cambios sin
                          * guardar en la pestaña correcta y no en la que esté al frente.
                          */}
                        <TabKeyContext.Provider value={tab.key}>
                            <BarreraDeError key={tab.key}>
                                <React.Suspense fallback={<CSpinner color="primary" />}>
                                    <Routes location={tabLocation}>
                                        <Route
                                            path={route.path}
                                            element={
                                                // Con permiso y rol a la vez: el menú ya
                                                // ofrece la pantalla por permiso, y si aquí
                                                // sólo se mirara el rol, conceder un permiso
                                                // mostraría la opción pero la abriría en /403.
                                                requires?.length || roles?.length || modulo ? (
                                                    <AccessGuard requires={requires} allowedRoles={roles} modulo={modulo} alNegar="pestana">
                                                        <Element />
                                                    </AccessGuard>
                                                ) : (
                                                    <Element />
                                                )
                                            }
                                        />
                                    </Routes>
                                </React.Suspense>
                            </BarreraDeError>
                        </TabKeyContext.Provider>
                    </div>
                )
            })}
        </Suspense>
    )
}

export default TabsOutlet
