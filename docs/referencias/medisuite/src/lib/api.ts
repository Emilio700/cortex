// Cliente HTTP del backend de MediSuite (modo servidor). Contrato: docs/api.md
//
// - Mismo origen, prefijo /api (configurable con VITE_API_BASE).
// - Sesión por cookie HttpOnly; todas las peticiones llevan `X-Requested-With: MediSuite` (CSRF).
// - Errores del servidor: { error, message } → ApiError con status, code y message en español.
// - Cualquier 401 (salvo las peticiones marcadas con `noAuthRedirect`) avisa a la sesión para volver al login.

export type Mode = 'server' | 'demo'

export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || '/api').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  code: string
  body: unknown
  constructor(status: number, code: string, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

const MENSAJES: Record<number, string> = {
  400: 'Los datos enviados no son válidos.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  403: 'Tu rol no tiene permiso para esta acción.',
  404: 'El registro no existe o fue eliminado.',
  409: 'La operación no se permite en el estado actual del registro.',
  413: 'El archivo es demasiado grande (máximo 25 MB).',
  423: 'La cuenta está bloqueada temporalmente.',
  429: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
}

type UnauthorizedHandler = (e: ApiError) => void
const unauthorizedHandlers = new Set<UnauthorizedHandler>()
/** La sesión se registra aquí para enterarse de cualquier 401. */
export function onUnauthorized(fn: UnauthorizedHandler) {
  unauthorizedHandlers.add(fn)
  return () => unauthorizedHandlers.delete(fn)
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown // se envía como JSON
  form?: FormData // multipart (no fijar Content-Type)
  query?: Record<string, string | number | undefined | null>
  timeout?: number // ms (por defecto 20 s; 120 s para subir archivos)
  signal?: AbortSignal
  noAuthRedirect?: boolean // no disparar "sesión expirada" en 401 (login, /me inicial, público)
  onResponse?: (res: Response) => void // para leer encabezados (X-Sync-Desde, Date…)
}

export function apiUrl(path: string, query?: ApiOptions['query']) {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : ''
  return API_BASE + (path.startsWith('/') ? path : '/' + path) + (qs ? '?' + qs : '')
}

/** fetch con timeout, cookie, encabezado CSRF y errores JSON. Devuelve el JSON (o undefined en 204). */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET')
  const ctrl = new AbortController()
  const ms = opts.timeout ?? (opts.form ? 120_000 : 20_000)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, ms)
  const onAbort = () => ctrl.abort()
  opts.signal?.addEventListener('abort', onAbort)
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'MediSuite' }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(apiUrl(path, opts.query), { method, headers, body, credentials: 'same-origin', signal: ctrl.signal, cache: 'no-store' })
  } catch (e) {
    if (timedOut) throw new ApiError(0, 'timeout', 'El servidor no respondió a tiempo. Inténtalo de nuevo.')
    if (opts.signal?.aborted) throw e
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new ApiError(0, offline ? 'sin_conexion' : 'red', offline ? 'Sin conexión a internet: el cambio no se guardó.' : 'No se pudo conectar con el servidor.')
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
  if (res.ok) opts.onResponse?.(res)
  if (res.status === 204) return undefined as T
  const text = await res.text().catch(() => '')
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const d = (data && typeof data === 'object' ? data : {}) as { error?: string; message?: string }
    const err = new ApiError(res.status, d.error || 'http_' + res.status, d.message || MENSAJES[res.status] || `Error del servidor (${res.status}).`, data)
    if (res.status === 401 && !opts.noAuthRedirect) unauthorizedHandlers.forEach((h) => h(err))
    throw err
  }
  return data as T
}

// ---------- Detección de modo ----------
let mode: Mode | null = null
export function getMode(): Mode | null {
  return mode
}
export const isServer = () => mode === 'server'

let detecting: Promise<Mode> | null = null
/** GET /api/health (timeout 2.5 s). `{ app: 'medisuite' }` → servidor; si no, demo. Forzable con VITE_MODE=server|demo. */
export function detectMode(): Promise<Mode> {
  if (detecting) return detecting
  detecting = (async (): Promise<Mode> => {
    const forced = import.meta.env.VITE_MODE as string | undefined
    // Forzado (build:demo / despliegue con backend): no se consulta /api/health para decidir el modo.
    // Con VITE_MODE=server, si el servidor no responde, la sesión muestra «Servidor no disponible».
    if (forced === 'server' || forced === 'demo') return (mode = forced)
    try {
      const h = await api<{ app?: string }>('/health', { timeout: 2500, noAuthRedirect: true })
      mode = h && typeof h === 'object' && h.app === 'medisuite' ? 'server' : 'demo'
    } catch {
      mode = 'demo'
    }
    return mode
  })()
  return detecting
}

/** Descarga un archivo del API con la sesión (respeta Content-Disposition). */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(apiUrl(path), { headers: { 'X-Requested-With': 'MediSuite' }, credentials: 'same-origin', cache: 'no-store' }).catch(() => {
    throw new ApiError(0, 'red', 'No se pudo conectar con el servidor.')
  })
  if (!res.ok) {
    let d: { error?: string; message?: string } = {}
    try {
      d = await res.json()
    } catch {
      /* sin JSON */
    }
    const err = new ApiError(res.status, d.error || 'http_' + res.status, d.message || MENSAJES[res.status] || `Error del servidor (${res.status}).`, d)
    if (res.status === 401) unauthorizedHandlers.forEach((h) => h(err))
    throw err
  }
  const cd = res.headers.get('Content-Disposition') ?? ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="?([^";]+)"?/i.exec(cd)
  let name = fallbackName
  if (m) {
    try {
      name = decodeURIComponent(m[1])
    } catch {
      name = m[1]
    }
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Mensaje legible de cualquier error (ApiError o Error). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
