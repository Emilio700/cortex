/**
 * «3 archivos parecen resultados sin orden — ligarlos» (plan 32, punto 6).
 *
 * Antes de este cambio el modal de Documentos guardaba «Resultado de
 * Laboratorio» sin ligarlo a nada (C4). Aquí el médico los liga a su orden
 * pendiente o los marca como estudio de otro lugar. Discreto: una línea, y
 * nada se cambia solo. El archivo no se mueve ni se copia.
 */
import { useCallback, useEffect, useState } from 'react'
import { CAlert, CButton, CFormInput, CFormLabel, CFormSelect, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle, CSpinner } from '@coreui/react-pro'

import { apiClient } from '../../shared/services/api'
import { mensajeDeError } from '../../shared/utils/errors'
import { formatearFechaISO, formatearInstante } from '../../shared/utils/date'
import type { OrdenPendienteResultado } from '../secretaria/hooks/useOrdenesResultado'

interface DocumentoSinOrden {
  id: number
  title: string
  file_name: string
  created_at: string
  lab_name?: string | null
}

export default function AvisoResultadosSinOrden({ patientId, onLigado }: { patientId: number; onLigado: () => void }) {
  const [docs, setDocs] = useState<DocumentoSinOrden[]>([])
  const [abierto, setAbierto] = useState(false)
  const [ordenes, setOrdenes] = useState<OrdenPendienteResultado[]>([])
  const [eleccion, setEleccion] = useState<Record<number, string>>({})
  const [nombres, setNombres] = useState<Record<number, string>>({})
  const [guardando, setGuardando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const { data } = await apiClient.get<DocumentoSinOrden[]>(`/clinical-tracking/patients/${patientId}/resultados-sin-orden`)
      setDocs(data)
    } catch {
      // Es un aviso de apoyo: si no se pudo leer, no se inventa nada ni se estorba.
      setDocs([])
    }
  }, [patientId])
  useEffect(() => { void cargar() }, [cargar])

  const abrir = async () => {
    setAbierto(true)
    setError(null)
    try {
      const { data } = await apiClient.get('/clinical-tracking/orders/awaiting-result', { params: { patient_id: patientId, limit: 100 } })
      setOrdenes(data.items)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar sus órdenes pendientes.'))
    }
  }

  const ligar = async (doc: DocumentoSinOrden) => {
    const valor = eleccion[doc.id] ?? ''
    const cuerpo = valor === 'externo'
      ? { externo_study_name: (nombres[doc.id] ?? '').trim() }
      : { order_id: Number(valor) }
    setGuardando(doc.id)
    setError(null)
    try {
      await apiClient.post(`/clinical-tracking/documents/${doc.id}/ligar`, cuerpo)
      setDocs((d) => d.filter((x) => x.id !== doc.id))
      onLigado()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo ligar el archivo.'))
    } finally {
      setGuardando(null)
    }
  }

  if (docs.length === 0) return null
  return (
    <>
      <div className="aviso-sin-orden" role="status" data-tour="expediente-sin-orden">
        {docs.length === 1 ? '1 archivo parece un resultado sin orden.' : `${docs.length} archivos parecen resultados sin orden.`}{' '}
        <button type="button" className="expediente-enlace" onClick={() => void abrir()}>Ligarlos</button>
      </div>
      <CModal visible={abierto} onClose={() => guardando === null && setAbierto(false)} alignment="center" size="lg"
        aria-labelledby="sin-orden-titulo">
        <CModalHeader>
          <CModalTitle as="h2" className="h5" id="sin-orden-titulo">Resultados sin orden</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <p className="small text-body-secondary">
            Se subieron como documento antes de que Cortex los ligara a su estudio. Elige su orden pendiente o márcalo como
            estudio de otro lugar. El archivo no se mueve.
          </p>
          {error && <CAlert color="danger" role="alert">{error}</CAlert>}
          <ul className="expediente-lista">
            {docs.map((d) => {
              const valor = eleccion[d.id] ?? ''
              const listo = valor === 'externo' ? (nombres[d.id] ?? '').trim().length >= 2 : valor !== ''
              return (
                <li key={d.id} className="expediente-lista__fila flex-column align-items-stretch">
                  <div>
                    <div className="fw-semibold">{d.title}</div>
                    <div className="small text-body-secondary">
                      {d.file_name} · subido {formatearInstante(d.created_at, { dateStyle: 'medium' })}
                      {d.lab_name ? ` · ${d.lab_name}` : ''}
                    </div>
                  </div>
                  <div className="d-flex flex-wrap gap-2 align-items-end">
                    <div className="flex-grow-1">
                      <CFormLabel htmlFor={`ligar-${d.id}`} className="small mb-1">¿De qué estudio es?</CFormLabel>
                      <CFormSelect id={`ligar-${d.id}`} size="sm" value={valor} disabled={guardando !== null}
                        onChange={(e) => setEleccion((x) => ({ ...x, [d.id]: e.target.value }))}>
                        <option value="">Elige…</option>
                        {ordenes.map((o) => (
                          <option key={o.order_id} value={o.order_id}>
                            {o.study_name} · Orden n.º {o.order_id} · {formatearFechaISO(o.requested_on)}
                          </option>
                        ))}
                        <option value="externo">Es un estudio de otro lugar</option>
                      </CFormSelect>
                    </div>
                    {valor === 'externo' && (
                      <div className="flex-grow-1">
                        <CFormLabel htmlFor={`ligar-nombre-${d.id}`} className="small mb-1">Estudio</CFormLabel>
                        <CFormInput id={`ligar-nombre-${d.id}`} size="sm" maxLength={255} value={nombres[d.id] ?? ''}
                          onChange={(e) => setNombres((x) => ({ ...x, [d.id]: e.target.value }))} />
                      </div>
                    )}
                    <CButton size="sm" color="primary" disabled={!listo || guardando !== null} onClick={() => void ligar(d)}>
                      {guardando === d.id && <CSpinner size="sm" className="me-1" />}
                      Ligar
                    </CButton>
                  </div>
                </li>
              )
            })}
          </ul>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={() => setAbierto(false)} disabled={guardando !== null}>Cerrar</CButton>
        </CModalFooter>
      </CModal>
    </>
  )
}
