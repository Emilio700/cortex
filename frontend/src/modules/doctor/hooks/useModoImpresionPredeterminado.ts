/**
 * Modo de impresión de órdenes que la doctora fijó en su perfil (plan 26, D-7).
 *
 * Solo la doctora tiene perfil: para recepción se devuelve `null` y el PDF se
 * pide sin `modo`, así el servidor usa el de la doctora autora de la orden. Se
 * guarda en memoria para no pedir el perfil cada vez que se abre una vista
 * previa; al guardar el perfil se actualiza. La memoria es **de una usuaria**:
 * al cerrar sesión o entrar otra (la misma computadora del consultorio) se
 * descarta, para no imprimir con la preferencia de otra doctora (M4).
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../../../shared/services/api'
import { useAuth } from '../../../shared/context/AuthContext'
import type { ModoImpresion } from '../utils/ordenEstudioPdf'

let enMemoria: ModoImpresion | null | undefined
let pendiente: Promise<ModoImpresion | null> | null = null
/** De quién es lo que está en memoria. */
let duena: number | null = null

const asegurarDuena = (userId: number | null) => {
  if (duena === userId) return
  duena = userId
  enMemoria = undefined
  pendiente = null
}

const leer = (): Promise<ModoImpresion | null> => {
  if (pendiente) return pendiente
  const peticion: Promise<ModoImpresion | null> = apiClient
    .get('/doctor-profile/me')
    .then((r) => {
      const valor = r.data?.order_settings?.modo_impresion
      const modo: ModoImpresion | null = valor === 'separado' || valor === 'una_hoja' ? valor : null
      enMemoria = modo
      return modo
    })
    .catch(() => {
      // Sin perfil no se inventa un modo: el servidor decide.
      pendiente = null
      return null
    })
  pendiente = peticion
  return peticion
}

/** Lo llama el perfil al guardar, para que la siguiente vista previa ya lo use. */
export const recordarModoImpresion = (modo: ModoImpresion | null) => {
  enMemoria = modo
  pendiente = Promise.resolve(modo)
}

/** Solo para pruebas. */
export const olvidarModoImpresion = () => {
  enMemoria = undefined
  pendiente = null
  duena = null
}

/**
 * `listo` dice si ya se sabe el modo: mientras se lee el perfil no se pide el
 * PDF, para no generarlo dos veces (una sin modo y otra con el del perfil).
 */
export const useModoImpresionPredeterminado = (
  activo = true,
): { modo: ModoImpresion | null; listo: boolean } => {
  const { user } = useAuth() as { user?: { role?: string; id?: number } | null }
  const esDoctora = user?.role === 'doctor'
  const userId = user?.id ?? null
  asegurarDuena(userId)
  const [modo, setModo] = useState<ModoImpresion | null>(enMemoria ?? null)
  const [listo, setListo] = useState(enMemoria !== undefined)

  useEffect(() => {
    if (!activo || !esDoctora) return
    asegurarDuena(userId)
    let vigente = true
    void leer().then((m) => {
      if (!vigente) return
      setModo(m)
      setListo(true)
    })
    return () => {
      vigente = false
    }
  }, [activo, esDoctora, userId])

  return esDoctora ? { modo, listo } : { modo: null, listo: true }
}
