import { useEffect, useState } from 'react'
import { CAlert, CBadge, CButton, CCard, CCardBody, CFormInput, CSpinner, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from '@coreui/react-pro'
import { apiClient } from '../../../shared/services/api'
import { formatearInstante } from '../../../shared/utils/date'
import { mensajeDeError } from '../../../shared/utils/errors'
import TablaResponsiva from '../../../shared/components/TablaResponsiva'
import { etiquetaDeAccion } from '../utils/accionesBitacora'
import { cilListRich } from '@coreui/icons'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import AccesosClinicos from '../components/AccesosClinicos'
import FoliosEmitidos from '../components/FoliosEmitidos'

type AuditItem = {
  id: number; actor_name: string | null; action: string; entity_type: string
  patient_id: number | null; patient_name?: string | null; outcome: string; ip_anonymized: string | null
  device_label: string | null; reason: string | null; created_at: string
}

const PAGE_SIZE = 25

type Vista = 'eventos' | 'accesos' | 'folios'

const VISTAS: { clave: Vista; nombre: string }[] = [
  { clave: 'eventos', nombre: 'Cambios y eventos' },
  { clave: 'accesos', nombre: 'Accesos a expedientes' },
  { clave: 'folios', nombre: 'Verificar folio' },
]

/** El resultado en español; el valor interno queda en el `title`. */
const RESULTADOS: Record<string, { texto: string; color: string }> = {
  success: { texto: 'Realizado', color: 'success' },
  denied: { texto: 'Denegado', color: 'danger' },
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  // Si la bitácora no se pudo leer se dice: antes quedaba la tabla vacía y
  // «0 eventos», que en una bitácora se lee como «nadie hizo nada» (plan 29).
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  // Dos bitácoras: lo que se cambió y lo que se abrió (plan 32, punto 7).
  const [vista, setVista] = useState<Vista>('eventos')

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await apiClient.get('/audit-logs', { params: { skip: page * PAGE_SIZE, limit: PAGE_SIZE, action: filter || undefined } })
        if (!Array.isArray(response.data?.items) || typeof response.data?.total !== 'number') {
          throw new Error('La bitácora no llegó completa.')
        }
        setItems(response.data.items)
        setTotal(response.data.total)
      } catch (err) {
        setItems([])
        setTotal(0)
        setError(mensajeDeError(err, 'No se pudo cargar la bitácora.'))
      } finally { setLoading(false) }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [page, filter, intento])

  return <>
    <EncabezadoPantalla
      titulo="Bitácora de auditoría"
      descripcion="Accesos y cambios sensibles. La IP se conserva únicamente como huella anonimizada."
      icono={cilListRich}
    />
    {/* Botones de alternar dentro de un grupo, no pestañas: <CNav> con
        botones dejaba aria-current en un botón, <li> sin lista y un
        tablist sin pestañas (revisión axe del plan 32). */}
    <div role="group" aria-label="Qué bitácora ver" className="d-flex flex-wrap gap-2 mb-3" data-tour="auditoria-vistas">
      {VISTAS.map(({ clave, nombre }) => (
        <CButton key={clave} type="button" color={vista === clave ? 'primary' : 'secondary'}
          variant={vista === clave ? undefined : 'outline'} aria-pressed={vista === clave}
          onClick={() => setVista(clave)}>{nombre}</CButton>
      ))}
    </div>
    {vista === 'folios' ? <CCard><CCardBody><FoliosEmitidos /></CCardBody></CCard> : vista === 'accesos' ? <CCard><CCardBody><AccesosClinicos /></CCardBody></CCard> : <CCard><CCardBody>
      <CFormInput className="mb-3" data-tour="auditoria-filtro" placeholder="Filtrar por código de acción (p. ej. soap_note, payment)…" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0) }} />
      {error && <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2" role="alert"><span className="flex-grow-1">{error}</span><CButton color="danger" variant="outline" size="sm" onClick={() => setIntento((n) => n + 1)}>Reintentar</CButton></CAlert>}
      {loading ? <div className="text-center p-5"><CSpinner /></div> : error ? null : items.length === 0 ? <p className="text-center text-body-secondary py-4">{filter ? `Ningún evento con «${filter}».` : 'Todavía no hay eventos registrados.'}</p> : <TablaResponsiva responsive hover data-tour="auditoria-tabla">
        <CTableHead><CTableRow><CTableHeaderCell>Fecha</CTableHeaderCell><CTableHeaderCell>Usuario</CTableHeaderCell><CTableHeaderCell>Acción</CTableHeaderCell><CTableHeaderCell>Paciente</CTableHeaderCell><CTableHeaderCell>Dispositivo / IP</CTableHeaderCell><CTableHeaderCell>Motivo</CTableHeaderCell><CTableHeaderCell>Resultado</CTableHeaderCell></CTableRow></CTableHead>
        <CTableBody>{items.map((item) => <CTableRow key={item.id}>
          <CTableDataCell>{formatearInstante(item.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</CTableDataCell>
          <CTableDataCell>{item.actor_name || 'Sistema'}</CTableDataCell>
          <CTableDataCell title={item.action}>{etiquetaDeAccion(item.action)}<div className="small text-body-secondary"><code>{item.action}</code></div></CTableDataCell>
          <CTableDataCell>{item.patient_name ?? (item.patient_id ? `Paciente n.º ${item.patient_id}` : '—')}</CTableDataCell>
          <CTableDataCell>{item.device_label || '—'}<div className="small font-monospace">{item.ip_anonymized || '—'}</div></CTableDataCell>
          <CTableDataCell>{item.reason || '—'}</CTableDataCell>
          <CTableDataCell><CBadge color={RESULTADOS[item.outcome]?.color ?? 'secondary'} title={item.outcome}>{RESULTADOS[item.outcome]?.texto ?? item.outcome}</CBadge></CTableDataCell>
        </CTableRow>)}</CTableBody>
      </TablaResponsiva>}
      <div className="d-flex justify-content-between align-items-center mt-3" data-tour="auditoria-paginas"><span>{error ? '—' : `${total} ${total === 1 ? 'evento' : 'eventos'}`}</span><div><CButton color="secondary" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</CButton><CButton className="ms-2" color="secondary" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Siguiente</CButton></div></div>
    </CCardBody></CCard>}
  </>
}
