/**
 * El rastro de cada estudio, con fecha y autor (plan 32, punto 3, decisión 3).
 *
 * Leyendas chicas y grises, para que no compitan con la acción, en hora de
 * Mazatlán. Donde el pasado no guardó quién, dice «sin registro»: no se
 * inventa. Con un toque se despliega la línea de tiempo completa, que se pide
 * al servidor solo entonces.
 */
import { useState } from 'react'
import { CSpinner } from '@coreui/react-pro'

import { apiClient } from '../../../shared/services/api'
import { formatearFechaISO, formatearInstante } from '../../../shared/utils/date'
import { mensajeDeError } from '../../../shared/utils/errors'
import type { DiagnosticResult } from '../types/clinicalTracking'
import './rastroDeEstudio.css'

const CANALES: Record<string, string> = { en_mano: 'En mano', llamada: 'Llamada', whatsapp: 'WhatsApp', correo: 'Correo' }

/** «3 oct 2026, 18:42» en hora del consultorio, como lo pidió Emilio. */
export const cuandoCorto = (iso?: string | null) =>
  formatearInstante(
    iso,
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    'sin fecha',
  )

const autor = (nombre?: string | null) => nombre || 'sin registro'

export interface EventoRastro {
  tipo: string
  titulo: string
  cuando?: string | null
  solo_fecha?: boolean
  autor?: string | null
  detalle?: string | null
}

interface RastroRespuesta {
  order_id: number
  ultima_actualizacion?: EventoRastro | null
  eventos: EventoRastro[]
}

/** «Última actualización: 3 oct 2026, 18:42 · Jhoany», y su línea de tiempo. */
export function LeyendaUltimaActualizacion({
  orderId,
  cuando,
  por,
}: {
  orderId: number
  cuando?: string | null
  por?: string | null
}) {
  const [abierto, setAbierto] = useState(false)
  const [rastro, setRastro] = useState<RastroRespuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idLinea = `rastro-${orderId}`

  const alternar = async () => {
    const abrir = !abierto
    setAbierto(abrir)
    if (!abrir || rastro) return
    setError(null)
    try {
      setRastro((await apiClient.get<RastroRespuesta>(`/clinical-tracking/orders/${orderId}/rastro`)).data)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar el historial del estudio.'))
    }
  }

  if (!cuando) return null
  return (
    <div className="rastro">
      <span className="rastro__leyenda">
        Última actualización: {cuandoCorto(cuando)} · {autor(por)}
      </span>{' '}
      <button
        type="button"
        className="rastro__ver"
        aria-expanded={abierto}
        aria-controls={idLinea}
        onClick={() => void alternar()}
        data-tour="bandeja-rastro"
      >
        {abierto ? 'Ocultar historial' : 'Ver historial'}
      </button>
      {abierto && (
        <div id={idLinea} className="rastro__linea">
          {error ? (
            <span className="text-danger" role="alert">{error}</span>
          ) : !rastro ? (
            <CSpinner size="sm" aria-label="Cargando el historial" />
          ) : (
            <ol className="rastro__eventos">
              {rastro.eventos.map((e, i) => (
                <li key={`${e.tipo}-${i}`} className={`rastro__evento rastro__evento--${e.tipo}`}>
                  <span className="rastro__titulo">{e.titulo}</span>{' '}
                  <span className="rastro__meta">
                    {e.solo_fecha ? formatearFechaISO(e.cuando) : cuandoCorto(e.cuando)} · {autor(e.autor)}
                  </span>
                  {e.detalle && <span className="rastro__detalle"> · {e.detalle}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

/** Las leyendas de un resultado: subido, escrito, editado, revisado, comunicado. */
export function LeyendasDeResultado({ resultado: r }: { resultado: DiagnosticResult }) {
  const lineas: string[] = [
    `${r.patient_document_id ? 'Subido' : 'Capturado'} el ${cuandoCorto(r.created_at)} por ${autor(r.recorded_by_nombre)}`,
  ]
  if (r.interpretacion_escrita_at) {
    lineas.push(`Escrito el ${cuandoCorto(r.interpretacion_escrita_at)} por ${autor(r.interpretacion_escrita_por_nombre)}`)
  } else if (r.clinician_interpretation) {
    lineas.push('Interpretación escrita: sin registro de cuándo ni quién')
  }
  if (r.interpretacion_editada_at) {
    lineas.push(`Editado el ${cuandoCorto(r.interpretacion_editada_at)} por ${autor(r.interpretacion_editada_por_nombre)}`)
  }
  if (r.reviewed_at) lineas.push(`Revisado el ${cuandoCorto(r.reviewed_at)} por ${autor(r.reviewed_by_nombre)}`)
  if (r.communicated_at) {
    const canal = r.communication_channel ? ` · ${CANALES[r.communication_channel] ?? r.communication_channel}` : ''
    lineas.push(`Comunicado el ${cuandoCorto(r.communicated_at)} por ${autor(r.communicated_by_nombre)}${canal}`)
  }
  return (
    <ul className="rastro__leyendas" aria-label="Rastro del resultado">
      {lineas.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  )
}
