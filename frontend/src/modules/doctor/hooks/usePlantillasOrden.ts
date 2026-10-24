/**
 * Plantillas de orden que precargan estudios (O-03).
 *
 * Son de sólo lectura y genéricas (no tocan ningún expediente). El médico
 * elige una, se copian sus estudios al formulario de la orden agrupada (O-02) y
 * ella revisa, edita y confirma. La plantilla no crea nada por sí sola.
 */
import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'

export interface PlantillaResumen {
  clave: string
  nombre: string
  descripcion: string
  num_estudios: number
}

export interface PlantillaEstudio {
  category: string
  study_name: string
  catalog_code?: string | null
  specimen_or_body_site?: string | null
  preparation_instructions?: string | null
}

export interface PlantillaDetalle {
  clave: string
  nombre: string
  descripcion: string
  indicacion_sugerida: string
  estudios: PlantillaEstudio[]
}

export const usePlantillasOrden = (habilitado: boolean) => {
  const [plantillas, setPlantillas] = useState<PlantillaResumen[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!habilitado) return
    let vigente = true
    apiClient
      .get<{ plantillas: PlantillaResumen[] }>('/clinical-tracking/order-templates')
      .then((resp) => {
        if (vigente) setPlantillas(resp.data.plantillas || [])
      })
      .catch(() => {
        // Sin plantillas el médico sigue armando la orden a mano.
        if (vigente) setPlantillas([])
      })
    return () => {
      vigente = false
    }
  }, [habilitado])

  /** Trae una plantilla con sus estudios. Lanza un Error con mensaje si falla. */
  const cargarDetalle = useCallback(async (clave: string): Promise<PlantillaDetalle> => {
    setError(null)
    try {
      const resp = await apiClient.get<PlantillaDetalle>(
        `/clinical-tracking/order-templates/${clave}`,
      )
      return resp.data
    } catch (err) {
      const mensaje = mensajeDeError(err, 'No se pudo cargar la plantilla.')
      setError(mensaje)
      throw new Error(mensaje)
    }
  }, [])

  return { plantillas, error, cargarDetalle }
}
