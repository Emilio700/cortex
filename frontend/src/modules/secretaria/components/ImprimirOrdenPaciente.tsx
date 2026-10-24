/**
 * «Imprimir orden de la paciente» en recepción, una por doctora (plan 26, M5).
 *
 * Un papel lleva la firma de una sola doctora: si la paciente tiene órdenes de
 * dos, el servidor responde 409 y recepción se quedaba sin salida. Aquí se
 * ofrece un botón por doctora. Con la doctora conocida se piden TODAS sus
 * órdenes pendientes de la paciente (`pendientes=true&doctor_id=`), no solo las
 * de la página que se ve (M5); sin `doctor_id`, las de la página, como antes.
 */
import BotonVistaPreviaOrden from '../../doctor/components/BotonVistaPreviaOrden'
import {
  nombreArchivoPaciente,
  obtenerPdfOrdenesDePaciente,
  obtenerPdfPendientesDePaciente,
} from '../../doctor/utils/ordenEstudioPdf'

export interface OrdenParaImprimir {
  order_id: number
  doctor_id?: number | null
  doctor_name?: string | null
}

interface Props {
  patientId: number
  patientName: string
  ordenes: OrdenParaImprimir[]
  dataTour?: string
  variant?: 'outline'
  color?: string
  /**
   * `'listadas'`: el papel lleva exactamente estas órdenes (en «Por entregar»,
   * las de hoy). `'pendientes'`: todas las pendientes de la paciente con esa
   * doctora, aunque no estén en la página (R2).
   */
  alcance?: 'listadas' | 'pendientes'
}

export const agruparPorDoctora = (ordenes: OrdenParaImprimir[]) => {
  const grupos = new Map<
    string,
    { doctorId: number | null; nombre: string | null; ids: number[] }
  >()
  for (const o of ordenes) {
    const clave = o.doctor_id != null ? String(o.doctor_id) : 'sin-doctora'
    const grupo = grupos.get(clave) ?? {
      doctorId: o.doctor_id ?? null,
      nombre: o.doctor_name ?? null,
      ids: [] as number[],
    }
    grupo.ids.push(o.order_id)
    grupos.set(clave, grupo)
  }
  return [...grupos.values()]
}

const ImprimirOrdenPaciente = ({
  patientId,
  patientName,
  ordenes,
  dataTour,
  variant,
  color,
  alcance = 'pendientes',
}: Props) => {
  if (ordenes.length === 0) return null
  const grupos = agruparPorDoctora(ordenes)
  const varias = grupos.length > 1
  return (
    <div className="d-flex flex-wrap gap-2">
      {grupos.map((grupo, i) => (
        <BotonVistaPreviaOrden
          key={grupo.nombre ?? i}
          etiqueta={
            alcance === 'listadas'
              ? varias
                ? `Imprimir orden de hoy de ${grupo.nombre ?? 'otra doctora'}`
                : 'Imprimir orden de hoy'
              : varias
                ? `Imprimir pendientes de ${grupo.nombre ?? 'otra doctora'}`
                : 'Imprimir pendientes de la paciente'
          }
          titulo={`Órdenes de estudio de ${patientName}${varias && grupo.nombre ? ` · ${grupo.nombre}` : ''}`}
          nombreArchivo={nombreArchivoPaciente(patientId)}
          obtener={(modo) =>
            alcance === 'pendientes' && grupo.doctorId != null
              ? obtenerPdfPendientesDePaciente(patientId, grupo.doctorId, modo)
              : obtenerPdfOrdenesDePaciente(patientId, grupo.ids, modo)
          }
          conModo
          orderIds={grupo.ids}
          variant={variant}
          color={color}
          dataTour={i === 0 ? dataTour : undefined}
        />
      ))}
    </div>
  )
}

export default ImprimirOrdenPaciente
