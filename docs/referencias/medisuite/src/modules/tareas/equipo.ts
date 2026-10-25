// Usuario actual y lista del equipo para asignar tareas.
// - Modo servidor: el usuario de la sesión y GET /api/users/asignables (cualquier rol: solo id, nombre y rol de los activos).
//   Un servidor anterior sin ese endpoint responde 404: admin cae a /api/users y los demás asignan con texto libre.
// - Modo demo: no hay login; «yo» es el médico configurado en Ajustes.
import { useEffect, useState } from 'react'
import { api, ApiError, isServer } from '../../lib/api'
import { useSession } from '../../lib/session'
import { useSettings } from '../../lib/store'
import type { User } from '../../lib/types'
import type { Usuario } from './tareas'

// Caché por usuario de la sesión (otra sesión → otra organización posible).
let cache: { clave: string; us: Usuario[] } | null = null
let enVuelo: { clave: string; p: Promise<Usuario[]> } | null = null

async function cargarEquipo(esAdmin: boolean): Promise<Usuario[]> {
  try {
    const us = await api<{ id: string; nombre: string; rol: string }[]>('/users/asignables')
    return us.map((u) => ({ id: u.id, nombre: u.nombre }))
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404) || !esAdmin) return []
    const us = await api<User[]>('/users').catch((): User[] => [])
    return us.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }))
  }
}

export function useEquipo(): {
  yo: Usuario | null
  usuarios: Usuario[] | null
} {
  const ses = useSession()
  const settings = useSettings()
  const server = isServer()
  const clave = server && ses.user ? ses.user.id : ''
  const esAdmin = ses.user?.rol === 'admin'
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(clave && cache?.clave === clave ? cache.us : null)

  useEffect(() => {
    if (!clave) return setUsuarios(null)
    if (cache?.clave === clave) return setUsuarios(cache.us.length ? cache.us : null)
    let vivo = true
    if (enVuelo?.clave !== clave) {
      const p = cargarEquipo(esAdmin).then((us) => {
        cache = { clave, us }
        return us
      })
      enVuelo = { clave, p }
      p.finally(() => {
        if (enVuelo?.p === p) enVuelo = null
      })
    }
    enVuelo.p.then((us) => vivo && setUsuarios(us.length ? us : null))
    return () => {
      vivo = false
    }
  }, [clave, esAdmin])

  const yo: Usuario | null = server ? (ses.user ? { id: ses.user.id, nombre: ses.user.nombre } : null) : settings.doctor.nombre ? { nombre: settings.doctor.nombre } : null
  return { yo, usuarios }
}
