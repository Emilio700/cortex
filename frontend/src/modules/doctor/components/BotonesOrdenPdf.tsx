/**
 * «Imprimir orden» de un solo estudio (O-01, plan 26 D-2).
 *
 * Decisión de Emilio: el médico imprime al final de la consulta y recepción
 * puede reimprimir. Ya no se imprime a ciegas: el botón abre la vista previa
 * con el PDF real y desde ahí se imprime o se descarga. En una orden cancelada,
 * rechazada o en borrador no se ofrece, porque el servidor no la imprime.
 */
import BotonVistaPreviaOrden from './BotonVistaPreviaOrden'
import { nombreArchivoOrden, obtenerPdfOrden, ordenImprimible } from '../utils/ordenEstudioPdf'

interface Props {
  orderId: number
  status: string
  etiqueta?: string
}

const BotonesOrdenPdf = ({ orderId, status, etiqueta = 'Imprimir orden' }: Props) => {
  if (!ordenImprimible(status)) return null
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
      <BotonVistaPreviaOrden
        etiqueta={etiqueta}
        titulo={`Orden de estudio n.º ${orderId}`}
        nombreArchivo={nombreArchivoOrden(orderId)}
        obtener={() => obtenerPdfOrden(orderId)}
        orderIds={[orderId]}
        variant="outline"
        dataTour="orden-pdf"
      />
    </div>
  )
}

export default BotonesOrdenPdf
