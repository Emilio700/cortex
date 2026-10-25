/**
 * Axios HTTP client configuration
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { olvidarPestanas } from '../tabs/almacenPestanas'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

/**
 * Dirección de `/health`, que vive fuera de `/api/v1`. Pedirlo con `apiClient`
 * daba 404 y el panel de Master decía «API fuera de línea» siempre (plan 29).
 */
export const URL_DE_SALUD = `${API_BASE_URL.replace(/\/$/, '')}/health`

// The backend mounts every router under /api/v1 (see app/main.py); only
// /health and / stay unprefixed. Every call site in this app goes through
// this single apiClient instance, so the prefix only needs to be set here.
const API_V1_PREFIX = '/api/v1'
// Avoid double slashes when API_BASE_URL ends with '/'
const BASE_URL_WITH_PREFIX = API_BASE_URL.endsWith('/')
  ? `${API_BASE_URL}api/v1`
  : `${API_BASE_URL}${API_V1_PREFIX}`

/**
 * Cabecera con la que el backend anuncia la version de permisos de la sesion.
 * Debe coincidir con ``PERMISSIONS_VERSION_HEADER`` del backend. Axios entrega
 * los nombres de cabecera en minusculas.
 */
export const PERMISSIONS_VERSION_HEADER = 'x-permissions-version'

/**
 * Quien quiere enterarse de que los permisos de la sesion cambiaron.
 *
 * Vive aqui porque este interceptor es el unico punto por el que pasan todas
 * las respuestas del API: asi cualquier accion de la usuaria sirve de disparo,
 * sin encuestar al servidor cada tantos segundos. Lo registra AuthContext, que
 * es quien sabe con que version se calculo el menu que hay en pantalla.
 */
type PermissionsVersionListener = (version: number) => void
let permissionsVersionListener: PermissionsVersionListener | null = null

export const setPermissionsVersionListener = (listener: PermissionsVersionListener | null): void => {
  permissionsVersionListener = listener
}

const notifyPermissionsVersion = (headers: unknown): void => {
  if (!permissionsVersionListener || !headers) return
  const raw = (headers as Record<string, unknown>)[PERMISSIONS_VERSION_HEADER]
  if (raw === undefined || raw === null) return
  const version = Number(raw)
  if (!Number.isFinite(version)) return
  permissionsVersionListener(version)
}

/**
 * Axios instance with base configuration
 */
export const apiClient = axios.create({
  baseURL: BASE_URL_WITH_PREFIX,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Plain axios instance (no interceptors) used only for the refresh call
// itself, so a failed refresh can never recursively trigger another refresh
// attempt through apiClient's own response interceptor below.
const refreshClient = axios.create({ baseURL: BASE_URL_WITH_PREFIX })

// Coalesces concurrent 401s into a single in-flight refresh request instead
// of firing one refresh call per failed request.
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) {
    throw new Error('No refresh token available')
  }
  const response = await refreshClient.post('/auth/refresh', { refresh_token: refreshToken })
  const { access_token, refresh_token } = response.data
  localStorage.setItem('access_token', access_token)
  localStorage.setItem('refresh_token', refresh_token)
  return access_token
}

function redirectToLogin(): void {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  // Las pestañas de esta cuenta no pasan a la siguiente que entre aquí.
  olvidarPestanas()
  window.location.href = '/#/login'
}

/**
 * Request interceptor to add JWT token
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

/**
 * Response interceptor: on a 401 from an expired access token, transparently
 * refresh it once and retry the original request. Login itself is excluded
 * (a 401 there means "wrong credentials", not "expired token" - retrying
 * with a refresh makes no sense and there's usually no refresh token stored
 * yet anyway). If the refresh itself fails, fall back to the previous
 * behavior: clear storage and send the user to the login screen.
 */
apiClient.interceptors.response.use(
  (response) => {
    notifyPermissionsVersion(response.headers)
    return response
  },
  async (error: AxiosError) => {
    // Tambien en el camino de error: revocar un permiso suele manifestarse
    // justo como un 403, y ese es el momento en que la pantalla mas necesita
    // enterarse de que sus permisos quedaron viejos.
    notifyPermissionsVersion(error.response?.headers)
    const originalRequest = error.config as RetryableRequestConfig | undefined
    const isLoginRequest = originalRequest?.url?.includes('/auth/login')
      || originalRequest?.url?.includes('/auth/mfa/')

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isLoginRequest) {
      originalRequest._retry = true
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null
          })
        }
        const newAccessToken = await refreshPromise
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        redirectToLogin()
        return Promise.reject(refreshError)
      }
    }

    if (error.response?.status === 401 && !isLoginRequest) {
      redirectToLogin()
    }

    return Promise.reject(error)
  },
)

export default apiClient
