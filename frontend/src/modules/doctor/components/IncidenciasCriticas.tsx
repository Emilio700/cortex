/**
 * Incidencias críticas abiertas, en el inicio del médico (plan 26, D-3 y D-8).
 *
 * Antes marcar «Resultado crítico» solo pintaba un badge (B-6). Decisión de
 * Emilio: un resultado valorado «Crítico» aparece aquí como incidencia de la
 * doctora autora y se queda hasta que se cierra, de una de dos maneras: se
 * documenta que se le comunicó o entregó al paciente (con el medio), o la
 * doctora lo revisa dentro de una consulta del paciente. Revisarlo desde la
 * bandeja no la cierra (D-8). No se manda ninguna notificación
 * que pueda decir «se avisó» sin haberse avisado: lo que se ve es lo que el
 * servidor tiene abierto (`GET /clinical-tracking/critical-results`).
 *
 * Sin incidencias no se pinta nada. Si no se pudo consultar, se dice: un fallo
 * nunca se muestra como «no hay críticos».
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilWarning } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import { formatearFechaISO, formatearInstante } from '../../../shared/utils/date'
import VisorDocumentos, { archivoDeDocumento } from '../../../shared/components/VisorDocumentos'
import { EVENTO_RESULTADOS_ACTUALIZADOS } from '../hooks/useResultadosSinRevisar'
import { pedirFiltroBandeja } from '../utils/filtroBandeja'

export interface IncidenciaCritica {
  result_id: number
  order_id: number
  patient_id: number
  patient_name: string
  study_name: string
  review_status: string
  resulted_on?: string | null
  created_at: string
  patient_document_id?: number | null
  document_file_name?: string | null
  document_mime_type?: string | null
}

const VISIBLES = 5

interface Props {
  /**
   * Datos que ya trae quien la monta (el inicio del médico, plan 28): así
   * la franja y el indicador de resultados cuentan lo mismo y se refrescan
   * juntos. Sin esto, la tarjeta pide sus datos por su cuenta, como siempre.
   */
  controlado?: {
    datos: { items: IncidenciaCritica[]; total: number } | null
    error: string | null
    recargar: () => void
  }
}

const IncidenciasCriticas = ({ controlado }: Props = {}) => {
  const navigate = useNavigate()
  const [itemsPropios, setItems] = useState<IncidenciaCritica[]>([])
  const [totalPropio, setTotal] = useState(0)
  const [errorPropio, setError] = useState<string | null>(null)
  const [viendo, setViendo] = useState<IncidenciaCritica | null>(null)

  const cargar = useCallback(async () => {
    try {
      const { data } = await apiClient.get<{ items: IncidenciaCritica[]; total: number }>(
        '/clinical-tracking/critical-results',
      )
      // Una respuesta sin la forma esperada no se lee como «cero críticos».
      if (!Array.isArray(data?.items) || typeof data?.total !== 'number') {
        throw new Error('La respuesta de resultados críticos no trae el total.')
      }
      setItems(data.items)
      setTotal(data.total)
      setError(null)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo consultar si hay resultados críticos.'))
    }
  }, [])

  useEffect(() => {
    if (controlado) return
    void cargar()
    // Al revisar en la bandeja la incidencia se cierra: se vuelve a preguntar.
    const alCambiar = () => void cargar()
    window.addEventListener(EVENTO_RESULTADOS_ACTUALIZADOS, alCambiar)
    window.addEventListener('focus', alCambiar)
    return () => {
      window.removeEventListener(EVENTO_RESULTADOS_ACTUALIZADOS, alCambiar)
      window.removeEventListener('focus', alCambiar)
    }
    // `controlado` no cambia de sentido durante la vida del componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar])

  const items = controlado ? (controlado.datos?.items ?? []) : itemsPropios
  const total = controlado ? (controlado.datos?.total ?? 0) : totalPropio
  // Con datos anteriores, un refresco fallido no tapa la lista: la lista sigue
  // y el aviso de no actualizado lo da el encabezado del inicio.
  const error = controlado ? (controlado.datos ? null : controlado.error) : errorPropio
  const reintentar = () => (controlado ? controlado.recargar() : void cargar())

  if (error) {
    return (
      <div className="hf-card mb-4" data-tour="doctora-criticos" role="alert">
        <div
          className="hf-section-header"
          style={{ padding: '1rem 1.25rem', gap: 12, flexWrap: 'wrap' }}
        >
          <div style={{ color: 'var(--hf-red)', fontSize: '0.9rem' }}>
            {error} Puede que tengas resultados críticos sin cerrar.
          </div>
          <CButton color="secondary" variant="outline" size="sm" onClick={reintentar}>
            Reintentar
          </CButton>
        </div>
      </div>
    )
  }

  if (total === 0) return null

  return (
    <div className="hf-card mb-4 border border-danger" data-tour="doctora-criticos">
      <div
        className="hf-section-header"
        style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--hf-border-light)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CIcon icon={cilWarning} style={{ color: 'var(--hf-red)' }} />
          <h5 className="mb-0">
            {total === 1
              ? '1 resultado crítico sin cerrar'
              : `${total} resultados críticos sin cerrar`}
          </h5>
          <div className="w-100 small" style={{ color: 'var(--hf-text-tertiary)' }}>
            Se cierran al documentar que se le comunicó o entregó al paciente, o al revisarlos
            dentro de una consulta suya.
          </div>
        </div>
        <CButton
          color="danger"
          size="sm"
          onClick={() => {
            pedirFiltroBandeja('criticos')
            navigate('/doctor/results')
          }}
        >
          Verlos en la bandeja
        </CButton>
      </div>
      {items.slice(0, VISIBLES).map((item) => (
        <div
          key={item.result_id}
          className="d-flex flex-wrap align-items-center gap-2"
          style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--hf-border-light)' }}
        >
          <div className="flex-grow-1">
            <div className="fw-semibold">{item.patient_name}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--hf-text-tertiary)' }}>
              {item.study_name} · Orden n.º {item.order_id}
              {item.resulted_on
                ? ` · reporte del ${formatearFechaISO(item.resulted_on)}`
                : ` · recibido el ${formatearInstante(item.created_at, { dateStyle: 'medium' })}`}
            </div>
          </div>
          {item.patient_document_id && (
            <CButton size="sm" color="secondary" variant="outline" onClick={() => setViendo(item)}>
              Ver archivo
            </CButton>
          )}
        </div>
      ))}
      {total > VISIBLES && (
        <div style={{ padding: '0.75rem 1.25rem', fontSize: '0.85rem' }}>
          Y {total - VISIBLES} más en la bandeja.
        </div>
      )}
      <VisorDocumentos
        visible={viendo !== null}
        onClose={() => setViendo(null)}
        titulo={viendo ? `${viendo.patient_name}: ${viendo.study_name}` : ''}
        archivos={
          viendo?.patient_document_id
            ? [
                archivoDeDocumento(
                  viendo.patient_document_id,
                  viendo.document_file_name,
                  viendo.document_mime_type,
                ),
              ]
            : []
        }
      />
    </div>
  )
}

export default IncidenciasCriticas
