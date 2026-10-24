/**
 * Verificar un folio (plan 32, folios homologados). Quien recibe un papel de
 * la clínica —otro médico, una aseguradora— puede preguntar si es auténtico:
 * aquí se busca y se ve qué documento es, de qué paciente, quién lo emitió y
 * cuándo.
 */
import { useEffect, useState } from 'react'
import { CAlert, CBadge, CButton, CFormInput, CSpinner, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from '@coreui/react-pro'
import { apiClient } from '../../../shared/services/api'
import { formatearInstante } from '../../../shared/utils/date'
import { mensajeDeError } from '../../../shared/utils/errors'
import TablaResponsiva from '../../../shared/components/TablaResponsiva'

type Folio = {
  folio: string; tipo: string; tipo_nombre: string; patient_id: number | null; patient_name: string | null
  emitted_by_name: string | null; emitted_at: string | null; homologado: boolean
}

const PAGE_SIZE = 25

export default function FoliosEmitidos() {
  const [busqueda, setBusqueda] = useState('')
  const [items, setItems] = useState<Folio[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await apiClient.get('/audit-logs/folios', {
          params: { skip: page * PAGE_SIZE, limit: PAGE_SIZE, folio: busqueda.trim() || undefined },
        })
        if (!Array.isArray(response.data?.items) || typeof response.data?.total !== 'number') {
          throw new Error('La lista de folios no llegó completa.')
        }
        if (!vigente) return
        setItems(response.data.items)
        setTotal(response.data.total)
      } catch (err) {
        if (!vigente) return
        setItems([])
        setTotal(0)
        setError(mensajeDeError(err, 'No se pudieron cargar los folios.'))
      } finally {
        if (vigente) setLoading(false)
      }
    }, 250)
    return () => { vigente = false; window.clearTimeout(timer) }
  }, [busqueda, page, intento])

  const buscando = busqueda.trim() !== ''

  return <>
    <CFormInput className="mb-3" data-tour="auditoria-folios" placeholder="Escribe el folio impreso (p. ej. GYG-REC-2026-0042)…"
      aria-label="Buscar folio" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPage(0) }} />
    {error && <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2" role="alert">
      <span className="flex-grow-1">{error} No quiere decir que el folio no exista.</span>
      <CButton color="danger" variant="outline" size="sm" onClick={() => setIntento((n) => n + 1)}>Reintentar</CButton>
    </CAlert>}
    {loading ? <div className="text-center p-5"><CSpinner /></div> : error ? null : items.length === 0
      ? <p className="text-center text-body-secondary py-4">
        {buscando ? `Ningún documento de esta sucursal tiene el folio «${busqueda.trim()}». Revisa que esté escrito completo.` : 'Todavía no se ha emitido ningún folio con el formato nuevo.'}
      </p>
      : <TablaResponsiva responsive hover>
        <CTableHead><CTableRow>
          <CTableHeaderCell>Folio</CTableHeaderCell><CTableHeaderCell>Documento</CTableHeaderCell>
          <CTableHeaderCell>Paciente</CTableHeaderCell><CTableHeaderCell>Emitió</CTableHeaderCell><CTableHeaderCell>Cuándo</CTableHeaderCell>
        </CTableRow></CTableHead>
        <CTableBody>{items.map((f) => <CTableRow key={f.folio}>
          <CTableDataCell className="font-monospace">{f.folio}{!f.homologado && <CBadge color="secondary" className="ms-2" title="Emitido antes de la versión 1.2.0">formato anterior</CBadge>}</CTableDataCell>
          <CTableDataCell>{f.tipo_nombre}</CTableDataCell>
          <CTableDataCell>{f.patient_name ?? (f.patient_id ? `Paciente n.º ${f.patient_id}` : '—')}</CTableDataCell>
          <CTableDataCell>{f.emitted_by_name || '—'}</CTableDataCell>
          <CTableDataCell>{f.emitted_at ? formatearInstante(f.emitted_at, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</CTableDataCell>
        </CTableRow>)}</CTableBody>
      </TablaResponsiva>}
    <div className="d-flex justify-content-between align-items-center mt-3">
      <span>{error ? '—' : `${total} ${total === 1 ? 'folio' : 'folios'}`}</span>
      <div>
        <CButton color="secondary" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</CButton>
        <CButton className="ms-2" color="secondary" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Siguiente</CButton>
      </div>
    </div>
  </>
}
