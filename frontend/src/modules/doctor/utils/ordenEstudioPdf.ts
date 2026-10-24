/**
 * PDF de la orden de estudio (O-01).
 *
 * El servidor lo genera en `GET /clinical-tracking/orders/{id}/pdf` (contrato en
 * `docs/auditoria/avance/agente-a.md`). Desde el plan 26 (D-2) nada se imprime
 * a ciegas: el PDF se muestra en la vista previa (`VistaPreviaOrden`) y desde
 * ahí se imprime o se descarga.
 */
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'

/**
 * Estados en los que el servidor no imprime (responde 409): la orden no se
 * emitió o el médico ya no la quiere. El botón ni se ofrece.
 */
export const ESTADOS_SIN_IMPRESION = new Set(['draft', 'cancelled', 'rejected'])

export const ordenImprimible = (status: string): boolean => !ESTADOS_SIN_IMPRESION.has(status)

/**
 * Con `responseType: 'blob'` el cuerpo de un error también llega como Blob, así
 * que el `detail` del servidor («Esta orden está cancelada…») no se veía y
 * quedaba el genérico por código. Se lee el Blob antes de traducir.
 */
const leerTexto = (blob: Blob): Promise<string> =>
  typeof blob.text === 'function'
    ? blob.text()
    : new Promise((resolver, fallar) => {
        const lector = new FileReader()
        lector.onload = () => resolver(String(lector.result))
        lector.onerror = () => fallar(lector.error)
        lector.readAsText(blob)
      })

const errorLegible = async (err: any): Promise<string> => {
  const datos = err?.response?.data
  if (datos instanceof Blob) {
    try {
      const cuerpo = JSON.parse(await leerTexto(datos))
      return mensajeDeError({ ...err, response: { ...err.response, data: cuerpo } }, 'No se pudo generar el PDF de la orden.')
    } catch {
      // Cuerpo que no es JSON: el mensaje por código basta.
    }
  }
  return mensajeDeError(err, 'No se pudo generar el PDF de la orden.')
}

/** Pide el PDF. Lanza un Error con el mensaje en español si no se generó. */
export const obtenerPdfOrden = async (orderId: number): Promise<Blob> => {
  try {
    const respuesta = await apiClient.get(`/clinical-tracking/orders/${orderId}/pdf`, { responseType: 'blob' })
    return new Blob([respuesta.data], { type: 'application/pdf' })
  } catch (err) {
    throw new Error(await errorLegible(err))
  }
}

/**
 * Cómo se reparte el papel con varios estudios (plan 26, D-2): una hoja por
 * destino físico (laboratorio, imagen y gabinete, otros), para que el paciente
 * entregue cada una donde va, o todo seguido en una sola hoja.
 */
export type ModoImpresion = 'separado' | 'una_hoja'

export const MODOS_DE_IMPRESION: ReadonlyArray<{ valor: ModoImpresion; etiqueta: string }> = [
  { valor: 'separado', etiqueta: 'Separado por destino' },
  { valor: 'una_hoja', etiqueta: 'Todo en una hoja' },
]

/**
 * Pide un PDF de varias órdenes. Sin `modo` el servidor usa el que el médico
 * autora fijó en su perfil; por eso no se manda un valor inventado.
 */
const pedirPdf = async (ruta: string, params: Record<string, string>): Promise<PdfConOrdenes> => {
  try {
    const respuesta = await apiClient.get(ruta, {
      responseType: 'blob',
      ...(Object.keys(params).length ? { params } : {}),
    })
    return pdfDeRespuesta(respuesta)
  } catch (err) {
    throw new Error(await errorLegible(err))
  }
}

const conModo = (modo?: ModoImpresion | null): Record<string, string> => (modo ? { modo } : {})

/**
 * PDF de la orden agrupada (O-02): un solo papel con todos los estudios del
 * lote. Los estudios cancelados o en borrador no salen; si no queda ninguno el
 * servidor responde 409 y aquí se lanza su motivo tal cual.
 */
export const obtenerPdfOrdenAgrupada = (groupId: number, modo?: ModoImpresion | null): Promise<PdfConOrdenes> =>
  pedirPdf(`/clinical-tracking/order-groups/${groupId}/pdf`, conModo(modo))

/** Papel consolidado de una consulta: todos sus estudios, folio `C-{cita}` (plan 26, §3.2). */
export const obtenerPdfOrdenesDeConsulta = (
  appointmentId: number,
  modo?: ModoImpresion | null,
): Promise<PdfConOrdenes> => pedirPdf(`/clinical-tracking/appointments/${appointmentId}/orders/pdf`, conModo(modo))

/**
 * Papel de varias órdenes de un paciente, aunque no sean de la misma consulta
 * (p. ej. «Imprimir orden del paciente» en la bandeja o en recepción).
 */
export const obtenerPdfOrdenesDePaciente = (
  patientId: number,
  orderIds: number[],
  modo?: ModoImpresion | null,
): Promise<PdfConOrdenes> =>
  pedirPdf(`/clinical-tracking/patients/${patientId}/orders/pdf`, {
    order_ids: orderIds.join(','),
    ...conModo(modo),
  })

export const nombreArchivoOrden = (orderId: number) => `Orden_de_estudio_${orderId}.pdf`

/**
 * Nombre del papel de varias órdenes mientras el servidor no dice su folio.
 *
 * Antes se armaba aquí con `G-{id}` o `C-{cita}`, pero desde los folios
 * homologados (plan 32) el papel imprime `GYG-ORD-2026-0118`: el archivo
 * descargado prometía un folio que no era el del papel. Ahora el nombre real
 * llega con el PDF (`folioDeRespuesta`); este es el neutro, sin folio.
 */
export const NOMBRE_PAPEL_SIN_FOLIO = 'Orden_de_estudios.pdf'

export const nombreArchivoOrdenAgrupada = (_groupId?: number) => NOMBRE_PAPEL_SIN_FOLIO

export const nombreArchivoConsulta = (_appointmentId?: number) => NOMBRE_PAPEL_SIN_FOLIO

export const nombreArchivoPaciente = (_patientId?: number) => NOMBRE_PAPEL_SIN_FOLIO

type Cabeceras = Record<string, unknown> | undefined

const cabecera = (headers: Cabeceras, nombre: string): string => {
  if (!headers) return ''
  const h = headers as { get?: (n: string) => unknown } & Record<string, unknown>
  const valor = typeof h.get === 'function' ? h.get(nombre) : h[nombre] ?? h[nombre.toLowerCase()]
  return valor == null ? '' : String(valor).trim()
}

/**
 * El folio con el que el servidor imprimió el papel: `X-Folio`, o el que trae
 * el nombre de `Content-Disposition` (`Orden_de_estudios_{folio}.pdf`). Si no
 * llega ninguno, `null`: la interfaz no inventa uno.
 */
export const folioDeRespuesta = (headers: Cabeceras): { folio: string | null; nombreArchivo: string | null } => {
  const directo = cabecera(headers, 'x-folio')
  const disposicion = cabecera(headers, 'content-disposition')
  const archivo = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposicion)?.[1]?.trim() || null
  const delArchivo = archivo ? /^Orden_de_estudios?_(.+)\.pdf$/i.exec(archivo)?.[1] ?? null : null
  const folio = directo || delArchivo
  const nombreArchivo = archivo ?? (folio ? `Orden_de_estudios_${folio}.pdf` : null)
  return { folio: folio || null, nombreArchivo }
}

const pdfDeRespuesta = (respuesta: { data: BlobPart; headers?: Cabeceras }): PdfConOrdenes => {
  const ids = cabecera(respuesta.headers, 'x-order-ids')
  const orderIds = ids
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  return {
    pdf: new Blob([respuesta.data], { type: 'application/pdf' }),
    orderIds,
    ...folioDeRespuesta(respuesta.headers),
  }
}

/**
 * Registra en la bitácora que se imprimió o descargó un papel de órdenes (plan
 * 26, M2). Abrir la vista previa ya no cuenta como impresión: el servidor solo
 * anota que generó el PDF. Esto se llama al pulsar Imprimir o Descargar.
 *
 * Devuelve `null` si quedó registrado o un aviso si no; nunca lanza, porque la
 * bitácora no debe impedir que el paciente se lleve su orden.
 */
export const registrarImpresion = async (
  orderIds: number[],
  accion: 'impreso' | 'descargado',
  folio?: string,
): Promise<string | null> => {
  if (orderIds.length === 0) return null
  try {
    await apiClient.post('/clinical-tracking/orders/print-record', {
      order_ids: orderIds,
      accion,
      ...(folio ? { folio } : {}),
    })
    return null
  } catch {
    return accion === 'impreso'
      ? 'Se abrió la impresión, pero no quedó anotada en la bitácora.'
      : 'Se descargó el PDF, pero no quedó anotado en la bitácora.'
  }
}

/** Un PDF con las órdenes que el servidor metió en él (cabecera `X-Order-Ids`). */
export interface PdfConOrdenes {
  pdf: Blob
  /** Vacío si el servidor no lo dijo: entonces cuentan las que conoce la pantalla. */
  orderIds: number[]
  /** El folio impreso en el papel, si el servidor lo dijo. */
  folio?: string | null
  /** El nombre de descarga que dio el servidor, con ese folio. */
  nombreArchivo?: string | null
}

/**
 * Papel con TODAS las órdenes pendientes del paciente con un médico, sin
 * depender de la página que se ve (plan 26, M5): `?pendientes=true&doctor_id=`.
 * El servidor dice cuáles imprimió en `X-Order-Ids`; con esos se anota la
 * impresión en la bitácora.
 */
export const obtenerPdfPendientesDePaciente = async (
  patientId: number,
  doctorId: number,
  modo?: ModoImpresion | null,
): Promise<PdfConOrdenes> => {
  try {
    const respuesta = await apiClient.get(`/clinical-tracking/patients/${patientId}/orders/pdf`, {
      responseType: 'blob',
      params: { pendientes: 'true', doctor_id: String(doctorId), ...conModo(modo) },
    })
    return pdfDeRespuesta(respuesta)
  } catch (err) {
    throw new Error(await errorLegible(err))
  }
}
