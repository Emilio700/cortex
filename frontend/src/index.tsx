import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
// Sin `import 'core-js'`: la plantilla original lo cargaba entero (287 KB
// minificados, 103 KB con gzip, en el paquete inicial) para navegadores viejos que
// la app ya no soporta. Vite 7 compila para navegadores con base amplia (Chrome
// 107+, Safari 16+), pdf.js 5 los exige de todos modos, y el código no usa APIs
// más nuevas que eso (plan 29, lote 6).

import App from './App'
import store from './store'
import './i18n'
// Barrera raíz: la de `App` vive dentro del enrutador, así que un fallo al
// armar la sesión o el propio enrutador se escapaba y React 19 desmontaba todo
// (pantalla en blanco, sin mensaje). Esta envuelve a todo.
import BarreraDeError from './shared/components/BarreraDeError'

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <BarreraDeError respaldo={{ etiqueta: 'Ir al acceso', ruta: '/login' }}>
      <App />
    </BarreraDeError>
  </Provider>,
)

// Sólo en producción: en desarrollo un service worker se interpone con la
// recarga en caliente de vite. Si el registro falla la app funciona igual; lo
// único que se pierde es poder instalarla en Android.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
