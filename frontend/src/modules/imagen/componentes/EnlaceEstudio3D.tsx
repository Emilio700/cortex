/**
 * «Ver el estudio en 3D» desde Neuro 3D (feat/render-volumetrico).
 *
 * Neuro 3D enseña un modelo (esquemático o reconstruido); este enlace lleva al
 * estudio mismo pintado en volumen. Busca la TC o RM más reciente del paciente
 * con una serie que pueda formar un volumen y, si no hay, no pinta nada: un
 * enlace que lleva a «no se puede» sólo estorba.
 *
 * Vive en el módulo de imagen para que Neuro 3D sólo tenga que pintarlo.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ordenarSeries } from '../dominio/tipos'
import { elegibilidad3D } from '../dominio/volumen3d'
import { estudiosApi } from '../servicios/estudiosApi'
import { rutaDelVolumen3D } from './BotonVer3D'

/** Cuántos estudios se revisan como máximo (del más reciente al más antiguo). */
const ESTUDIOS_A_REVISAR = 3

export default function EnlaceEstudio3D({ patientId }: { patientId: number }) {
  const [ruta, setRuta] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    setRuta(null)
    const buscar = async () => {
      try {
        const estudios = await estudiosApi.listar(patientId)
        const candidatos = (Array.isArray(estudios) ? estudios : [])
          .filter((e) => ['CT', 'MR'].includes((e.modality || '').toUpperCase()) && e.instance_count > 0)
          .slice(0, ESTUDIOS_A_REVISAR)
        for (const estudio of candidatos) {
          const detalle = await estudiosApi.detalle(estudio.id)
          const serie = ordenarSeries(detalle.series ?? []).find((s) => elegibilidad3D(s).apta)
          if (serie) {
            if (vigente) setRuta(rutaDelVolumen3D(patientId, estudio.id, serie.id))
            return
          }
        }
      } catch {
        // Si no se puede consultar, no se ofrece el enlace: Neuro 3D sigue igual.
      }
    }
    void buscar()
    return () => {
      vigente = false
    }
  }, [patientId])

  if (!ruta) return null
  return (
    <Link className="btn btn-light" to={ruta} data-tour="atlas-estudio-3d">
      Ver el estudio en 3D
    </Link>
  )
}
