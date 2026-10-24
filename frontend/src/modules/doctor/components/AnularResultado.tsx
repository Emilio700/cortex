/**
 * «Anular resultado» desde la orden (plan 29, lote 9).
 *
 * El archivo equivocado ligado a una orden no se borra: se anula con motivo,
 * junto con su documento, y después se sube el correcto. Solo el médico que
 * pidió el estudio o la administración; el servidor lo decide y aquí solo se
 * dice su respuesta.
 *
 * Regla de oro (plan 22): el mensaje dice exactamente lo que el servidor hizo
 * con la orden y con la incidencia crítica, no lo que la pantalla supone.
 */
import { useState } from 'react'
import { CAlert, CButton, CFormTextarea, CSpinner } from '@coreui/react-pro'
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import { etiquetaEstadoVisible } from '../utils/etiquetasOrden'
import type {
  AnulacionDeResultado,
  DiagnosticResult,
  OrdenEnBandeja,
} from '../types/clinicalTracking'

/** La orden como quedó según el servidor: sin el resultado anulado. */
export const ordenTrasAnular = (
  orden: OrdenEnBandeja,
  hecho: AnulacionDeResultado,
): OrdenEnBandeja => {
  const results = orden.results.filter((r) => r.id !== hecho.result_id)
  const abierta = hecho.incidencia === 'sigue_abierta'
  return {
    ...orden,
    results,
    status: hecho.order_status,
    estado_visible: hecho.estado_visible,
    comunicada: results.some((r) => Boolean(r.communicated_at)),
    critico_sin_comunicar: abierta,
    incidencia_abierta: abierta,
  }
}

/** Lo que dice el aviso: el estado de la orden y la incidencia, tal como contestó el servidor. */
export const mensajeTrasAnular = (estudio: string, hecho: AnulacionDeResultado): string => {
  const partes = [
    hecho.documento_anulado
      ? `${estudio}: se anuló el resultado y su archivo.`
      : `${estudio}: se anuló el resultado.`,
  ]
  const estado = etiquetaEstadoVisible(hecho.estado_visible)
  if (hecho.resultados_vigentes === 0) {
    partes.push(
      `La orden volvió a «${estado}»: ya no tiene resultados. Sube el correcto con «Anexar archivo del resultado».`,
    )
  } else {
    const otros =
      hecho.resultados_vigentes === 1
        ? 'otro resultado vigente'
        : `otros ${hecho.resultados_vigentes} resultados vigentes`
    partes.push(`La orden sigue en «${estado}» porque tiene ${otros}.`)
  }
  if (hecho.incidencia === 'cerrada') {
    partes.push('La incidencia crítica quedó cerrada por resultado anulado.')
  } else if (hecho.incidencia === 'sigue_abierta') {
    partes.push('La incidencia crítica sigue abierta: otro resultado de esta orden es crítico.')
  }
  return partes.join(' ')
}

interface Props {
  orden: OrdenEnBandeja
  resultado: DiagnosticResult
  deshabilitado?: boolean
  onAnulado: (orden: OrdenEnBandeja, mensaje: string) => void
}

const AnularResultado = ({ orden, resultado, deshabilitado, onAnulado }: Props) => {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idMotivo = `anular-motivo-${resultado.id}`

  if (!abierto) {
    return (
      <CButton
        type="button"
        size="sm"
        color="danger"
        variant="ghost"
        className="px-0"
        disabled={deshabilitado}
        onClick={() => setAbierto(true)}
        data-tour="resultado-anular"
      >
        Anular resultado…
      </CButton>
    )
  }

  const anular = async () => {
    if (motivo.trim().length < 3) {
      setError('Escribe por qué se anula el resultado.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const { data } = await apiClient.post<AnulacionDeResultado>(
        `/clinical-tracking/results/${resultado.id}/anular`,
        { motivo: motivo.trim() },
      )
      onAnulado(ordenTrasAnular(orden, data), mensajeTrasAnular(orden.study_name, data))
    } catch (err) {
      // El motivo del servidor puede ser genérico; lo que importa aquí es que
      // nada cambió, y eso se dice siempre.
      setError(
        `${mensajeDeError(err, 'No se pudo anular el resultado.')} El resultado sigue vigente.`,
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className="border border-danger rounded p-2 mt-2 bg-body"
      role="group"
      aria-labelledby={`${idMotivo}-titulo`}
    >
      <div id={`${idMotivo}-titulo`} className="fw-semibold">
        Anular este resultado
      </div>
      <p className="mb-2">
        Úsalo si el archivo es de otro paciente o de otro estudio. El resultado y su archivo dejan
        de contar en la bandeja y en la gráfica; no se borran. Después sube el correcto.
      </p>
      {error && (
        <CAlert color="danger" className="py-2" role="alert">
          {error}
        </CAlert>
      )}
      <CFormTextarea
        id={idMotivo}
        rows={2}
        label="Motivo (obligatorio)"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        invalid={Boolean(error) && motivo.trim().length < 3}
        maxLength={500}
      />
      <div className="d-flex gap-2 mt-2 flex-wrap">
        <CButton
          type="button"
          color="danger"
          size="sm"
          disabled={enviando}
          onClick={() => void anular()}
        >
          {enviando ? <CSpinner size="sm" /> : 'Anular resultado'}
        </CButton>
        <CButton
          type="button"
          color="light"
          size="sm"
          disabled={enviando}
          onClick={() => {
            setAbierto(false)
            setMotivo('')
            setError(null)
          }}
        >
          No anular
        </CButton>
      </div>
    </div>
  )
}

export default AnularResultado
