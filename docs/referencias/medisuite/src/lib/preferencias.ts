// Preferencias persistentes de negocio (plantillas, listas de precios, borradores…).
//
// - Modo servidor: /api/preferencias/:clave?scope=user|org (docs/api.md v1.1). `org` la leen todos y la
//   escriben admin y médico; `user` es privada de cada usuario. Se cachean en memoria (nunca en el navegador)
//   y se vuelven a leer en cada sincronización periódica para ver los cambios de los colegas.
// - Modo demo: localStorage de este navegador (como antes; `lsKey` conserva las claves antiguas).
//
// Uso:
//   const [precios, setPrecios, meta] = usePreferencia<Precio[]>('caja.precios', 'org', PRECIOS_BASE, { lsKey: 'medisuite.precios' })
//   meta.cargando · meta.puedeEscribir · meta.error
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { api, ApiError, errorMessage, isServer } from './api'
import { toast } from '../components/toast'
import type { Rol } from './types'

export type PrefScope = 'user' | 'org'

interface Entry {
  valor: unknown // undefined = aún no cargada
  cargada: boolean
  error?: string
  version: number // cambia en cada escritura local (para descartar lecturas viejas)
}

const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const enVuelo = new Map<string, Promise<void>>()
let gen = 0
let rolActual: Rol | null = null

const k = (clave: string, scope: PrefScope) => scope + ':' + clave
const emit = () => listeners.forEach((l) => l())
function setEntry(key: string, e: Partial<Entry>) {
  const prev = cache.get(key) ?? { valor: undefined, cargada: false, version: 0 }
  cache.set(key, { ...prev, ...e })
  emit()
}

/** Normaliza un fragmento variable (p. ej. un id de paciente) al alfabeto permitido de las claves `[a-z0-9._-]`. */
/** Alfabeto de claves que acepta el servidor (api/src/schemas.ts → PREF_KEY_RE). */
export const PREF_CLAVE_RE = /^[a-z0-9._-]{1,64}$/

export function claveSegura(s: string, max = 40): string {
  const base = s.toLowerCase().replace(/[^a-z0-9._-]/g, '_')
  if (base === s && base.length <= max) return s
  // si cambió (mayúsculas u otros caracteres) o es muy larga, se agrega un hash corto para no colisionar
  let h = 0
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  return base.slice(0, max - 8) + '-' + (h >>> 0).toString(36)
}

/** La sesión informa el rol actual (para saber si se puede escribir en scope `org`). */
export function setPrefRol(rol: Rol | null) {
  rolActual = rol
  emit()
}

export function puedeEscribirPref(scope: PrefScope): boolean {
  if (!isServer()) return true
  if (scope === 'user') return true
  return rolActual === 'admin' || rolActual === 'medico'
}

// ---------- Modo demo (localStorage) ----------
function lsLeer(lsKey: string): unknown {
  try {
    const raw = localStorage.getItem(lsKey)
    if (raw == null) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return raw // valores antiguos guardados como texto plano
    }
  } catch {
    return undefined
  }
}
function lsEscribir(lsKey: string, v: unknown) {
  try {
    if (v === undefined || v === null) localStorage.removeItem(lsKey)
    else localStorage.setItem(lsKey, JSON.stringify(v))
  } catch {
    /* sin almacenamiento */
  }
}

// ---------- Modo servidor ----------
const ruta = (clave: string) => '/preferencias/' + encodeURIComponent(clave)

function cargar(clave: string, scope: PrefScope, force = false): Promise<void> {
  const key = k(clave, scope)
  const e = cache.get(key)
  if (!force && e?.cargada) return Promise.resolve()
  const vuelo = enVuelo.get(key)
  if (vuelo) return vuelo
  const g = gen
  const ver = e?.version ?? 0
  const p = api<{ valor: unknown }>(ruta(clave), { query: { scope } })
    .then((r) => {
      if (g !== gen) return
      const cur = cache.get(key)
      // si hubo una escritura local mientras se leía (o hay una pendiente), gana lo local
      if (cur && (cur.version !== ver || timers.has(key))) return setEntry(key, { cargada: true })
      setEntry(key, { valor: r?.valor ?? null, cargada: true, error: undefined })
    })
    .catch((err) => {
      if (g !== gen) return
      if (err instanceof ApiError && err.status === 401) return
      setEntry(key, { cargada: true, error: errorMessage(err), valor: cache.get(key)?.valor ?? null })
    })
    .finally(() => enVuelo.delete(key))
  enVuelo.set(key, p)
  return p
}

function guardarRemoto(clave: string, scope: PrefScope, prev: unknown) {
  const key = k(clave, scope)
  clearTimeout(timers.get(key))
  const g = gen
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      const valor = cache.get(key)?.valor
      const req =
        valor === undefined || valor === null
          ? api(ruta(clave), { method: 'DELETE', query: { scope } })
          : api(ruta(clave), { method: 'PUT', query: { scope }, body: { valor } })
      req.catch((err) => {
        if (g !== gen || (err instanceof ApiError && err.status === 401)) return
        toast(err instanceof ApiError && err.status === 403 ? 'Tu rol no puede cambiar esta configuración compartida de la clínica.' : errorMessage(err), 'danger', {
          title: 'No se guardó la preferencia',
        })
        setEntry(key, { valor: prev, version: (cache.get(key)?.version ?? 0) + 1 })
      })
    }, 400),
  )
}

/** Vuelve a leer del servidor las preferencias ya cargadas (sincronización periódica). */
export function refreshPreferencias() {
  if (!isServer()) return
  for (const key of cache.keys()) {
    if (timers.has(key)) continue
    const i = key.indexOf(':')
    cargar(key.slice(i + 1), key.slice(0, i) as PrefScope, true)
  }
}

/** Al cerrar sesión: olvida todo (no deben quedar datos del usuario anterior). */
export function clearPreferencias() {
  gen++
  timers.forEach((t) => clearTimeout(t))
  timers.clear()
  enVuelo.clear()
  cache.clear()
  rolActual = null
  emit()
}

/** Lee una preferencia (para usar fuera de React). Devuelve `undefined` si aún no se carga. */
export async function leerPreferencia<T>(clave: string, scope: PrefScope, opts: { lsKey?: string } = {}): Promise<T | null> {
  if (!isServer()) return (lsLeer(opts.lsKey ?? 'medisuite.pref.' + clave) as T) ?? null
  await cargar(clave, scope)
  return (cache.get(k(clave, scope))?.valor as T) ?? null
}

export interface PrefMeta {
  cargando: boolean
  puedeEscribir: boolean
  error?: string
  /** true si el valor viene del servidor/localStorage (false = se está usando `inicial`). */
  guardada: boolean
}

/**
 * Preferencia persistente. `null` o `undefined` al escribir borra la preferencia.
 * `inicial` se usa mientras carga o si no existe. `lsKey`: clave de localStorage en modo demo.
 */
export function usePreferencia<T>(
  clave: string | null,
  scope: PrefScope,
  inicial: T,
  opts: { lsKey?: string } = {},
): [T, (v: T | null | ((prev: T) => T | null)) => void, PrefMeta] {
  const server = isServer()
  if (import.meta.env.DEV && clave && !PREF_CLAVE_RE.test(clave)) console.error(`usePreferencia: clave inválida «${clave}» (el servidor solo acepta ${PREF_CLAVE_RE})`)
  const lsKey = clave ? (opts.lsKey ?? 'medisuite.pref.' + clave) : ''
  const key = clave ? k(clave, scope) : ''

  // en demo se sirve del mismo caché (iniciado desde localStorage) para que todos los componentes lo compartan
  if (clave && !server && !cache.has(key)) cache.set(key, { valor: lsLeer(lsKey) ?? null, cargada: true, version: 0 })

  const entry = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => (key ? cache.get(key) : undefined),
  )
  // rol (re-render cuando cambia)
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => rolActual,
  )

  useEffect(() => {
    if (clave && server) void cargar(clave, scope)
  }, [clave, scope, server])

  const set = useCallback(
    (v: T | null | ((prev: T) => T | null)) => {
      if (!clave) return
      const cur = cache.get(key)
      const prevValor = cur?.valor
      const base = (prevValor ?? inicial) as T
      const next = typeof v === 'function' ? (v as (p: T) => T | null)(base) : v
      setEntry(key, { valor: next ?? null, cargada: true, version: (cur?.version ?? 0) + 1 })
      if (!server) return lsEscribir(lsKey, next)
      if (!puedeEscribirPref(scope)) {
        toast('Tu rol no puede cambiar esta configuración compartida de la clínica.', 'warn')
        setEntry(key, { valor: prevValor ?? null, version: (cache.get(key)?.version ?? 0) + 1 })
        return
      }
      guardarRemoto(clave, scope, prevValor ?? null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave, key, scope, server, lsKey],
  )

  const valor = entry?.valor
  const guardada = valor !== undefined && valor !== null
  return [
    (guardada ? valor : inicial) as T,
    set,
    { cargando: !!clave && server && !entry?.cargada, puedeEscribir: puedeEscribirPref(scope), error: entry?.error, guardada },
  ]
}
