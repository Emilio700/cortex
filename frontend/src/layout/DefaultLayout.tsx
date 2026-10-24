import { useEffect } from 'react'
import { AppContent, AppSidebar, AppFooter, AppHeader } from '../components/index'
import { ToastProvider } from '../shared/components/ToastProvider'
import { TutorialesProvider } from '../shared/tutoriales/TutorialesContext'
import { AvisosProvider } from '../shared/avisos/AvisosContext'
import CentroAvisos from '../shared/avisos/CentroAvisos'
import EmergentesDeAvisos from '../shared/avisos/EmergentesDeAvisos'

const DefaultLayout = () => {
  useEffect(() => {
    document.body.classList.add('hf-theme')
    return () => document.body.classList.remove('hf-theme')
  }, [])

  return (
    <ToastProvider>
      {/* Envuelve todo el diseño porque el botón de ayuda vive en el
          encabezado y los recorridos señalan el menú, las pestañas y el
          contenido a la vez. */}
      <TutorialesProvider>
        {/* Los avisos sondean una vez para toda la aplicación: la campana, el
            centro, los emergentes y las pantallas que se cuelgan del latido
            leen lo mismo (plan 27, Fase 2). */}
        <AvisosProvider>
          <AppSidebar />
          <div className="wrapper d-flex flex-column min-vh-100">
            <AppHeader />
            <div className="body flex-grow-1">
              <AppContent />
            </div>
            <AppFooter />
          </div>
          <CentroAvisos />
          <EmergentesDeAvisos />
        </AvisosProvider>
      </TutorialesProvider>
    </ToastProvider>
  )
}

export default DefaultLayout
