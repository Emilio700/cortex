// Estado del servidor (GET /api/health v1.1): servicios configurados (WhatsApp, correo, PAC), almacenamiento y programador.
// Se cachea en memoria; `refreshHealth()` vuelve a pedirlo.
import { useEffect, useSyncExternalStore } from 'react'
import { api, isServer } from './api'

export interface Health {
  app: string
  version?: string
  db?: string
  storage?: { tipo: 'disk' | 's3' | string; estado: 'ok' | 'error' | string }
  scheduler?: { activo: boolean; ultimaEjecucion?: string; ultimosEnviados?: number; error?: string }
  servicios?: { whatsapp?: boolean; correo?: boolean; pac?: boolean }
}

let health: Health | null = null
let cargando: Promise<void> | null = null
const listeners = new Set<() => void>()

export function refreshHealth(): Promise<void> {
  if (!isServer()) return Promise.resolve()
  if (cargando) return cargando
  cargando = api<Health>('/health', { noAuthRedirect: true, timeout: 8000 })
    .then((h) => {
      health = h && typeof h === 'object' ? h : null
    })
    .catch(() => {
      /* se conserva el último valor */
    })
    .finally(() => {
      cargando = null
      listeners.forEach((l) => l())
    })
  return cargando
}

/** Estado del servidor (null mientras carga o en modo demo). */
export function useHealth(): Health | null {
  const h = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => health,
  )
  useEffect(() => {
    if (!health) void refreshHealth()
  }, [])
  return h
}

/** ¿El servicio está configurado? `undefined` = aún no se sabe (se asume que sí y se maneja el 503). */
export function useServicio(s: 'whatsapp' | 'correo' | 'pac'): boolean | undefined {
  const h = useHealth()
  return h?.servicios?.[s]
}
