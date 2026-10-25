// Registro del service worker (public/sw.js). Solo en builds de producción y en contexto seguro (https o localhost).
// Cuando hay una versión nueva esperando, muestra «Actualización disponible — Recargar».
import { toast } from '../components/toast'

declare const __BUILD_ID__: string

function seguro() {
  const h = location.hostname
  return location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

function avisar(reg: ServiceWorkerRegistration) {
  const w = reg.waiting
  if (!w || !navigator.serviceWorker.controller) return // primera instalación: no hay nada que actualizar
  toast('Hay una versión nueva de MediSuite.', 'info', {
    title: 'Actualización disponible',
    ms: 0,
    action: { label: 'Recargar', onClick: () => w.postMessage({ type: 'SKIP_WAITING' }) },
  })
}

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) {
    // en desarrollo no debe quedar un SW de un build anterior sirviendo archivos viejos
    navigator.serviceWorker
      .getRegistrations()
      .then((rs) => rs.forEach((r) => r.unregister()))
      .catch(() => undefined)
    return
  }
  if (!seguro() || window.top !== window.self) return
  const version = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
  let recargando = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return
    recargando = true
    location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js?v=' + encodeURIComponent(version), { scope: './' })
      .then((reg) => {
        avisar(reg)
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          nw?.addEventListener('statechange', () => nw.state === 'installed' && avisar(reg))
        })
        // busca versiones nuevas al volver a la pestaña y cada 30 min
        const buscar = () => reg.update().catch(() => undefined)
        setInterval(buscar, 30 * 60_000)
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && buscar())
      })
      .catch(() => undefined)
  })
}
