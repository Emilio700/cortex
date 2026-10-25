// Sesión de usuario (modo servidor) y permisos por rol.
// En modo demo no hay login: `can()` siempre es verdadero y no hay usuario.
import { useSyncExternalStore } from 'react'
import type { Org, Rol, User } from './types'
import { api, ApiError, getMode, onUnauthorized, type Mode } from './api'
import { clearServer, loadServer, ready, refreshServer, setReadableCollections } from './store'
import type { CollectionName } from './types'
import { clearMensajes } from './mensajes'
import { clearPreferencias, refreshPreferencias, setPrefRol } from './preferencias'

export type SessionStatus = 'init' | 'anon' | 'loading' | 'ready' | 'error' | 'offline' // offline: servidor no disponible
export interface SessionState {
  mode: Mode | null
  status: SessionStatus
  user: User | null
  org: Org | null
  message: string | null // aviso para la pantalla de login (sesión expirada, cerrada por inactividad…)
  error?: string // error al cargar los datos
}

let s: SessionState = { mode: null, status: 'init', user: null, org: null, message: null }
const listeners = new Set<() => void>()
function set(patch: Partial<SessionState>) {
  s = { ...s, ...patch }
  listeners.forEach((l) => l())
}
export const getSession = () => s
export function useSession(): SessionState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => s,
  )
}

export const ROL_LABEL: Record<Rol, string> = { admin: 'Administrador', medico: 'Médico', recepcion: 'Recepción', enfermeria: 'Enfermería' }

// ---------- Permisos (espejo de la matriz de docs/api.md; el servidor es quien decide) ----------
export type Perm =
  | 'clinico.ver' // notas, signos, recetas, línea de tiempo
  | 'notas.escribir' // crear/editar/firmar notas y adendas
  | 'obs.escribir' // signos, escalas, calculadoras…
  | 'recetas.escribir'
  | 'pacientes.borrar'
  | 'pacientes.clinico' // antecedentes, notas, medicamentos actuales
  | 'pagos.ver'
  | 'pagos.escribir'
  | 'citas.escribir'
  | 'config.escribir' // clínica y servicios
  | 'perfil.escribir' // perfil del médico
  | 'usuarios'
  | 'bitacora'
  | 'exportar'

const PERMS: Record<Rol, Perm[]> = {
  admin: ['clinico.ver', 'pacientes.borrar', 'pacientes.clinico', 'pagos.ver', 'pagos.escribir', 'citas.escribir', 'config.escribir', 'perfil.escribir', 'usuarios', 'bitacora', 'exportar'],
  medico: ['clinico.ver', 'notas.escribir', 'obs.escribir', 'recetas.escribir', 'pacientes.clinico', 'pagos.ver', 'citas.escribir', 'perfil.escribir'],
  enfermeria: ['clinico.ver', 'obs.escribir', 'pacientes.clinico'],
  recepcion: ['pagos.ver', 'pagos.escribir', 'citas.escribir'],
}

/** ¿El usuario actual puede…? En modo demo, todo (excepto lo que solo existe en servidor). */
export function can(p: Perm, user: User | null = s.user): boolean {
  if (getMode() !== 'server') return !['usuarios', 'bitacora', 'exportar'].includes(p)
  if (!user) return false
  return PERMS[user.rol]?.includes(p) ?? false
}
/** Hook reactivo de `can` (se re-renderiza al cambiar de usuario). */
export function useCan(p: Perm): boolean {
  const ses = useSession()
  return can(p, ses.user)
}

// ---------- Ciclo de vida ----------
let pollTimer: ReturnType<typeof setInterval> | undefined
let lastActivity = Date.now()
export const getLastActivity = () => lastActivity
export function touchActivity() {
  lastActivity = Date.now()
}

function startPolling() {
  stopPolling()
  // Refresca cada 60 s mientras la pestaña está visible y el usuario estuvo activo en los últimos 10 min
  // (si no, las lecturas automáticas renovarían la sesión del servidor indefinidamente).
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastActivity < 10 * 60_000) {
      refreshServer()
      refreshPreferencias()
    }
  }, 60_000)
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    if (s.status === 'ready' && s.mode === 'server') refreshServer()
  })
  const act = () => (lastActivity = Date.now())
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, act, { passive: true, capture: true })
  let mm = 0
  window.addEventListener(
    'mousemove',
    () => {
      const now = Date.now()
      if (now - mm > 5000) lastActivity = mm = now
    },
    { passive: true },
  )
}

// `registros` lo leen todos los roles: el servidor filtra por tipo (src/lib/registros.ts).
const LEE: Partial<Record<Rol, CollectionName[]>> = {
  recepcion: ['patients', 'appointments', 'documents', 'payments', 'registros'],
  enfermeria: ['patients', 'appointments', 'encounters', 'observations', 'prescriptions', 'documents', 'registros'],
}

// Claves antiguas de localStorage (antes de /api/preferencias) que pueden contener datos clínicos o de la clínica.
// En modo servidor no deben quedar en el navegador: se borran al iniciar y al cerrar sesión.
const LEGADO_RE = /^medisuite\.(anatomia\.|telemed\.|recetasTipo$|precios$|odontograma\.precios$|pref\.)/
export function limpiarLegadoLocal(tambienActivo = false) {
  try {
    const borrar: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (LEGADO_RE.test(k) || (tambienActivo && k === 'medisuite.activePatient'))) borrar.push(k)
    }
    borrar.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* sin almacenamiento */
  }
}

async function afterLogin(user: User, org: Org) {
  limpiarLegadoLocal()
  setReadableCollections(LEE[user.rol] ?? null)
  setPrefRol(user.rol)
  set({ status: 'loading', user, org, message: null, error: undefined })
  try {
    await loadServer()
    touchActivity()
    set({ status: 'ready' })
    startPolling()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return
    set({ status: 'error', error: (e as Error).message })
  }
}

/** Arranque: detecta el modo y, en servidor, si ya hay sesión (cookie). */
export async function boot() {
  await ready
  const mode = getMode()
  if (mode !== 'server') return set({ mode, status: 'ready' })
  set({ mode })
  try {
    const me = await api<{ user: User; org: Org }>('/auth/me', { noAuthRedirect: true })
    await afterLogin(me.user, me.org)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) set({ status: 'anon' })
    // sin red, proxy caído o API reiniciándose: pantalla «Servidor no disponible» (nunca se cae a modo demo)
    else if (e instanceof ApiError && (e.status === 0 || e.status >= 502 || e.code === 'http_404')) set({ status: 'offline', message: e.message })
    else set({ status: 'anon', message: (e as Error).message })
  }
}

export async function retryLoad() {
  if (s.user && s.org) await afterLogin(s.user, s.org)
}

/** Inicia sesión. Lanza ApiError (credenciales_invalidas, totp_requerido, cuenta_bloqueada…). */
export async function login(email: string, password: string, totp?: string) {
  const r = await api<{ user: User; org: Org }>('/auth/login', { method: 'POST', body: { email, password, ...(totp ? { totp } : {}) }, noAuthRedirect: true })
  await afterLogin(r.user, r.org)
}

function endSession(message: string | null) {
  stopPolling()
  clearServer()
  clearPreferencias()
  limpiarLegadoLocal(true)
  clearMensajes()
  set({ status: 'anon', user: null, org: null, message, error: undefined })
}

export async function logout(message: string | null = null) {
  try {
    await api('/auth/logout', { method: 'POST', noAuthRedirect: true, timeout: 5000 })
  } catch {
    /* aunque falle, se borra todo localmente */
  }
  endSession(message)
}

/** Actualiza los datos del usuario actual (p. ej. tras activar 2FA). */
export function patchUser(patch: Partial<User>) {
  if (s.user) set({ user: { ...s.user, ...patch } })
}

/** Renueva la sesión del servidor (botón "Seguir conectado"). */
export async function keepAlive() {
  touchActivity()
  const me = await api<{ user: User; org: Org }>('/auth/me')
  set({ user: me.user, org: me.org })
}

onUnauthorized(() => {
  if (s.status === 'ready' || s.status === 'loading' || s.status === 'error') endSession('Tu sesión expiró. Vuelve a iniciar sesión para continuar donde te quedaste.')
})
