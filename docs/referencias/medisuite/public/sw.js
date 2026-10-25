/* MediSuite — service worker escrito a mano (sin dependencias).
 *
 * - Precarga el «app shell»: index.html + los archivos con hash listados en precache-manifest.json (generado en el build).
 * - index.html / navegación: red primero (para recibir actualizaciones) y, sin red, la copia en caché.
 * - Archivos con hash del build: caché primero (son inmutables).
 * - WASM, modelos de IA/OCR y fragmentos grandes: caché primero, guardados la primera vez que se usan.
 * - NUNCA guarda respuestas de la API (/api/*: datos clínicos), ni peticiones a otros orígenes, ni respuestas
 *   marcadas `no-store`/`private`.
 * - La versión nueva espera a que el usuario pulse «Recargar» (mensaje SKIP_WAITING).
 */
const SHELL_PREFIX = 'medisuite-shell-'
const LAZY_CACHE = 'medisuite-lazy-v1'
const SCOPE = new URL(self.registration.scope)
const BASE = SCOPE.pathname // p. ej. "/" o "/app/"
const INDEX = new URL('index.html', SCOPE).href
const LAZY_RE = /\.(wasm|onnx|task|tflite|traineddata|data|bin)$/i
const LAZY_DIRS = ['mediapipe/', 'models/', 'tesseract/', 'tessdata/', 'excalidraw-assets/']

// La versión viene en la URL del script (sw.js?v=<build>): cada build registra un SW nuevo y su propia caché.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const SHELL = SHELL_PREFIX + VERSION
const MANIFEST_URL = new URL('precache-manifest.json', SCOPE).href
const VACIO = { assets: [], lazy: [] }

let manifestPromise = null
/** Manifiesto de ESTA versión: guardado en su caché al instalar (o de la red si aún no existe). */
function getManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const hit = await caches.open(SHELL).then((c) => c.match(MANIFEST_URL))
      if (hit) return hit.json()
      const r = await fetch(MANIFEST_URL + '?v=' + encodeURIComponent(VERSION), { cache: 'no-store' })
      if (!r.ok) return VACIO
      const m = await r.clone().json()
      await (await caches.open(SHELL)).put(MANIFEST_URL, r)
      return m
    })().catch(() => {
      manifestPromise = null
      return VACIO
    })
  }
  return manifestPromise
}

const esApi = (url) => url.pathname.startsWith(BASE + 'api/') || url.pathname.startsWith('/api/') || url.pathname.includes('/api/')
function cacheable(res) {
  if (!res || !res.ok || res.status !== 200 || res.type === 'opaque') return false
  const cc = (res.headers.get('Cache-Control') || '').toLowerCase()
  return !cc.includes('no-store') && !cc.includes('private')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const m = await getManifest()
      const cache = await caches.open(SHELL)
      const urls = [INDEX, new URL('manifest.webmanifest', SCOPE).href, new URL('favicon.svg', SCOPE).href, ...m.assets.map((a) => new URL(a, SCOPE).href)]
      // de a poco: un archivo que falle no debe impedir instalar el resto
      await Promise.all(
        urls.map(async (u) => {
          try {
            const res = await fetch(u, { cache: 'no-cache' })
            if (cacheable(res)) await cache.put(u, res)
          } catch {
            /* sin red: se reintentará en la siguiente versión */
          }
        }),
      )
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const m = await getManifest()
      for (const k of await caches.keys()) if (k.startsWith(SHELL_PREFIX) && k !== SHELL) await caches.delete(k)
      // los fragmentos grandes con hash de versiones anteriores ya no sirven
      const lazy = await caches.open(LAZY_CACHE)
      const vigentes = new Set(m.lazy.map((a) => new URL(a, SCOPE).href))
      for (const req of await lazy.keys()) {
        const u = new URL(req.url)
        if (u.pathname.startsWith(BASE + 'assets/') && !vigentes.has(u.href)) await lazy.delete(req)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

async function networkFirstIndex(request) {
  const cache = await caches.open(SHELL)
  try {
    const res = await fetch(request.mode === 'navigate' ? INDEX : request, { cache: 'no-cache' })
    if (cacheable(res)) cache.put(INDEX, res.clone())
    return res
  } catch (e) {
    const hit = (await cache.match(INDEX)) || (await caches.match(INDEX))
    if (hit) return hit
    throw e
  }
}

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (cacheable(res)) {
    const cache = await caches.open(cacheName)
    cache.put(request, res.clone())
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // otros orígenes (CDN de modelos, Jitsi…): el navegador decide
  if (esApi(url)) return // datos clínicos: jamás en caché
  if (req.headers.has('range')) return
  if (!url.pathname.startsWith(BASE)) return
  const rel = url.pathname.slice(BASE.length)

  if (req.mode === 'navigate' || rel === '' || rel === 'index.html') {
    event.respondWith(networkFirstIndex(req))
    return
  }
  if (rel === 'sw.js' || rel === 'precache-manifest.json') return
  if (rel.startsWith('assets/')) {
    event.respondWith(
      (async () => {
        const m = await getManifest()
        const lazy = LAZY_RE.test(rel) || m.lazy.includes(rel)
        return cacheFirst(req, lazy ? LAZY_CACHE : SHELL)
      })(),
    )
    return
  }
  if (LAZY_RE.test(rel) || LAZY_DIRS.some((d) => rel.startsWith(d))) {
    event.respondWith(cacheFirst(req, LAZY_CACHE))
    return
  }
  // resto (manifest, íconos…): red primero con respaldo en caché
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req)
        if (cacheable(res)) (await caches.open(SHELL)).put(req, res.clone())
        return res
      } catch (e) {
        const hit = await caches.match(req)
        if (hit) return hit
        throw e
      }
    })(),
  )
})
