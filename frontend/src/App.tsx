import React, { Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'

import { CSpinner, useColorModes } from '@coreui/react-pro'

// Las tipografías de Cortex viajan en el build: el consultorio no depende de
// un CDN para ver la interfaz completa.
import '@fontsource-variable/inter'
import '@fontsource/michroma/400.css'
import './scss/style.scss'

// Auth
import { AuthProvider } from './shared/context/AuthContext'

// Tabs
import { TabsProvider } from './shared/tabs/TabsContext'

// Guards
import { ProtectedRoute } from './shared/guards/ProtectedRoute'
import { useAuth } from './shared/context/AuthContext'
import { rutaDeInicioPermitida } from './shared/utils/inicio'
import { buildRouteEntries, resolveTabTitle } from './shared/tabs/routeMatch'

// Containers
const DefaultLayout = React.lazy(() => import('./layout/DefaultLayout'))

const Login = React.lazy(() => import('./views/pages/login/Login'))
const ForgotPasswordPage = React.lazy(() => import('./views/pages/login/ForgotPasswordPage'))
const ResetPasswordPage = React.lazy(() => import('./views/pages/login/ResetPasswordPage'))
const ForceChangePasswordPage = React.lazy(() => import('./views/pages/login/ForceChangePasswordPage'))
const Page403 = React.lazy(() => import('./views/pages/page403/Page403'))
const Page404 = React.lazy(() => import('./views/pages/page404/Page404'))
const Page500 = React.lazy(() => import('./views/pages/page500/Page500'))

/**
 * Las pestañas, con el inicio del rol como la que queda al cerrar todas: antes
 * quedaba «/dashboard», la página genérica, y la doctora perdía su tablero.
 */
const PestanasConInicio = ({ children }: { children: React.ReactNode }) => {
  const { user, permissions } = useAuth()
  const path = rutaDeInicioPermitida(user?.role, permissions)
  return (
    <TabsProvider inicio={{ path, title: resolveTabTitle(path, buildRouteEntries()) }}>
      {children}
    </TabsProvider>
  )
}

const App = () => {
  const { setColorMode } = useColorModes(
    'gems-theme',
  )

  useEffect(() => {
    setColorMode('light')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthProvider>
      <HashRouter>
        <Suspense
        fallback={
          <div className="pt-3 text-center">
            <CSpinner color="primary" variant="grow" />
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/force-change-password" element={<ForceChangePasswordPage />} />
          <Route path="/403" element={<Page403 />} />
          <Route path="/404" element={<Page404 />} />
          <Route path="/500" element={<Page500 />} />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <PestanasConInicio>
                  <DefaultLayout />
                </PestanasConInicio>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
      </HashRouter>
    </AuthProvider>
  )
}

export default App
