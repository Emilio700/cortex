/**
 * Carga una sola vez el catalogo de estudios del laboratorio con el que
 * trabaja el consultorio. Son 16 grupos: cabe de sobra en memoria y se filtra
 * del lado del cliente sin pegarle al backend en cada tecla.
 */
import { useEffect, useState } from 'react'
import apiClient from '../../../shared/services/api'
import type { CatalogoEstudios, GrupoEstudios } from '../utils/catalogoEstudios'

export function useCatalogoEstudios() {
  const [grupos, setGrupos] = useState<GrupoEstudios[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    apiClient
      .get<CatalogoEstudios>('/catalogo-estudios')
      .then((resp) => {
        if (vigente) setGrupos(resp.data?.grupos || [])
      })
      .catch(() => {
        // Sin catalogo el doctor sigue pudiendo escribir el estudio a mano.
        if (vigente) setGrupos([])
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [])

  return { grupos, cargando }
}
