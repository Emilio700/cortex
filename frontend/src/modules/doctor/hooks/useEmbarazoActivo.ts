/**
 * Embarazo activo de un paciente, resumido para mostrarlo en la consulta.
 *
 * «No tiene embarazo activo» y «no se pudo consultar» no son lo mismo (plan
 * 29, C-2): antes un fallo dejaba `embarazo` en null y la consulta se veía
 * igual que la de un paciente no embarazada, sin semanas de gestación ni
 * sugerencia de próxima revisión. Ahora el fallo queda en `error` y la
 * pantalla lo dice. Un 403 (rol sin lectura prenatal) no es un fallo: no le
 * toca ver ese dato y no se le dice nada.
 */
import { useCallback, useEffect, useState } from 'react'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import type { Pregnancy, PregnancyCollection } from '../types/prenatal'
import { resumirEmbarazo, type ResumenEmbarazo } from '../utils/embarazo'

interface EstadoEmbarazoActivo {
  /** Embarazo activo del paciente, si lo hay. */
  embarazo: Pregnancy | null
  /** Edad gestacional y próxima revisión sugerida; null si no hay datación. */
  resumen: ResumenEmbarazo | null
  cargando: boolean
  /** No se pudo consultar; `null` si se consultó (haya o no embarazo). */
  error: string | null
  recargar: () => Promise<void>
}

export const useEmbarazoActivo = (patientId?: number): EstadoEmbarazoActivo => {
  const [embarazo, setEmbarazo] = useState<Pregnancy | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!patientId) {
      setEmbarazo(null)
      setError(null)
      return
    }
    setCargando(true)
    try {
      const response = await apiClient.get<PregnancyCollection>(
        `/prenatal/patient/${patientId}/pregnancies?status=active`,
      )
      // Una respuesta sin la lista no se lee como «sin embarazo».
      if (!Array.isArray(response.data?.items)) throw new Error('Respuesta sin la lista de embarazos.')
      setEmbarazo(response.data.items[0] ?? null)
      setError(null)
    } catch (err: any) {
      setEmbarazo(null)
      setError(
        err?.response?.status === 403
          ? null
          : mensajeDeError(err, 'No se pudo consultar si el paciente tiene un embarazo activo.'),
      )
    } finally {
      setCargando(false)
    }
  }, [patientId])

  useEffect(() => {
    void recargar()
  }, [recargar])

  return { embarazo, resumen: resumirEmbarazo(embarazo), cargando, error, recargar }
}
