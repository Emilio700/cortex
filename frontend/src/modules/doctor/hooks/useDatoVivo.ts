/**
 * Un dato del inicio que se carga, se refresca y falla por su cuenta (plan 28, §4.5).
 *
 * - Mientras no se sabe nada: `datos === null` y `cargando`. La pantalla pinta
 *   un esqueleto o «—», nunca «0».
 * - Un refresco que falla **no borra** lo que ya se mostraba: deja los datos y
 *   pone `error`, para que la sección diga «No se pudo actualizar (hace 3 min)».
 *   Una foto vieja sin aviso es la falla F-7 del plan 27.
 * - Si dos cargas se cruzan (un `focus` y el temporizador), gana la última que
 *   se pidió, no la última que contestó.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { mensajeDeError } from '../../../shared/utils/errors'

export interface DatoVivo<T> {
  datos: T | null
  error: string | null
  cargando: boolean
  /** Cuándo llegó la última respuesta buena. */
  actualizadoEn: Date | null
  recargar: () => Promise<void>
}

export const useDatoVivo = <T,>(
  cargar: () => Promise<T>,
  { habilitado = true, mensaje = 'No se pudo cargar.' } = {},
): DatoVivo<T> => {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(habilitado)
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null)
  const funcion = useRef(cargar)
  funcion.current = cargar
  const turno = useRef(0)

  const recargar = useCallback(async () => {
    if (!habilitado) return
    const mio = ++turno.current
    setCargando(true)
    try {
      const valor = await funcion.current()
      if (mio !== turno.current) return
      setDatos(valor)
      setError(null)
      setActualizadoEn(new Date())
    } catch (err) {
      if (mio !== turno.current) return
      setError(mensajeDeError(err, mensaje))
    } finally {
      if (mio === turno.current) setCargando(false)
    }
  }, [habilitado, mensaje])

  useEffect(() => {
    void recargar()
  }, [recargar])

  return { datos, error, cargando, actualizadoEn, recargar }
}
