/**
 * ENTRADA TEMPORAL del origen «radiografía» en Neuro 3D.
 *
 * El selector visible «Origen del modelo» (esquemático · radiografía · TC) lo
 * construye el tramo TC en `componentes/SelectorOrigen.tsx`. Mientras no esté en
 * esta rama, esto ofrece las dos opciones que existen aquí. Al integrar con TC se
 * borra y la opción «radiografía» se conecta a su selector (ver COORDINACION.md).
 *
 * Igual que pide el contrato: si no hay ajuste de radiografía, la opción queda
 * deshabilitada y dice por qué.
 */
import { CButton, CButtonGroup } from '@coreui/react-pro'
import { Link } from 'react-router-dom'
import type { OrigenModelo } from '../dominio/origenModelo'

interface Props {
  origen: OrigenModelo
  alCambiar: (o: OrigenModelo) => void
  /** Por qué no se puede elegir «radiografía»; `null` si se puede. */
  razonSinRadiografia: string | null
  /** A dónde ir para marcar radiografías, si el médico puede hacerlo. */
  rutaMarcado: string | null
}

export default function OrigenTemporalRx({ origen, alCambiar, razonSinRadiografia, rutaMarcado }: Props) {
  return (
    <div className="rx-origen" data-tour="atlas-origen">
      <span className="small fw-semibold" id="rx-origen-titulo">Origen del modelo</span>
      <CButtonGroup role="group" aria-labelledby="rx-origen-titulo" size="sm">
        <CButton color={origen === 'esquematico' ? 'primary' : 'secondary'} variant={origen === 'esquematico' ? undefined : 'outline'} aria-pressed={origen === 'esquematico'} onClick={() => alCambiar('esquematico')}>
          Esquemático
        </CButton>
        <CButton
          color={origen === 'radiografia' ? 'primary' : 'secondary'}
          variant={origen === 'radiografia' ? undefined : 'outline'}
          aria-pressed={origen === 'radiografia'}
          disabled={razonSinRadiografia !== null}
          onClick={() => alCambiar('radiografia')}
        >
          Desde radiografía
        </CButton>
      </CButtonGroup>
      {razonSinRadiografia && <span className="rx-origen__razon">{razonSinRadiografia}</span>}
      {rutaMarcado && (
        <Link to={rutaMarcado} className="btn btn-sm btn-outline-primary" data-tour="atlas-marcar-rx">
          Marcar radiografías
        </Link>
      )}
    </div>
  )
}
