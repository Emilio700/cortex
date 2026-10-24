/**
 * Resumen clínico en PDF (plan 32, punto 8).
 *
 *   POST /patients/{id}/resumen-clinico/vista-previa  -> PDF sin folio
 *        Cabecera `X-Vista-Previa`: la constancia que pide la emisión.
 *   POST /patients/{id}/resumen-clinico              -> PDF con folio RES
 *        Cabecera `X-Folio`. 409 si la constancia no es de estas opciones o
 *        tiene más de 30 minutos.
 */
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'

export type SeccionResumen =
  | 'alergias'
  | 'antecedentes'
  | 'diagnosticos'
  | 'embarazo'
  | 'consultas'
  | 'estudios'
  | 'medicacion'

/** Mismas claves y mismo orden que el servidor (`SECCIONES`). */
export const SECCIONES_DEL_RESUMEN: { clave: SeccionResumen; nombre: string }[] = [
  { clave: 'alergias', nombre: 'Alergias' },
  { clave: 'antecedentes', nombre: 'Antecedentes' },
  { clave: 'diagnosticos', nombre: 'Diagnósticos activos' },
  { clave: 'embarazo', nombre: 'Embarazo' },
  { clave: 'consultas', nombre: 'Últimas consultas' },
  { clave: 'estudios', nombre: 'Estudios' },
  { clave: 'medicacion', nombre: 'Última receta' },
]

const errorLegible = async (err: any, respaldo: string): Promise<string> => {
  const datos = err?.response?.data
  if (datos instanceof Blob) {
    try {
      const cuerpo = JSON.parse(await datos.text())
      return mensajeDeError({ ...err, response: { ...err.response, data: cuerpo } }, respaldo)
    } catch {
      // Cuerpo que no es JSON: el mensaje por código basta.
    }
  }
  return mensajeDeError(err, respaldo)
}

export const pedirVistaPreviaResumen = async (
  patientId: number,
  secciones: SeccionResumen[],
  consultas: number,
): Promise<{ pdf: Blob; constancia: string }> => {
  try {
    const r = await apiClient.post(
      `/patients/${patientId}/resumen-clinico/vista-previa`,
      { secciones, consultas },
      { responseType: 'blob' },
    )
    const constancia = String(r.headers?.['x-vista-previa'] ?? '')
    if (!constancia) throw new Error('La vista previa llegó sin su constancia; vuelve a abrirla.')
    return { pdf: new Blob([r.data], { type: 'application/pdf' }), constancia }
  } catch (err) {
    if (!(err as any)?.isAxiosError && err instanceof Error) throw err
    throw new Error(await errorLegible(err, 'No se pudo generar la vista previa del resumen.'))
  }
}

export const emitirResumenClinico = async (
  patientId: number,
  secciones: SeccionResumen[],
  consultas: number,
  constancia: string,
): Promise<{ pdf: Blob; folio: string }> => {
  try {
    const r = await apiClient.post(
      `/patients/${patientId}/resumen-clinico`,
      { secciones, consultas, vista_previa: constancia },
      { responseType: 'blob' },
    )
    const folio = String(r.headers?.['x-folio'] ?? '')
    // Sin folio no hay emisión que anunciar.
    if (!folio) throw new Error('El servidor no confirmó el folio del resumen.')
    return { pdf: new Blob([r.data], { type: 'application/pdf' }), folio }
  } catch (err) {
    if (!(err as any)?.isAxiosError && err instanceof Error) throw err
    throw new Error(await errorLegible(err, 'No se pudo emitir el resumen.'))
  }
}
