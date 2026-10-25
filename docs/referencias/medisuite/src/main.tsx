import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { boot } from './lib/session'
import { registrarServiceWorker } from './lib/pwa'

// Detecta el modo (servidor o demo) y la sesión; la app muestra una pantalla de carga mientras tanto.
boot()
registrarServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
