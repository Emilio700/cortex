/**
 * «Ver en 3D» en el encabezado del visor (feat/render-volumetrico).
 *
 * Abre el render volumétrico de la serie que se está viendo. Sólo se habilita
 * cuando la serie forma un volumen (TC o RM con cortes suficientes, paralelos y
 * de espaciado uniforme); si no, queda deshabilitado y **dice por qué** en el
 * texto, no sólo en un tooltip que en una tableta no se ve.
 *
 * La serie va en la ruta y no en `?serie=`: las pestañas recortan la consulta.
 */
import { Link } from 'react-router-dom'
import { CButton } from '@coreui/react-pro'

import type { ManifiestoSerie, SerieDicom } from '../dominio/tipos'
import { elegibilidad3D } from '../dominio/volumen3d'

export function rutaDelVolumen3D(patientId: number | string, estudioId: number | string, serieId: number): string {
  return `/pacientes/${patientId}/estudios/${estudioId}/3d/${serieId}`
}

interface Props {
  patientId: number | string
  estudioId: number | string
  serie: SerieDicom
  /** El manifiesto de la serie; `null` mientras carga. */
  manifiesto: ManifiestoSerie | null
}

export default function BotonVer3D({ patientId, estudioId, serie, manifiesto }: Props) {
  const previa = elegibilidad3D(serie)
  const final = previa.apta && manifiesto ? elegibilidad3D(serie, manifiesto) : previa
  const revisando = previa.apta && !manifiesto

  if (final.apta && !revisando) {
    return (
      <div className="visor-modelo3d" data-tour="visor-ver-3d">
        <Link
          className="btn btn-sm btn-outline-primary"
          to={rutaDelVolumen3D(patientId, estudioId, serie.id)}
          title="Pinta el estudio en volumen: hueso, vasos con contraste, piel. Sin mediciones."
        >
          Ver en 3D
        </Link>
      </div>
    )
  }

  const motivo = revisando ? 'Revisando la serie…' : !final.apta ? final.motivo : ''
  return (
    <div className="visor-modelo3d" data-tour="visor-ver-3d">
      <CButton size="sm" color="primary" variant="outline" disabled aria-describedby="visor-ver-3d-motivo">
        Ver en 3D
      </CButton>
      <span id="visor-ver-3d-motivo" className="visor-modelo3d__texto">
        {revisando ? motivo : `Sin 3D: ${motivo}`}
      </span>
    </div>
  )
}
