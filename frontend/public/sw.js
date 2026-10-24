/*
 * Service worker de GEMS.
 *
 * Existe sólo para que Chrome en Android permita instalar la app: sin un
 * service worker con manejador de `fetch` la rechaza con "No se puede instalar
 * esta app". A propósito NO guarda nada: cada petición va directo a la red.
 * Un caché aquí dejaría expedientes en el teléfono y, tras un despliegue,
 * serviría pantallas viejas contra un servidor nuevo.
 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request))
})
