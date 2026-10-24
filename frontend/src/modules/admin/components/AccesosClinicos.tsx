/**
 * Accesos a expedientes (plan 32, punto 7; NOM-024): quién abrió qué sección
 * clínica de quién y cuándo. El servidor ya lo agrupa por sesión: cada renglón
 * es una visita de una persona al expediente de una paciente, con las
 * secciones que abrió en ella.
 */
import { useEffect, useState } from 'react'
import { CAlert, CBadge, CButton, CSpinner, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from '@coreui/react-pro'
import { apiClient } from '../../../shared/services/api'
import { formatearInstante } from '../../../shared/utils/date'
import { mensajeDeError } from '../../../shared/utils/errors'
import TablaResponsiva from '../../../shared/components/TablaResponsiva'

type Seccion = { seccion: string; veces: number; primer_acceso: string; ultimo_acceso: string }
type Visita = {
  sesion: string; user_id: number; user_name: string | null; patient_id: number; patient_name: string | null
  device_label: string | null; primer_acceso: string; ultimo_acceso: string; secciones: Seccion[]
}

const PAGE_SIZE = 25

/** Los nombres que ve el personal, no el código interno. */
export const NOMBRE_DE_SECCION: Record<string, string> = {
  consultas: 'Consultas',
  recetas: 'Recetas',
  certificados: 'Certificados',
  estudios: 'Estudios',
  imagenes: 'Imágenes',
  documentos: 'Documentos',
  embarazo: 'Embarazo',
  episodios: 'Episodios',
  consentimientos: 'Consentimientos',
  resumen_clinico: 'Resumen clínico',
}

const hora = (iso: string) => formatearInstante(iso, { dateStyle: 'medium', timeStyle: 'short' })

export default function AccesosClinicos() {
  const [items, setItems] = useState<Visita[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  // Un fallo no es «nadie abrió nada»: se dice, con «Reintentar».
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    const cargar = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await apiClient.get('/audit-logs/accesos', { params: { skip: page * PAGE_SIZE, limit: PAGE_SIZE } })
        if (!Array.isArray(response.data?.items) || typeof response.data?.total !== 'number') {
          throw new Error('La bitácora de accesos no llegó completa.')
        }
        if (!vigente) return
        setItems(response.data.items)
        setTotal(response.data.total)
      } catch (err) {
        if (!vigente) return
        setItems([])
        setTotal(0)
        setError(mensajeDeError(err, 'No se pudo cargar la bitácora de accesos.'))
      } finally {
        if (vigente) setLoading(false)
      }
    }
    void cargar()
    return () => { vigente = false }
  }, [page, intento])

  return <>
    <p className="text-body-secondary small">
      Una fila por visita: la persona, la paciente y las secciones clínicas que abrió en esa sesión. Abrir varias veces lo mismo suma, no repite el renglón.
    </p>
    {error && <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2" role="alert">
      <span className="flex-grow-1">{error} Esto no quiere decir que no haya accesos.</span>
      <CButton color="danger" variant="outline" size="sm" onClick={() => setIntento((n) => n + 1)}>Reintentar</CButton>
    </CAlert>}
    {loading ? <div className="text-center p-5"><CSpinner /></div> : error ? null : items.length === 0
      ? <p className="text-center text-body-secondary py-4">Todavía no hay accesos registrados.</p>
      : <TablaResponsiva responsive hover data-tour="auditoria-accesos">
        <CTableHead><CTableRow>
          <CTableHeaderCell>Cuándo</CTableHeaderCell><CTableHeaderCell>Usuario</CTableHeaderCell>
          <CTableHeaderCell>Paciente</CTableHeaderCell><CTableHeaderCell>Secciones abiertas</CTableHeaderCell>
          <CTableHeaderCell>Dispositivo / sesión</CTableHeaderCell>
        </CTableRow></CTableHead>
        <CTableBody>{items.map((v) => <CTableRow key={`${v.sesion}-${v.patient_id}`}>
          <CTableDataCell>{hora(v.ultimo_acceso)}{v.primer_acceso !== v.ultimo_acceso && <div className="small text-body-secondary">desde {hora(v.primer_acceso)}</div>}</CTableDataCell>
          <CTableDataCell>{v.user_name || `Usuario n.º ${v.user_id}`}</CTableDataCell>
          <CTableDataCell>{v.patient_name ?? `Paciente n.º ${v.patient_id}`}</CTableDataCell>
          <CTableDataCell><div className="d-flex flex-wrap gap-1">{v.secciones.map((s) =>
            <CBadge key={s.seccion} color="secondary" title={`Primera vez: ${hora(s.primer_acceso)} · última: ${hora(s.ultimo_acceso)}`}>
              {NOMBRE_DE_SECCION[s.seccion] ?? s.seccion}{s.veces > 1 ? ` ×${s.veces}` : ''}
            </CBadge>)}</div></CTableDataCell>
          <CTableDataCell>{v.device_label || '—'}<div className="small font-monospace">{v.sesion}</div></CTableDataCell>
        </CTableRow>)}</CTableBody>
      </TablaResponsiva>}
    <div className="d-flex justify-content-between align-items-center mt-3">
      <span>{error ? '—' : `${total} ${total === 1 ? 'visita' : 'visitas'}`}</span>
      <div>
        <CButton color="secondary" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</CButton>
        <CButton className="ms-2" color="secondary" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Siguiente</CButton>
      </div>
    </div>
  </>
}
