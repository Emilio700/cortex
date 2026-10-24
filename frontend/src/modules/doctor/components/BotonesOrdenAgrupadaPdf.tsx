/**
 * «Imprimir orden» de un lote de estudios (O-02, plan 26 D-2).
 *
 * Pide el papel único del lote (`GET /order-groups/{id}/pdf`) y lo muestra en
 * la vista previa, donde se elige si va separado por destino o en una hoja.
 */
import BotonVistaPreviaOrden from './BotonVistaPreviaOrden'
import { nombreArchivoOrdenAgrupada, obtenerPdfOrdenAgrupada } from '../utils/ordenEstudioPdf'

interface Props {
  groupId: number
  /** Cuántos estudios lleva el lote, para que el botón diga cuánto se imprime. */
  numEstudios?: number
  /** Órdenes del lote, para anotar la impresión real en la bitácora (M2). */
  orderIds?: number[]
}

const BotonesOrdenAgrupadaPdf = ({ groupId, numEstudios, orderIds }: Props) => (
  <BotonVistaPreviaOrden
    etiqueta={
      numEstudios ? `Imprimir orden (${numEstudios} estudios, 1 papel)` : 'Imprimir orden agrupada'
    }
    titulo="Orden de estudios del lote"
    nombreArchivo={nombreArchivoOrdenAgrupada(groupId)}
    obtener={(modo) => obtenerPdfOrdenAgrupada(groupId, modo)}
    conModo
    orderIds={orderIds}
    folio={`G-${groupId}`}
    dataTour="orden-agrupada-pdf"
  />
)

export default BotonesOrdenAgrupadaPdf
